import { statSync } from "node:fs";
import { evaluateDataQuality, type DataQuality } from "../../src/lib/dataQualityGate";
import { terminalHealth } from "../../src/lib/mt5Journal";
import type { EquitySnapshot } from "../types/equity";
import { readTerminalLogs, terminalDirFromFilesPath, type TerminalLogs } from "./mt5JournalReader";

/**
 * F2/TT-3 (13 Okt 2026) — layanan kualitas data per broker: log terminal
 * dibaca paling sering tiap 30 dtk (cache), lalu gerbang dinilai.
 */
export interface DataQualitySource {
  readonly getEquity: () => EquitySnapshot | null;
  /** Path quotes.csv broker (dari .env) → folder terminal. */
  readonly quotesPath: string | undefined;
}

export interface DataQualityService {
  logs(): TerminalLogs | null;
  quality(): DataQuality;
}

export const LOG_CACHE_MS = 30_000;

export function createDataQualityService(src: DataQualitySource, now: () => number = () => Date.now()): DataQualityService {
  const dir = terminalDirFromFilesPath(src.quotesPath);
  let cache: { at: number; logs: TerminalLogs | null } | null = null;
  const logs = (): TerminalLogs | null => {
    const t = now();
    if (cache === null || t - cache.at > LOG_CACHE_MS) cache = { at: t, logs: readTerminalLogs(dir) };
    return cache.logs;
  };
  return {
    logs,
    quality: () => {
      const eq = src.getEquity();
      const modified = eq === null ? null : Date.parse(eq.lastModified);
      const l = logs();
      // Audit A-3 (16 Okt 2026): mtime quotes.csv dibaca LANGSUNG (bukan lewat equity), supaya gerbang
      // tidak salah mengira harga live hidup hanya karena equity.csv-nya (EA lain) masih diperbarui.
      let quotesModifiedMs: number | null = null;
      if (src.quotesPath !== undefined) {
        try {
          quotesModifiedMs = statSync(src.quotesPath).mtimeMs;
        } catch {
          quotesModifiedMs = null;
        }
      }
      return evaluateDataQuality({
        nowMs: now(),
        equityModifiedMs: modified === null || !Number.isFinite(modified) ? null : modified,
        quotesModifiedMs,
        health: l === null || l.journal.length === 0 ? null : terminalHealth(l.journal, eq?.account ?? null),
      });
    },
  };
}
