import { Router, type Request, type Response } from "express";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { QuoteSnapshot } from "../types/quotes";
import { pickLiveSource, resolveLiveBroker } from "../types/liveSource";
import { resolveCommonFilesDir } from "./marginRoutes";

/**
 * Langkah 3a (Mode Aman, 8 Okt 2026) — bahan pemindai simbol.
 *
 * GET /api/candles?broker=finex|orbitraderberjangka
 * → { broker, items: [{ symbol, csv, modified, quote }] }
 *
 * Simbol = yang ada di quotes.csv broker itu (Market Watch terminalnya),
 * CSV = Common\Files\MDBKA_<symbol>_H1.csv (service AutoExportMDBKA).
 * Simbol tanpa file CSV dilewati (tanpa data fiktif). Dibaca ulang tiap
 * request: file kecil (±200 candle) dan selalu segar.
 */
export interface CandleSource {
  getSymbols(): string[];
  getLatestBySymbol(symbol: string, limit?: number): QuoteSnapshot[];
}

export interface CandleItem {
  readonly symbol: string;
  readonly csv: string;
  readonly modified: string;
  readonly quote: QuoteSnapshot | null;
}

export function collectCandleItems(
  source: CandleSource,
  commonDir: string,
): CandleItem[] {
  const items: CandleItem[] = [];
  for (const symbol of [...source.getSymbols()].sort()) {
    const file = join(commonDir, `MDBKA_${symbol}_H1.csv`);
    if (!existsSync(file)) continue;
    try {
      const latest = source.getLatestBySymbol(symbol, 1);
      items.push({
        symbol,
        csv: readFileSync(file, "utf8"),
        modified: statSync(file).mtime.toISOString(),
        quote: latest.length > 0 ? latest[latest.length - 1] : null,
      });
    } catch {
      // File terkunci MT5 saat ditulis: lewati, request berikutnya mencoba lagi.
    }
  }
  return items;
}

/** G2: nama simbol aman untuk nama file (cegah path traversal). */
export const SAFE_SYMBOL = /^[A-Za-z0-9#._-]{1,32}$/;

/**
 * Butir 1 G2 (9 Okt 2026) — CSV H1 satu simbol. null bila nama tidak aman,
 * file tidak ada, atau terkunci MT5 (jujur: tanpa data fiktif).
 */
export function readCandleCsv(
  commonDir: string,
  symbol: string,
): { csv: string; modified: string } | null {
  if (!SAFE_SYMBOL.test(symbol) || symbol.includes("..")) return null;
  const file = join(commonDir, `MDBKA_${symbol}_H1.csv`);
  if (!existsSync(file)) return null;
  try {
    return { csv: readFileSync(file, "utf8"), modified: statSync(file).mtime.toISOString() };
  } catch {
    return null;
  }
}

export function createCandlesRoutes(
  reader: CandleSource | null,
  readerFinex: CandleSource | null,
  commonDir: string = resolveCommonFilesDir(),
  readerMifx: CandleSource | null = null,
): Router {
  const router = Router();

  router.get("/", (req: Request, res: Response) => {
    const broker = resolveLiveBroker(req.query.broker);
    if (broker === null) {
      res
        .status(400)
        .json({ error: "Unknown broker (use finex|orbitraderberjangka)" });
      return;
    }
    const source = pickLiveSource(broker, reader, readerFinex, readerMifx);
    if (source === null) {
      res
        .status(404)
        .json({ error: `Live source not configured for broker ${broker}` });
      return;
    }
    res.json({ broker, items: collectCandleItems(source, commonDir) });
  });

  // G2: GET /api/candles/:symbol → { symbol, csv, modified } | 404.
  router.get("/:symbol", (req: Request, res: Response) => {
    const raw = req.params.symbol;
    const symbol = (Array.isArray(raw) ? (raw[0] ?? "") : raw).trim();
    const found = readCandleCsv(commonDir, symbol);
    if (found === null) {
      res.status(404).json({ error: `CSV H1 ${symbol} belum ada` });
      return;
    }
    res.json({ symbol, ...found });
  });

  return router;
}
