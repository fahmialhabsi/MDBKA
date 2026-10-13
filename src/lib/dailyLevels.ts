/**
 * P1/P2 (13 Okt 2026) — level harian dan arah D1 dari candle H1. MURNI.
 * Rancangan alur trader bagian 3.2 & 3.4; keputusan bagian 6 butir 2
 * (arah D1 ketat: D1 "netral" = TUNGGU).
 *
 * - Hari = tanggal jam server MT5 ("YYYY.MM.DD", candle 00:00 = open harian).
 * - Hanya candle tertutup: hari TERAKHIR di data dianggap belum tutup dan
 *   tidak dipakai untuk D1 (aman: lebih baik tertinggal satu hari daripada
 *   memakai candle D1 yang masih berubah).
 * - Data kurang → null (tidak ada arah karangan).
 */
import type { Candle } from "../calculations/swingDetector";
import { atrWilder, sma } from "../calculations/indicators";

const DATE = /^(\d{4})[.-](\d{2})[.-](\d{2})/;

function dayOf(time: string): string | null {
  const m = DATE.exec(time);
  return m === null ? null : `${m[1]}.${m[2]}.${m[3]}`;
}

/** Kelompokkan H1 per tanggal server (urutan dijaga). Candle tanpa tanggal sah dilewati. */
function groupByDay(candles: readonly Candle[]): { readonly day: string; readonly bars: Candle[] }[] {
  const out: { day: string; bars: Candle[] }[] = [];
  for (const c of candles) {
    const day = dayOf(c.time);
    if (day === null) continue;
    const last = out[out.length - 1];
    if (last !== undefined && last.day === day) last.bars.push(c);
    else out.push({ day, bars: [c] });
  }
  return out;
}

export interface DailyLevels {
  /** Tanggal server candle terakhir (hari berjalan). */
  readonly day: string;
  /** Open harian = open candle H1 pertama hari berjalan. */
  readonly dayOpen: number;
  /** Hari perdagangan sebelumnya (null bila data hanya satu hari). */
  readonly prevDay: string | null;
  readonly prevHigh: number | null;
  readonly prevLow: number | null;
  readonly prevClose: number | null;
}

/** P1: open harian dan high/low/close kemarin. null = tidak ada candle sah. */
export function dailyLevels(h1: readonly Candle[]): DailyLevels | null {
  const days = groupByDay(h1);
  const today = days[days.length - 1];
  if (today === undefined) return null;
  const prev = days.length >= 2 ? days[days.length - 2] : null;
  return {
    day: today.day,
    dayOpen: today.bars[0].open,
    prevDay: prev?.day ?? null,
    prevHigh: prev === null ? null : Math.max(...prev.bars.map((c) => c.high)),
    prevLow: prev === null ? null : Math.min(...prev.bars.map((c) => c.low)),
    prevClose: prev === null ? null : prev.bars[prev.bars.length - 1].close,
  };
}

/** P2: rakit D1 dari H1 (hari terakhir yang belum tutup dibuang). time = "YYYY.MM.DD 00:00". */
export function aggregateDaily(h1: readonly Candle[]): Candle[] {
  const days = groupByDay(h1);
  return days.slice(0, -1).map(({ day, bars }) => ({
    time: `${day} 00:00`,
    open: bars[0].open,
    high: Math.max(...bars.map((c) => c.high)),
    low: Math.min(...bars.map((c) => c.low)),
    close: bars[bars.length - 1].close,
  }));
}

export interface D1DirectionParams {
  readonly maPeriod: number;
  /** Kemiringan MA = MA hari ini dibanding MA `slopeLookback` hari lalu. */
  readonly slopeLookback: number;
  /** |close − MA| < neutralAtr × ATR(14) D1 → NETRAL. */
  readonly neutralAtr: number;
}

/** Dikunci sebelum uji (keputusan bagian 6). Disetel hanya dengan data latih. */
export const D1_PARAMS: D1DirectionParams = { maPeriod: 50, slopeLookback: 5, neutralAtr: 0.25 };

export type D1Direction = "NAIK" | "TURUN" | "NETRAL";

export interface D1DirectionResult {
  readonly direction: D1Direction;
  readonly close: number;
  readonly ma: number;
  readonly maBefore: number;
  readonly atr: number;
  readonly reason: string;
}

/**
 * P2: arah D1 = close terhadap MA50 + kemiringan MA50. NAIK hanya bila close
 * di atas MA (lebih dari pita netral) DAN MA menanjak; TURUN cermin; selain
 * itu NETRAL (= TUNGGU di aturan ketat). null = D1 kurang dari MA + kemiringan.
 */
export function d1Direction(d1: readonly Candle[], p: D1DirectionParams = D1_PARAMS): D1DirectionResult | null {
  if (d1.length < p.maPeriod + p.slopeLookback) return null;
  const closes = d1.map((c) => c.close);
  const ma = sma(closes, p.maPeriod);
  const maBefore = sma(closes.slice(0, closes.length - p.slopeLookback), p.maPeriod);
  const atr = atrWilder(d1, 14);
  if (ma === null || maBefore === null || atr === null || !(atr > 0)) return null;
  const close = closes[closes.length - 1];
  const band = p.neutralAtr * atr;
  const base = { close, ma, maBefore, atr };
  if (close > ma + band && ma > maBefore) {
    return { ...base, direction: "NAIK", reason: `Close D1 di atas MA${p.maPeriod} dan MA menanjak` };
  }
  if (close < ma - band && ma < maBefore) {
    return { ...base, direction: "TURUN", reason: `Close D1 di bawah MA${p.maPeriod} dan MA menurun` };
  }
  return {
    ...base,
    direction: "NETRAL",
    reason: Math.abs(close - ma) <= band ? `Close D1 dekat MA${p.maPeriod} (±${p.neutralAtr}×ATR)` : `Posisi close dan kemiringan MA${p.maPeriod} tidak searah`,
  };
}
