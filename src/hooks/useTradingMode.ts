import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import type { TradingMode } from "../lib/tradingMode";
import type { BrokerId } from "../types/broker";

export interface TradingModeState {
  readonly broker: BrokerId;
  readonly requested: TradingMode;
  readonly mode: TradingMode;
  readonly alasan: string;
  readonly login: string | null;
  readonly jenisAkun: "demo" | "live" | "tidak-terbukti";
}

const DEFAULT = (broker: BrokerId): TradingModeState => ({
  broker, requested: "LIVE", mode: "LIVE", alasan: "Mode Live: semua penjaga berlaku", login: null, jenisAkun: "tidak-terbukti",
});

/**
 * Tahap 13 (13 Okt 2026) — saklar mode A (GET/POST /api/trading-mode).
 * Gagal ambil = LIVE (aman). `error` = penolakan server (mis. akun live).
 */
export function useTradingMode(brokerId: BrokerId): {
  readonly state: TradingModeState;
  readonly error: string | null;
  readonly setMode: (mode: TradingMode) => void;
} {
  const [state, setState] = useState<TradingModeState>(DEFAULT(brokerId));
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(`${API_BASE_URL}/api/trading-mode?broker=${brokerId}`)
      .then((r) => (r.ok ? (r.json() as Promise<Omit<TradingModeState, "broker">>) : null))
      .then((j) => {
        if (j !== null) setState({ ...j, broker: brokerId });
      })
      .catch(() => undefined);
  }, [brokerId]);
  useEffect(() => {
    load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);
  const setMode = useCallback(
    (mode: TradingMode) => {
      setError(null);
      fetch(`${API_BASE_URL}/api/trading-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broker: brokerId, mode }),
      })
        .then(async (r) => {
          const j = (await r.json()) as { error?: string } & Partial<TradingModeState>;
          if (!r.ok) setError(j.error ?? "Gagal mengubah mode");
          load();
        })
        .catch(() => setError("Server tidak terjangkau — mode tetap"));
    },
    [brokerId, load],
  );
  return { state: state.broker === brokerId ? state : DEFAULT(brokerId), error, setMode };
}
