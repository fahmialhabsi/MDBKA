/**
 * T2 - Support/Resistance Calculator (Hybrid: Pivot Points + Live Breakout)
 *
 * Layer 1: Pivot Points dari last H1 candle (baseline struktur)
 * Layer 2: Breakout detection dari recent live ticks (dynamic filter)
 *
 * Output: SRLevels untuk T3 Signal Analyzer
 */

export interface Candle {
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly timestamp?: string;
}

export interface QuoteSnapshot {
  readonly symbol: string;
  readonly bid: number;
  readonly ask: number;
  readonly timestamp: string;
}

export interface SRLevels {
  readonly symbol: string;
  /** Pivot Point (baseline dari H1 close) */
  readonly pp: number;
  /** Support 1 (PP - span ke low) */
  readonly s1: number;
  /** Resistance 1 (PP + span ke high) */
  readonly r1: number;
  /** Immediate support (recent breakout ke bawah) */
  readonly support: number;
  /** Immediate resistance (recent breakout ke atas) */
  readonly resistance: number;
  /** Trend: 1 (up), -1 (down), 0 (neutral) */
  readonly trend: -1 | 0 | 1;
  /** Mid price (bid+ask)/2 */
  readonly mid: number;
  /** Spread dalam poin */
  readonly spreadPts: number;
  /** Timestamp kalkulasi */
  readonly calculatedAt: string;
}

/**
 * Layer 1: Hitung Pivot Points dari last completed H1 candle.
 * PP = (H + L + C) / 3
 * R1 = 2×PP - L
 * S1 = 2×PP - H
 */
export function calculatePivotPoints(candle: Candle): {
  pp: number;
  r1: number;
  s1: number;
} {
  const pp = (candle.high + candle.low + candle.close) / 3;
  const r1 = 2 * pp - candle.low;
  const s1 = 2 * pp - candle.high;

  return { pp, r1, s1 };
}

/**
 * Layer 2: Deteksi breakout levels dari recent live quotes.
 * Ambil min/max dari last N quotes, add margin untuk resistance/support.
 * Margin: 0.3% dari harga (cukup untuk spread + slippage kecil).
 */
export function detectBreakoutLevels(
  quotes: readonly QuoteSnapshot[],
  marginPercent: number = 0.003,
): {
  resistance: number;
  support: number;
} {
  if (quotes.length === 0) {
    return { resistance: 0, support: 0 };
  }

  // Ambil mid price dari setiap quote
  const mids = quotes.map((q) => (q.bid + q.ask) / 2);
  const recentHigh = Math.max(...mids);
  const recentLow = Math.min(...mids);

  // Add margin untuk resistance/support
  const resistance = recentHigh * (1 + marginPercent);
  const support = recentLow * (1 - marginPercent);

  return { resistance, support };
}

/**
 * Deteksi trend dari recent quotes (simple: bandingkan first vs last mid).
 * Return: 1 (up), -1 (down), 0 (flat/unclear)
 */
export function detectTrend(
  quotes: readonly QuoteSnapshot[],
): -1 | 0 | 1 {
  if (quotes.length < 2) return 0;

  const firstMid = (quotes[0].bid + quotes[0].ask) / 2;
  const lastMid =
    (quotes[quotes.length - 1].bid + quotes[quotes.length - 1].ask) / 2;

  const change = lastMid - firstMid;
  const changePercent = Math.abs(change) / firstMid;

  // Threshold: minimum 0.05% untuk detect trend (filter noise)
  if (changePercent < 0.0005) return 0;
  if (change > 0) return 1;
  if (change < 0) return -1;
  return 0;
}

/**
 * T2 Main: Combine pivot points + breakout levels + trend.
 * Gunakan last completed H1 candle + recent live quotes.
 */
export function calculateSRLevels(
  symbol: string,
  lastCandle: Candle,
  recentQuotes: readonly QuoteSnapshot[],
  marginPercent?: number,
): SRLevels {
  if (recentQuotes.length === 0) {
    throw new Error("No recent quotes available for S&R calculation");
  }

  // Layer 1: Pivot Points
  const pp_calc = calculatePivotPoints(lastCandle);

  // Layer 2: Breakout detection
  const breakout = detectBreakoutLevels(recentQuotes, marginPercent);

  // Trend detection
  const trend = detectTrend(recentQuotes);

  // Current price (mid dari latest quote)
  const latest = recentQuotes[recentQuotes.length - 1];
  const mid = (latest.bid + latest.ask) / 2;
  const spreadPts = latest.ask - latest.bid;

  return {
    symbol,
    pp: pp_calc.pp,
    s1: pp_calc.s1,
    r1: pp_calc.r1,
    support: breakout.support,
    resistance: breakout.resistance,
    trend,
    mid,
    spreadPts,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Utility: Format S&R levels untuk display (debugging).
 */
export function formatSRLevels(sr: SRLevels): string {
  return `[${sr.symbol}] PP=${sr.pp.toFixed(5)} S1=${sr.s1.toFixed(5)} R1=${sr.r1.toFixed(5)} Support=${sr.support.toFixed(5)} Resistance=${sr.resistance.toFixed(5)} Mid=${sr.mid.toFixed(5)} Trend=${sr.trend > 0 ? "↑" : sr.trend < 0 ? "↓" : "→"}`;
}
