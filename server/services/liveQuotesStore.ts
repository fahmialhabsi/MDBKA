import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { QuoteSnapshot } from "../types/quotes";
import { parseMarginCsvToLiveQuotes } from "../types/marginCsv";

/**
 * #509 - cache in-memory live quotes dari MDBKA_Margin_Finex.csv (broker real).
 * sync() idempotent: baca file, parse CSV → QuoteSnapshot[], perbarui cache Map.
 * getLatest(symbol) → quote terbaru atau null.
 */
export interface LiveQuotesStore {
  readonly file: string;
  getLatest(symbol: string): QuoteSnapshot | null;
  getAllLatest(): readonly QuoteSnapshot[];
  sync(): { added: number; total: number } | null;
}

/**
 * Resolve path MDBKA_Margin_Finex.csv dari CommonFiles atau env.
 * Default: %APPDATA%/MetaQuotes/Terminal/Common/Files/MDBKA_Margin_Finex.csv
 */
export function resolveMarginFile(): string {
  const fromEnv = (process.env?.["MT5_COMMON_FILES_DIR"] ?? "").trim();
  if (fromEnv !== "") return join(fromEnv, "MDBKA_Margin_Finex.csv");
  // Fallback: assume default Windows APPDATA path
  const appdata = process.env?.["APPDATA"] ?? "";
  return join(
    appdata,
    "MetaQuotes",
    "Terminal",
    "Common",
    "Files",
    "MDBKA_Margin_Finex.csv",
  );
}

export function createLiveQuotesStore(args: {
  readonly file: string;
}): LiveQuotesStore {
  const { file } = args;
  const cache = new Map<string, QuoteSnapshot>();

  const getLatest = (symbol: string): QuoteSnapshot | null => {
    return cache.get(symbol) ?? null;
  };

  const getAllLatest = (): readonly QuoteSnapshot[] => {
    return Array.from(cache.values());
  };

  const sync = (): { added: number; total: number } | null => {
    try {
      if (!existsSync(file)) return null;
      const csv = readFileSync(file, "utf8");
      const quotes = parseMarginCsvToLiveQuotes(csv);
      let added = 0;
      for (const q of quotes) {
        const prev = cache.get(q.symbol);
        if (!prev || prev.timestamp !== q.timestamp) {
          cache.set(q.symbol, q);
          added++;
        }
      }
      return { added, total: cache.size };
    } catch {
      return null;
    }
  };

  return {
    file,
    getLatest,
    getAllLatest,
    sync,
  };
}
