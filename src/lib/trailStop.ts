/**
 * T1 (Tahap 16, 15 Okt 2026) — Tim 2: saran geser SL mengikuti harga dan
 * aba-aba struktur rusak (rancangan alur trader 7.2 butir 2–3, 7.3). MURNI.
 * Hanya SARAN tampilan; Fahmi yang mengubah posisi di MT5.
 *
 * Geser SL (trailing):
 *  - Sumber: lembah swing (BELI) / puncak swing (JUAL) terakhir yang sudah
 *    terkonfirmasi di candle tertutup M15; M15 belum ada → H1.
 *  - SL hanya maju ke arah untung (7.3 butir 1) dan minimal di titik impas
 *    (di bawah impas = urusan saran breakeven yang sudah ada).
 *  - Jarak SL baru ke harga sekarang ≥ 0,5 × ATR timeframe itu, agar tidak
 *    tersapu gerak kecil. ATR tidak bisa dihitung → tanpa saran (jujur).
 * Struktur rusak (H1): BELI — candle H1 tertutup terakhir tutup di bawah
 * lembah swing terakhir sebelumnya; JUAL — tutup di atas puncak swing terakhir.
 * Status aturan: UJI (belum terbukti); wajib diuji dengan data MFE/MAE.
 */
import { atrWilder } from "../calculations/indicators";
import { detectSwingLevels, type Candle, type SwingPoint } from "../calculations/swingDetector";

export type TrailDirection = "BELI" | "JUAL";
export type TrailSource = "M15" | "H1";

export const TRAIL_PARAMS = {
  swingStrength: 2,
  /** Jarak minimum SL baru ke harga sekarang, kelipatan ATR. */
  minGapAtr: 0.5,
  atrPeriod: 14,
  /** Candle minimum agar swing & ATR bermakna. */
  minCandles: 20,
} as const;

export interface TrailInput {
  readonly direction: TrailDirection;
  readonly entryPrice: number;
  readonly sl: number;
  readonly bid: number;
  readonly ask: number;
  /** Candle M15 tertutup (lama → baru); null = belum diekspor. */
  readonly m15: readonly Candle[] | null;
  /** Candle H1 tertutup (lama → baru); null = tidak ada. */
  readonly h1: readonly Candle[] | null;
}

export interface TrailSuggestion {
  readonly slTarget: number;
  readonly source: TrailSource;
  readonly swingTime: string;
  readonly atr: number;
  readonly message: string;
}

export interface StructureBreak {
  readonly level: number;
  readonly swingTime: string;
  readonly closeTime: string;
  readonly close: number;
  readonly message: string;
}

const positive = (n: number): boolean => Number.isFinite(n) && n > 0;

function pickSource(input: TrailInput): { source: TrailSource; candles: readonly Candle[] } | null {
  if (input.m15 !== null && input.m15.length >= TRAIL_PARAMS.minCandles) return { source: "M15", candles: input.m15 };
  if (input.h1 !== null && input.h1.length >= TRAIL_PARAMS.minCandles) return { source: "H1", candles: input.h1 };
  return null;
}

function lastSwing(candles: readonly Candle[], direction: TrailDirection): SwingPoint | null {
  const levels = detectSwingLevels([...candles], 0, TRAIL_PARAMS.swingStrength);
  const list = direction === "BELI" ? levels.swingLows : levels.swingHighs;
  return list.length === 0 ? null : (list[list.length - 1] ?? null);
}

/** Saran geser SL; null = tidak ada saran (tahan SL sekarang). */
export function trailSuggestion(input: TrailInput): TrailSuggestion | null {
  if (!positive(input.entryPrice) || !positive(input.sl) || !positive(input.bid) || !positive(input.ask)) return null;
  const picked = pickSource(input);
  if (picked === null) return null;
  const atr = atrWilder(picked.candles, TRAIL_PARAMS.atrPeriod);
  if (atr === null || !positive(atr)) return null;
  const swing = lastSwing(picked.candles, input.direction);
  if (swing === null) return null;
  const buy = input.direction === "BELI";
  // Harga keluar: BELI ditutup di bid, JUAL di ask.
  const ref = buy ? input.bid : input.ask;
  const target = swing.price;
  const gap = buy ? ref - target : target - ref;
  if (!(gap >= TRAIL_PARAMS.minGapAtr * atr)) return null;
  const forward = buy ? target > input.sl : target < input.sl;
  const pastBreakeven = buy ? target >= input.entryPrice : target <= input.entryPrice;
  if (!forward || !pastBreakeven) return null;
  return {
    slTarget: target,
    source: picked.source,
    swingTime: swing.time,
    atr,
    message:
      `Geser SL ke ${target} (${buy ? "lembah" : "puncak"} swing ${picked.source} ${swing.time}; ` +
      `jarak ke harga ${(gap / atr).toFixed(1).replace(".", ",")}× ATR). SL hanya maju, jangan dijauhkan. TP jangan diubah.`,
  };
}

/** Aba-aba struktur H1 rusak; null = struktur masih utuh / data kurang. */
export function structureBreak(direction: TrailDirection, h1: readonly Candle[] | null): StructureBreak | null {
  if (h1 === null || h1.length < TRAIL_PARAMS.minCandles) return null;
  const last = h1[h1.length - 1];
  if (last === undefined) return null;
  const swing = lastSwing(h1.slice(0, -1), direction);
  if (swing === null) return null;
  const buy = direction === "BELI";
  const broken = buy ? last.close < swing.price : last.close > swing.price;
  if (!broken) return null;
  return {
    level: swing.price,
    swingTime: swing.time,
    closeTime: last.time,
    close: last.close,
    message:
      `Struktur H1 rusak: candle ${last.time} tutup ${last.close} ${buy ? "di bawah lembah" : "di atas puncak"} swing ` +
      `${swing.price} (${swing.time}). Pertimbangkan keluar lebih awal (rugi < 1R).`,
  };
}
