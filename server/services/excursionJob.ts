import fs from "fs";
import path from "path";
import { collectAccountEvaluations } from "../routes/evaluationRoutes";
import {
  appendExcursionCache,
  excursionCacheFile,
  excursionKey,
  isFinalExcursion,
  readExcursionCache,
  type CachedExcursion,
} from "./excursionCache";
import { computeExcursionsFromArchive, type ExcursionJob } from "./excursionReader";

/**
 * Langkah 5b3 (Mode Aman, 8 Okt 2026) — satu putaran pengisi buku MFE/MAE.
 *
 * Per broker: ambil trade tertutup dari History (sumber sama dengan panel
 * Evaluasi) yang belum tercatat → hitung dari arsip tick → catat yang
 * FINAL (lihat excursionCache). Yang belum final dicoba lagi putaran
 * berikutnya. Penjadwalan (start + tiap 10 menit) di server/index.ts (5b4).
 */
export const ARCHIVE_DIR_BY_BROKER: Readonly<Record<string, string>> = {
  orbitraderberjangka: "otb",
  finex: "finex",
};
const TAIL_BYTES = 8192;

export interface ExcursionPassSummary {
  readonly broker: string;
  readonly pending: number;
  readonly saved: number;
  readonly notFinal: number;
}

/** ts_raw tick terbaru = baris valid terakhir di file arsip terbaru (baca ekor saja). */
export function newestTickRaw(archiveDir: string): string | null {
  let names: string[];
  try {
    names = fs.readdirSync(archiveDir).filter((n) => /^ticks-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n));
  } catch {
    return null;
  }
  for (const name of names.sort().reverse()) {
    const file = path.join(archiveDir, name);
    let tail: string;
    try {
      const size = fs.statSync(file).size;
      const len = Math.min(size, TAIL_BYTES);
      const buf = Buffer.alloc(len);
      const fd = fs.openSync(file, "r");
      try {
        fs.readSync(fd, buf, 0, len, size - len);
      } finally {
        fs.closeSync(fd);
      }
      tail = buf.toString("utf-8");
    } catch {
      continue;
    }
    const lines = tail.split(/\r?\n/).reverse();
    for (const line of lines) {
      try {
        const rec = JSON.parse(line) as { ts_raw?: unknown };
        if (typeof rec.ts_raw === "string") return rec.ts_raw;
      } catch {
        // baris terpotong/rusak di ekor: coba baris sebelumnya
      }
    }
  }
  return null;
}

export async function runExcursionPass(opts: {
  readonly commonDir: string;
  readonly tradesDir: string;
  readonly historyDir: string;
  readonly labels?: Record<string, string>;
  readonly now?: () => Date;
}): Promise<ExcursionPassSummary[]> {
  const now = opts.now ?? (() => new Date());
  const accounts = collectAccountEvaluations(opts.commonDir, opts.tradesDir, opts.labels ?? {});
  const out: ExcursionPassSummary[] = [];
  for (const [broker, archiveName] of Object.entries(ARCHIVE_DIR_BY_BROKER)) {
    const cacheFile = excursionCacheFile(opts.tradesDir, broker);
    const cache = readExcursionCache(cacheFile);
    const jobs: ExcursionJob[] = [];
    for (const acc of accounts) {
      if (acc.broker !== broker) continue;
      for (const t of acc.evaluation.trades) {
        const key = excursionKey(acc.login, t.positionId);
        if (cache.has(key)) continue;
        jobs.push({
          key,
          symbol: t.symbol,
          side: t.side,
          openTime: t.openTime,
          closeTime: t.closeTime,
          openPrice: t.openPrice,
          sl: t.sl,
        });
      }
    }
    if (jobs.length === 0) {
      out.push({ broker, pending: 0, saved: 0, notFinal: 0 });
      continue;
    }
    const archiveDir = path.join(opts.historyDir, archiveName);
    const newest = newestTickRaw(archiveDir);
    const results = await computeExcursionsFromArchive(archiveDir, jobs);
    const computedAt = now().toISOString();
    const finals: CachedExcursion[] = [];
    for (const job of jobs) {
      const x = results.get(job.key);
      if (x !== undefined && isFinalExcursion(x, job.closeTime, newest)) {
        finals.push({ ...x, key: job.key, computedAt });
      }
    }
    appendExcursionCache(cacheFile, finals);
    out.push({ broker, pending: jobs.length, saved: finals.length, notFinal: jobs.length - finals.length });
  }
  return out;
}
