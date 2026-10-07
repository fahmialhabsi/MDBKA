import { useEffect, useState } from "react";
import type { QuoteSnapshot } from "../types/quotes";

/**
 * #509 - React hook: poll live quotes dari backend setiap 30 dtk.
 * Input: array simbol (AUDUSD_ORB, EURUSD_ORB, dll).
 * Output: Map symbol → QuoteSnapshot, error, loading state.
 */
export function useLiveQuotes(symbols: readonly string[] = []) {
  const [quotes, setQuotes] = useState<Map<string, QuoteSnapshot>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(symbols.length > 0);
  const symbolsKey = symbols.join(","); // Extract to avoid complex dependency

  useEffect(() => {
    if (symbols.length === 0) {
      return;
    }

    let isMounted = true;
    const POLL_INTERVAL_MS = 30000; // 30 dtk

    const syncQuotes = async (): Promise<void> => {
      try {
        const nextQuotes = new Map<string, QuoteSnapshot>();
        for (const symbol of symbols) {
          try {
            const url = `/api/quotes-live/latest/${encodeURIComponent(symbol)}`;
            const response = await fetch(url);
            if (response.ok) {
              const data = (await response.json()) as unknown;
              if (isQuoteSnapshot(data)) {
                nextQuotes.set(symbol, data);
              }
            }
          } catch (e) {
            console.warn(`Error fetching quote ${symbol}:`, e);
          }
        }
        if (isMounted) {
          setQuotes(nextQuotes);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (isMounted) {
          setError(String(e));
          setLoading(false);
        }
      }
    };

    // Sync immediately, then poll
    syncQuotes();
    const interval = setInterval(syncQuotes, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [symbols, symbolsKey]); // Depend on both symbols and key

  return { quotes, error, loading };
}

/** Type guard: validate QuoteSnapshot shape. */
function isQuoteSnapshot(value: unknown): value is QuoteSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.symbol === "string" &&
    typeof obj.bid === "number" &&
    typeof obj.ask === "number" &&
    typeof obj.timestamp === "string" &&
    obj.ask > obj.bid
  );
}
