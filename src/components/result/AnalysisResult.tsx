import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import type { AnalysisResult as ResultType, MarketData } from "../../types/analysis";
import type { ScaleIssue } from "../../calculations/scaleValidator";

interface Props {
  result: ResultType | null;
  market: MarketData;
  scaleIssues: ScaleIssue[];
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

export default function AnalysisResult({ result, market, scaleIssues }: Props) {
  if (scaleIssues.length > 0) {
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


