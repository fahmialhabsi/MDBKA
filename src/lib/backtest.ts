/**
 * B2 (12 Okt 2026) — INTI ALAT UJI DATA LAMA (backtest). MODUL MURNI.
 *
 * Memutar ulang CSV H1 panjang (MDBKA_<simbol>_H1_LONG.csv) candle demi
 * candle memakai `scanSymbol` (mesin + satpam yang SAMA dengan pemindai
 * live; decisionEngine tidak disentuh). Tiap jam mesin hanya melihat
 * `window` candle terakhir (default 200 = isi CSV live) — tanpa mengintip
 * masa depan. Sinyal LOLOS → posisi disimulasikan pada candle berikutnya.
 *
 * Aturan simulasi (sikap hati-hati):
 * - Candle MT5 = harga BID. BELI masuk di ask (= close + spread), keluar di
 *   bid. JUAL masuk di bid, keluar di ask (= harga candle + spread).
 * - SL dan TP tersentuh di candle yang sama → SL dianggap duluan.
 * - Harga loncat melewati SL/TP saat candle buka → keluar di harga buka.
 * - Time-stop 3 jam hanya golongan Forex & Forex JPY (timeStopApplies):
 *   ditutup di close candle saat umur posisi >= 3 jam.
 * - Satu posisi per simbol; sinyal baru dicari lagi setelah posisi tutup.
 * - Data habis saat posisi masih terbuka → "TERBUKA" (jangan dihitung).
 *
 * Satpam tanpa data historis (berita, sesi, pembukaan bursa, posisi lain,
 * jeda rugi beruntun, spesifikasi) TIDAK ikut dinilai — dilaporkan jujur.
 * Spread = angka tetap dari pemanggil (spread masa lalu tidak tercatat).
 * B5c: swap menginap ikut dipotong (estimateSwap: Finex mati, OTB/MIFX % tahunan).
 */
import type { Candle } from "../calculations/swingDetector";
import { convertToUSD, type ExchangeRates } from "../services/fxRateService";
import type { BrokerSettings } from "../types/analysis";
import type { BrokerId } from "../types/broker";
import { canonicalSymbolForBroker } from "./brokerSymbols";
import { parseCsvCandles } from "./csvCandleParser";
import { timeStopApplies, TIME_STOP_HOURS } from "./exitMonitor";
import { applyBrokerPreset } from "./marketReset";
import { estimateSwap } from "./swapEstimate";
import { withUsdPointValue } from "./usdPointValue";
import { candleTimeMs, scanSymbol, type ScanRiskHold, type ScanStatus } from "./symbolScanner";
import type { StrategyId } from "./strategyRegistry";

/** Jumlah candle yang dilihat mesin tiap jam (= CSV live AutoExport). */
export const BACKTEST_WINDOW = 200;

/** Satpam yang tidak bisa diuji ke masa lalu (tampil di rapor). */
export const BACKTEST_SKIPPED_GUARDS: readonly string[] = [
  "Satpam Kalender (berita)",
  "Satpam Sesi",
  "Satpam pembukaan bursa",
  "Taruhan ganda (posisi lain)",
  "Jeda 3 rugi beruntun",
  "Satpam spesifikasi",
];

export type BacktestOutcome = "TP" | "SL" | "WAKTU" | "TERBUKA";

export interface BacktestPlan {
  readonly direction: "BELI" | "JUAL";
  readonly entry: number;
  readonly stopLoss: number;
  readonly takeProfit: number;
}

export interface SimulatedExit {
  readonly outcome: BacktestOutcome;
  /** Indeks candle (pada array `future`) tempat posisi ditutup. */
  readonly exitIndex: number;
  readonly exitPrice: number;
}

export interface BacktestTrade extends BacktestPlan {
  readonly signalTime: string;
  readonly exitTime: string;
  readonly exitPrice: number;
  readonly outcome: BacktestOutcome;
  /** Lama posisi dalam candle H1. */
  readonly bars: number;
  /** Hasil dalam selisih harga searah posisi (+ untung), sebelum komisi. */
  readonly priceResult: number;
  /** Hasil dalam kelipatan risiko (1R = jarak entry→SL). */
  readonly rMultiple: number;
  /** B3: lot yang dipakai (saran mesin; tanpa saran = lot minimum broker). */
  readonly lot: number;
  /** B3: hasil bersih USD = (selisih harga × nilai poin − komisi) × lot + swap. */
  readonly netUsd: number;
  /**
   * B5c: swap menginap USD (negatif = biaya) dari mode broker (Finex mati = 0).
   * null = tidak bisa dihitung (spesifikasi/kurs tidak ada) → tidak masuk netUsd.
   */
  readonly swapUsd?: number | null;
}

export interface BacktestInput {
  readonly symbol: string;
  readonly brokerId: BrokerId;
  /** Isi CSV panjang (format MDBKA: time,open,high,low,close,tick_volume). */
  readonly csv: string;
  readonly equity: number;
  readonly fxRates: ExchangeRates | null;
  /** Spread tetap (satuan harga). <= 0 → spread 1 tick (perilaku pemindai). */
  readonly spread: number;
  readonly window?: number;
  /** S2: strategi yang diuji; absen = default "skor". */
  readonly strategy?: StrategyId;
  /**
   * E1 (12 Okt 2026) — PERCOBAAN batas waktu (jam) untuk golongan yang
   * memakai time-stop (Forex & Forex JPY). absen = aturan live (3 jam);
   * null = tanpa batas waktu. Golongan lain tetap tanpa batas.
   */
  readonly timeStopHours?: number | null;
  /** E2: lama satu candle (jam). absen = 1 (H1); 4 = H4 (dirakit dari H1). */
  readonly barHours?: number;
}

export interface BacktestRun {
  readonly symbol: string;
  readonly candles: number;
  /** Jumlah jam yang dinilai mesin. */
  readonly evaluated: number;
  /** Hitungan status pemindai per jam yang dinilai (tanpa jam saat posisi terbuka). */
  readonly statusCount: Readonly<Partial<Record<ScanStatus, number>>>;
  readonly trades: readonly BacktestTrade[];
  /** B5d: angka risiko tiap jam yang sinyalnya DITAHAN_RISIKO (bahan modal yang dibutuhkan). */
  readonly riskHolds?: readonly ScanRiskHold[];
  /** B3: jam candle pertama & terakhir yang dinilai mesin ("" bila gagal). */
  readonly startTime: string;
  readonly endTime: string;
  /** Pesan jujur bila data tidak bisa diuji (null = berjalan). */
  readonly error: string | null;
}

/**
 * Simulasi satu posisi pada candle SESUDAH sinyal. `future[0]` = candle
 * pertama setelah candle sinyal. `signalMs` = jam candle sinyal (untuk
 * time-stop; null = tanpa batas waktu).
 */
export function simulateTrade(
  plan: BacktestPlan,
  future: readonly Candle[],
  spread: number,
  signalMs: number | null,
  timeStopHours: number | null,
): SimulatedExit | null {
  if (future.length === 0) return null;
  const s = spread > 0 ? spread : 0;
  const buy = plan.direction === "BELI";
  for (let k = 0; k < future.length; k++) {
    const c = future[k];
    // Harga keluar: BELI keluar di bid (= candle), JUAL di ask (= candle + spread).
    const open = buy ? c.open : c.open + s;
    const high = buy ? c.high : c.high + s;
    const low = buy ? c.low : c.low + s;
    const close = buy ? c.close : c.close + s;
    if (buy) {
      if (open <= plan.stopLoss) return { outcome: "SL", exitIndex: k, exitPrice: open };
      if (open >= plan.takeProfit) return { outcome: "TP", exitIndex: k, exitPrice: open };
      if (low <= plan.stopLoss) return { outcome: "SL", exitIndex: k, exitPrice: plan.stopLoss };
      if (high >= plan.takeProfit) return { outcome: "TP", exitIndex: k, exitPrice: plan.takeProfit };
    } else {
      if (open >= plan.stopLoss) return { outcome: "SL", exitIndex: k, exitPrice: open };
      if (open <= plan.takeProfit) return { outcome: "TP", exitIndex: k, exitPrice: open };
      if (high >= plan.stopLoss) return { outcome: "SL", exitIndex: k, exitPrice: plan.stopLoss };
      if (low <= plan.takeProfit) return { outcome: "TP", exitIndex: k, exitPrice: plan.takeProfit };
    }
    if (timeStopHours !== null && signalMs !== null) {
      const ms = candleTimeMs(String(c.time ?? ""));
      if (ms !== null && ms - signalMs >= timeStopHours * 3_600_000) {
        return { outcome: "WAKTU", exitIndex: k, exitPrice: close };
      }
    }
  }
  const last = future[future.length - 1];
  return {
    outcome: "TERBUKA",
    exitIndex: future.length - 1,
    exitPrice: buy ? last.close : last.close + s,
  };
}

const ZERO_BROKER: BrokerSettings = {
  equity: 0, riskPercent: 0, minLot: 0, lotStep: 0, pointValue: 0,
  contractSize: 0, commission: 0, slippage: 0, buffer: 0,
  atrMultiplier: 0, targetRR: 0,
};

/** "2026.01.05 13:00" + n jam → format jam server yang sama. */
function addHours(time: string, hours: number): string {
  const ms = candleTimeMs(time);
  if (ms === null) return time;
  const d = new Date(ms + hours * 3_600_000);
  const p = (v: number): string => String(v).padStart(2, "0");
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function round12(v: number): number {
  return Number(v.toPrecision(12));
}

/** Jalankan uji data lama satu simbol. */
export function runBacktest(input: BacktestInput): BacktestRun {
  const window = input.window ?? BACKTEST_WINDOW;
  const symbol = canonicalSymbolForBroker(input.symbol, input.brokerId);
  const fail = (error: string, candles = 0): BacktestRun => ({
    symbol: symbol || input.symbol, candles, evaluated: 0, statusCount: {}, trades: [],
    startTime: "", endTime: "", error,
  });
  if (symbol === "") return fail("Simbol tidak dikenal");

  const lines = input.csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = lines[0] ?? "";
  const rows = lines.slice(1);
  const parsed = parseCsvCandles(input.csv);
  const candles = parsed.candles;
  if (candles.length !== rows.length) {
    return fail(`CSV tidak rapi: ${rows.length} baris, ${candles.length} candle valid`, candles.length);
  }
  if (candles.length <= window) {
    return fail(`Candle kurang (${candles.length}, butuh > ${window})`, candles.length);
  }

  // Quote basi buatan → pemindai memakai close CSV + spread ini (resolveCsvBidAsk).
  const quote = input.spread > 0
    ? { timestamp: "2000.01.01 00:00:00", symbol, bid: 1, ask: round12(1 + input.spread) }
    : null;
  const timeStop = !timeStopApplies(symbol)
    ? null
    : input.timeStopHours === undefined
      ? TIME_STOP_HOURS
      : input.timeStopHours !== null && input.timeStopHours > 0
        ? input.timeStopHours
        : null;
  // B3: angka broker dari jalur yang SAMA dengan pemindai (preset + nilai poin USD).
  const broker: BrokerSettings = withUsdPointValue(
    applyBrokerPreset({ ...ZERO_BROKER, equity: input.equity }, symbol, input.brokerId),
    symbol,
    input.brokerId,
    input.fxRates,
  );

  const statusCount: Partial<Record<ScanStatus, number>> = {};
  const trades: BacktestTrade[] = [];
  const riskHolds: ScanRiskHold[] = [];
  let evaluated = 0;
  let i = window - 1;
  while (i < candles.length - 1) {
    const csv = [header, ...rows.slice(i - window + 1, i + 1)].join("\n");
    const row = scanSymbol({
      symbol, brokerId: input.brokerId, csv, quote,
      equity: input.equity, fxRates: input.fxRates,
      ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
    });
    evaluated += 1;
    statusCount[row.status] = (statusCount[row.status] ?? 0) + 1;
    if (row.riskHold !== undefined) riskHolds.push(row.riskHold);
    const plan = row.status === "LOLOS" ? (row.plan ?? null) : null;
    if (plan === null) {
      i += 1;
      continue;
    }
    const signalMs = candleTimeMs(String(candles[i].time ?? ""));
    const exit = simulateTrade(plan, candles.slice(i + 1), input.spread, signalMs, timeStop);
    if (exit === null) break;
    const exitAt = i + 1 + exit.exitIndex;
    const risk = Math.abs(plan.entry - plan.stopLoss);
    const priceResult = round12(
      plan.direction === "BELI" ? exit.exitPrice - plan.entry : plan.entry - exit.exitPrice,
    );
    const lot = plan.suggestedLot !== null && plan.suggestedLot > 0 ? plan.suggestedLot : broker.minLot;
    // B5c: masuk di tutup candle sinyal, keluar dianggap di tutup candle keluar (hati-hati).
    const swap = estimateSwap(
      {
        symbol, broker: input.brokerId, direction: plan.direction, lot, price: plan.entry,
        entryServer: addHours(String(candles[i].time ?? ""), input.barHours ?? 1),
        nowServer: addHours(String(candles[exitAt].time ?? ""), input.barHours ?? 1),
      },
      (amount, currency) => {
        if (currency === "USD") return amount;
        const rate = input.fxRates?.[currency as keyof ExchangeRates];
        return input.fxRates !== null && typeof rate === "number" && rate > 0
          ? convertToUSD(amount, currency, input.fxRates)
          : null;
      },
    );
    const swapUsd = swap === null ? null : swap.value;
    const netUsd = Math.round(((priceResult * broker.pointValue - broker.commission) * lot + (swapUsd ?? 0)) * 100) / 100;
    trades.push({
      direction: plan.direction,
      entry: plan.entry,
      stopLoss: plan.stopLoss,
      takeProfit: plan.takeProfit,
      signalTime: String(candles[i].time ?? ""),
      exitTime: String(candles[exitAt].time ?? ""),
      exitPrice: round12(exit.exitPrice),
      outcome: exit.outcome,
      bars: exit.exitIndex + 1,
      priceResult,
      rMultiple: risk > 0 ? Math.round((priceResult / risk) * 100) / 100 : 0,
      lot,
      netUsd,
      swapUsd,
    });
    if (exit.outcome === "TERBUKA") break;
    // Sinyal berikutnya paling cepat di close candle tempat posisi tutup.
    i = exitAt;
  }
  return {
    symbol, candles: candles.length, evaluated, statusCount, trades, riskHolds,
    startTime: String(candles[window - 1].time ?? ""),
    endTime: String(candles[candles.length - 1].time ?? ""),
    error: null,
  };
}
