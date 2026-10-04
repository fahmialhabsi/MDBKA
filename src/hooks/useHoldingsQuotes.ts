import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import { extractQuoteFromRestPayload } from "../../server/types/quotes";
import type { BrokerId } from "../types/broker";

export interface HoldingsQuote {
  readonly bid: number;
  readonly ask: number;
  readonly timestamp: string;
}

/**
 * Tahap F1 — polling REST bid/ask untuk banyak simbol sekaligus
 * (satu interval, fetch paralel per simbol). Dipakai dashboard monitor
 * posisi; stream SSE per-baris tetap di LiveQuotes. Murni React + fetch.
 */
export function useHoldingsQuotes(
  symbols: readonly string[],
  brokerId: BrokerId | undefined,
  pollIntervalMs: number = 5000,
): {
  readonly quotes: Record<string, HoldingsQuote>;
  readonly isConnected: boolean;
  readonly error: string | null;
} {
  const [quotes, setQuotes] = useState<Record<string, HoldingsQuote>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = [...symbols].sort().join(",") + "|" + (brokerId ?? "");
  // Reset saat daftar simbol/broker berubah (pola adjust-during-render;
  // lihat catatan disable terlingkup di LiveQuotes.tsx).
  /* eslint-disable react-hooks/refs -- F1: sinkron ref key saat render, tanpa cascade (guard berubah) */
  const keyRef = useRef(key);
  if (keyRef.current !== key) {
    keyRef.current = key;
    setQuotes({});
    setIsConnected(false);
    setError(null);
  }
  /* eslint-enable react-hooks/refs */

  useEffect(() => {
    let cancelled = false;
    const query = brokerId === undefined ? "" : `?broker=${brokerId}`;
    const fetchAll = async (): Promise<void> => {
      try {
        const entries = await Promise.all(
          symbols.map(async (symbol) => {
            const res = await fetch(
              `${API_BASE_URL}/api/quotes/${encodeURIComponent(symbol)}${query}`,
            );
            if (!res.ok) return null;
            const payload: unknown = (await res.json()) as unknown;
            const latest = extractQuoteFromRestPayload(payload, symbol);
            return latest === null ? null : { symbol, latest };
          }),
        );
        if (cancelled) return;
        const next: Record<string, HoldingsQuote> = {};
        for (const entry of entries) {
          if (entry !== null) {
            next[entry.symbol] = {
              bid: entry.latest.bid,
              ask: entry.latest.ask,
              timestamp: entry.latest.timestamp,
            };
          }
        }
        setQuotes(next);
        setIsConnected(true);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setIsConnected(false);
          setError(err instanceof Error ? err.message : "Gagal fetch quotes");
        }
      }
    };
    void fetchAll();
    const id = window.setInterval(() => {
      void fetchAll();
    }, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- symbols dibekukan via key di atas
  }, [key, brokerId, pollIntervalMs]);

  return { quotes, isConnected, error };
}
