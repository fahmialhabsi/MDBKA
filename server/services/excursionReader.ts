import fs from "fs";
import path from "path";
import readline from "readline";
import {
  computeExcursion,
  type ExcursionTick,
  type ExcursionTrade,
  type TradeExcursion,
} from "./tradeExcursion";

/**
 * Langkah 5b1 (Mode Aman, 8 Okt 2026) — baca arsip tick untuk MFE/MAE.
 *
 * - Streaming baris demi baris (file harian 300–420 MB; readFileSync
 *   mendekati batas string Node ±512 MB → dilarang di sini).
 * - Satu file dibaca SEKALI untuk semua trade; baris simbol yang tak
 *   dibutuhkan dilewati sebelum JSON.parse.
 * - File dinamai tanggal `ts_utc` (offset bisa salah, mis. OTB lama +3),
 *   jadi dibaca tanggal jam server buka −1 s/d tutup +1; penyaringan
 *   waktu lewat `ts_raw` (jam server) di `computeExcursion`.
 */
export interface ExcursionJob extends ExcursionTrade {
  readonly key: string;
  readonly symbol: string;
}

const DAY_MS = 86400000;
const SYMBOL_TAG = '"symbol":"';

/** "YYYY.MM.DD ..." → ms tengah malam UTC tanggal itu. */
function dayMs(serverTime: string): number | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(serverTime.trim());
  return m === null ? null : Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

/** Nama file harian yang mungkin memuat tick trade (±1 hari). */
export function excursionFileNames(job: ExcursionTrade): string[] {
  const from = dayMs(job.openTime);
  const to = dayMs(job.closeTime);
  if (from === null || to === null || to < from) return [];
  const out: string[] = [];
  for (let d = from - DAY_MS; d <= to + DAY_MS; d += DAY_MS) {
    out.push(`ticks-${new Date(d).toISOString().slice(0, 10)}.jsonl`);
  }
  return out;
}

/** Ambil nilai "symbol" tanpa JSON.parse (cepat untuk penyaringan). */
function symbolOf(line: string): string | null {
  const i = line.indexOf(SYMBOL_TAG);
  if (i < 0) return null;
  const start = i + SYMBOL_TAG.length;
  const end = line.indexOf('"', start);
  return end < 0 ? null : line.slice(start, end);
}

export async function computeExcursionsFromArchive(
  brokerDir: string,
  jobs: readonly ExcursionJob[],
): Promise<Map<string, TradeExcursion>> {
  const ticksByJob = new Map<string, ExcursionTick[]>();
  const jobsByFile = new Map<string, ExcursionJob[]>();
  for (const job of jobs) {
    ticksByJob.set(job.key, []);
    for (const name of excursionFileNames(job)) {
      jobsByFile.set(name, [...(jobsByFile.get(name) ?? []), job]);
    }
  }

  for (const name of [...jobsByFile.keys()].sort()) {
    const file = path.join(brokerDir, name);
    if (!fs.existsSync(file)) continue;
    const bySymbol = new Map<string, ExcursionJob[]>();
    for (const job of jobsByFile.get(name) ?? []) {
      bySymbol.set(job.symbol, [...(bySymbol.get(job.symbol) ?? []), job]);
    }
    const rl = readline.createInterface({
      input: fs.createReadStream(file, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      const sym = symbolOf(line);
      if (sym === null) continue;
      const wanted = bySymbol.get(sym);
      if (wanted === undefined) continue;
      let rec: Partial<ExcursionTick>;
      try {
        rec = JSON.parse(line) as Partial<ExcursionTick>;
      } catch {
        continue; // baris korup dilewati
      }
      if (
        typeof rec.ts_raw !== "string" ||
        typeof rec.bid !== "number" ||
        typeof rec.ask !== "number"
      ) {
        continue;
      }
      const tick: ExcursionTick = { ts_raw: rec.ts_raw, bid: rec.bid, ask: rec.ask };
      for (const job of wanted) {
        if (tick.ts_raw >= job.openTime && tick.ts_raw <= job.closeTime) {
          ticksByJob.get(job.key)?.push(tick);
        }
      }
    }
  }

  const out = new Map<string, TradeExcursion>();
  for (const job of jobs) {
    out.set(job.key, computeExcursion(job, ticksByJob.get(job.key) ?? []));
  }
  return out;
}
