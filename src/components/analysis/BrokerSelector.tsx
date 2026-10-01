import {
  BROKER_PROFILES,
  getBrokerProfile,
  isSupportedBrokerId,
} from "../../lib/brokerRegistry";
import type { BrokerId } from "../../types/broker";

export type BrokerSelectorProps = {
  value: BrokerId;
  onChange: (brokerId: BrokerId) => void;
  disabled?: boolean;
};

const FINEX_NOTE =
  "Mode Finex aktif. Gunakan data dari terminal Finex.";

const ORBITRADER_NOTE =
  "Mode OrbiTraderBerjangka aktif. Parameter instrumen harus diverifikasi dari terminal OrbiTraderBerjangka.";

/**
 * Tahap 3 — dropdown pilihan broker (konteks + tampilan saja).
 * Tidak mengubah parser, preset angka, maupun rumus analisis.
 * Opsi berasal dari registry (satu sumber kebenaran).
 */
export default function BrokerSelector({
  value,
  onChange,
  disabled = false,
}: BrokerSelectorProps) {
  const activeLabel = getBrokerProfile(value).label;
  const isOrbitrader = value === "orbitraderberjangka";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label
          htmlFor="broker-selector"
          className="text-xs font-semibold uppercase tracking-wide text-slate-400"
        >
          Broker / Trader aktif
        </label>

        <span
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
            isOrbitrader
              ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
              : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
          }`}
        >
          Broker aktif: {activeLabel}
        </span>
      </div>

      <select
        id="broker-selector"
        data-testid="broker-selector"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (isSupportedBrokerId(next)) {
            onChange(next);
          }
        }}
        className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
      >
        {BROKER_PROFILES.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.label}
          </option>
        ))}
      </select>

      <p
        className={`rounded-xl border p-3 text-xs leading-5 ${
          isOrbitrader
            ? "border-amber-400/20 bg-amber-400/5 text-amber-100"
            : "border-white/10 bg-slate-950/50 text-slate-400"
        }`}
      >
        {isOrbitrader ? ORBITRADER_NOTE : FINEX_NOTE}
      </p>
    </div>
  );
}
