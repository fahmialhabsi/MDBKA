/**
 * P3 (13 Okt 2026) — pola breakout-retest. MURNI. Rancangan alur trader 3.5;
 * keputusan bagian 6 butir 3 & 4 (zona ±0,25 × ATR, parameter dikunci).
 *
 * BELI (JUAL = cermin, memakai swing low):
 * 1. Level = puncak swing yang SUDAH terkonfirmasi (diapit `swingStrength` candle).
 * 2. Breakout: candle k tutup DI ATAS level, candle sebelumnya tutup ≤ level.
 * 3. Selama menunggu (k+1 … terakhir−1) tidak ada candle tutup di bawah
 *    level − zona (breakout gagal).
 * 4. Retest = candle TERAKHIR (sudah tutup): low menyentuh level + zona,
 *    tutup di atas level, dan berupa candle penolakan bawah (bullishRejection).
 * 5. Jarak breakout → retest maksimal `maxRetestBars` candle.
 * Hanya pengenal pola; SL/TP/lot ditentukan strategi `topdown` (P4) lewat applyRiskGates.
 */
import { detectSwingLevels, type Candle } from "../calculations/swingDetector";
import { bearishRejection, bullishRejection } from "./candleStrategy";

export interface BreakoutRetestParams {
  readonly swingStrength: number;
  readonly maxRetestBars: number;
  readonly zoneAtr: number;
}

export const BREAKOUT_RETEST_PARAMS: BreakoutRetestParams = { swingStrength: 3, maxRetestBars: 6, zoneAtr: 0.25 };

export interface BreakoutRetest {
  readonly direction: "BELI" | "JUAL";
  readonly level: number;
  readonly levelTime: string;
  readonly breakoutTime: string;
  readonly retestTime: string;
  readonly reason: string;
}

export function breakoutRetestAt(
  candles: readonly Candle[],
  atr: number | null,
  p: BreakoutRetestParams = BREAKOUT_RETEST_PARAMS,
): BreakoutRetest | null {
  const n = candles.length;
  if (atr === null || !(atr > 0) || n < 2 * p.swingStrength + 3) return null;
  const last = candles[n - 1];
  const prev = candles[n - 2];
  const zone = p.zoneAtr * atr;
  // Swing hanya dari candle sebelum retest (tanpa mengintip candle terakhir).
  const swings = detectSwingLevels(candles.slice(0, n - 1) as Candle[], last.close, p.swingStrength);
  const tries: ReadonlyArray<{ dir: "BELI" | "JUAL"; points: typeof swings.swingHighs }> = [
    { dir: "BELI", points: [...swings.swingHighs].reverse() },
    { dir: "JUAL", points: [...swings.swingLows].reverse() },
  ];
  for (const { dir, points } of tries) {
    for (const sw of points) {
      const level = sw.price;
      const from = sw.index + p.swingStrength + 1; // swing terkonfirmasi lebih dulu
      for (let k = Math.max(from, n - 1 - p.maxRetestBars); k < n - 1; k++) {
        const broke = dir === "BELI"
          ? candles[k].close > level && candles[k - 1].close <= level
          : candles[k].close < level && candles[k - 1].close >= level;
        if (!broke) continue;
        const failed = candles.slice(k + 1, n - 1).some((c) => (dir === "BELI" ? c.close < level - zone : c.close > level + zone));
        if (failed) continue;
        const touched = dir === "BELI" ? last.low <= level + zone && last.close > level : last.high >= level - zone && last.close < level;
        if (!touched) continue;
        const rejection = dir === "BELI" ? bullishRejection(prev, last) : bearishRejection(prev, last);
        if (rejection === null) continue;
        return {
          direction: dir,
          level,
          levelTime: sw.time,
          breakoutTime: candles[k].time,
          retestTime: last.time,
          reason: `${dir === "BELI" ? "Tembus puncak" : "Tembus lembah"} ${level} lalu diuji ulang: ${rejection}`,
        };
      }
    }
  }
  return null;
}
