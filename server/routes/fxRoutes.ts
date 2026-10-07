import { Router, type Request, type Response } from "express";
import {
  FALLBACK_RATES,
  parseECBXml,
  type ExchangeRates,
} from "../../src/services/fxRateService";

/**
 * Tahap FX-PROXY — kurs ECB via backend (bukan browser langsung).
 *
 * Latar: fetch langsung dari browser ke eurofxref diblokir CORS oleh
 * server ECB (tanpa header ACAO) → console error + fallback basi.
 * Server-side fetch tidak kena CORS → proksikan lewat sini.
 * Frontend (App.tsx) memakai rute ini dulu; direct fetch + FALLBACK
 * dipertahankan sebagai lapis cadangan (dan untuk konteks Node/test).
 *
 * Cache memori 12 jam (kurs ECB harian): hemat request, tetap segar.
 */

export const FX_CACHE_TTL_MS = 12 * 3600 * 1000;
export const ECB_SOURCE_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

interface FxCache {
  rates: ExchangeRates;
  atMs: number;
}

let cache: FxCache | null = null;

/** Kurs ECB terakhir di cache (null bila belum pernah diambil). Langkah 4b. */
export function getCachedEcbRates(): ExchangeRates | null {
  return cache?.rates ?? null;
}

/** True bila cache masih segar (murni, untuk test). */
export function isFxCacheFresh(
  cachedAtMs: number,
  nowMs: number = Date.now(),
  ttlMs: number = FX_CACHE_TTL_MS,
): boolean {
  if (!Number.isFinite(cachedAtMs) || !Number.isFinite(nowMs)) return false;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return false;
  return nowMs - cachedAtMs < ttlMs;
}

async function fetchEcbServerSide(): Promise<ExchangeRates | null> {
  try {
    const doFetch = (
      globalThis as { fetch?: typeof fetch }
    ).fetch;
    if (typeof doFetch !== "function") return null;
    const response = await doFetch(ECB_SOURCE_URL);
    if (!response.ok) return null;
    const text = await response.text();
    const rates = parseECBXml(text);
    rates.fetchedAt = new Date().toISOString().split("T")[0];
    return rates;
  } catch {
    return null;
  }
}

export function createFxRoutes(): Router {
  const router = Router();

  router.get("/ecb", async (_req: Request, res: Response) => {
    try {
      const now = Date.now();
      if (cache !== null && isFxCacheFresh(cache.atMs, now)) {
        res.json(cache.rates);
        return;
      }
      const fresh = await fetchEcbServerSide();
      if (fresh !== null) {
        cache = { rates: fresh, atMs: now };
        res.json(fresh);
        return;
      }
      // ECB tak terjangkau: FALLBACK jujur (bentuk sama, tanggal fallback).
      console.warn("⚠ ECB fetch gagal (server-side), pakai FALLBACK_RATES");
      res.json(FALLBACK_RATES);
    } catch (error) {
      console.error("Error proxy ECB:", error);
      res.json(FALLBACK_RATES);
    }
  });

  return router;
}
