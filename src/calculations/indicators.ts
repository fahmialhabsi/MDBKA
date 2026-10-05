import type { Candle } from "./swingDetector";

/**
 * Tahap NS — indikator teknikal dari candle CSV (MODUL MURNI, CJS-safe:
 * tanpa import.meta, tanpa DOM). Memungkinkan alur TANPA screenshot:
 * upload CSV 50+ candle → indikator terisi otomatis → analisa jalan.
 *
 * Konvensi Wilder standar (selaras MT5):
 * - MA50: SMA 50 close terakhir.
 * - RSI(14): Wilder smoothing (contoh kanonis 70.46 teruji).
 * - CCI(14): (TP−SMA) / (0.015 × mean-deviation); datar → 0.
 * - ATR(14): Wilder smoothing True Range.
 * - MACD: EMA12 − EMA26 (seed SMA), signal EMA9 garis MACD.
 * Minimum 50 candle (MA50 + seed EMA/MACD yang stabil).
 */

export const INDICATOR_MIN_CANDLES = 50;
const RSI_PERIOD = 14;
const CCI_PERIOD = 14;
const ATR_PERIOD = 14;
const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;

export interface ComputedIndicators {
  readonly ma50: number;
  readonly rsi: number;
  readonly cci: number;
  readonly atr: number;
  readonly macd: number;
  readonly macdSignal: number;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function isValidCandle(candle: Candle): boolean {
  return (
    Number.isFinite(candle.open) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    Number.isFinite(candle.close) &&
    candle.high >= candle.low &&
    candle.high >= candle.open &&
    candle.high >= candle.close &&
    candle.low <= candle.open &&
    candle.low <= candle.close
  );
}

/** SMA N nilai terakhir; null bila kurang data/invalid. */
export function sma(values: readonly number[], period: number): number | null {
  if (!Number.isInteger(period) || period <= 0) return null;
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const value = values[i];
    if (!Number.isFinite(value)) return null;
    sum += value;
  }
  return sum / period;
}

/**
 * Deret EMA (seed SMA `period` pertama). Mengembalikan SEMUA nilai EMA
 * dari indeks period−1 agar MACD/signal bisa dibangun berlapis.
 */
export function emaSeries(
  values: readonly number[],
  period: number,
): number[] {
  if (!Number.isInteger(period) || period <= 0) return [];
  if (values.length < period) return [];
  for (const value of values) {
    if (!Number.isFinite(value)) return [];
  }
  const seed = sma(values.slice(0, period), period);
  if (seed === null) return [];
  const multiplier = 2 / (period + 1);
  const out: number[] = [seed];
  for (let i = period; i < values.length; i++) {
    out.push(values[i] * multiplier + out[out.length - 1] * (1 - multiplier));
  }
  return out;
}

/** EMA terakhir; null bila kurang data. */
export function ema(values: readonly number[], period: number): number | null {
  const series = emaSeries(values, period);
  return series.length > 0 ? series[series.length - 1] : null;
}

/** RSI Wilder; null bila < period+1 closes. Contoh kanonis: 70.46. */
export function rsiWilder(
  closes: readonly number[],
  period: number = RSI_PERIOD,
): number | null {
  if (!Number.isInteger(period) || period <= 0) return null;
  if (closes.length < period + 1) return null;
  for (const close of closes) {
    if (!Number.isFinite(close)) return null;
  }
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const relativeStrength = avgGain / avgLoss;
  return 100 - 100 / (1 + relativeStrength);
}

/** CCI; 0 bila mean-deviation nol (deret datar). */
export function cci(
  candles: readonly Candle[],
  period: number = CCI_PERIOD,
): number | null {
  if (!Number.isInteger(period) || period <= 0) return null;
  if (candles.length < period) return null;
  const slice = candles.slice(candles.length - period);
  const typical: number[] = [];
  for (const candle of slice) {
    if (!isValidCandle(candle)) return null;
    typical.push((candle.high + candle.low + candle.close) / 3);
  }
  const mean = typical.reduce((sum, value) => sum + value, 0) / period;
  const deviation =
    typical.reduce((sum, value) => sum + Math.abs(value - mean), 0) / period;
  if (deviation === 0) return 0;
  return (typical[typical.length - 1] - mean) / (0.015 * deviation);
}

/** ATR Wilder; null bila < period+1 candles. */
export function atrWilder(
  candles: readonly Candle[],
  period: number = ATR_PERIOD,
): number | null {
  if (!Number.isInteger(period) || period <= 0) return null;
  if (candles.length < period + 1) return null;
  for (const candle of candles) {
    if (!isValidCandle(candle)) return null;
  }
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];
    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close),
      ),
    );
  }
  // Wilder smoothing atas deret TR (panjang = candles−1 ≥ period).
  let average =
    trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    average = (average * (period - 1) + trueRanges[i]) / period;
  }
  return average;
}

/** MACD + signal; null bila < 26+9−1 closes. */
export function macd(
  closes: readonly number[],
): { readonly line: number; readonly signal: number } | null {
  const fast = emaSeries(closes, MACD_FAST);
  const slow = emaSeries(closes, MACD_SLOW);
  if (fast.length === 0 || slow.length === 0) return null;
  // Selaraskan: fast[i] sejajar slow[i] dari indeks MACD_SLOW−MACD_FAST.
  const offset = MACD_SLOW - MACD_FAST;
  if (fast.length < offset + 1) return null;
  const line: number[] = [];
  for (let i = 0; i < slow.length; i++) {
    line.push(fast[i + offset] - slow[i]);
  }
  const signalSeries = emaSeries(line, MACD_SIGNAL);
  if (signalSeries.length === 0) return null;
  return {
    line: line[line.length - 1],
    signal: signalSeries[signalSeries.length - 1],
  };
}

/**
 * Hitung 6 indikator dari candle CSV. Null bila < 50 candle valid
 * atau salah satu gagal (tanpa fabrikasi parsial — semua atau null).
 */
export function computeIndicators(
  candles: readonly Candle[],
): ComputedIndicators | null {
  if (candles.length < INDICATOR_MIN_CANDLES) return null;
  for (const candle of candles) {
    if (!isValidCandle(candle)) return null;
  }
  const closes = candles.map((candle) => candle.close);
  const ma50 = sma(closes, 50);
  const rsi = rsiWilder(closes, RSI_PERIOD);
  const cciValue = cci(candles, CCI_PERIOD);
  const atr = atrWilder(candles, ATR_PERIOD);
  const macdValue = macd(closes);
  if (
    ma50 === null ||
    rsi === null ||
    cciValue === null ||
    atr === null ||
    macdValue === null
  ) {
    return null;
  }
  return {
    ma50: round6(ma50),
    rsi: round6(rsi),
    cci: round6(cciValue),
    atr: round6(atr),
    macd: round6(macdValue.line),
    macdSignal: round6(macdValue.signal),
  };
}
