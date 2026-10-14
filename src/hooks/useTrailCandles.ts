import { useEffect, useState } from "react";
import type { Candle } from "../calculations/swingDetector";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import { parseCsvCandles } from "../lib/csvCandleParser";

/**
 * T1 (Tahap 16, 15 Okt 2026) — candle M15 + H1 tertutup satu simbol untuk saran
 * geser SL (GET /api/candles/:symbol?tf=M15 dan tanpa tf = H1), tiap 60 dtk.
 * Belum diekspor / server tidak terjangkau = null (tanpa saran, bukan tebakan).
 */
export interface TrailCandles {
  readonly m15: readonly Candle[] | null;
  readonly h1: readonly Candle[] | null;
}

const EMPTY: TrailCandles = { m15: null, h1: null };

async function load(symbol: string, tf: "M15" | "H1"): Promise<readonly Candle[] | null> {
  const query = tf === "H1" ? "" : `?tf=${tf}`;
  try {
    const res = await fetch(`${API_BASE_URL}/api/candles/${encodeURIComponent(symbol)}${query}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { csv?: unknown };
    if (typeof j.csv !== "string") return null;
    const candles = parseCsvCandles(j.csv).candles;
    return candles.length === 0 ? null : candles;
  } catch {
    return null;
  }
}

export function useTrailCandles(symbol: string, enabled: boolean): TrailCandles {
  const [state, setState] = useState<{ symbol: string; data: TrailCandles }>({ symbol, data: EMPTY });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = (): void => {
      void Promise.all([load(symbol, "M15"), load(symbol, "H1")]).then(([m15, h1]) => {
        if (!cancelled) setState({ symbol, data: { m15, h1 } });
      });
    };
    run();
    const id = window.setInterval(run, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [symbol, enabled]);
  return enabled && state.symbol === symbol ? state.data : EMPTY;
}
