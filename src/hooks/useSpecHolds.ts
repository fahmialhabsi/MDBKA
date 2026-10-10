import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import { specHoldMap } from "../lib/specCompare";
import type { BrokerId } from "../types/broker";

const REFRESH_MS = 5 * 60_000;

/**
 * V2c-3: simbol broker aktif yang spesifikasi MT5-nya beda dengan spec32
 * (GET /api/specs). null = belum/tidak tersedia → satpam diabaikan.
 */
export function useSpecHolds(brokerId: BrokerId): ReadonlyMap<string, string> | null {
  const [state, setState] = useState<{
    readonly broker: BrokerId;
    readonly holds: ReadonlyMap<string, string> | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/specs?broker=${brokerId}`);
        const body = res.ok
          ? ((await res.json()) as { available?: boolean; diffs?: { symbol: string; level: string; reason: string }[] })
          : null;
        if (cancelled) return;
        setState({
          broker: brokerId,
          holds: body !== null && body.available === true && Array.isArray(body.diffs) ? specHoldMap(body.diffs) : null,
        });
      } catch {
        if (!cancelled) setState({ broker: brokerId, holds: null });
      }
    };
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [brokerId]);
  return state !== null && state.broker === brokerId ? state.holds : null;
}
