import type { BrokerSettings } from "../../types/analysis";
import type { BrokerId } from "../../types/broker";
import { getInstrumentProfile } from "../../lib/instrumentConfig";
import { hasOtbPresetForSymbol } from "../../lib/brokerSymbols";
import {
  displayMarketNumber,
  parseMarketInput,
} from "../../lib/marketReset";

interface Props {
  broker: BrokerSettings;
  symbol: string;
  /** Konteks broker aktif (display only). Tidak mengubah rumus/nilai. */
  brokerId?: BrokerId;
  onChange: (data: BrokerSettings) => void;
  onApplyPreset?: () => void;
}

type FieldSource = "preset" | "account" | "strategy" | "optional";

const fields: Array<{
  key: keyof BrokerSettings;
  label: string;
  help: string;
  source: FieldSource;
}> = [
  {
    key: "equity",
    label: "Equity USD",
    help: "Saldo/equity akun saat ini.",
    source: "account"
  },
  {
    key: "riskPercent",
    label: "Risiko maksimum %",
    help: "Contoh: 10 berarti 10%.",
    source: "strategy"
  },
  {
    key: "minLot",
    label: "Minimum lot",
    help: "Contoh broker: 0.01.",
    source: "preset"
  },
  {
    key: "lotStep",
    label: "Lot step",
    help: "Contoh broker: 0.01.",
    source: "preset"
  },
  {
    key: "pointValue",
    label: "Nilai perubahan harga / 1 lot USD",
    help: "Wajib dicek dari spesifikasi broker (berbeda untuk forex vs indeks).",
    source: "preset"
  },
  {
    key: "contractSize",
    label: "Contract size",
    help: "Wajib dicek dari spesifikasi broker (forex umumnya 100000).",
    source: "preset"
  },
  {
    key: "commission",
    label: "Komisi USD / lot",
    help: "Isi 0 bila tidak ada.",
    source: "optional"
  },
  {
    key: "slippage",
    label: "Cadangan slippage point",
    help: "Tambahan konservatif.",
    source: "optional"
  },
  {
    key: "buffer",
    label: "Buffer struktur point",
    help: "Jarak di luar swing.",
    source: "preset"
  },
  {
    key: "atrMultiplier",
    label: "Pengali ATR",
    help: "Default 1.2.",
    source: "strategy"
  },
  {
    key: "targetRR",
    label: "Target RR",
    help: "Default 1.5.",
    source: "strategy"
  }
];

const SOURCE_LABELS: Record<FieldSource, string> = {
  preset: "Diisi otomatis dari preset • perlu verifikasi broker",
  account: "Wajib diisi dari akun (bukan dari screenshot)",
  strategy: "Default strategi",
  optional: "0 berarti tidak ada/belum dimasukkan",
};

export default function BrokerSettingsForm({
  broker,
  symbol,
  brokerId,
  onChange,
  onApplyPreset
}: Props) {
  function update(key: keyof BrokerSettings, value: string) {
    const parsed = parseMarketInput(value);

    // Ketikan sementara diabaikan; state tidak pernah NaN/undefined.
    if (parsed === null) return;

    onChange({
      ...broker,
      [key]: parsed
    });
  }

  const brokerNote = getInstrumentProfile(symbol).brokerNote;

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">
        {brokerNote}
      </p>

      {brokerId === "orbitraderberjangka" &&
        !hasOtbPresetForSymbol(symbol, brokerId) && (
          <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
            Parameter OrbiTraderBerjangka belum diverifikasi. Isi berdasarkan
            menu Specification pada MetaTrader OrbiTraderBerjangka.
          </p>
        )}

      {onApplyPreset && (
        <button
          type="button"
          onClick={onApplyPreset}
          className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
        >
          {`Gunakan preset ${symbol || "instrumen"}`}
        </button>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((field) => (
        <label key={field.key} className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {field.label}
          </span>

          <input
            type="number"
            step="any"
            value={displayMarketNumber(broker[field.key])}
            placeholder={`Masukkan ${field.label}`}
            onChange={(event) =>
              update(field.key, event.target.value)
            }
            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none focus:border-emerald-400"
          />

          <span className="block text-xs text-slate-500">
            {field.help}
          </span>

          <span className="block text-[11px] text-cyan-200/70">
            {SOURCE_LABELS[field.source]}
          </span>
        </label>
      ))}
      </div>
    </div>
  );
}


