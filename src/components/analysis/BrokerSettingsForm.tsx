import type { BrokerSettings } from "../../types/analysis";
import { getInstrumentProfile } from "../../lib/instrumentConfig";

interface Props {
  broker: BrokerSettings;
  symbol: string;
  onChange: (data: BrokerSettings) => void;
}

const fields: Array<{
  key: keyof BrokerSettings;
  label: string;
  help: string;
}> = [
  {
    key: "equity",
    label: "Equity USD",
    help: "Saldo/equity akun saat ini."
  },
  {
    key: "riskPercent",
    label: "Risiko maksimum %",
    help: "Contoh: 10 berarti 10%."
  },
  {
    key: "minLot",
    label: "Minimum lot",
    help: "Contoh broker: 0.01."
  },
  {
    key: "lotStep",
    label: "Lot step",
    help: "Contoh broker: 0.01."
  },
  {
    key: "pointValue",
    label: "Nilai perubahan harga / 1 lot USD",
    help: "Wajib dicek dari spesifikasi broker (berbeda untuk forex vs indeks)."
  },
  {
    key: "contractSize",
    label: "Contract size",
    help: "Wajib dicek dari spesifikasi broker (forex umumnya 100000)."
  },
  {
    key: "commission",
    label: "Komisi USD / lot",
    help: "Isi 0 bila tidak ada."
  },
  {
    key: "slippage",
    label: "Cadangan slippage point",
    help: "Tambahan konservatif."
  },
  {
    key: "buffer",
    label: "Buffer struktur point",
    help: "Jarak di luar swing."
  },
  {
    key: "atrMultiplier",
    label: "Pengali ATR",
    help: "Default 1.2."
  },
  {
    key: "targetRR",
    label: "Target RR",
    help: "Default 1.5."
  }
];

export default function BrokerSettingsForm({
  broker,
  symbol,
  onChange
}: Props) {
  function update(key: keyof BrokerSettings, value: string) {
    const numeric = Number(value);

    onChange({
      ...broker,
      [key]: Number.isFinite(numeric) ? numeric : NaN
    });
  }

  const brokerNote = getInstrumentProfile(symbol).brokerNote;

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">
        {brokerNote}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((field) => (
        <label key={field.key} className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {field.label}
          </span>

          <input
            type="number"
            step="any"
            value={broker[field.key]}
            onChange={(event) =>
              update(field.key, event.target.value)
            }
            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none focus:border-emerald-400"
          />

          <span className="block text-xs text-slate-500">
            {field.help}
          </span>
        </label>
      ))}
      </div>
    </div>
  );
}


