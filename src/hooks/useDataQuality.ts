import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import type { BrokerId } from "../types/broker";

/**
 * F2 (13 Okt 2026) — alasan gerbang kualitas data broker (GET /api/data-quality),
 * diperbarui tiap 60 dtk. null = lolos / tidak dinilai / server tidak terjangkau
 * (perilaku lama: pemindai tidak ditahan karena gagal mengambil status).
 */
export function useDataQuality(brokerId: BrokerId): string | null {
  const [state, setState] = useState<{ broker: BrokerId; reason: string | null }>({ broker: brokerId, reason: null });
  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      fetch(`${API_BASE_URL}/api/data-quality?broker=${brokerId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { alasan?: string | null } | null) => {
          if (!cancelled) setState({ broker: brokerId, reason: typeof j?.alasan === "string" ? j.alasan : null });
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [brokerId]);
  return state.broker === brokerId ? state.reason : null;
}
