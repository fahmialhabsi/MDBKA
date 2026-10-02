import { useEffect, useRef, useState } from "react";
import type { QuoteSnapshot } from "../../server/types/quotes";

const QUOTES_BASE_URL = "http://localhost:3000";

export interface QuotesStreamState {
  readonly quote: QuoteSnapshot | null;
  readonly isConnected: boolean;
  readonly error: string | null;
}

export function useQuotesStream(symbol: string, pollIntervalMs = 5000): QuotesStreamState {
  const [quote, setQuote] = useState<QuoteSnapshot | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchLatest = async (): Promise<void> => {
      try {
        const res = await fetch(`${QUOTES_BASE_URL}/api/quotes/${symbol}`);
        if (!res.ok) throw new Error(`Backend HTTP ${res.status}`);
        const data = (await res.json()) as { data: QuoteSnapshot[] };
        if (!cancelled && data.data.length > 0) {
          setQuote(data.data[0]);
          setIsConnected(true);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setIsConnected(false);
          setError(err instanceof Error ? err.message : "Gagal fetch quotes");
        }
      }
    };

    const startPolling = (): void => {
      if (pollRef.current !== null) return;
      pollRef.current = window.setInterval(() => {
        void fetchLatest();
      }, pollIntervalMs);
    };

    let source: EventSource | null = null;
    try {
      source = new EventSource(`${QUOTES_BASE_URL}/api/quotes/${symbol}/stream`);
      source.onopen = () => {
        if (!cancelled) {
          setIsConnected(true);
          setError(null);
        }
      };
      source.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as QuoteSnapshot;
          if (!cancelled) {
            setQuote(data);
            setIsConnected(true);
            setError(null);
          }
        } catch {
          if (!cancelled) setError("Gagal parse data quotes");
        }
      };
      source.onerror = () => {
        source?.close();
        source = null;
        if (!cancelled) {
          setIsConnected(false);
          void fetchLatest();
          startPolling();
        }
      };
    } catch {
      void fetchLatest();
      startPolling();
    }

    return () => {
      cancelled = true;
      source?.close();
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [symbol, pollIntervalMs]);

  return { quote, isConnected, error };
}
