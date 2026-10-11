/**
 * C1 (12 Okt 2026) — STRATEGI "candle": tren → mundur (ide ABC) → candle
 * penolakan. MODUL MURNI. Disetujui Fahmi 12 Okt 2026.
 *
 * BELI (JUAL = cermin):
 * 1. Tren naik: 2 puncak swing terakhir makin tinggi DAN 2 lembah swing
 *    terakhir makin tinggi (swing sah = diapit `swingStrength` candle).
 * 2. Mundur: dari puncak tertinggi SEJAK lembah swing terakhir harga turun
 *    >= `minPullbackAtr`×ATR, tetapi belum menembus lembah itu (tembus = tren rusak).
 * 3. Candle terakhir: wick bawah >= `minWickToBody`×body DAN >= `minWickToRange`
 *    tinggi candle, tutup putih — ATAU bullish engulfing.
 * 4. SL = ujung wick (low) − buffer broker; TP = entry + jarak SL × R:R broker.
 * Lot, batas Rupiah, gerbang biaya, time-stop = rumus bersama (applyRiskGates).
 *
 * Angka parameter hanya boleh disetel memakai data LATIH (rapor backtest).
 */
import { detectSwingLevels, type Candle, type SwingPoint } from "../calculations/swingDetector";
import type { StrategySetup } from "../calculations/decisionEngine";
import type { BrokerSettings, MarketData } from "../types/analysis";

export interface CandleStrategyParams {
  readonly swingStrength: number;
  readonly minPullbackAtr: number;
  readonly minWickToBody: number;
  readonly minWickToRange: number;
}

export const CANDLE_PARAMS: CandleStrategyParams = {
  swingStrength: 3,
  minPullbackAtr: 1,
  minWickToBody: 2,
  minWickToRange: 0.5,
};

export type CandleTrend = "NAIK" | "TURUN" | "TIDAK_JELAS";

/** Arah tren dari 2 puncak & 2 lembah swing terakhir. */
export function trendFromSwings(highs: readonly SwingPoint[], lows: readonly SwingPoint[]): CandleTrend {
  if (highs.length < 2 || lows.length < 2) return "TIDAK_JELAS";
  const [h1, h2] = [highs[highs.length - 2].price, highs[highs.length - 1].price];
  const [l1, l2] = [lows[lows.length - 2].price, lows[lows.length - 1].price];
  if (h2 > h1 && l2 > l1) return "NAIK";
  if (h2 < h1 && l2 < l1) return "TURUN";
  return "TIDAK_JELAS";
}

/** Penolakan bawah (BELI): wick bawah panjang + tutup putih, atau bullish engulfing. */
export function bullishRejection(prev: Candle | undefined, c: Candle, p: CandleStrategyParams = CANDLE_PARAMS): string | null {
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  const lowerWick = Math.min(c.open, c.close) - c.low;
  if (range > 0 && c.close >= c.open && lowerWick >= p.minWickToBody * body && lowerWick >= p.minWickToRange * range) {
    return "Wick bawah panjang, tutup putih (harga ditolak turun)";
  }
  if (prev !== undefined && prev.close < prev.open && c.close > c.open && c.close >= prev.open && c.open <= prev.close) {
    return "Bullish engulfing (candle putih menelan candle merah)";
  }
  return null;
}

/** Penolakan atas (JUAL): wick atas panjang + tutup merah, atau bearish engulfing. */
export function bearishRejection(prev: Candle | undefined, c: Candle, p: CandleStrategyParams = CANDLE_PARAMS): string | null {
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);
  if (range > 0 && c.close <= c.open && upperWick >= p.minWickToBody * body && upperWick >= p.minWickToRange * range) {
    return "Wick atas panjang, tutup merah (harga ditolak naik)";
  }
  if (prev !== undefined && prev.close > prev.open && c.close < c.open && c.close <= prev.open && c.open >= prev.close) {
    return "Bearish engulfing (candle merah menelan candle putih)";
  }
  return null;
}

function fmt(v: number): string {
  return String(Math.round(v * 10) / 10).replace(".", ",");
}

export function candleSetup(
  market: MarketData,
  broker: BrokerSettings,
  candles: readonly Candle[],
  p: CandleStrategyParams = CANDLE_PARAMS,
): StrategySetup {
  const wait = (factors: string[]): StrategySetup => ({
    decision: "TUNGGU", score: 0, trendScore: 0, cciScore: 0, macdScore: 0, rsiScore: 0,
    entry: (market.bid + market.ask) / 2, stopLoss: null, takeProfit: null,
    riskDistance: null, targetDistance: null, factors,
    waitWarning: "Pola candle belum lengkap: tren jelas → mundur → candle penolakan.",
    waitExplanation: "Lebih baik menunggu: belum ada tren yang mundur lalu ditolak oleh candle terakhir.",
  });
  const n = candles.length;
  if (n < p.swingStrength * 2 + 3 || !(market.atr > 0)) return wait(["Candle/ATR belum cukup untuk membaca pola"]);

  const last = candles[n - 1];
  const prev = candles[n - 2];
  const swings = detectSwingLevels([...candles], last.close, p.swingStrength);
  const trend = trendFromSwings(swings.swingHighs, swings.swingLows);
  if (trend === "TIDAK_JELAS") return wait(["Tren tidak jelas (puncak/lembah belum searah)"]);

  const lastHigh = swings.swingHighs[swings.swingHighs.length - 1];
  const lastLow = swings.swingLows[swings.swingLows.length - 1];
  const factors: string[] = [
    trend === "NAIK" ? "Tren naik: puncak & lembah makin tinggi" : "Tren turun: puncak & lembah makin rendah",
  ];

  if (trend === "NAIK") {
    // Sejak lembah swing terakhir: puncak tertinggi (boleh belum sah) & tembusan.
    const since = candles.slice(lastLow.index + 1);
    const peak = Math.max(lastHigh.price, ...since.map((c) => c.high));
    const lowest = Math.min(...since.map((c) => c.low));
    const pullback = (peak - last.low) / market.atr;
    if (lowest <= lastLow.price) return wait([...factors, "Lembah terakhir tertembus — tren rusak"]);
    if (pullback < p.minPullbackAtr) return wait([...factors, `Mundur baru ${fmt(pullback)}× ATR (butuh ${fmt(p.minPullbackAtr)}×)`]);
    const why = bullishRejection(prev, last, p);
    if (why === null) return wait([...factors, `Mundur ${fmt(pullback)}× ATR, menunggu candle penolakan`]);
    const entry = market.ask;
    const stopLoss = last.low - broker.buffer;
    const riskDistance = entry - stopLoss;
    if (!(riskDistance > 0)) return wait([...factors, "Jarak SL tidak valid"]);
    const takeProfit = entry + riskDistance * broker.targetRR;
    return {
      decision: "BELI", score: 0, trendScore: 0, cciScore: 0, macdScore: 0, rsiScore: 0,
      entry, stopLoss, takeProfit, riskDistance, targetDistance: takeProfit - entry,
      factors: [...factors, `Mundur ${fmt(pullback)}× ATR dari puncak, lembah belum tertembus`, why],
      waitWarning: "", waitExplanation: "",
    };
  }

  // Sejak puncak swing terakhir: lembah terendah (boleh belum sah) & tembusan.
  const since = candles.slice(lastHigh.index + 1);
  const trough = Math.min(lastLow.price, ...since.map((c) => c.low));
  const highest = Math.max(...since.map((c) => c.high));
  const pullback = (last.high - trough) / market.atr;
  if (highest >= lastHigh.price) return wait([...factors, "Puncak terakhir tertembus — tren rusak"]);
  if (pullback < p.minPullbackAtr) return wait([...factors, `Naik balik baru ${fmt(pullback)}× ATR (butuh ${fmt(p.minPullbackAtr)}×)`]);
  const why = bearishRejection(prev, last, p);
  if (why === null) return wait([...factors, `Naik balik ${fmt(pullback)}× ATR, menunggu candle penolakan`]);
  const entry = market.bid;
  const stopLoss = last.high + broker.buffer;
  const riskDistance = stopLoss - entry;
  if (!(riskDistance > 0)) return wait([...factors, "Jarak SL tidak valid"]);
  const takeProfit = entry - riskDistance * broker.targetRR;
  return {
    decision: "JUAL", score: 0, trendScore: 0, cciScore: 0, macdScore: 0, rsiScore: 0,
    entry, stopLoss, takeProfit, riskDistance, targetDistance: entry - takeProfit,
    factors: [...factors, `Naik balik ${fmt(pullback)}× ATR dari lembah, puncak belum tertembus`, why],
    waitWarning: "", waitExplanation: "",
  };
}
