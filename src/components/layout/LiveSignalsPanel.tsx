import { TrendingDown, TrendingUp } from "lucide-react";
import { useSignalPrediction, type Candle } from "../../hooks/useSignalPrediction";
import type { BrokerId } from "../../types/broker";

/**
 * T4 - Live Signals Panel v2 (integrated with T2+T3)
 * Display real signal predictions (BELI/JUAL/TUNGGU) dari S&R + trend analysis
 *
 * Props:
 * - symbols: array of trading symbols ke track
 * - lastCandles: Map<symbol, Candle> (last completed H1 candle per symbol)
 */

interface LiveSignalsPanelProps {
  readonly symbols: readonly string[];
  readonly lastCandles: ReadonlyMap<string, Candle>;
  readonly brokerId: BrokerId;
}

export function LiveSignalsPanel({
  symbols,
  lastCandles,
  brokerId,
}: LiveSignalsPanelProps) {
  const { predictions, loading, error } = useSignalPrediction(
    symbols,
    lastCandles,
    brokerId,
  );

  if (loading) {
    return (
      <div className="text-xs text-slate-400">
        Loading predictions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-red-400">
        Error: {error}
      </div>
    );
  }

  if (predictions.size === 0) {
    return (
      <div className="text-xs text-slate-400">
        No predictions
      </div>
    );
  }

  // Sort predictions by symbol
  const sortedPredictions = Array.from(predictions.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );

  return (
    <div className="flex items-center gap-3 overflow-x-auto">
      {sortedPredictions.map((prediction) => {
        const { signal, confidence, symbol, srLevels } = prediction;

        // Signal color
        const signalColor =
          signal === "BELI"
            ? "text-green-400"
            : signal === "JUAL"
              ? "text-red-400"
              : "text-amber-400";

        // Confidence indicator: bar width based on confidence
        const confidenceWidth = `${confidence}%`;

        return (
          <div
            key={symbol}
            className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs whitespace-nowrap"
          >
            <div className="font-semibold text-white">
              {symbol}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5 text-slate-300">
                <div>B: {srLevels.mid.toFixed(5)}</div>
                <div>PP: {srLevels.pp.toFixed(5)}</div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className={`flex items-center gap-1 font-bold ${signalColor}`}>
                  <div className="text-[10px]">
                    {signal === "BELI" ? (
                      <TrendingUp size={12} />
                    ) : signal === "JUAL" ? (
                      <TrendingDown size={12} />
                    ) : (
                      <div>→</div>
                    )}
                  </div>
                  <div>{signal}</div>
                </div>
                {/* Confidence bar */}
                <div className="h-1 w-16 rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all ${
                      signal === "BELI"
                        ? "bg-green-400"
                        : signal === "JUAL"
                          ? "bg-red-400"
                          : "bg-amber-400"
                    }`}
                    style={{ width: confidenceWidth }}
                  />
                </div>
                <div className="text-[10px] text-slate-400">
                  {confidence}%
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
