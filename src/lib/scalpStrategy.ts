/**
 * P1 (12 Okt 2026) — STRATEGI "scalping": aturan PDF MIFX "Strategi
 * Scalping Praktis untuk Pemula" diterjemahkan jadi aturan pasti. MODUL MURNI.
 *
 * BELI (JUAL = cermin):
 * 1. Tren (aturan 1): MA9 di atas MA120 DAN MA120 naik dibanding
 *    `slopeBars` candle lalu (bukan pasar datar).
 * 2. Crossing (aturan 2): MA9 memotong MA120 ke atas dalam `crossLookback`
 *    candle terakhir (tren masih muda).
 * 3. Stochastic (aturan 3): %K lambat (14,3) <= 20 pada salah satu dari
 *    `stochLookback` candle terakhir (harga sempat jenuh jual = mundur).
 * 4. Engulfing (aturan 4): candle terakhir bullish engulfing.
 * 5. SL = low terendah 2 candle terakhir − buffer broker; TP = 2× jarak SL
 *    (RR 1:2 sesuai PDF). Lot, batas Rupiah, biaya = applyRiskGates.
 *
 * Batas data: PDF untuk scalping (M1–M15); MDBKA baru punya candle H1/H4,
 * jadi yang diuji adalah ATURANNYA pada H1, bukan kecepatan scalping.
 */
import type { Candle } from "../calculations/swingDetector";
import type { StrategySetup } from "../calculations/decisionEngine";
import type { BrokerSettings, MarketData } from "../types/analysis";

export interface ScalpParams {
  readonly fast: number;
  readonly slow: number;
  readonly slopeBars: number;
  readonly crossLookback: number;
  readonly stochPeriod: number;
  readonly stochSmooth: number;
  readonly stochLookback: number;
  readonly oversold: number;
  readonly overbought: number;
  readonly rewardRisk: number;
}

export const SCALP_PARAMS: ScalpParams = {
  fast: 9,
  slow: 120,
  slopeBars: 5,
  crossLookback: 24,
  stochPeriod: 14,
  stochSmooth: 3,
  stochLookback: 3,
  oversold: 20,
  overbought: 80,
  rewardRisk: 2,
};

/** Deret SMA penutupan; indeks < period−1 = null. */
export function smaSeries(closes: readonly number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/** %K Stochastic lambat: SMA(smooth) dari %K mentah (period). null = data kurang / rentang 0. */
export function stochasticK(candles: readonly Candle[], period: number, smooth: number): Array<number | null> {
  const raw: Array<number | null> = candles.map((c, i) => {
    if (i < period - 1) return null;
    const win = candles.slice(i - period + 1, i + 1);
    const hh = Math.max(...win.map((x) => x.high));
    const ll = Math.min(...win.map((x) => x.low));
    return hh > ll ? ((c.close - ll) / (hh - ll)) * 100 : null;
  });
  return raw.map((_, i) => {
    if (i < smooth - 1) return null;
    const win = raw.slice(i - smooth + 1, i + 1);
    if (win.some((v) => v === null)) return null;
    return (win as number[]).reduce((a, b) => a + b, 0) / smooth;
  });
}

export function isBullishEngulfing(prev: Candle, c: Candle): boolean {
  return prev.close < prev.open && c.close > c.open && c.close >= prev.open && c.open <= prev.close;
}

export function isBearishEngulfing(prev: Candle, c: Candle): boolean {
  return prev.close > prev.open && c.close < c.open && c.close <= prev.open && c.open >= prev.close;
}

function fmt(v: number): string {
  return String(Math.round(v)).replace(".", ",");
}

export function scalpSetup(
  market: MarketData,
  broker: BrokerSettings,
  candles: readonly Candle[],
  p: ScalpParams = SCALP_PARAMS,
): StrategySetup {
  const wait = (factors: string[]): StrategySetup => ({
    decision: "TUNGGU", score: 0, trendScore: 0, cciScore: 0, macdScore: 0, rsiScore: 0,
    entry: (market.bid + market.ask) / 2, stopLoss: null, takeProfit: null,
    riskDistance: null, targetDistance: null, factors,
    waitWarning: "Aturan scalping belum lengkap: tren + crossing MA9/MA120 + Stochastic 80/20 + engulfing.",
    waitExplanation: "Lebih baik menunggu: keempat aturan scalping belum terpenuhi bersamaan.",
  });
  const n = candles.length;
  if (n < p.slow + Math.max(p.slopeBars, p.crossLookback) + 1) return wait(["Candle belum cukup untuk MA120"]);

  const closes = candles.map((c) => c.close);
  const fast = smaSeries(closes, p.fast);
  const slow = smaSeries(closes, p.slow);
  const f = fast[n - 1] as number;
  const s = slow[n - 1] as number;
  const sPast = slow[n - 1 - p.slopeBars] as number;
  const up = f > s && s > sPast;
  const down = f < s && s < sPast;
  if (!up && !down) return wait(["Pasar tidak trending (MA9/MA120 belum searah kemiringan MA120)"]);

  let crossed = false;
  for (let i = n - p.crossLookback; i < n; i++) {
    const f0 = fast[i - 1] as number, s0 = slow[i - 1] as number, f1 = fast[i] as number, s1 = slow[i] as number;
    if (up && f0 <= s0 && f1 > s1) crossed = true;
    if (down && f0 >= s0 && f1 < s1) crossed = true;
  }
  const factors = [up ? "Tren naik: MA9 di atas MA120, MA120 menanjak" : "Tren turun: MA9 di bawah MA120, MA120 menurun"];
  if (!crossed) return wait([...factors, `Crossing MA9/MA120 sudah lebih dari ${p.crossLookback} candle lalu`]);

  const k = stochasticK(candles, p.stochPeriod, p.stochSmooth).slice(n - p.stochLookback);
  const ks = k.filter((v): v is number => v !== null);
  const extreme = up ? Math.min(...ks) : Math.max(...ks);
  const touched = ks.length > 0 && (up ? extreme <= p.oversold : extreme >= p.overbought);
  if (!touched) return wait([...factors, `Stochastic belum ${up ? `<= ${p.oversold}` : `>= ${p.overbought}`}`]);
  factors.push(`Crossing MA9/MA120 baru, Stochastic sempat ${fmt(extreme)}`);

  const last = candles[n - 1];
  const prev = candles[n - 2];
  if (up) {
    if (!isBullishEngulfing(prev, last)) return wait([...factors, "Menunggu bullish engulfing"]);
    const entry = market.ask;
    const stopLoss = Math.min(prev.low, last.low) - broker.buffer;
    const riskDistance = entry - stopLoss;
    if (!(riskDistance > 0)) return wait([...factors, "Jarak SL tidak valid"]);
    const takeProfit = entry + riskDistance * p.rewardRisk;
    return {
      decision: "BELI", score: 0, trendScore: 0, cciScore: 0, macdScore: 0, rsiScore: 0,
      entry, stopLoss, takeProfit, riskDistance, targetDistance: takeProfit - entry,
      factors: [...factors, "Bullish engulfing"], waitWarning: "", waitExplanation: "",
    };
  }
  if (!isBearishEngulfing(prev, last)) return wait([...factors, "Menunggu bearish engulfing"]);
  const entry = market.bid;
  const stopLoss = Math.max(prev.high, last.high) + broker.buffer;
  const riskDistance = stopLoss - entry;
  if (!(riskDistance > 0)) return wait([...factors, "Jarak SL tidak valid"]);
  const takeProfit = entry - riskDistance * p.rewardRisk;
  return {
    decision: "JUAL", score: 0, trendScore: 0, cciScore: 0, macdScore: 0, rsiScore: 0,
    entry, stopLoss, takeProfit, riskDistance, targetDistance: entry - takeProfit,
    factors: [...factors, "Bearish engulfing"], waitWarning: "", waitExplanation: "",
  };
}
