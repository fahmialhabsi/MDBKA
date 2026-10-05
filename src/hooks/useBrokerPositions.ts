import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import {
  isBrokerPosition,
  type BrokerPosition,
} from "../../server/types/positions";
import type { BrokerId } from "../types/broker";

/**
 * Tahap AP — polling daftar posisi terbuka MT5 (read-only).
 * GET /api/positions?broker= → {positions}. Tanpa SSE (REST cukup).
 * Backend mati/belum dikonfigurasi → list kosong + error jujur.
 */
export function useBrokerPositions(
  brokerId: BrokerId | undefined,
  pollIntervalMs: number = 5000,
): {
  readonly positions: BrokerPosition[];
  readonly isConnected: boolean;
  /** True bila backend jawab 404 = EA/file belum dikonfigurasi. */
  readonly sourceMissing: boolean;
  readonly error: string | null;
} {
  const [positions, setPositions] = useState<BrokerPosition[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [sourceMissing, setSourceMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const query = brokerId === undefined ? "" : `?broker=${brokerId}`;
    const fetchAll = async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/positions${query}`);
        if (res.status === 404) {
          if (!cancelled) {
            setPositions([]);
            setIsConnected(true);
            setSourceMissing(true);
            setError(null);
          }
          return;
        }
        if (!res.ok) throw new Error(`Backend HTTP ${res.status}`);
        const payload: unknown = (await res.json()) as unknown;
        const list =
          typeof payload === "object" &&
          payload !== null &&
          Array.isArray((payload as { positions?: unknown }).positions)
            ? (
                (payload as { positions: unknown[] }).positions.filter(
                  isBrokerPosition,
                )
              )
            : [];
        if (!cancelled) {
          setPositions(list);
          setIsConnected(true);
          setSourceMissing(false);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setIsConnected(false);
          setSourceMissing(false);
          setError(err instanceof Error ? err.message : "Gagal fetch posisi");
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
  }, [brokerId, pollIntervalMs]);

  return { positions, isConnected, sourceMissing, error };
}
