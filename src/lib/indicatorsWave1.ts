/**
 * TI-2 (Tahap 16, 15 Okt 2026) — indikator gelombang 1 (rancangan tim indikator
 * bagian 5): ADX, lebar Bollinger/StdDev, Fractals, tick volume. MURNI.
 * Hanya KONTEKS/shadow: tidak dipakai keputusan BELI/JUAL dan tidak mengubah
 * rumus decisionEngine. Data kurang = null (tanpa angka karangan).
 * tick volume dibaca pembaca sendiri (kolom "tick_volume"); csvCandleParser tidak diubah.
 */
import type { Candle } from "../calculations/swingDetector";

export const WAVE1_PARAMS = {
  adxPeriod: 14,
  bbPeriod: 20,
  bbDeviation: 2,
  /** Fractal Bill Williams: puncak/lembah di antara 2 candle kiri & 2 kanan. */
  fractalSide: 2,
  volumePeriod: 20,
} as const;

export interface AdxValue {
  readonly adx: number;
  readonly plusDi: number;
  readonly minusDi: number;
}

/** ADX Wilder (+DI/−DI), cara hitung sama dengan TA-Lib; null bila < 2×period+1 candle. */
export function adxWilder(candles: readonly Candle[], period: number = WAVE1_PARAMS.adxPeriod): AdxValue | null {
  if (!Number.isInteger(period) || period <= 0 || candles.length < 2 * period + 1) return null;
  const tr: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    if (c === undefined || p === undefined) return null;
    const up = c.high - p.high;
    const down = p.low - c.low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const sum = (xs: readonly number[]): number => xs.reduce((s, v) => s + v, 0);
  // Seed seperti TA-Lib (Wilder asli): jumlah period−1 nilai pertama, lalu
  // tiap candle: S = S − S/period + nilai baru.
  let trS = sum(tr.slice(0, period - 1));
  let pS = sum(plusDm.slice(0, period - 1));
  let mS = sum(minusDm.slice(0, period - 1));
  const dx: number[] = [];
  let plusDi = 0;
  let minusDi = 0;
  for (let j = period - 1; j < tr.length; j++) {
    trS = trS - trS / period + (tr[j] ?? 0);
    pS = pS - pS / period + (plusDm[j] ?? 0);
    mS = mS - mS / period + (minusDm[j] ?? 0);
    if (!(trS > 0)) return null;
    plusDi = (100 * pS) / trS;
    minusDi = (100 * mS) / trS;
    const total = plusDi + minusDi;
    dx.push(total === 0 ? 0 : (100 * Math.abs(plusDi - minusDi)) / total);
  }
  if (dx.length < period) return null;
  let adx = sum(dx.slice(0, period)) / period;
  for (let i = period; i < dx.length; i++) adx = (adx * (period - 1) + (dx[i] ?? 0)) / period;
  return { adx, plusDi, minusDi };
}

export interface BollingerValue {
  readonly middle: number;
  readonly upper: number;
  readonly lower: number;
  /** Simpangan baku populasi (seperti MT5). */
  readonly stdDev: number;
  /** Lebar pita = (atas − bawah) ÷ tengah. */
  readonly widthPct: number;
}

export function bollinger(
  closes: readonly number[],
  period: number = WAVE1_PARAMS.bbPeriod,
  deviation: number = WAVE1_PARAMS.bbDeviation,
): BollingerValue | null {
  if (!Number.isInteger(period) || period <= 1 || closes.length < period) return null;
  const win = closes.slice(-period);
  const middle = win.reduce((s, v) => s + v, 0) / period;
  if (!(middle > 0)) return null;
  const stdDev = Math.sqrt(win.reduce((s, v) => s + (v - middle) ** 2, 0) / period);
  const upper = middle + deviation * stdDev;
  const lower = middle - deviation * stdDev;
  return { middle, upper, lower, stdDev, widthPct: (upper - lower) / middle };
}

export interface FractalPoint {
  readonly time: string;
  readonly price: number;
}

/** Fractal atas & bawah terakhir yang sudah terkonfirmasi (2 candle kanan tertutup). */
export function lastFractals(candles: readonly Candle[]): { readonly up: FractalPoint | null; readonly down: FractalPoint | null } {
  const k = WAVE1_PARAMS.fractalSide;
  let up: FractalPoint | null = null;
  let down: FractalPoint | null = null;
  for (let i = candles.length - 1 - k; i >= k && (up === null || down === null); i--) {
    const c = candles[i];
    if (c === undefined) continue;
    const around = [...candles.slice(i - k, i), ...candles.slice(i + 1, i + 1 + k)];
    if (up === null && around.every((o) => c.high > o.high)) up = { time: c.time, price: c.high };
    if (down === null && around.every((o) => c.low < o.low)) down = { time: c.time, price: c.low };
  }
  return { up, down };
}

/** Kolom tick_volume per baris (urut seperti berkas); tanpa kolom = null. */
export function readTickVolumes(csv: string): readonly { readonly time: string; readonly volume: number }[] | null {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = (lines[0] ?? "").toLowerCase().split(",").map((h) => h.trim());
  const vi = head.indexOf("tick_volume");
  const ti = head.indexOf("time");
  if (vi < 0 || ti < 0) return null;
  const out: { time: string; volume: number }[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const v = Number((cells[vi] ?? "").trim());
    const t = (cells[ti] ?? "").trim();
    if (t !== "" && Number.isFinite(v) && v >= 0) out.push({ time: t, volume: v });
  }
  return out.length === 0 ? null : out;
}

/** Volume candle terakhir ÷ rata-rata `period` candle sebelumnya; data kurang = null. */
export function volumeRatio(volumes: readonly number[], period: number = WAVE1_PARAMS.volumePeriod): number | null {
  if (volumes.length < period + 1) return null;
  const prev = volumes.slice(-period - 1, -1);
  const avg = prev.reduce((s, v) => s + v, 0) / period;
  const last = volumes[volumes.length - 1];
  return last === undefined || !(avg > 0) ? null : last / avg;
}

export interface Wave1Context {
  readonly adx: AdxValue | null;
  readonly bollinger: BollingerValue | null;
  readonly fractals: { readonly up: FractalPoint | null; readonly down: FractalPoint | null };
  readonly volumeRatio: number | null;
}

/** Satu potret konteks gelombang 1 dari candle tertutup + CSV aslinya (untuk tick volume). */
export function wave1Context(candles: readonly Candle[], csv: string | null): Wave1Context {
  const vols = csv === null ? null : readTickVolumes(csv);
  return {
    adx: adxWilder(candles),
    bollinger: bollinger(candles.map((c) => c.close)),
    fractals: lastFractals(candles),
    volumeRatio: vols === null ? null : volumeRatio(vols.map((v) => v.volume)),
  };
}
