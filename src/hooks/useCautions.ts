import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import type { CautionNote } from "../lib/cautionNotes";
import type { BrokerId } from "../types/broker";

/**
 * PR-2 (Tahap 17, 15 Okt 2026) — catatan waspada per simbol broker aktif
 * (GET /api/evaluation/cautions), tiap 5 menit. Gagal = tanpa catatan.
 */
export function useCautions(brokerId: BrokerId): ReadonlyMap<string, CautionNote> {
  const [state, setState] = useState<{ broker: BrokerId; map: ReadonlyMap<string, CautionNote> }>({ broker: brokerId, map: new Map() });
  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      fetch(`${API_BASE_URL}/api/evaluation/cautions?broker=${brokerId}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ cautions?: CautionNote[] }>) : null))
        .then((j) => {
          if (cancelled) return;
          const list = Array.isArray(j?.cautions) ? j.cautions : [];
          // Demo + Live broker sama: simpan rangkaian rugi TERBARU per simbol.
          const map = new Map<string, CautionNote>();
          for (const c of list) {
            const prev = map.get(c.symbol);
            if (prev === undefined || c.startTime > prev.startTime) map.set(c.symbol, c);
          }
          setState({ broker: brokerId, map });
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
  return state.broker === brokerId ? state.map : new Map();
}
