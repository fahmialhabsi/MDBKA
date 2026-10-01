import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert
} from "lucide-react";
import { getSpreadLabel } from "../../lib/instrumentConfig";

import type { ValidationSummary } from "../../calculations/inputValidator";

interface Props {
  validation: ValidationSummary;
  symbol: string;
}

export default function ValidationSummaryCard({
  validation,
  symbol
}: Props) {
  const spreadLabel = getSpreadLabel(symbol);

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

