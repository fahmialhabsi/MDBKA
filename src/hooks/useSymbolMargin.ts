import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import type { BrokerId } from "../types/broker";

/**
 * Item (e) — margin per 1 lot simbol aktif dari GET /api/margin.
 * Sumber: OrderCalcMargin MT5 (snapshot saat script ExportMarginMDBKA
 * dijalankan). 404 = file/simbol belum ada → sourceMissing jujur.
 */
export interface SymbolMarginState {
  readonly marginBuy: number | null;
  readonly marginSell: number | null;
  readonly exported: string | null;
  readonly sourceMissing: boolean;
  readonly error: string | null;
}

const EMPTY: SymbolMarginState = {
  marginBuy: null,
  marginSell: null,
  exported: null,
  sourceMissing: false,
  error: null,
};

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export function useSymbolMargin(
  brokerId: BrokerId | undefined,
  symbol: string,
  pollIntervalMs: number = 60000,
): SymbolMarginState {
  const sym = symbol.trim();
  const key = brokerId === undefined || sym === "" ? "" : `${brokerId}|${sym}`;
  const [state, setState] = useState<{ key: string; value: SymbolMarginState }>(
    {
      key: "",
      value: EMPTY,
    },
  );

  useEffect(() => {
    if (key === "" || brokerId === undefined) return;
    let cancelled = false;
    const fetchOne = async (): Promise<void> => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/margin?broker=${brokerId}&symbol=${encodeURIComponent(sym)}`,
        );
        if (res.status === 404) {
          if (!cancelled)
            setState({ key, value: { ...EMPTY, sourceMissing: true } });
          return;
        }
        if (!res.ok) throw new Error(`Backend HTTP ${res.status}`);
        const payload = (await res.json()) as {
          marginBuy?: unknown;
          marginSell?: unknown;
          exported?: unknown;
        };
        if (!cancelled) {
          setState({
            key,
            value: {
              marginBuy: positive(payload.marginBuy),
              marginSell: positive(payload.marginSell),
              exported:
                typeof payload.exported === "string" ? payload.exported : null,
              sourceMissing: false,
              error: null,
            },
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            key,
            value: {
              ...EMPTY,
              error: err instanceof Error ? err.message : "Gagal fetch margin",
            },
          });
        }
      }
    };
    void fetchOne();
    const id = window.setInterval(() => {
      void fetchOne();
    }, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [key, brokerId, sym, pollIntervalMs]);

  return key !== "" && state.key === key ? state.value : EMPTY;
}
