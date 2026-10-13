/**
 * TB-2 (13 Okt 2026) — buku trade bayangan (rancangan tim 11.1). Murni.
 * - Bayangan dibuat untuk sinyal BELI/JUAL yang DITAHAN penjaga, memakai
 *   SL/TP usulan strategi sebelum gerbang Mode Aman (decisionEngine tidak disentuh).
 * - Satu bayangan per simbol + arah selama yang sama masih berjalan.
 * - Satu baris DIBUAT saat dibuat, satu baris SELESAI saat selesai (append-only).
 */
import type { StrategySetup } from "../calculations/decisionEngine";
import type { BrokerId } from "../types/broker";
import { classifyScanStatus } from "./guardClass";
import type { BayanganRecord } from "./jsonlRecord";
import { riskGroupOf } from "./riskGroup";
import type { ShadowTradeResult } from "./shadowTrade";
import type { ScanRow } from "./symbolScanner";

const SERVER_TIME = /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/;

export interface ShadowCandidateMeta {
  readonly bayanganId: string;
  readonly waktuUtc: string;
  readonly broker: BrokerId;
  /** Jam server kuotasi saat sinyal ("YYYY.MM.DD HH:MM:SS"). */
  readonly signalServerTime: string | null;
}

/** Baris DIBUAT, atau null bila bukan sinyal tertahan yang bisa diikuti. */
export function shadowCandidate(row: ScanRow, setup: StrategySetup | null, meta: ShadowCandidateMeta): BayanganRecord | null {
  if (!row.held || setup === null) return null;
  if (row.direction !== "BELI" && row.direction !== "JUAL") return null;
  if (setup.decision !== row.direction) return null;
  const guard = classifyScanStatus(row.status);
  if (guard === "LOLOS" || guard === "BUKAN_SETUP") return null;
  if (meta.signalServerTime === null || !SERVER_TIME.test(meta.signalServerTime)) return null;
  const { entry, stopLoss, takeProfit } = setup;
  if (stopLoss === null || takeProfit === null || !Number.isFinite(entry) || entry <= 0) return null;
  const ordered = row.direction === "BELI" ? stopLoss < entry && entry < takeProfit : takeProfit < entry && entry < stopLoss;
  if (!ordered) return null;
  return {
    skema: "bayangan/1",
    bayanganId: meta.bayanganId,
    fase: "DIBUAT",
    waktuUtc: meta.waktuUtc,
    broker: meta.broker,
    login: null,
    simbol: row.symbol,
    golongan: riskGroupOf(row.symbol).id,
    arah: row.direction,
    waktuSinyalServer: meta.signalServerTime,
    entry,
    sl: stopLoss,
    tp: takeProfit,
    lotTeoretis: null,
    porsiBiaya: row.costShareOfRisk,
    ditahanOleh: row.status,
    kelasPenjaga: guard,
    aturanId: "skor",
    versi: "1",
    hasil: null,
    waktuKeluarServer: null,
    hargaKeluar: null,
    r: null,
    mfeR: null,
    maeR: null,
    mengoreksi: null,
  };
}

/** Bayangan yang sudah DIBUAT tetapi belum SELESAI (urut sesuai berkas). */
export function openShadows(records: readonly BayanganRecord[]): BayanganRecord[] {
  const done = new Set(records.filter((r) => r.fase === "SELESAI").map((r) => r.bayanganId));
  const seen = new Set<string>();
  const out: BayanganRecord[] = [];
  for (const r of records) {
    if (r.fase !== "DIBUAT" || done.has(r.bayanganId) || seen.has(r.bayanganId)) continue;
    seen.add(r.bayanganId);
    out.push(r);
  }
  return out;
}

/** Kunci "satu bayangan per simbol + arah selama masih berjalan". */
export function shadowOpenKey(r: Pick<BayanganRecord, "simbol" | "arah">): string {
  return `${r.simbol}|${r.arah}`;
}

/** Baris SELESAI dari hasil evaluateShadowTrade; null bila masih BERJALAN. */
export function finishShadow(open: BayanganRecord, result: ShadowTradeResult, waktuUtc: string): BayanganRecord | null {
  if (result.outcome === "BERJALAN") return null;
  return {
    ...open,
    fase: "SELESAI",
    waktuUtc,
    hasil: result.outcome,
    waktuKeluarServer: result.exitServerTime,
    hargaKeluar: result.exitPrice,
    r: result.r,
    mfeR: result.maxFavorableR,
    maeR: result.maxAdverseR,
  };
}

/** Bentuk BayanganRecord dari baris JSONL yang dibaca (null bila kolom inti tidak sah). */
export function asBayangan(raw: Record<string, unknown>): BayanganRecord | null {
  const ok =
    raw.skema === "bayangan/1" &&
    typeof raw.bayanganId === "string" &&
    (raw.fase === "DIBUAT" || raw.fase === "SELESAI") &&
    typeof raw.simbol === "string" &&
    (raw.arah === "BELI" || raw.arah === "JUAL") &&
    typeof raw.waktuSinyalServer === "string" &&
    typeof raw.entry === "number" &&
    typeof raw.sl === "number" &&
    typeof raw.tp === "number";
  return ok ? (raw as unknown as BayanganRecord) : null;
}

/**
 * Peringkas tick hari yang sudah lewat (berkas tidak berubah lagi) untuk
 * bayangan yang masih BERJALAN: karena di hari itu tidak ada SL/TP/time-stop,
 * cukup simpan tick dengan R tertinggi dan terendah (bahan MFE/MAE).
 * Hasil evaluasi sama persis dengan memakai semua tick.
 */
export function condenseTicks<T extends { readonly tsServer: string; readonly bid: number; readonly ask: number }>(
  open: Pick<BayanganRecord, "arah" | "entry" | "sl">,
  ticks: readonly T[],
): T[] {
  let best: T | null = null;
  let worst: T | null = null;
  let bestR = -Infinity;
  let worstR = Infinity;
  for (const t of ticks) {
    const price = open.arah === "BELI" ? t.bid : t.ask;
    const r = open.arah === "BELI" ? (price - open.entry) / (open.entry - open.sl) : (open.entry - price) / (open.sl - open.entry);
    if (!Number.isFinite(r)) continue;
    if (r > bestR) {
      bestR = r;
      best = t;
    }
    if (r < worstR) {
      worstR = r;
      worst = t;
    }
  }
  const out = [best, worst].filter((t): t is T => t !== null);
  const unique = out.length === 2 && out[0] === out[1] ? [out[0]] : out;
  return unique.sort((a, b) => (a.tsServer < b.tsServer ? -1 : a.tsServer > b.tsServer ? 1 : 0));
}
