/**
 * T3 - Signal Analyzer (BELI/JUAL/TUNGGU prediction)
 *
 * Input: SRLevels dari T2 + current market state
 * Output: Signal (BELI/JUAL/TUNGGU) + confidence score
 *
 * Logic:
 * - BELI: price di atas PP + trend up + support terjaga
 * - JUAL: price di bawah PP + trend down + resistance terjaga
 * - TUNGGU: price near PP atau trend unclear
 */

export type Signal = "BELI" | "JUAL" | "TUNGGU";

export interface SRLevels {
  readonly symbol: string;
  readonly pp: number;
  readonly s1: number;
  readonly r1: number;
  readonly support: number;
  readonly resistance: number;
  readonly trend: -1 | 0 | 1;
  readonly mid: number;
  readonly spreadPts: number;
  readonly calculatedAt: string;
}

export interface SignalResult {
  readonly symbol: string;
  readonly signal: Signal;
  /** Confidence 0-100 (higher = more certain) */
  readonly confidence: number;
  /** Reason for signal */
  readonly reason: string;
  /** Price position relative to S&R */
  readonly pricePosition: "ABOVE_R1" | "ABOVE_PP" | "BETWEEN_PP_S1" | "BELOW_S1";
  /** SRLevels yang dipakai */
  readonly srLevels: SRLevels;
  readonly analyzedAt: string;
}

/**
 * Kategorisasi posisi harga terhadap S&R levels.
 */
function getPricePosition(
  price: number,
  pp: number,
  r1: number,
  s1: number,
): SignalResult["pricePosition"] {
  if (price >= r1) return "ABOVE_R1";
  if (price >= pp) return "ABOVE_PP";
  if (price >= s1) return "BETWEEN_PP_S1";
  return "BELOW_S1";
}

/**
 * Hitung confidence score untuk signal.
 *
 * BELI confidence tinggi jika:
 * - Price above PP (bullish zone)
 * - Trend up
 * - Price mendekati resistance (strong momentum)
 *
 * JUAL confidence tinggi jika:
 * - Price below PP (bearish zone)
 * - Trend down
 * - Price mendekati support (strong downmove)
 */
function calculateConfidence(
  signal: Signal,
  sr: SRLevels,
): number {
  const { mid, pp, r1, s1, trend } = sr;

  let confidence = 50; // Base 50%

  if (signal === "BELI") {
    // Zone bonus: 0-15pts tergantung di mana harga
    if (mid > pp) {
      const distToPP = mid - pp;
      const distToR1 = Math.max(0, r1 - mid);
      if (distToR1 > 0) {
        // Semakin dekat ke R1, semakin strong signal
        confidence += Math.min(15, (distToPP / distToR1) * 15);
      } else {
        confidence += 15; // Sudah di atas R1
      }
    }

    // Trend bonus: +10 jika trend up
    if (trend > 0) confidence += 10;

    // Distance dari support: +10 jika cukup jauh
    const distFromSupport = mid - sr.support;
    if (distFromSupport > sr.spreadPts * 5) confidence += 10;
  } else if (signal === "JUAL") {
    // Zone bonus: price di bawah PP
    if (mid < pp) {
      const distFromPP = pp - mid;
      const distToS1 = Math.max(0, mid - s1);
      if (distToS1 > 0) {
        confidence += Math.min(15, (distFromPP / distToS1) * 15);
      } else {
        confidence += 15; // Sudah di bawah S1
      }
    }

    // Trend bonus: +10 jika trend down
    if (trend < 0) confidence += 10;

    // Distance dari resistance: +10 jika cukup jauh
    const distFromResistance = sr.resistance - mid;
    if (distFromResistance > sr.spreadPts * 5) confidence += 10;
  } else {
    // TUNGGU: neutral confidence (50-60%)
    if (Math.abs(trend) === 0) confidence += 10; // Trend unclear
  }

  return Math.min(100, Math.max(0, Math.round(confidence)));
}

/**
 * Analisis signal berdasarkan SRLevels.
 *
 * Rules:
 * 1. Jika price > R1 AND trend up → BELI (strong breakout)
 * 2. Jika price > PP AND trend up → BELI (bullish)
 * 3. Jika price < S1 AND trend down → JUAL (strong breakdown)
 * 4. Jika price < PP AND trend down → JUAL (bearish)
 * 5. Else → TUNGGU (indecisive)
 */
export function analyzeSignal(sr: SRLevels): SignalResult {
  const { mid, pp, r1, s1, trend, symbol } = sr;
  const position = getPricePosition(mid, pp, r1, s1);

  let signal: Signal;
  let reason: string;

  // Strong signals
  if (mid >= r1 && trend > 0) {
    signal = "BELI";
    reason = "Breakout di atas R1, trend bullish";
  } else if (mid <= s1 && trend < 0) {
    signal = "JUAL";
    reason = "Breakdown di bawah S1, trend bearish";
  }
  // Normal signals
  else if (mid > pp && trend > 0) {
    signal = "BELI";
    reason = "Price di atas PP, trend bullish";
  } else if (mid < pp && trend < 0) {
    signal = "JUAL";
    reason = "Price di bawah PP, trend bearish";
  }
  // Neutral/unclear
  else if (mid > pp && trend === 0) {
    signal = "TUNGGU";
    reason = "Price di atas PP tapi trend unclear";
  } else if (mid < pp && trend === 0) {
    signal = "TUNGGU";
    reason = "Price di bawah PP tapi trend unclear";
  } else {
    signal = "TUNGGU";
    reason = "Price near PP atau sinyal bertentangan";
  }

  const confidence = calculateConfidence(signal, sr);

  return {
    symbol,
    signal,
    confidence,
    reason,
    pricePosition: position,
    srLevels: sr,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Format signal untuk display (debugging).
 */
export function formatSignal(result: SignalResult): string {
  return `[${result.symbol}] ${result.signal} (${result.confidence}%) - ${result.reason} | Pos=${result.pricePosition}`;
}
