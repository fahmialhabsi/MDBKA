import { isClearlyStale } from "./dataFreshness";

export interface LiveQuoteLike {
  readonly timestamp: string;
  readonly symbol: string;
  readonly bid: number;
  readonly ask: number;
}

/**
 * Bid/Ask untuk market dari CSV (#498).
 * - Quote live simbol sama & segar → bid/ask live (harga eksekusi nyata).
 * - Quote simbol sama tapi basi (akhir pekan) → close CSV + spread live.
 * - Tanpa quote valid → close CSV + 1 tick (spread minimal).
 * Dibulatkan toPrecision(12) agar tanpa sisa float (#488).
 */
export function resolveCsvBidAsk(
  close: number,
  tick: number,
  symbol: string,
  liveQuote: LiveQuoteLike | null,
  nowMs: number = Date.now(),
): { bid: number; ask: number } {
  const round = (value: number): number => Number(value.toPrecision(12));
  const valid =
    liveQuote !== null &&
    liveQuote.symbol === symbol &&
    Number.isFinite(liveQuote.bid) &&
    liveQuote.bid > 0 &&
    liveQuote.ask > liveQuote.bid;
  if (!valid) return { bid: close, ask: round(close + tick) };
  if (!isClearlyStale(liveQuote.timestamp, nowMs)) {
    return { bid: liveQuote.bid, ask: liveQuote.ask };
  }
  return { bid: close, ask: round(close + liveQuote.ask - liveQuote.bid) };
}
