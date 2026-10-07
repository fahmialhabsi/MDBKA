import { useEffect, useState } from "react";
import { calculateSRLevels, type SRLevels } from "../calculations/srCalculator";
import { analyzeSignal, type SignalResult } from "../calculations/signalAnalyzer";
import { useLiveQuotes } from "./useLiveQuotes";

/**
 * T4 - useSignalPrediction Hook
 * Combine live quotes (T1) + S&R calc (T2) + signal analysis (T3)
 *
 * Input: symbols + lastCandles (H1 candle terakhir per symbol)
 * Output: Map<symbol, SignalResult> dengan BELI/JUAL/TUNGGU predictions
 */

export interface Candle {
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly timestamp?: string;
}

export interface SignalPredictionState {
  readonly predictions: Map<string, SignalResult>;
  readonly srLevels: Map<string, SRLevels>;
  readonly loading: boolean;
  readonly error: string | null;
  readonly lastUpdated: string | null;
}

export function useSignalPrediction(
  symbols: readonly string[] = [],
  lastCandles: Map<string, Candle> = new Map(),
): SignalPredictionState {
  const [state, setState] = useState<SignalPredictionState>({
    predictions: new Map(),
    srLevels: new Map(),
    loading: symbols.length > 0,
    error: null,
    lastUpdated: null,
  });

  const { quotes: liveQuotes, loading: quotesLoading, error: quotesError } = useLiveQuotes(symbols);

  useEffect(() => {
    if (symbols.length === 0) {
      setState({
        predictions: new Map(),
        srLevels: new Map(),
        loading: false,
        error: null,
        lastUpdated: null,
      });
      return;
    }

    // Tunggu sampai ada quotes
    if (quotesLoading || liveQuotes.size === 0) {
      setState((prev) => ({ ...prev, loading: true }));
      return;
    }

    try {
      const newPredictions = new Map<string, SignalResult>();
      const newSRLevels = new Map<string, SRLevels>();

      for (const symbol of symbols) {
        const candle = lastCandles.get(symbol);
        const quoteList = Array.from(liveQuotes.values()).filter(
          (q) => q.symbol === symbol,
        );

        // Skip jika data tidak lengkap
        if (!candle || quoteList.length === 0) {
          continue;
        }

        try {
          // T2: Calculate S&R
          const sr = calculateSRLevels(symbol, candle, quoteList);
          newSRLevels.set(symbol, sr);

          // T3: Analyze signal
          const signal = analyzeSignal(sr);
          newPredictions.set(symbol, signal);
        } catch (e) {
          console.warn(`Error analyzing signal for ${symbol}:`, e);
        }
      }

      setState({
        predictions: newPredictions,
        srLevels: newSRLevels,
        loading: false,
        error: quotesError,
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: String(e),
        loading: false,
      }));
    }
  }, [symbols, liveQuotes, lastCandles, quotesLoading, quotesError]);

  return state;
}
