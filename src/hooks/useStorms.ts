import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import type { StormWarning } from "../lib/stormWarning";

/**
 * CU-1 (15 Okt 2026) — Peringatan Badai 30 menit per simbol pemindai
 * (GET /api/candles/storm?symbols=...), tiap 60 dtk. Gagal = tanpa peringatan.
 */
export function useStorms(symbols: readonly string[]): ReadonlyMap<string, StormWarning> {
  const key = [...symbols].sort().join(",");
  const [state, setState] = useState<{ key: string; map: ReadonlyMap<string, StormWarning> }>({ key, map: new Map() });
  useEffect(() => {
    if (key === "") return;
    let cancelled = false;
    const load = (): void => {
      fetch(`${API_BASE_URL}/api/candles/storm?symbols=${encodeURIComponent(key)}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ storms?: Array<{ symbol: string } & StormWarning> }>) : null))
        .then((j) => {
          if (cancelled) return;
          const map = new Map<string, StormWarning>();
          for (const w of Array.isArray(j?.storms) ? j.storms : []) map.set(w.symbol, w);
          setState({ key, map });
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [key]);
  return state.key === key ? state.map : new Map();
}
