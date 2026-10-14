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
  /** F4: versi spesifikasi broker saat keputusan ("YYYY-MM-DD#hash"); absen = null. */
  readonly versiSpesifikasi?: string | null;
  /** F3: identitas akun terbukti (EA); absen = login null, tidak-terbukti. */
  readonly login?: string | null;
  readonly jenisAkun?: "demo" | "live" | "tidak-terbukti";
  /** J2 (Tahap 13): entry di mode LIVE = setara Live; mode DEMO = tidak; absen = null. */
  readonly setaraLive?: boolean | null;
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
    login: meta.login ?? null,
    jenisAkun: meta.jenisAkun ?? "tidak-terbukti",
    setaraLive: meta.setaraLive ?? null,
    simbol: input.symbol,
    golongan: riskGroupOf(input.symbol).id,
    versiSpesifikasi: meta.versiSpesifikasi ?? null,
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
