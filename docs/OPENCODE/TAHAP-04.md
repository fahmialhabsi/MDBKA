# Tahap 04 — Snapshot keputusan (A7-4), test kembar (A7-6), catatan keputusan saat entry (G-4)

**Fase:** 0. **Tampilan tidak berubah.** **Nomor test:** 704–706. **Target akhir:** 702 lolos, 0 gagal.
**Cara kerja: SALIN-TEMPEL.** Semua kode sudah diuji Claude (702 lolos; `tsc -b`, `tsc -p tsconfig.server.json --noEmit`, eslint bersih). **Jangan mengubah, merapikan, atau "memperbaiki" kode.** Bila teks penanda tidak ditemukan persis, berhenti dan tulis di laporan.

Rancangan: fondasi A7 (butir 1–3, 6), G2 (`keputusan`), G3 (keputusan jalur entry → tiket).

**Apa yang dibuat:**
- Satu bentuk "snapshot keputusan" (semua masukan `scanSymbol`) dan sidik jarinya (SHA-256) supaya keputusan bisa diputar ulang dengan masukan yang persis sama.
- Setiap posisi baru yang terlihat di server (catatan entry yang sudah ada) kini juga menulis satu baris `keputusan` jalur `entry` ke `data/keputusan/keputusan-<broker>-<YYYY-MM>.jsonl`, lengkap dengan `tiket` dan sidik jari. Gagal tulis tidak pernah menghentikan catatan entry.

Urutan: Langkah 1 → 5.

---

## Langkah 1 — `src/lib/jsonlRecord.ts` (1 sisipan)

Cari blok ini (akhir `interface KeputusanRecord`, tepat sebelum `export interface BayanganRecord`):
```ts
  readonly mengoreksi: string | null;
}

export interface BayanganRecord {
```
Ganti dengan:
```ts
  readonly mengoreksi: string | null;
  /** A7-4: tiket posisi MT5 untuk jalur entry (G3); absen/null di jalur lain. */
  readonly tiket?: string | null;
}

export interface BayanganRecord {
```

## Langkah 2 — Berkas baru `src/lib/decisionSnapshot.ts` (isi persis)

````ts
/**
 * A7-4 (13 Okt 2026) — snapshot keputusan: satu bentuk masukan untuk semua
 * jalur yang memakai scanSymbol (pemindai, detail sinyal, entry, backtest),
 * plus pembangun baris `keputusan` (G5). Murni: sidik jari SHA-256 dihitung
 * di server (jsonlStore.snapshotFingerprint) dari `snapshotMaterial`.
 */
import { usdIdrRate } from "../services/fxRateService";
import type { BrokerId } from "../types/broker";
import type { KeputusanRecord } from "./jsonlRecord";
import { riskGroupOf } from "./riskGroup";
import type { ScanInput, ScanRow } from "./symbolScanner";

export interface DecisionMeta {
  readonly keputusanId: string;
  readonly jalur: "pemindai" | "entry" | "backtest";
  readonly waktuUtc: string;
  readonly waktuServer: string | null;
  readonly sidikJariSnapshot: string | null;
  readonly tiket: string | null;
}

/**
 * Isi snapshot yang menentukan hasil scanSymbol, dalam bentuk data biasa
 * (Map → daftar terurut). Dua masukan yang setara menghasilkan materi yang
 * sama (urutan kunci diurus canonicalJson). Fungsi tidak dibandingkan.
 */
export function snapshotMaterial(input: ScanInput): Record<string, unknown> {
  const specHolds =
    input.specHolds === null || input.specHolds === undefined
      ? null
      : [...input.specHolds.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return {
    symbol: input.symbol,
    brokerId: input.brokerId,
    strategy: input.strategy ?? "skor",
    csv: input.csv,
    quote: input.quote,
    equity: input.equity,
    fxRates: input.fxRates,
    nowMs: input.nowMs ?? null,
    referenceCandleMs: input.referenceCandleMs ?? null,
    openPositions: (input.openPositions ?? []).map((p) => ({ symbol: p.symbol, side: p.side })),
    pauseReason: input.pauseReason ?? null,
    newsEvents: input.newsEvents ?? null,
    newsNow: input.newsNow ?? null,
    sessions: input.sessions ?? null,
    specHolds,
    openingNowMs: input.openingNowMs ?? null,
    proof: input.proof ?? null,
  };
}

/** Jumlah baris data CSV dan teks waktu candle terakhir apa adanya (kolom pertama). */
function csvSummary(csv: string): { readonly count: number; readonly last: string | null } {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { count: 0, last: null };
  const last = (lines[lines.length - 1].split(",")[0] ?? "").trim();
  return { count: lines.length - 1, last: last === "" ? null : last };
}

/** Baris `keputusan` (G5) dari masukan + hasil scanSymbol. Nilai yang tidak diketahui = null. */
export function keputusanFromScan(input: ScanInput, row: ScanRow, meta: DecisionMeta): KeputusanRecord {
  const csv = csvSummary(input.csv);
  const held = row.status !== "LOLOS" && row.status !== "TUNGGU";
  const broker: BrokerId = input.brokerId;
  return {
    skema: "keputusan/1",
    keputusanId: meta.keputusanId,
    jalur: meta.jalur,
    waktuUtc: meta.waktuUtc,
    waktuServer: meta.waktuServer,
    waktuDiterima: meta.waktuUtc,
    broker,
    login: null,
    jenisAkun: "tidak-terbukti",
    setaraLive: null,
    simbol: input.symbol,
    golongan: riskGroupOf(input.symbol).id,
    versiSpesifikasi: null,
    aturanId: input.strategy ?? "skor",
    versi: "1",
    sidikJariSnapshot: meta.sidikJariSnapshot,
    masukan: {
      bid: input.quote?.bid ?? null,
      ask: input.quote?.ask ?? null,
      umurKuotasiDetik: null,
      candleTerakhir: csv.last,
      jumlahCandle: csv.count,
      ma50: null,
      rsi: null,
      cci: null,
      macd: null,
      atr: null,
      kursUsdIdr: usdIdrRate(input.fxRates),
      tanggalKurs: null,
      equity: Number.isFinite(input.equity) ? input.equity : null,
    },
    kualitasData: [],
    penjaga: held
      ? [{ nama: row.status, hasil: "GAGAL", kodeAlasan: row.status, sumberData: null, umurDataDetik: null }]
      : [],
    hasil: {
      status: row.status,
      keputusan: row.decision ?? "TUNGGU",
      arahAsli: row.direction,
      entry: row.plan?.entry ?? null,
      sl: row.plan?.stopLoss ?? null,
      tp: row.plan?.takeProfit ?? null,
      lot: row.plan?.suggestedLot ?? null,
      risikoUsd: null,
      risikoRp: null,
      porsiBiaya: row.costShareOfRisk,
      kodeAlasanUtama: row.status === "LOLOS" || row.status === "TUNGGU" ? null : row.status,
    },
    sumber: "live",
    diubahManual: [],
    mengoreksi: null,
    tiket: meta.tiket,
  };
}
````

## Langkah 3 — GANTI SELURUH ISI `server/services/tradeEntryLog.ts` dengan isi di bawah (persis)

Berkas ini diganti utuh supaya tidak ada sisipan yang terlewat. Fungsi lama tetap ada dengan nama yang sama; yang bertambah hanya opsi `decisionDataDir`, fungsi `recordDecision`, parameter `ticket` pada `scanFor`, dan 4 impor.

````ts
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  lastCandleTimeMs,
  scanSymbol,
  type ScanInput,
  type ScanRow,
  type ScanStatus,
} from "../../src/lib/symbolScanner";
import type { ExchangeRates } from "../../src/services/fxRateService";
import type { BrokerId } from "../../src/types/broker";
import { collectCandleItems, type CandleSource } from "../routes/candlesRoutes";
import { randomUUID } from "node:crypto";
import { jsonlRelativePath } from "../../src/lib/jsonlRecord";
import { keputusanFromScan, snapshotMaterial } from "../../src/lib/decisionSnapshot";
import { appendJsonlRecord, snapshotFingerprint } from "./jsonlStore";
import type { BrokerPosition } from "../types/positions";
import type { NewsEventLike } from "../../src/lib/newsGuard";
import type { TradeSession } from "../../src/lib/sessionGuard";

/**
 * Langkah 4b (Mode Aman, 8 Okt 2026) — catatan entry posisi.
 *
 * Setiap tiket posisi BARU di positions.csv dicatat SEKALI ke JSONL
 * (append-only): SL/TP awal (History MT5 tidak menyimpannya) + hasil
 * pemindai Mode Aman saat posisi pertama terlihat. Dipasangkan dengan
 * History (PositionId = tiket) di langkah 4c untuk membuktikan apakah
 * setup "Lolos" benar-benar menang.
 *
 * Posisi yang SUDAH terbuka saat backend start ditandai preExisting dan
 * tanpa scan (analisa saat entry tidak diketahui — tanpa angka fiktif).
 */
export interface EntryScan {
  readonly status: ScanStatus;
  readonly direction: "BELI" | "JUAL" | "TUNGGU" | null;
  readonly score: number | null;
  readonly costShareOfRisk: number | null;
  readonly reason: string;
}

export interface TradeEntryRecord {
  readonly ticket: string;
  readonly broker: BrokerId;
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly volume: number;
  readonly priceOpen: number;
  readonly sl: number;
  readonly tp: number;
  readonly timeOpen: string;
  readonly firstSeenUtc: string;
  readonly preExisting: boolean;
  readonly equity: number | null;
  readonly scan: EntryScan | null;
}

export interface TradeEntryLogOptions {
  readonly file: string;
  readonly broker: BrokerId;
  readonly commonDir: string;
  readonly quotes: CandleSource;
  readonly getEquity: () => number | null;
  readonly getFxRates: () => ExchangeRates | null;
  /**
   * Opsi 6a (8 Okt 2026): alasan jeda 3-rugi-beruntun pada jam server
   * entry (timeOpen posisi), atau null bila tidak jeda. Tanpa ini entry
   * saat jeda tercatat "LOLOS" dan mencemari bukti n>=20.
   */
  readonly getPauseReason?: (serverTime: string) => string | null;
  /**
   * Satpam Kalender K4c (9 Okt 2026): event kalender broker ini (jam
   * server); dinilai pada jam entry (timeOpen). null / gagal = tanpa satpam.
   */
  readonly getNewsEvents?: () => readonly NewsEventLike[] | null;
  /** Satpam Sesi S3: jam trading resmi broker; null / gagal = tanpa satpam. */
  readonly getSessions?: () => readonly TradeSession[] | null;
  /** V2c-2: simbol → alasan spesifikasi MT5 beda spec32; null / gagal = tanpa satpam. */
  readonly getSpecHolds?: () => ReadonlyMap<string, string> | null;
  /**
   * A7-4/G-4 (13 Okt 2026): folder data/ untuk baris `keputusan` jalur entry
   * (data/keputusan/keputusan-<broker>-<YYYY-MM>.jsonl). Absen = tidak dicatat.
   * Gagal tulis tidak pernah menghentikan catatan entry.
   */
  readonly decisionDataDir?: string;
  readonly now?: () => Date;
}

export interface TradeEntryLog {
  readonly file: string;
  /** Catat tiket baru dari snapshot posisi; mengembalikan yang baru dicatat. */
  ingest(positions: readonly BrokerPosition[]): TradeEntryRecord[];
  readAll(): TradeEntryRecord[];
}

/** Baca semua catatan entry (baris rusak dilewati). Dipakai evaluasi 4c. */
export function readTradeEntries(file: string): TradeEntryRecord[] {
  if (!existsSync(file)) return [];
  const out: TradeEntryRecord[] = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim() === "") continue;
    try {
      const rec = JSON.parse(line) as TradeEntryRecord;
      if (typeof rec.ticket === "string") out.push(rec);
    } catch {
      // Baris rusak (mis. terpotong saat mati listrik): lewati, jangan tebak.
    }
  }
  return out;
}

export function createTradeEntryLog(opts: TradeEntryLogOptions): TradeEntryLog {
  const now = opts.now ?? (() => new Date());
  const known = new Set(readTradeEntries(opts.file).map((r) => r.ticket));
  let first = true;

  // Gagal baca History → tanpa jeda (catatan tetap ditulis; jangan blok).
  const pauseAt = (timeOpen: string): string | null => {
    if (opts.getPauseReason === undefined) return null;
    try {
      return opts.getPauseReason(timeOpen);
    } catch {
      return null;
    }
  };

  // Gagal baca kalender → tanpa satpam berita (catatan tetap ditulis).
  const newsEvents = (): readonly NewsEventLike[] | null => {
    if (opts.getNewsEvents === undefined) return null;
    try {
      return opts.getNewsEvents();
    } catch {
      return null;
    }
  };

  const sessions = (): readonly TradeSession[] | null => {
    if (opts.getSessions === undefined) return null;
    try {
      return opts.getSessions();
    } catch {
      return null;
    }
  };

  const specHolds = (): ReadonlyMap<string, string> | null => {
    if (opts.getSpecHolds === undefined) return null;
    try {
      return opts.getSpecHolds();
    } catch {
      return null;
    }
  };

  // A7-4/G-4: satu baris `keputusan` per entry baru; gagal = diam (catatan entry tetap).
  const recordDecision = (input: ScanInput, row: ScanRow, timeOpen: string, ticket: string): void => {
    if (opts.decisionDataDir === undefined) return;
    try {
      const waktuUtc = now().toISOString().slice(0, 19) + "Z";
      const rec = keputusanFromScan(input, row, {
        keputusanId: randomUUID(),
        jalur: "entry",
        waktuUtc,
        waktuServer: timeOpen,
        sidikJariSnapshot: snapshotFingerprint(snapshotMaterial(input)),
        tiket: ticket,
      });
      appendJsonlRecord(opts.decisionDataDir, jsonlRelativePath("keputusan", opts.broker, waktuUtc), rec);
    } catch {
      // Jangan blok catatan entry.
    }
  };

  const scanFor = (
    symbol: string,
    equity: number | null,
    others: readonly { symbol: string; side: string }[],
    timeOpen: string,
    ticket: string,
  ): EntryScan => {
    const items = collectCandleItems(opts.quotes, opts.commonDir);
    const item = items.find((i) => i.symbol === symbol);
    if (item === undefined || equity === null) {
      return {
        status: "DATA",
        direction: null,
        score: null,
        costShareOfRisk: null,
        reason:
          item === undefined
            ? "CSV candle simbol tidak ada saat entry"
            : "Equity live tidak tersedia saat entry",
      };
    }
    const reference = items.reduce<number | null>((max, i) => {
      const t = lastCandleTimeMs(i.csv);
      return t !== null && (max === null || t > max) ? t : max;
    }, null);
    const input: ScanInput = {
      symbol,
      brokerId: opts.broker,
      csv: item.csv,
      quote: item.quote,
      equity,
      fxRates: opts.getFxRates(),
      referenceCandleMs: reference,
      // Langkah D: dinilai terhadap posisi LAIN yang sudah terbuka.
      openPositions: others,
      pauseReason: pauseAt(timeOpen),
      // K4c: berita Tinggi ±30 mnt dinilai pada jam server entry.
      newsEvents: newsEvents(),
      newsNow: timeOpen,
      sessions: sessions(),
      specHolds: specHolds(),
      // O2b: pembukaan bursa pada jam nyata posisi pertama terlihat (≈ jam entry).
      openingNowMs: now().getTime(),
    };
    const row = scanSymbol(input);
    recordDecision(input, row, timeOpen, ticket);
    return {
      status: row.status,
      direction: row.direction,
      score: row.score,
      costShareOfRisk: row.costShareOfRisk,
      reason: row.reason,
    };
  };

  return {
    file: opts.file,
    ingest(positions) {
      const preExisting = first;
      first = false;
      const added: TradeEntryRecord[] = [];
      for (const p of positions) {
        if (known.has(p.ticket)) continue;
        const equity = opts.getEquity();
        let scan: EntryScan | null = null;
        if (!preExisting) {
          try {
            scan = scanFor(
              p.symbol,
              equity,
              positions.filter((o) => o.ticket !== p.ticket),
              p.timeOpen,
              p.ticket,
            );
          } catch (e) {
            scan = {
              status: "DATA",
              direction: null,
              score: null,
              costShareOfRisk: null,
              reason: `Pemindai gagal: ${e instanceof Error ? e.message : String(e)}`,
            };
          }
        }
        const rec: TradeEntryRecord = {
          ticket: p.ticket,
          broker: opts.broker,
          symbol: p.symbol,
          side: p.side,
          volume: p.volume,
          priceOpen: p.priceOpen,
          sl: p.sl,
          tp: p.tp,
          timeOpen: p.timeOpen,
          firstSeenUtc: now().toISOString(),
          preExisting,
          equity,
          scan,
        };
        mkdirSync(dirname(opts.file), { recursive: true });
        appendFileSync(opts.file, `${JSON.stringify(rec)}\n`, "utf8");
        known.add(p.ticket);
        added.push(rec);
      }
      return added;
    },
    readAll() {
      return readTradeEntries(opts.file);
    },
  };
}
````

## Langkah 4 — `server/index.ts` (1 sisipan)

Cari (di dalam `createTradeEntryLog({ ... })`):
```ts
        return snap === null ? null : specHoldMap(snap.diffs);
      },
```
Tepat **di bawah** dua baris itu tambahkan:
```ts
      // A7-4/G-4 (13 Okt 2026): baris `keputusan` jalur entry + sidik jari snapshot.
      decisionDataDir: path.join(process.cwd(), "data"),
```
Pertahankan akhir baris berkas (CRLF).

## Langkah 5 — `scripts/run-tests.ts` (hanya sisipan, CRLF)

**Impor:** tepat **di bawah** baris:
```ts
import { handleShadowRequest } from "../server/routes/keputusanRoutes";
```
tambahkan:
```ts
import { keputusanFromScan, snapshotMaterial } from "../src/lib/decisionSnapshot";
```

**Test:** sisipkan blok berikut tepat **di atas** baris yang diawali `test("288. parseECBXml()`:

````ts
test("704. A7-4 snapshot keputusan: materi setara = sidik jari sama; isi berbeda = sidik jari berbeda", () => {
  const csv = scanCsv(80);
  const a = {
    symbol: "GBPUSD", brokerId: "finex" as const, csv, quote: null, equity: 10000, fxRates: null,
    specHolds: new Map([["AUDJPY", "beda"], ["XAUUSD", "beda"]]),
    sessions: [{ symbol: "GBPUSD", day: 1, fromMin: 0, toMin: 1440 }],
  };
  const b = {
    sessions: [{ symbol: "GBPUSD", day: 1, fromMin: 0, toMin: 1440 }],
    specHolds: new Map([["XAUUSD", "beda"], ["AUDJPY", "beda"]]),
    fxRates: null, equity: 10000, quote: null, csv, brokerId: "finex" as const, symbol: "GBPUSD",
  };
  const ma = snapshotMaterial(a);
  assert(canonicalJson(ma) === canonicalJson(snapshotMaterial(b)), "urutan kunci/Map tidak boleh berpengaruh");
  assert(snapshotFingerprint(ma) === snapshotFingerprint(snapshotMaterial(b)), "sidik jari harus sama");
  assert(ma.strategy === "skor" && ma.newsEvents === null && ma.proof === null, "nilai absen = default jujur (skor / null)");
  const lines = csv.split("\n");
  lines[lines.length - 1] = lines[lines.length - 1].replace(/,100$/, ",101");
  assert(snapshotFingerprint(snapshotMaterial({ ...a, csv: lines.join("\n") })) !== snapshotFingerprint(ma), "candle berubah = sidik jari berubah");
  assert(snapshotFingerprint(snapshotMaterial({ ...a, equity: 10001 })) !== snapshotFingerprint(ma), "equity berubah = sidik jari berubah");
});
test("705. A7-6 test kembar: snapshot setara → scanSymbol identik; pemindai, detail sinyal, entry, dan backtest memakai scanSymbol", () => {
  const csv = scanCsv(80);
  const a = { symbol: "GBPUSD", brokerId: "finex" as const, csv, quote: null, equity: 10000, fxRates: null, specHolds: new Map([["AUDJPY", "x"], ["EURUSD", "y"]]) };
  const b = { specHolds: new Map([["EURUSD", "y"], ["AUDJPY", "x"]]), fxRates: null, equity: 10000, quote: null, csv, brokerId: "finex" as const, symbol: "GBPUSD" };
  const ra = scanSymbol(a);
  const rb = scanSymbol(b);
  assert(canonicalJson(ra) === canonicalJson(rb), "hasil scanSymbol harus identik untuk snapshot setara");
  const rec = keputusanFromScan(a, ra, { keputusanId: "k-1", jalur: "pemindai", waktuUtc: "2026-10-08T06:15:00Z", waktuServer: null, sidikJariSnapshot: null, tiket: null });
  assert(rec.hasil.status === ra.status && rec.hasil.keputusan === (ra.decision ?? "TUNGGU") && rec.tiket === null && rec.sumber === "live", "baris keputusan mengikuti hasil scanSymbol");
  for (const rel of [
    "src/components/analysis/SymbolScannerPanel.tsx",
    "src/components/analysis/SignalDetailPage.tsx",
    "server/services/tradeEntryLog.ts",
    "src/lib/backtest.ts",
  ]) {
    assert(readSrc(rel).includes("scanSymbol("), `${rel} harus memakai scanSymbol`);
  }
  // Hasil analisa (App.tsx) masih jalur sendiri sampai klausul A9 (A7-5); dicatat lewat shadow S1–S3.
  assert(!readSrc("src/App.tsx").includes("scanSymbol("), "App belum boleh memakai scanSymbol (menunggu A9)");
});
test("706. G-4 catatan entry menulis baris keputusan jalur entry + tiket + sidik jari; gagal tulis tidak memblok", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const nfs = require("node:fs") as unknown as typeof import("node:fs");
  const npath = require("node:path") as unknown as typeof import("node:path");
  const dir = nfs.mkdtempSync(npath.join(os.tmpdir(), "entries-keputusan-"));
  try {
    nfs.writeFileSync(npath.join(dir, "MDBKA_GBPUSD_H1.csv"), scanCsv(80));
    const quotes = { getSymbols: () => ["GBPUSD"], getLatestBySymbol: () => [] };
    const dataDir = npath.join(dir, "data");
    const pos = (ticket: string) => ({
      ticket, symbol: "GBPUSD", side: "BUY" as const, volume: 0.01,
      priceOpen: 1.3, sl: 1.29, tp: 1.31, timeOpen: "2026.10.08 09:15:00",
    });
    const log = createTradeEntryLog({
      file: npath.join(dataDir, "trades", "entries-finex.jsonl"), broker: "finex", commonDir: dir, quotes,
      getEquity: () => 10000, getFxRates: () => null, decisionDataDir: dataDir,
      now: () => new Date("2026-10-08T06:15:00Z"),
    });
    log.ingest([pos("1")]);
    const baru = log.ingest([pos("1"), pos("2")]);
    assert(baru.length === 1 && baru[0].scan !== null, "entry baru harus dipindai");
    const book = readJsonlRecords(dataDir, "keputusan/keputusan-finex-2026-10.jsonl", "keputusan/1");
    assert(book.records.length === 1 && book.brokenLines === 0, `harus 1 baris keputusan, dapat ${book.records.length}`);
    const rec = book.records[0];
    assert(rec.jalur === "entry" && rec.tiket === "2" && rec.waktuServer === "2026.10.08 09:15:00", "jalur/tiket/jam server");
    assert(typeof rec.sidikJariSnapshot === "string" && /^[0-9a-f]{64}$/.test(rec.sidikJariSnapshot), "sidik jari SHA-256");
    const hasil = rec.hasil as { status: string };
    assert(baru[0].scan !== null && hasil.status === baru[0].scan.status, "status keputusan = status catatan entry");
    const masukan = rec.masukan as { jumlahCandle: number; candleTerakhir: string | null; bid: number | null };
    assert(masukan.jumlahCandle === 80 && masukan.candleTerakhir === "2026.10.04 07:00" && masukan.bid === null, `masukan: ${JSON.stringify(masukan)}`);
    // Folder keputusan tidak bisa ditulis (berupa berkas) → entry tetap tercatat.
    const blocked = npath.join(dir, "blocked");
    nfs.writeFileSync(blocked, "bukan folder");
    const log2 = createTradeEntryLog({
      file: npath.join(dir, "b.jsonl"), broker: "finex", commonDir: dir, quotes,
      getEquity: () => 10000, getFxRates: () => null, decisionDataDir: blocked,
    });
    log2.ingest([]);
    assert(log2.ingest([pos("3")]).length === 1, "gagal tulis keputusan tidak boleh memblok catatan entry");
    const tanpa = createTradeEntryLog({
      file: npath.join(dir, "c.jsonl"), broker: "finex", commonDir: dir, quotes,
      getEquity: () => 10000, getFxRates: () => null,
    });
    tanpa.ingest([]);
    tanpa.ingest([pos("4")]);
    assert(readJsonlRecords(dataDir, "keputusan/keputusan-finex-2026-10.jsonl", "keputusan/1").records.length === 1, "tanpa decisionDataDir = tidak mencatat");
    assert(readSrc("server/index.ts").includes('decisionDataDir: path.join(process.cwd(), "data"),'), "server harus memasang decisionDataDir");
  } finally {
    nfs.rmSync(dir, { recursive: true, force: true });
  }
});
````

---

## Selesai tahap (WAJIB semua, tulis hasilnya di laporan)

1. `npm test` → **702 lolos, 0 gagal**.
2. `npm run build` → selesai tanpa error (tulis baris terakhirnya).
3. `npm run lint` → tanpa error.
4. `npx tsc -p tsconfig.server.json --noEmit` → tanpa error.
5. Tulis `docs/OPENCODE/LAPORAN-TAHAP-04.md`. Jangan commit.

Bila salah satu gagal: jangan mengubah kode di atas. Bandingkan salinan Anda dengan spesifikasi baris per baris (terutama baris `import` di awal berkas), lalu laporkan.
