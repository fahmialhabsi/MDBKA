import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import type { TradeSession } from "../lib/sessionGuard";
import type { BrokerId } from "../types/broker";

/**
 * Satpam Sesi S4 — jam trading resmi broker (GET /api/sessions?broker=),
 * diperbarui tiap 5 menit. Gagal / file belum ada → [] (satpam diabaikan).
 */
export function useTradeSessions(brokerId: BrokerId | undefined): readonly TradeSession[] {
  const [book, setBook] = useState<{ broker: BrokerId | undefined; sessions: TradeSession[] }>({ broker: undefined, sessions: [] });
  useEffect(() => {
    if (brokerId === undefined) return;
    let cancelled = false;
    const load = (): void => {
      fetch(`${API_BASE_URL}/api/sessions?broker=${brokerId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { sessions?: TradeSession[] } | null) => {
          if (!cancelled) setBook({ broker: brokerId, sessions: Array.isArray(j?.sessions) ? j.sessions : [] });
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 300_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [brokerId]);
  return book.broker === brokerId ? book.sessions : [];
}
