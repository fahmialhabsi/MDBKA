import fs from "fs";
import path from "path";
import { serverMs, type TradeExcursion } from "./tradeExcursion";

/**
 * Langkah 5b2 (Mode Aman, 8 Okt 2026) — buku catatan hasil MFE/MAE.
 *
 * Membaca arsip tick ±18 dtk per putaran → hasil per trade dicatat sekali di
 * `data/trades/excursion-<broker>.jsonl` (append-only; baris terakhir per
 * kunci menang). Kunci = `<login>:<positionId>`.
 *
 * Kapan hasil dianggap FINAL (boleh dicatat permanen):
 * - cakupan PENUH, atau
 * - trade ditutup > 1 jam sebelum tick terbaru arsip (rekaman tidak akan
 *   bertambah lagi untuk rentang itu).
 * Selain itu (baru saja ditutup, rekaman mungkin tertinggal) → hitung ulang
 * pada putaran berikutnya.
 */
export const EXCURSION_FINAL_AFTER_HOURS = 1;

export interface CachedExcursion extends TradeExcursion {
  readonly key: string;
  readonly computedAt: string;
}

export function excursionKey(login: string, positionId: string): string {
  return `${login}:${positionId}`;
}

export function excursionCacheFile(tradesDir: string, broker: string): string {
  return path.join(tradesDir, `excursion-${broker}.jsonl`);
}

export function isFinalExcursion(
  x: TradeExcursion,
  closeTime: string,
  newestTickRaw: string | null,
): boolean {
  if (x.coverage === "PENUH") return true;
  if (newestTickRaw === null) return false;
  const close = serverMs(closeTime);
  const newest = serverMs(newestTickRaw);
  if (close === null || newest === null) return false;
  return newest - close > EXCURSION_FINAL_AFTER_HOURS * 3600 * 1000;
}

/** Baca catatan; baris rusak dilewati, kunci ganda → baris terakhir. */
export function readExcursionCache(file: string): Map<string, CachedExcursion> {
  const out = new Map<string, CachedExcursion>();
  let text: string;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch {
    return out; // belum ada catatan
  }
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    try {
      const rec = JSON.parse(line) as Partial<CachedExcursion>;
      if (typeof rec.key === "string" && typeof rec.coverage === "string") {
        out.set(rec.key, rec as CachedExcursion);
      }
    } catch {
      // baris rusak dilewati
    }
  }
  return out;
}

export function appendExcursionCache(
  file: string,
  records: readonly CachedExcursion[],
): void {
  if (records.length === 0) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
}
