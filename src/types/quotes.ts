/**
 * T1 - Live Quotes Types
 * QuoteSnapshot: snapshot real-time bid/ask dari margin CSV
 */

export interface QuoteSnapshot {
  readonly symbol: string;
  readonly bid: number;
  readonly ask: number;
  readonly timestamp: string;
}
