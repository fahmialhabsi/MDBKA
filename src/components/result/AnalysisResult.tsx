import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import type { AnalysisResult as ResultType, MarketData } from "../../types/analysis";
import type { BrokerId } from "../../types/broker";
import type { ValidationViewState } from "../../lib/validationView";
import { attachSwapToResult } from "../../calculations/attachSwapToResult";
import { getTripleSwapLabel } from "../../services/dateService";
import type { ExchangeRates } from "../../services/fxRateService";
import { LiveEquity } from "./LiveEquity";

interface Props {
  result: ResultType | null;
  market: MarketData;
  viewState: ValidationViewState;
  blockedReasons?: string[] | null;
  /** Konteks broker (display only): mengaktifkan blok swap OTB. */
  brokerId?: BrokerId;
  /** Tahap 5D-STEP2: ECB rate cache dari App (display USD info-only). */
  fxRates?: ExchangeRates | null;
}

function money(value: number | null) {
  return value === null
    ? "-"
    : `$${value.toFixed(2)}`;
}

function number(value: number | null, digits = 2) {
  return value === null
    ? "-"
    : value.toFixed(digits);
}

const REQUIRED_SUMMARY = [
  "Bid dan Ask",
  "OHLC",
  "MA50",
  "ATR",
  "Support dan Resistance"
];

export default function AnalysisResult({ result, market, viewState, blockedReasons, brokerId, fxRates }: Props) {
  // Tahap 5C Step 2: holding + memo swap (info-only, post-decision).
  // Tahap 5D-STEP2: teruskan currentPrice (untuk % calc) + fxRates
  // (untuk display USD). Hooks di atas semua early return.
  // Tanpa hasil/lot → null.
  const [holdingDays, setHoldingDays] = useState(0);

  const currentPrice = market.bid > 0 ? market.bid : market.close;

  // Tahap 5E-STEP1: tanggal mulai holding = hari ini (auto-detect Rabu x3).
  // Di-memo agar stabil selama session render (tidak re-create tiap render).
  const holdingStartDate = useMemo(() => new Date(), []);

  const attached = useMemo(
    () =>
      result === null
        ? null
        : attachSwapToResult(result, {
            symbol: market.symbol,
            brokerId,
            direction: result.decision,
            lot: result.suggestedLot ?? result.theoreticalLot,
            holdingDays,
            currentPrice,
            fxRates: fxRates ?? null,
            startDate: holdingStartDate,
          }),
    [result, market.symbol, brokerId, holdingDays, currentPrice, fxRates, holdingStartDate],
  );

  const showSwapBlock =
    brokerId === "orbitraderberjangka" && result !== null;

  // Umpan balik klik Analisa yang eksplisit: selalu diutamakan bila ada.
  if (blockedReasons && blockedReasons.length > 0) {
    return (
      <div className="space-y-4 rounded-3xl border border-amber-400/30 bg-amber-400/5 p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
            Analisa ditahan
          </p>
          <h2 className="mt-1 text-2xl font-black text-amber-100">
            Analisa belum dapat dilakukan
          </h2>
          <p className="mt-2 text-sm text-amber-100/80">
            Lengkapi hal berikut lalu klik Analisa Sekarang lagi.
          </p>
        </div>

        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-100">
          {blockedReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    );
  }

  // Prioritas tampilan: data kosong bukan mismatch skala.
  if (viewState.kind === "empty") {
    return (
      <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
            Menunggu data
          </p>
          <h2 className="mt-1 text-2xl font-black text-white">
            Data belum lengkap
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {viewState.symbol
              ? `Masukkan atau impor data ${viewState.symbol} dari chart MT5. Field harga dan indikator masih kosong.`
              : "Pilih simbol sebelum melakukan analisa."}
          </p>
        </div>

        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-400">
          {REQUIRED_SUMMARY.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (viewState.kind === "incomplete") {
    return (
      <div className="space-y-4 rounded-3xl border border-amber-400/30 bg-amber-400/5 p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
            Data perlu dilengkapi
          </p>
          <h2 className="mt-1 text-2xl font-black text-amber-100">
            Data belum lengkap
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-100/80">
            {`Lengkapi data ${viewState.symbol} sebelum melakukan analisa.`}
          </p>
        </div>

        <details className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-300">
            Lihat field yang belum lengkap
          </summary>

          <div className="mt-3 space-y-2">
            {viewState.issues.map((issue) => (
              <div
                key={`${issue.field}-${issue.message}`}
                className="rounded-xl border border-amber-300/20 bg-slate-950/40 p-3 text-sm text-amber-100"
              >
                <strong>{issue.field}:</strong> {issue.message}
              </div>
            ))}
          </div>
        </details>
      </div>
    );
  }

  if (viewState.kind === "mismatch") {
    const scaleIssues = viewState.issues;

    return (
      <div className="space-y-4 rounded-3xl border border-red-400/30 bg-red-400/10 p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">
            Data perlu diperiksa
          </p>
          <h2 className="mt-1 text-2xl font-black text-red-100">
            Mismatch skala harga terdeteksi
          </h2>
          <p className="mt-2 text-sm text-red-100/80">
            Simbol {market.symbol} memiliki skala harga yang tidak cocok dengan
            satu atau lebih nilai pada form.
          </p>
        </div>

        <div className="space-y-2">
          {scaleIssues.map((issue) => (
            <div
              key={`${issue.field}-${issue.message}`}
              className="rounded-xl border border-red-300/20 bg-slate-950/40 p-3 text-sm text-red-100"
            >
              <strong>{issue.field}:</strong> {issue.message}
            </div>
          ))}
        </div>

        <p className="text-sm text-amber-100">
          Perbaiki data pasar terlebih dahulu. Hasil BELI/JUAL/TUNGGU belum
          boleh dianggap valid.
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <Clock3 className="mx-auto mb-3 text-slate-500" size={34} />
        <h3 className="font-semibold text-white">
          Belum ada hasil analisa
        </h3>
        <p className="mt-2 text-sm text-slate-400">
          Lengkapi data lalu klik tombol Analisa Sekarang.
        </p>
      </div>
    );
  }

  const decisionStyle =
    result.decision === "BELI"
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
      : result.decision === "JUAL"
        ? "border-red-400/40 bg-red-400/10 text-red-300"
        : "border-amber-400/40 bg-amber-400/10 text-amber-300";

  const Icon =
    result.decision === "BELI"
      ? TrendingUp
      : result.decision === "JUAL"
        ? TrendingDown
        : Clock3;

  return (
    <div className="space-y-5">
      <div
        className={[
          "rounded-3xl border p-6",
          decisionStyle
        ].join(" ")}
      >
        <div className="flex items-center gap-4">
          <Icon size={42} />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em]">
              Hasil analisa
            </p>
            <h2 className="mt-1 text-4xl font-black">
              {result.decision}
            </h2>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs uppercase tracking-wide opacity-70">
              Skor
            </p>
            <p className="text-3xl font-black">
              {result.score}/5
            </p>
          </div>
        </div>

        <p className="mt-5 max-w-3xl text-sm leading-6">
          {result.explanation}
        </p>
      </div>

      {result.decision !== "TUNGGU" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Entry
            </p>
            <p className="mt-1 text-2xl font-bold text-white">
              {number(result.entry, 5)}
            </p>
          </div>

          <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-5">
            <p className="text-xs uppercase tracking-wide text-red-300">
              Stop Loss
            </p>
            <p className="mt-1 text-2xl font-bold text-red-200">
              {number(result.stopLoss, 5)}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
            <p className="text-xs uppercase tracking-wide text-emerald-300">
              Take Profit
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-200">
              {number(result.takeProfit, 5)}
            </p>
          </div>

          <div className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5">
            <p className="text-xs uppercase tracking-wide text-sky-300">
              RR
            </p>
            <p className="mt-1 text-2xl font-bold text-sky-200">
              {number(
                result.targetDistance !== null &&
                  result.riskDistance !== null
                  ? result.targetDistance /
                      result.riskDistance
                  : null,
                2
              )}
              :1
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Risiko maksimum" value={money(result.maxRiskUsd)} />
        <Metric label="Risiko lot minimum" value={money(result.riskAtMinLot)} />
        <Metric label="Lot teoritis" value={number(result.theoreticalLot, 4)} />
        <Metric label="Lot disarankan" value={number(result.suggestedLot, 4)} />
      </div>

      {/* Tahap 5E-STEP2: live equity MT5 (info-only, tak mengubah keputusan). */}
      <LiveEquity />

      {showSwapBlock && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Holding (hari)
            </span>

            <input
              data-testid="swap-holding-input"
              type="number"
              min={0}
              max={10}
              step={1}
              value={holdingDays}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                setHoldingDays(
                  Number.isFinite(parsed)
                    ? Math.min(10, Math.max(0, Math.floor(parsed)))
                    : 0,
                );
              }}
              className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none focus:border-emerald-400"
            />

            <span className="block text-xs text-slate-500">
              0 = intraday (tanpa swap). Maksimal 10 hari.
            </span>

            <span className="block text-xs text-gray-400">
              {getTripleSwapLabel(holdingDays, holdingStartDate)}
            </span>
          </label>

          {attached !== null &&
            attached.swapDetail !== null &&
            holdingDays > 0 && (
              <p
                data-testid="swap-memo"
                className="mt-3 text-sm text-slate-400"
              >
                Swap {attached.swapDetail.holdingDays} hari:{" "}
                {attached.swapDetail.swapCost.toFixed(2)}{" "}
                {attached.swapDetail.profitCurrency}/lot (profit{" "}
                {attached.swapDetail.profitCurrency})
                {attached.swapDetail.swapCostInUSD !== null && (
                  <>
                    {" "}≈ {attached.swapDetail.swapCostInUSD.toFixed(2)}{" "}
                    USD (dari{" "}
                    {attached.swapDetail.swapCostInContractBaseCurrency.toFixed(2)}{" "}
                    {attached.swapDetail.contractBaseCurrency} @{" "}
                    {attached.swapDetail.fxRate !== null &&
                    attached.swapDetail.fxRate !== undefined
                      ? attached.swapDetail.fxRate.toFixed(4)
                      : "-"}
                    )
                  </>
                )}
              </p>
            )}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-start gap-3">
          {result.riskStatus === "MEMENUHI batas risiko" ? (
            <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={20} />
          ) : (
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-400" size={20} />
          )}

          <div>
            <p className="font-semibold text-white">
              {result.riskStatus}
            </p>

            <div className="mt-3 space-y-2">
              {result.factors.map((factor) => (
                <p key={factor} className="text-sm text-slate-300">
                  - {factor}
                </p>
              ))}

              {result.warnings.map((warning) => (
                <p key={warning} className="text-sm text-amber-200">
                  PERINGATAN: {warning}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold text-white">
        {value}
      </p>
    </div>
  );
}


