import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import type { NewsEventLike } from "../lib/newsGuard";
import type { BrokerId } from "../types/broker";

const REFRESH_MS = 5 * 60_000;

/**
 * Satpam Kalender K5: event kalender ekonomi broker aktif (jam server) dari
 * /api/calendar. null = belum/tidak tersedia → satpam diabaikan.
 */
export function useNewsCalendar(brokerId: BrokerId): readonly NewsEventLike[] | null {
  const [state, setState] = useState<{
    readonly broker: BrokerId;
    readonly events: readonly NewsEventLike[] | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/calendar?broker=${brokerId}`);
        const body = res.ok
          ? ((await res.json()) as { available?: boolean; events?: NewsEventLike[] })
          : null;
        if (cancelled) return;
        setState({
          broker: brokerId,
          events:
            body !== null && body.available === true && Array.isArray(body.events)
              ? body.events
              : null,
        });
      } catch {
        if (!cancelled) setState({ broker: brokerId, events: null });
      }
    };
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [brokerId]);
  return state !== null && state.broker === brokerId ? state.events : null;
}
