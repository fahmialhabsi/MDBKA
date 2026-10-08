import fs from "fs";
import path from "path";
import type { QuoteSnapshot } from "../types/quotes";

/**
 * Tahap HIST-1 — arsip tick per simbol untuk agregator masa depan.
 *
 * - Append-only JSONL harian: `<HISTORY_DIR>/<broker>/ticks-YYYY-MM-DD.jsonl`
 *   (satu baris = satu tick valid). Tanpa DB native (tanpa kompilasi),
 *   bisa dibaca manusia, aman ditulis saat EA menahan quotes.csv
 *   (file terpisah, tidak dikunci EA).
 * - Record: ts_utc (ISO, waktu absolut) + ts_raw (asli MT5) + broker +
 *   symbol + bid/ask + received_at (jam backend). ts_raw disimpan agar
 *   bucketing ulang tetap mungkin bila offset zona terbukti salah.
 * - Normalisasi zona: timestamp MT5 "YYYY.MM.DD HH:MM:SS" adalah waktu
 *   SERVER (zona tak diketahui) → UTC via offset per broker dari env
 *   MT5_TZ_OFFSET_<OTB|FINEX> (jam, default +3). ISO dilewatkan utuh.
 * - Dedup: tick identik (symbol|ts_raw|bid|ask) dengan yang sudah
 *   tersimpan dilewati — membunuh duplikat 14 ribu baris EA OTB.
 * - Asumsi append-only EA: ingest memproses tail (1000 baris) per update
 *   + full-array sekali saat backfill awal. Kunci terlihat dibatasi
 *   (LRU sederhana) agar memori tetap datar.
 * - Retensi: file lebih tua dari HISTORY_RETENTION_DAYS (default 120)
 *   dihapus saat init. Coverage jujur: simbol + rentang + hitungan.
 */

export const DEFAULT_TZ_OFFSET_HOURS = 3;
export const DEFAULT_RETENTION_DAYS = 120;
export const HISTORY_FILENAME_PREFIX = "ticks-";
const TAIL_ROWS = 1000;
const MAX_SEEN_KEYS = 20000;
const SEEN_PRUNE_BATCH = 5000;
/** Langkah 4b-1: ekor file yang dibaca saat start (±40 ribu baris tick). */
export const SEEN_TAIL_BYTES = 8 * 1024 * 1024;

export interface HistoryTick {
  readonly ts_utc: string;
  readonly ts_raw: string;
  readonly broker: string;
  readonly symbol: string;
  readonly bid: number;
  readonly ask: number;
  readonly received_at: string;
}

export interface SymbolCoverage {
  readonly count: number;
  readonly first: string;
  readonly last: string;
}

export interface BrokerCoverage {
  readonly broker: string;
  readonly files: number;
  readonly symbols: Record<string, SymbolCoverage>;
}

const MT5_TS_RE = /^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

/** Validasi offset zona jam; invalid → default (dilog pemanggil). */
export function resolveTzOffset(raw: unknown): number {
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n === "number" && Number.isFinite(n) && n >= -12 && n <= 14) {
    return n;
  }
  return DEFAULT_TZ_OFFSET_HOURS;
}

/**
 * Normalisasi timestamp tick ke ISO UTC. MT5 "YYYY.MM.DD HH:MM:SS"
 * dibaca sebagai waktu server lalu digeser offset; ISO absolut
 * dilewatkan via Date.parse. Invalid → null (baris dilewati, dihitung).
 */
export function normalizeTsToUtc(
  timestamp: string,
  tzOffsetHours: number,
): string | null {
  const trimmed = timestamp.trim();
  if (trimmed === "") return null;
  const mt5 = MT5_TS_RE.exec(trimmed);
  if (mt5 !== null) {
    const ms =
      Date.UTC(
        Number(mt5[1]),
        Number(mt5[2]) - 1,
        Number(mt5[3]),
        Number(mt5[4]),
        Number(mt5[5]),
        Number(mt5[6]),
      ) -
      tzOffsetHours * 3600 * 1000;
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  const iso = Date.parse(trimmed);
  return Number.isFinite(iso) ? new Date(iso).toISOString() : null;
}

/** Nama file harian dari ISO UTC: ticks-YYYY-MM-DD.jsonl. */
export function historyFileName(tsUtc: string): string {
  return `${HISTORY_FILENAME_PREFIX}${tsUtc.slice(0, 10)}.jsonl`;
}

/** Kunci dedup tick identik. */
export function tickKey(
  symbol: string,
  tsRaw: string,
  bid: number,
  ask: number,
): string {
  return `${symbol}|${tsRaw}|${bid}|${ask}`;
}

function isValidQuote(q: QuoteSnapshot): boolean {
  return (
    typeof q.symbol === "string" &&
    q.symbol.length > 0 &&
    typeof q.timestamp === "string" &&
    Number.isFinite(q.bid) &&
    q.bid > 0 &&
    Number.isFinite(q.ask) &&
    q.ask > 0 &&
    q.ask > q.bid
  );
}

/**
 * Baca maksimal `maxBytes` terakhir file sebagai teks. Bila tidak dari awal
 * file, baris pertama (terpotong) dibuang. Aman untuk file sangat besar.
 */
export function readTailText(file: string, maxBytes: number): string {
  const size = fs.statSync(file).size;
  const len = Math.min(size, Math.max(0, maxBytes));
  if (len === 0) return "";
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buf, 0, len, size - len);
  } finally {
    fs.closeSync(fd);
  }
  const text = buf.toString("utf-8");
  if (len === size) return text;
  const nl = text.indexOf("\n");
  return nl < 0 ? "" : text.slice(nl + 1);
}

export class TickHistoryLogger {
  private readonly dir: string;
  private readonly broker: string;
  private readonly tzOffsetHours: number;
  private readonly seen = new Set<string>();
  private appendedTotal = 0;
  private skippedTotal = 0;

  constructor(historyDir: string, broker: string, tzOffsetHours: number) {
    this.dir = path.join(historyDir, broker);
    this.broker = broker;
    this.tzOffsetHours = tzOffsetHours;
    fs.mkdirSync(this.dir, { recursive: true });
    this.loadSeenFromDisk();
    const compacted = this.compact();
    if (compacted.dupesRemoved > 0) {
      console.log(
        `✓ History ${broker}: compact ${compacted.dupesRemoved} baris duplikat dari ${compacted.filesCompacted} file`,
      );
    }
    this.prune();
  }

  /**
   * Muat kunci tick yang sudah tersimpan ke memori (dedup lintas restart).
   * Tanpa ini, backfill setiap start backend menulis ulang tick lama.
   * Langkah 4b-1: hanya EKOR file terbaru (SEEN_TAIL_BYTES) yang dibaca —
   * file harian 300–420 MB tidak lagi dimuat utuh (lambat, ±1 GB RAM, dan
   * > 512 MB gagal jadi string). Yang diingat = tick TERBARU (dulu justru
   * 20.000 tick pertama file), dibatasi MAX_SEEN_KEYS.
   */
  private loadSeenFromDisk(): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(this.dir);
    } catch {
      return;
    }
    const files = entries
      .filter((n) => /^ticks-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n))
      .sort()
      .reverse();
    const batches: string[][] = [];
    let total = 0;
    for (const name of files) {
      if (total >= MAX_SEEN_KEYS) break;
      let text: string;
      try {
        text = readTailText(path.join(this.dir, name), SEEN_TAIL_BYTES);
      } catch {
        continue;
      }
      const keys: string[] = [];
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        try {
          const rec = JSON.parse(trimmed) as Partial<HistoryTick>;
          if (
            typeof rec.symbol === "string" &&
            typeof rec.ts_raw === "string" &&
            typeof rec.bid === "number" &&
            typeof rec.ask === "number"
          ) {
            keys.push(tickKey(rec.symbol, rec.ts_raw, rec.bid, rec.ask));
          }
        } catch {
          // Baris korup dilewati (coverage juga melewatinya).
        }
      }
      const take = keys.slice(-(MAX_SEEN_KEYS - total));
      batches.push(take);
      total += take.length;
    }
    // File lama dulu, terbaru terakhir → pemangkasan LRU membuang yang lama.
    for (const batch of batches.reverse()) {
      for (const key of batch) this.seen.add(key);
    }
  }

  /**
   * Tulis ulang file dengan baris duplikat dibuang (pertahankan kemunculan
   * pertama). Sekali jalan saat init; murah pada skala personal.
   */
  compact(): { filesCompacted: number; dupesRemoved: number } {
    let filesCompacted = 0;
    let dupesRemoved = 0;
    let entries: string[];
    try {
      entries = fs.readdirSync(this.dir);
    } catch {
      return { filesCompacted, dupesRemoved };
    }
    for (const name of entries) {
      if (!/^ticks-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) continue;
      const full = path.join(this.dir, name);
      let text: string;
      try {
        text = fs.readFileSync(full, "utf-8");
      } catch {
        continue;
      }
      const seenLocal = new Set<string>();
      const kept: string[] = [];
      let removed = 0;
      for (const line of text.split("\n")) {
        if (line.trim() === "") continue;
        let key: string | null = null;
        try {
          const rec = JSON.parse(line) as Partial<HistoryTick>;
          if (
            typeof rec.symbol === "string" &&
            typeof rec.ts_raw === "string" &&
            typeof rec.bid === "number" &&
            typeof rec.ask === "number"
          ) {
            key = tickKey(rec.symbol, rec.ts_raw, rec.bid, rec.ask);
          }
        } catch {
          key = null;
        }
        if (key === null || seenLocal.has(key)) {
          removed++;
          continue;
        }
        seenLocal.add(key);
        kept.push(line);
      }
      if (removed > 0) {
        try {
          fs.writeFileSync(full, kept.length > 0 ? kept.join("\n") + "\n" : "");
          filesCompacted++;
          dupesRemoved += removed;
        } catch {
          // Gagal tulis: biarkan file apa adanya.
        }
      }
    }
    return { filesCompacted, dupesRemoved };
  }

  /** Hapus file harian lebih tua dari retensi (default 120 hari). */
  prune(retentionDays: number = DEFAULT_RETENTION_DAYS): number {
    let removed = 0;
    let entries: string[];
    try {
      entries = fs.readdirSync(this.dir);
    } catch {
      return 0;
    }
    const cutoff = Date.now() - retentionDays * 86400 * 1000;
    for (const name of entries) {
      const m = /^ticks-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name);
      if (m === null) continue;
      const dayMs = Date.parse(`${m[1]}T00:00:00.000Z`);
      if (Number.isFinite(dayMs) && dayMs < cutoff) {
        try {
          fs.unlinkSync(path.join(this.dir, name));
          removed++;
        } catch {
          // File hilang di tengah jalan: abaikan, lanjutkan.
        }
      }
    }
    return removed;
  }

  private remember(key: string): boolean {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    if (this.seen.size > MAX_SEEN_KEYS) {
      const it = this.seen.values();
      for (let i = 0; i < SEEN_PRUNE_BATCH; i++) {
        const next = it.next();
        if (next.done) break;
        this.seen.delete(next.value);
      }
    }
    return true;
  }

  /**
   * Arsipkan tick dari snapshot reader.
   * - full=true (backfill awal): proses SELURUH array.
   * - full=false (update rutin): proses tail 1000 baris (asumsi EA append).
   * Mengembalikan {appended, skipped} untuk log jujur.
   */
  ingest(
    quotes: readonly QuoteSnapshot[],
    full: boolean = false,
  ): { appended: number; skipped: number } {
    const rows = full ? quotes : quotes.slice(-TAIL_ROWS);
    const receivedAt = new Date().toISOString();
    const byFile = new Map<string, string[]>();
    let appended = 0;
    let skipped = 0;

    for (const q of rows) {
      if (!isValidQuote(q)) {
        skipped++;
        continue;
      }
      const tsUtc = normalizeTsToUtc(q.timestamp, this.tzOffsetHours);
      if (tsUtc === null) {
        skipped++;
        continue;
      }
      const key = tickKey(q.symbol, q.timestamp.trim(), q.bid, q.ask);
      if (!this.remember(key)) {
        skipped++;
        continue;
      }
      const record: HistoryTick = {
        ts_utc: tsUtc,
        ts_raw: q.timestamp.trim(),
        broker: this.broker,
        symbol: q.symbol,
        bid: q.bid,
        ask: q.ask,
        received_at: receivedAt,
      };
      const file = historyFileName(tsUtc);
      const list = byFile.get(file) ?? [];
      list.push(JSON.stringify(record));
      byFile.set(file, list);
      appended++;
    }

    for (const [file, lines] of byFile) {
      try {
        fs.appendFileSync(path.join(this.dir, file), lines.join("\n") + "\n");
      } catch {
        skipped += lines.length;
        appended -= lines.length;
      }
    }

    this.appendedTotal += appended;
    this.skippedTotal += skipped;
    return { appended, skipped };
  }

  /** Cakupan arsip: per simbol {count, first, last} + jumlah file. */
  coverage(): BrokerCoverage {
    const symbols: Record<string, { count: number; first: string; last: string }> =
      {};
    let files = 0;
    let entries: string[];
    try {
      entries = fs.readdirSync(this.dir);
    } catch {
      return { broker: this.broker, files: 0, symbols };
    }
    for (const name of entries) {
      if (!name.startsWith(HISTORY_FILENAME_PREFIX) || !name.endsWith(".jsonl")) {
        continue;
      }
      files++;
      let text: string;
      try {
        text = fs.readFileSync(path.join(this.dir, name), "utf-8");
      } catch {
        continue;
      }
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        let rec: Partial<HistoryTick>;
        try {
          rec = JSON.parse(trimmed) as Partial<HistoryTick>;
        } catch {
          continue;
        }
        if (
          typeof rec.symbol !== "string" ||
          typeof rec.ts_utc !== "string" ||
          rec.symbol === "" ||
          rec.ts_utc === ""
        ) {
          continue;
        }
        const prev = symbols[rec.symbol];
        if (prev === undefined) {
          symbols[rec.symbol] = { count: 1, first: rec.ts_utc, last: rec.ts_utc };
        } else {
          symbols[rec.symbol] = {
            count: prev.count + 1,
            first: rec.ts_utc < prev.first ? rec.ts_utc : prev.first,
            last: rec.ts_utc > prev.last ? rec.ts_utc : prev.last,
          };
        }
      }
    }
    return { broker: this.broker, files, symbols };
  }

  getTotals(): { appended: number; skipped: number } {
    return { appended: this.appendedTotal, skipped: this.skippedTotal };
  }
}
