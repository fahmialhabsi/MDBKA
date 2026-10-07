import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import { extractQuoteFromRestPayload } from "../../server/types/quotes";
import type { QuoteSnapshot } from "../types/quotes";
import type { BrokerId } from "../types/broker";

const EMPTY_QUOTES: ReadonlyMap<string, QuoteSnapshot> = new Map();

/**
 * #509 - React hook: poll quote live per broker dari endpoint yang sama
 * dengan dashboard (GET /api/quotes/:symbol?broker=..., sumber quotes.csv
 * EA yang diperbarui terus) — BUKAN snapshot margin CSV yang statis.
 *
 * Input: simbol sesuai penamaan broker (Finex: AUDUSD, OTB: AUDUSD_ORB).
 * Output: Map symbol → QuoteSnapshot, error, loading.
 *
 * Effect dikunci pada `key` (string) agar array `symbols` baru di tiap
 * render parent tidak memicu ulang polling (banjir request).
 */
export function useLiveQuotes(
  symbols: readonly string[] = [],
  brokerId?: BrokerId,
  pollIntervalMs: number = 30000,
): {
  readonly quotes: ReadonlyMap<string, QuoteSnapshot>;
  readonly error: string | null;
  readonly loading: boolean;
} {
  const key = symbols.join(",") + "|" + (brokerId ?? "");
  const [quotes, setQuotes] =
    useState<ReadonlyMap<string, QuoteSnapshot>>(EMPTY_QUOTES);
  const [error, setError] = useState<string | null>(null);
  // Key terakhir yang selesai di-fetch; loading diturunkan darinya
  // (tanpa setState sinkron di dalam effect).
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (symbols.length === 0) return;

    let cancelled = false;
    const query = brokerId === undefined ? "" : `?broker=${brokerId}`;

    const fetchAll = async (): Promise<void> => {
      const next = new Map<string, QuoteSnapshot>();
      let failure: string | null = null;
      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const res = await fetch(
              `${API_BASE_URL}/api/quotes/${encodeURIComponent(symbol)}${query}`,
            );
            if (!res.ok) return; // simbol belum ada di quotes.csv broker ini
            const payload: unknown = (await res.json()) as unknown;
            const latest = extractQuoteFromRestPayload(payload, symbol);
            if (latest !== null) next.set(symbol, latest);
          } catch (e) {
            failure = e instanceof Error ? e.message : String(e);
          }
        }),
      );
      if (cancelled) return;
      setQuotes(next);
      setError(failure);
      setLoadedKey(key);
    };

    void fetchAll();
    const id = window.setInterval(() => {
      void fetchAll();
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- symbols & brokerId dibekukan via key
  }, [key, pollIntervalMs]);

  const ready = loadedKey === key;
  return {
    quotes: ready ? quotes : EMPTY_QUOTES,
    error: ready ? error : null,
    loading: symbols.length > 0 && !ready,
  };
}
