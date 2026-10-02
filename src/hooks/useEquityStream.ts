/**
 * Tahap 5E-STEP2 — hook equity MT5 real-time (FRONTEND).
 *
 * Strategi koneksi:
 * 1. SSE via EventSource ke /api/equity/stream (real-time push).
 * 2. Bila SSE gagal/terputus → fallback polling GET /api/equity/latest
 *    tiap `pollIntervalMs` (default 5 dtk).
 * Backend mati total → state offline + pesan error jujur (tanpa crash).
 */

import { useEffect, useRef, useState } from "react";
import type { EquitySnapshot } from "../../server/types/equity";

const EQUITY_BASE_URL = "http://localhost:3000";

export interface EquityStreamState {
  readonly equity: EquitySnapshot | null;
  readonly isConnected: boolean;
  readonly error: string | null;
}

export function useEquityStream(pollIntervalMs = 5000): EquityStreamState {
  const [equity, setEquity] = useState<EquitySnapshot | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchLatest = async (): Promise<void> => {
      try {
        const res = await fetch(`${EQUITY_BASE_URL}/api/equity/latest`);
        if (!res.ok) throw new Error(`Backend HTTP ${res.status}`);
        const data = (await res.json()) as EquitySnapshot;
        if (!cancelled) {
          setEquity(data);
          setIsConnected(true);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setIsConnected(false);
          setError(err instanceof Error ? err.message : "Gagal fetch equity");
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
      source = new EventSource(`${EQUITY_BASE_URL}/api/equity/stream`);
      source.onopen = () => {
        if (!cancelled) {
          setIsConnected(true);
          setError(null);
        }
      };
      source.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as EquitySnapshot;
          if (!cancelled) {
            setEquity(data);
            setIsConnected(true);
            setError(null);
          }
        } catch {
          if (!cancelled) setError("Gagal parse data equity");
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
      // EventSource tak tersedia (mis. SSR/test): langsung fallback polling.
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
  }, [pollIntervalMs]);

  return { equity, isConnected, error };
}
