import { useEffect, useState, type JSX } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import { predictDailySwap } from "../../lib/swapPrediction";
import type { BrokerId } from "../../types/broker";
import type { SwapLogRow } from "../../../server/types/swapLogCsv";

interface SwapLogResponse {
  readonly login: string;
  readonly count: number;
  readonly rows: SwapLogRow[];
}

/**
 * #502 — Log Swap (MT5): baris EA MDBKASwapLogger jam demi jam, swap
 * aktual terminal berdampingan dengan prediksi rumus ÷360. Baris dengan
 * swap ≠ 0 disorot (bukti rollover). Poll 60 dtk (file append per jam).
 */
export function SwapLogPanel({ brokerId }: { brokerId: BrokerId }): JSX.Element {
  const [data, setData] = useState<SwapLogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/swaplog?broker=${brokerId}`);
        const body: unknown = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
          setError(msg);
          setData(null);
          return;
        }
        setError(null);
        setData(body as SwapLogResponse);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [brokerId]);

  if (error !== null) {
    return <p className="text-sm text-amber-300">Log swap belum tersedia: {error}</p>;
  }
  if (data === null) {
    return <p className="text-sm text-slate-400">Memuat log swap…</p>;
  }

  const rows = [...data.rows].reverse();
  const fmt = (n: number | null, d = 2): string => (n === null ? "—" : n.toFixed(d));

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">
        Login {data.login} · {data.count} baris · terbaru di atas · waktu = jam lokal (WIT)
      </p>
      <div className="max-h-[28rem] overflow-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="sticky top-0 bg-slate-900 text-slate-400">
            <tr>
              <th className="px-2 py-1">Waktu</th>
              <th className="px-2 py-1">Alasan</th>
              <th className="px-2 py-1">Simbol</th>
              <th className="px-2 py-1">Arah/Lot</th>
              <th className="px-2 py-1">Harga</th>
              <th className="px-2 py-1">Swap MT5</th>
              <th className="px-2 py-1">Prediksi ÷360</th>
              <th className="px-2 py-1">Profit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const prediction = predictDailySwap(row);
              const hit = row.swap !== null && row.swap !== 0;
              return (
                <tr
                  key={`${row.localTime}-${row.ticket ?? "none"}-${i}`}
                  className={hit ? "bg-emerald-400/10 text-emerald-200" : "border-t border-white/5"}
                >
                  <td className="px-2 py-1 whitespace-nowrap">{row.localTime}</td>
                  <td className="px-2 py-1">{row.reason}</td>
                  <td className="px-2 py-1">{row.symbol || "—"}</td>
                  <td className="px-2 py-1">
                    {row.type ? `${row.type} ${fmt(row.volume)}` : "—"}
                  </td>
                  <td className="px-2 py-1">{row.priceCurrent ?? "—"}</td>
                  <td className="px-2 py-1 font-semibold">{fmt(row.swap)}</td>
                  <td className="px-2 py-1">
                    {prediction === null
                      ? "—"
                      : `${prediction.value.toFixed(2)} ${prediction.currency}`}
                  </td>
                  <td className="px-2 py-1">{fmt(row.profit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
