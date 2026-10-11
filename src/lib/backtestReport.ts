/**
 * B3 (12 Okt 2026) — RAPOR ALAT UJI DATA LAMA. MODUL MURNI.
 *
 * Merangkum hasil runBacktest (satu atau beberapa simbol) menjadi angka
 * yang bisa dibaca orang awam: tingkat menang vs titik impas, hasil bersih
 * Rupiah setelah komisi, rugi beruntun terpanjang, dan turun terdalam.
 *
 * Data dibagi menurut WAKTU: bagian awal = data LATIH (boleh dipakai
 * menyetel aturan), bagian akhir = data UJIAN (tidak boleh diintip saat
 * menyetel). Strategi hanya "layak diuji di demo" bila untung di KEDUA
 * bagian dan masing-masing punya bukti minimal MIN_PROVEN_TRADES trade.
 *
 * Kurs USD→Rp memakai SATU angka dari pemanggil (kurs ECB terkini), bukan
 * kurs per tanggal — cukup untuk menilai strategi, bukan untuk pajak.
 */
import { candleTimeMs } from "./symbolScanner";
import { MIN_PROVEN_TRADES } from "./evaluationView";
import {
  BACKTEST_SKIPPED_GUARDS,
  type BacktestOutcome,
  type BacktestRun,
  type BacktestTrade,
} from "./backtest";

/** Porsi waktu untuk data latih (sisanya data ujian). */
export const BACKTEST_TRAIN_FRACTION = 0.7;

export type SegmentVerdict = "BELUM_CUKUP" | "UNTUNG" | "RUGI";
export type BacktestVerdict = "BELUM_CUKUP" | "LAYAK_DEMO" | "TIDAK_LAYAK";

export interface BacktestSegment {
  /** Trade yang sudah tutup (TERBUKA tidak dihitung). */
  readonly n: number;
  readonly wins: number;
  /** 0..1; null bila n = 0. */
  readonly winRate: number | null;
  /** Tingkat menang minimum agar tidak rugi (0..1); null bila belum bisa dihitung. */
  readonly breakEvenWinRate: number | null;
  readonly outcomes: Readonly<Record<Exclude<BacktestOutcome, "TERBUKA">, number>>;
  readonly totalUsd: number;
  /** null bila kurs Rupiah tidak tersedia. */
  readonly totalIdr: number | null;
  readonly expectancyIdr: number | null;
  readonly avgWinIdr: number | null;
  readonly avgLossIdr: number | null;
  readonly worstLosingStreak: number;
  /** Turun terdalam dari puncak saldo uji (Rupiah, angka positif). */
  readonly maxDrawdownIdr: number | null;
  readonly verdict: SegmentVerdict;
}

export interface BacktestReport {
  readonly symbols: readonly string[];
  readonly startTime: string;
  readonly endTime: string;
  /** Batas waktu latih | ujian. */
  readonly splitTime: string;
  readonly usdIdr: number | null;
  readonly all: BacktestSegment;
  readonly latih: BacktestSegment;
  readonly ujian: BacktestSegment;
  /** Posisi yang masih terbuka saat data habis (tidak dihitung). */
  readonly openAtEnd: number;
  readonly verdict: BacktestVerdict;
  readonly verdictText: string;
  readonly skippedGuards: readonly string[];
  readonly notes: readonly string[];
}

function rupiah(usd: number, usdIdr: number | null): number | null {
  return usdIdr === null ? null : Math.round(usd * usdIdr);
}

export function summarizeTrades(
  trades: readonly BacktestTrade[],
  usdIdr: number | null,
): BacktestSegment {
  const closed = trades.filter((t) => t.outcome !== "TERBUKA");
  const n = closed.length;
  const winsList = closed.filter((t) => t.netUsd > 0);
  const lossList = closed.filter((t) => t.netUsd <= 0);
  const totalUsd = Math.round(closed.reduce((a, t) => a + t.netUsd, 0) * 100) / 100;
  const avgWinUsd = winsList.length > 0 ? winsList.reduce((a, t) => a + t.netUsd, 0) / winsList.length : null;
  const avgLossUsd = lossList.length > 0 ? Math.abs(lossList.reduce((a, t) => a + t.netUsd, 0)) / lossList.length : null;
  const breakEvenWinRate =
    avgWinUsd !== null && avgLossUsd !== null && avgWinUsd + avgLossUsd > 0
      ? avgLossUsd / (avgWinUsd + avgLossUsd)
      : null;

  let streak = 0;
  let worst = 0;
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const t of closed) {
    streak = t.netUsd <= 0 ? streak + 1 : 0;
    worst = Math.max(worst, streak);
    equity += t.netUsd;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  const count = (o: BacktestOutcome): number => closed.filter((t) => t.outcome === o).length;
  const expectancyUsd = n > 0 ? totalUsd / n : null;
  return {
    n,
    wins: winsList.length,
    winRate: n > 0 ? winsList.length / n : null,
    breakEvenWinRate,
    outcomes: { TP: count("TP"), SL: count("SL"), WAKTU: count("WAKTU") },
    totalUsd,
    totalIdr: rupiah(totalUsd, usdIdr),
    expectancyIdr: expectancyUsd === null ? null : rupiah(expectancyUsd, usdIdr),
    avgWinIdr: avgWinUsd === null ? null : rupiah(avgWinUsd, usdIdr),
    avgLossIdr: avgLossUsd === null ? null : rupiah(avgLossUsd, usdIdr),
    worstLosingStreak: worst,
    maxDrawdownIdr: rupiah(Math.round(drawdown * 100) / 100, usdIdr),
    verdict: n < MIN_PROVEN_TRADES ? "BELUM_CUKUP" : totalUsd > 0 ? "UNTUNG" : "RUGI",
  };
}

function formatMs(ms: number): string {
  const d = new Date(ms);
  const p = (v: number): string => String(v).padStart(2, "0");
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Rapor gabungan beberapa simbol (urut jam tutup trade). */
export function buildBacktestReport(
  runs: readonly BacktestRun[],
  usdIdr: number | null,
  trainFraction: number = BACKTEST_TRAIN_FRACTION,
): BacktestReport {
  const ok = runs.filter((r) => r.error === null);
  const kurs = usdIdr !== null && Number.isFinite(usdIdr) && usdIdr > 0 ? usdIdr : null;
  const starts = ok.map((r) => candleTimeMs(r.startTime)).filter((v): v is number => v !== null);
  const ends = ok.map((r) => candleTimeMs(r.endTime)).filter((v): v is number => v !== null);
  const startMs = starts.length > 0 ? Math.min(...starts) : null;
  const endMs = ends.length > 0 ? Math.max(...ends) : null;
  const splitMs = startMs !== null && endMs !== null ? startMs + (endMs - startMs) * trainFraction : null;

  const trades = ok
    .flatMap((r) => r.trades)
    .slice()
    .sort((a, b) => (candleTimeMs(a.exitTime) ?? 0) - (candleTimeMs(b.exitTime) ?? 0));
  const isTrain = (t: BacktestTrade): boolean =>
    splitMs !== null && (candleTimeMs(t.signalTime) ?? Number.POSITIVE_INFINITY) < splitMs;
  const latih = summarizeTrades(trades.filter(isTrain), kurs);
  const ujian = summarizeTrades(trades.filter((t) => !isTrain(t)), kurs);

  const verdict: BacktestVerdict =
    latih.verdict === "BELUM_CUKUP" || ujian.verdict === "BELUM_CUKUP"
      ? "BELUM_CUKUP"
      : latih.verdict === "UNTUNG" && ujian.verdict === "UNTUNG"
        ? "LAYAK_DEMO"
        : "TIDAK_LAYAK";
  const verdictText =
    verdict === "LAYAK_DEMO"
      ? "Untung di data latih DAN data ujian — layak dicoba di akun demo (belum di akun live)."
      : verdict === "TIDAK_LAYAK"
        ? "Rugi di data latih atau data ujian — jangan dipakai; tetap TUNGGU."
        : `Bukti belum cukup (minimal ${MIN_PROVEN_TRADES} trade di latih DAN ujian) — belum bisa dinilai.`;

  const notes: string[] = [
    "Spread dianggap tetap (spread masa lalu tidak tercatat MT5).",
    "Slippage dan swap menginap tidak dihitung.",
    kurs === null
      ? "Kurs Rupiah tidak tersedia — hasil hanya dalam USD."
      : `Kurs tetap Rp${Math.round(kurs).toLocaleString("id-ID")}/USD untuk semua trade.`,
  ];
  for (const r of runs) {
    if (r.error !== null) notes.push(`${r.symbol}: ${r.error}`);
  }

  return {
    symbols: runs.map((r) => r.symbol),
    startTime: startMs === null ? "" : formatMs(startMs),
    endTime: endMs === null ? "" : formatMs(endMs),
    splitTime: splitMs === null ? "" : formatMs(splitMs),
    usdIdr: kurs,
    all: summarizeTrades(trades, kurs),
    latih,
    ujian,
    openAtEnd: trades.filter((t) => t.outcome === "TERBUKA").length,
    verdict,
    verdictText,
    skippedGuards: BACKTEST_SKIPPED_GUARDS,
    notes,
  };
}
