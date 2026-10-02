export interface QuoteSnapshot {
  timestamp: string;
  symbol: string;
  bid: number;
  ask: number;
}

export interface QuotesResponse {
  data: QuoteSnapshot[];
  symbol: string;
  count: number;
  timestamp: string;
}

export interface QuotesStreamEvent {
  type: 'quote' | 'error';
  payload: QuoteSnapshot | { message: string };
}
