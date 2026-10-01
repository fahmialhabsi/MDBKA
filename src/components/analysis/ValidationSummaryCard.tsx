import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert
} from "lucide-react";
import { getSpreadLabel } from "../../lib/instrumentConfig";

import type { ValidationSummary } from "../../calculations/inputValidator";
import type { ValidationViewState } from "../../lib/validationView";

interface Props {
  validation: ValidationSummary;
  symbol: string;
  viewState: ValidationViewState;
}

export default function ValidationSummaryCard({
  validation,
  symbol,
  viewState
}: Props) {
  const spreadLabel = getSpreadLabel(symbol);

  // Saat pasar kosong atau sebagian terisi, validasi internal tetap
  // berjalan tetapi tampilan diringkas agar tidak membanjiri pengguna
  // dengan belasan pesan individual. Rincian tetap ada di <details>.
  if (viewState.kind === "empty" || viewState.kind === "incomplete") {
    return (
      <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <div className="flex items-center gap-2">
          <CircleAlert className="text-amber-400" size={20} />

          <h3 className="font-bold text-white">
            Data belum lengkap
          </h3>
        </div>

        <p className="text-sm leading-6 text-slate-300">
          {viewState.kind === "empty"
            ? viewState.symbol
              ? `Masukkan atau impor data ${viewState.symbol} dari chart MT5. Field harga dan indikator masih kosong.`
              : "Pilih simbol sebelum melakukan analisa."
            : `Lengkapi data ${viewState.symbol} sebelum melakukan analisa.`}
        </p>

        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-400">
          <li>Bid dan Ask</li>
          <li>OHLC</li>
          <li>MA50</li>
          <li>ATR</li>
          <li>Support dan Resistance</li>
        </ul>

        {(validation.errors.length > 0 ||
          validation.warnings.length > 0) && (
          <details className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-300">
              Lihat rincian pemeriksaan
            </summary>

            <div className="mt-3 space-y-2">
              {validation.errors.map((error) => (
                <div
                  key={`${error.field}-${error.message}`}
                  className="flex gap-2 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200"
                >
                  <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                  <span>{error.message}</span>
                </div>
              ))}

              {validation.warnings.map((warning) => (
                <div
                  key={`${warning.field}-${warning.message}`}
                  className="flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100"
                >
                  <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                  <span>{warning.message}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <div className="flex items-center gap-2">
        {validation.valid ? (
          <CheckCircle2 className="text-emerald-400" size={20} />
        ) : (
          <CircleAlert className="text-red-400" size={20} />
        )}

        <h3 className="font-bold text-white">
          6. Pemeriksaan kelengkapan dan risiko
        </h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Spread"
          value={`${validation.spreadPips.toFixed(1)} ${spreadLabel}`}
        />

        <Metric
          label="Batas risiko"
          value={`$${validation.maxRiskUsd.toFixed(2)}`}
        />

        <Metric
          label="Risiko minimum lot"
          value={
            validation.minimumLotRiskUsd === null
              ? "-"
              : `$${validation.minimumLotRiskUsd.toFixed(2)}`
          }
        />
      </div>

      {validation.errors.map((error) => (
        <div
          key={`${error.field}-${error.message}`}
          className="flex gap-2 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200"
        >
          <AlertTriangle className="mt-0.5 shrink-0" size={16} />
          <span>{error.message}</span>
        </div>
      ))}

      {validation.warnings.map((warning) => (
        <div
          key={`${warning.field}-${warning.message}`}
          className="flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100"
        >
          <AlertTriangle className="mt-0.5 shrink-0" size={16} />
          <span>{warning.message}</span>
        </div>
      ))}

      {validation.valid &&
        validation.warnings.length === 0 && (
          <p className="text-sm text-emerald-300">
            Data wajib sudah lengkap dan siap diperiksa oleh mesin analisa.
          </p>
        )}
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
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-bold text-white">{value}</p>
    </div>
  );
}

