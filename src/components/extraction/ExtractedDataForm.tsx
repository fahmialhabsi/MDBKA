import type { MarketData } from "../../types/analysis";
import type { BrokerId } from "../../types/broker";
import {
  SUPPORTED_SYMBOLS,
} from "../../lib/instrumentConfig";
import { getAvailableSymbols } from "../../lib/brokerSymbols";
import {
  displayMarketNumber,
  parseMarketInput,
} from "../../lib/marketReset";
import { traceOcrStage } from "../../lib/debugTrace";

interface Props {
  market: MarketData;
  /** Konteks broker aktif (display only): menentukan daftar simbol. */
  brokerId?: BrokerId;
  onChange: (data: MarketData) => void;
  onSymbolChange?: (symbol: string) => void;
}

type NumericField = Exclude<keyof MarketData, "symbol" | "timeframe">;

const numericFields: Array<{
  key: NumericField;
  label: string;
  placeholder: string;
}> = [
  { key: "bid", label: "Bid", placeholder: "Masukkan Bid" },
  { key: "ask", label: "Ask", placeholder: "Masukkan Ask" },
  { key: "close", label: "Close", placeholder: "Masukkan Close" },
  { key: "open", label: "Open", placeholder: "Masukkan Open" },
  { key: "high", label: "High", placeholder: "Masukkan High" },
  { key: "low", label: "Low", placeholder: "Masukkan Low" },
  { key: "ma50", label: "MA50", placeholder: "Masukkan MA50" },
  { key: "cci", label: "CCI(14)", placeholder: "Masukkan CCI" },
  { key: "rsi", label: "RSI(14)", placeholder: "Masukkan RSI" },
  { key: "macd", label: "MACD", placeholder: "Masukkan MACD" },
  { key: "macdSignal", label: "MACD Signal", placeholder: "Masukkan MACD Signal" },
  { key: "atr", label: "ATR(14)", placeholder: "Masukkan ATR" },
  { key: "support", label: "Support", placeholder: "Masukkan Support" },
  { key: "resistance", label: "Resistance", placeholder: "Masukkan Resistance" }
];

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400";

export default function ExtractedDataForm({
  market,
  brokerId,
  onChange,
  onSymbolChange
}: Props) {
  // Opsi dropdown mengikuti broker aktif dari satu sumber per broker:
  // Finex = SUPPORTED_SYMBOLS (instrumentConfig, perilaku lama);
  // OTB = hanya simbol berpreset lengkap. Jika simbol aktif di luar
  // daftar (mis. NAS100 via OCR, atau simbol Finex saat baru pindah ke
  // OTB), tampilkan nilai aktif agar select tidak kosong, tetapi value
  // tetap kode simbol.
  const symbolOptions: string[] =
    brokerId === "orbitraderberjangka"
      ? [...getAvailableSymbols(brokerId)]
      : [...SUPPORTED_SYMBOLS];
  if (market.symbol && !symbolOptions.includes(market.symbol)) {
    symbolOptions.push(market.symbol);
  }

  function updateTimeframe(value: string) {
    onChange({ ...market, timeframe: value });
  }

  function updateSymbol(nextSymbol: string) {
    // Reset terpusat di App agar CSV, hasil, dan broker ikut menyesuaikan.
    if (onSymbolChange) {
      onSymbolChange(nextSymbol);
      return;
    }

    onChange({
      ...market,
      symbol: nextSymbol,
      support: 0,
      resistance: 0
    });
  }

  function updateNumber(key: NumericField, value: string) {
    const parsed = parseMarketInput(value);

    // Ketikan sementara ("-", ".") diabaikan agar pengguna bisa
    // melanjutkan mengetik; state tetap number yang valid.
    if (parsed === null) return;

    onChange({
      ...market,
      [key]: parsed
    });
  }

  traceOcrStage("form-render", {
    symbol: market.symbol,
    bid: market.bid,
    ask: market.ask,
    ma50: market.ma50,
    support: market.support,
    resistance: market.resistance,
    displayBid: displayMarketNumber(market.bid),
    displayAsk: displayMarketNumber(market.ask),
    displayMa50: displayMarketNumber(market.ma50),
    displaySupport: displayMarketNumber(market.support),
    displayResistance: displayMarketNumber(market.resistance),
  });

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
            value={displayMarketNumber(market[field.key])}
            type="number"
            step="any"
            placeholder={field.placeholder}
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
