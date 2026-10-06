/**
 * Tahap 5E-STEP2 — panel Live Equity MT5 (display only, info-only).
 *
 * Independen dari decision engine: angka balance/equity dari backend
 * TIDAK mengubah hasil BELI/JUAL/TUNGGU maupun lot (risiko tetap dari
 * input equity manual). Backend offline → status jujur, bukan angka
 * fiktif.
 *
 * Kolom turunan (frontend-computed, info-only):
 *   margin      = snapshot.margin ?? balance / leverage
 *   freeMargin  = snapshot.freeMargin ?? equity - margin
 *   marginLevel = snapshot.marginLevel ?? (equity / margin) * 100
 * Leverage: snapshot.leverage bila ada, fallback DEFAULT_LEVERAGE.
 * margin <= 0 → marginLevel "-" (jujur, bukan Infinity fiktif).
 */

import { Activity, Wallet } from "lucide-react";
import { useRef, type JSX } from "react";
import {
  useEquityStream,
  type EquityStreamState,
} from "../../hooks/useEquityStream";
import { useNow } from "../../hooks/useNow";
import {
  formatAge,
  isClearlyStale,
  isStale,
} from "../../lib/dataFreshness";
import type { EquitySnapshot } from "../../../server/types/equity";
import type { BrokerId } from "../../types/broker";

/** Leverage fallback bila backend tak mengirim leverage (umum 1:100). */
export const DEFAULT_LEVERAGE = 100;

export interface MarginMetrics {
  readonly margin: number | null;
  readonly freeMargin: number | null;
  readonly marginLevel: number | null;
  readonly leverage: number;
}

/**
 * Derivasi murni metrik margin dari snapshot (tanpa side-effect).
 * Backend-first: nilai eksplisit dari snapshot menang; bila absen,
 * dihitung dari balance/equity/leverage. Tak pernah melempar.
 */
export function deriveMarginMetrics(
  snapshot: Pick<
    EquitySnapshot,
    "balance" | "equity" | "leverage" | "margin" | "freeMargin" | "marginLevel"
  >,
  fallbackLeverage: number = DEFAULT_LEVERAGE,
): MarginMetrics {
  const leverage =
    snapshot.leverage !== undefined &&
    Number.isFinite(snapshot.leverage) &&
    snapshot.leverage > 0
      ? snapshot.leverage
      : fallbackLeverage;

  const margin =
    snapshot.margin !== undefined && Number.isFinite(snapshot.margin)
      ? snapshot.margin
      : snapshot.balance / leverage;

  const freeMargin =
    snapshot.freeMargin !== undefined && Number.isFinite(snapshot.freeMargin)
      ? snapshot.freeMargin
      : snapshot.equity - margin;

  const marginLevel =
    snapshot.marginLevel !== undefined && Number.isFinite(snapshot.marginLevel)
      ? snapshot.marginLevel
      : margin > 0
        ? (snapshot.equity / margin) * 100
        : null;

  return { margin, freeMargin, marginLevel, leverage };
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function percent(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(2)}%`;
}

/**
 * View murni (tanpa langganan): dipakai App yang memiliki stream sendiri
 * agar satu SSE/polling dipakai bersama untuk panel + auto-analisa.
 */
export function LiveEquityView({
  equity,
  isConnected,
  error,
  brokerId,
  onApplyEquity,
}: EquityStreamState & {
  /** Hanya untuk petunjuk sumber di pesan offline. */
  brokerId?: BrokerId;
  onApplyEquity?: (equity: number) => void;
}): JSX.Element {

  // Tahap P2 — kesegaran data (anti-timezone, sama seperti LiveQuotes).
  // Lihat catatan disable terlingkup di LiveQuotes.tsx.
  const nowMs = useNow();
  /* eslint-disable react-hooks/refs, react-hooks/purity -- P2: sinkron ref prev-payload saat render, tanpa cascade (guard payloadKey berubah) */
  const payloadKey = equity
    ? `${equity.timestamp}|${equity.balance}|${equity.equity}`
    : "";
  const prevKeyRef = useRef("");
  const lastMsRef = useRef<number | null>(null);
  if (payloadKey !== "" && payloadKey !== prevKeyRef.current) {
    prevKeyRef.current = payloadKey;
    lastMsRef.current = Date.now();
  }
  const lastChangeMs = lastMsRef.current;
  const stale =
    equity !== null &&
    (isStale(lastChangeMs, nowMs) ||
      isClearlyStale(equity.timestamp, nowMs) ||
      isClearlyStale(equity.lastModified, nowMs));
  const ageLabel =
    equity !== null && lastChangeMs !== null
      ? formatAge(nowMs - lastChangeMs)
      : null;
  /* eslint-enable react-hooks/refs, react-hooks/purity */

  const metrics =
    equity !== null
      ? deriveMarginMetrics(equity)
      : { margin: null, freeMargin: null, marginLevel: null, leverage: 100 };

  return (
    <div
      data-testid="live-equity"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
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
            ? `Backend equity offline (${error}). Jalankan npm run dev:backend lalu isi MT5_LOG_PATH bila perlu.${brokerId === "finex" ? " Untuk sumber Finex, isi MT5_LOG_PATH_FINEX di .env backend." : ""}`
            : "Menghubungkan ke backend equity…"}
        </p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">
              Balance
            </dt>
            <dd
              data-testid="live-equity-balance"
              className="mt-1 text-base font-bold text-white"
            >
              {money(equity.balance)}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">
              Equity
            </dt>
            <dd
              data-testid="live-equity-equity"
              className="mt-1 text-base font-bold text-white"
            >
              {money(equity.equity)}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">
              Profit
            </dt>
            <dd
              data-testid="live-equity-profit"
              className={[
                "mt-1 text-base font-bold",
                equity.profit >= 0 ? "text-emerald-300" : "text-red-300",
              ].join(" ")}
            >
              {equity.profit >= 0 ? "+" : ""}
              {equity.profit.toFixed(2)}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">
              Margin
            </dt>
            <dd
              data-testid="live-equity-margin"
              className="mt-1 text-base font-bold text-white"
            >
              {metrics.margin !== null ? money(metrics.margin) : "-"}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">
              Free Margin
            </dt>
            <dd
              data-testid="live-equity-free-margin"
              className="mt-1 text-base font-bold text-white"
            >
              {metrics.freeMargin !== null ? money(metrics.freeMargin) : "-"}
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">
              Margin Level
            </dt>
            <dd
              data-testid="live-equity-margin-level"
              className="mt-1 text-base font-bold text-sky-300"
            >
              {percent(metrics.marginLevel)}
            </dd>
          </div>
        </dl>
      )}

      {equity !== null && (
        <p className="mt-3 text-xs text-slate-500">
          Update terakhir: {equity.timestamp}
          {ageLabel !== null ? ` (${ageLabel})` : ""}
          {stale ? " — data basi" : ""}
          {equity.account !== undefined && equity.account !== ""
            ? ` · Akun ${equity.account}`
            : ""}
          {` · 1:${metrics.leverage}`}
        </p>
      )}

      {equity !== null && onApplyEquity !== undefined && (
        <button
          type="button"
          onClick={() => onApplyEquity(equity.equity)}
          disabled={!Number.isFinite(equity.equity) || equity.equity <= 0}
          className="mt-3 w-full rounded-xl bg-emerald-400/15 px-4 py-2 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Gunakan equity live (${equity.equity.toFixed(2)}) untuk analisa
        </button>
      )}
    </div>
  );
}

/** Kompatibilitas: panel mandiri dengan langganan sendiri. */
export function LiveEquity({
  brokerId,
  onApplyEquity,
}: {
  /** Sumber live mengikuti broker aktif (default = sumber utama backend). */
  brokerId?: BrokerId;
  onApplyEquity?: (equity: number) => void;
}): JSX.Element {
  const stream = useEquityStream(5000, brokerId);
  return (
    <LiveEquityView
      {...stream}
      brokerId={brokerId}
      onApplyEquity={onApplyEquity}
    />
  );
}
