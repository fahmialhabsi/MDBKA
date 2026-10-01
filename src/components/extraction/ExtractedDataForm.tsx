import type { MarketData } from "../../types/analysis";
import {
  SUPPORTED_SYMBOLS,
  isSupportedSymbol,
} from "../../lib/instrumentConfig";

interface Props {
  market: MarketData;
  onChange: (data: MarketData) => void;
}

type NumericField = Exclude<keyof MarketData, "symbol" | "timeframe">;

const numericFields: Array<{
  key: NumericField;
  label: string;
}> = [
  { key: "bid", label: "Bid" },
  { key: "ask", label: "Ask" },
  { key: "close", label: "Close" },
  { key: "open", label: "Open" },
  { key: "high", label: "High" },
  { key: "low", label: "Low" },
  { key: "ma50", label: "MA50" },
  { key: "cci", label: "CCI(14)" },
  { key: "rsi", label: "RSI(14)" },
  { key: "macd", label: "MACD" },
  { key: "macdSignal", label: "MACD Signal" },
  { key: "atr", label: "ATR(14)" },
  { key: "support", label: "Support" },
  { key: "resistance", label: "Resistance" }
];

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400";

export default function ExtractedDataForm({
  market,
  onChange
}: Props) {
  // Opsi dropdown dari satu sumber (instrumentConfig). Jika OCR mendeteksi
  // simbol di luar daftar (mis. NAS100), tampilkan nilai aktif agar tidak
  // kosong, tetapi value tetap kode simbol.
  const symbolOptions: string[] = [...SUPPORTED_SYMBOLS];
  if (market.symbol && !isSupportedSymbol(market.symbol)) {
    symbolOptions.push(market.symbol);
  }

  function updateTimeframe(value: string) {
    onChange({ ...market, timeframe: value });
  }

  function updateSymbol(nextSymbol: string) {
    onChange({
      ...market,
      symbol: nextSymbol,
      support: 0,
      resistance: 0
    });
  }

  function updateNumber(key: NumericField, value: string) {
    onChange({
      ...market,
      [key]: Number(value)
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Simbol instrumen
        </span>

        <select
          value={market.symbol}
          onChange={(event) => updateSymbol(event.target.value)}
          className={inputClassName}
        >
          <option value="">Pilih instrumen</option>
          {symbolOptions.map((symbol) => (
            <option key={symbol} value={symbol}>
              {symbol}
            </option>
          ))}
        </select>

        <span className="block text-xs text-slate-500">
          Pilih simbol yang sama dengan chart dan file CSV MetaTrader.
        </span>
      </label>

      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Timeframe
        </span>

        <input
          value={market.timeframe}
          type="text"
          onChange={(event) => updateTimeframe(event.target.value)}
          className={inputClassName}
        />
      </label>

      {numericFields.map((field) => (
        <label key={field.key} className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {field.label}
          </span>

          <input
            value={String(market[field.key])}
            type="number"
            step="any"
            onChange={(event) =>
              updateNumber(field.key, event.target.value)
            }
            className={inputClassName}
          />
        </label>
      ))}
    </div>
  );
}
