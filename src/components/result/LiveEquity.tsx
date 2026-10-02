/**
 * Tahap 5E-STEP2 — panel Live Equity MT5 (display only, info-only).
 *
 * Independen dari decision engine: angka balance/equity dari backend
 * TIDAK mengubah hasil BELI/JUAL/TUNGGU maupun lot (risiko tetap dari
 * input equity manual). Backend offline → status jujur, bukan angka
 * fiktif.
 */

import { Activity, Wallet } from "lucide-react";
import type { JSX } from "react";
import { useEquityStream } from "../../hooks/useEquityStream";

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function LiveEquity(): JSX.Element {
  const { equity, isConnected, error } = useEquityStream();

  return (
    <div
      data-testid="live-equity"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
    >
      <div className="flex items-center gap-2">
        <Wallet size={18} className="text-sky-300" />
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-300">
          Live Equity (MT5)
        </h3>
        <span
          className={[
            "ml-auto flex items-center gap-1 text-xs font-semibold",
            isConnected ? "text-emerald-300" : "text-slate-500",
          ].join(" ")}
        >
          <Activity size={14} />
          {isConnected ? "Live" : "Offline"}
        </span>
      </div>

      {equity === null ? (
        <p className="mt-3 text-sm text-slate-400">
          {error !== null
            ? `Backend equity offline (${error}). Jalankan npm run dev:backend lalu isi MT5_LOG_PATH bila perlu.`
            : "Menghubungkan ke backend equity…"}
        </p>
      ) : (
        <dl className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Balance
            </dt>
            <dd className="mt-1 text-lg font-bold text-white">
              {money(equity.balance)}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Equity
            </dt>
            <dd className="mt-1 text-lg font-bold text-white">
              {money(equity.equity)}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Profit
            </dt>
            <dd
              className={[
                "mt-1 text-lg font-bold",
                equity.profit >= 0 ? "text-emerald-300" : "text-red-300",
              ].join(" ")}
            >
              {equity.profit >= 0 ? "+" : ""}
              {equity.profit.toFixed(2)}
            </dd>
          </div>
        </dl>
      )}

      {equity !== null && (
        <p className="mt-3 text-xs text-slate-500">
          Update terakhir: {equity.timestamp}
        </p>
      )}
    </div>
  );
}
