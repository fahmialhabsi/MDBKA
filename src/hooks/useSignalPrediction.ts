import { useMemo } from "react";
import { calculateSRLevels, type SRLevels } from "../calculations/srCalculator";
import { analyzeSignal, type SignalResult } from "../calculations/signalAnalyzer";
import type { BrokerId } from "../types/broker";
import { useLiveQuotes } from "./useLiveQuotes";

/**
 * T4 - useSignalPrediction Hook
 * Combine live quotes (T1) + S&R calc (T2) + signal analysis (T3)
 *
 * Input: symbols + lastCandles (H1 candle terakhir per symbol) + broker.
 * Output: Map<symbol, SignalResult> dengan BELI/JUAL/TUNGGU predictions.
 *
 * Prediksi diturunkan murni (useMemo) dari quote + candle — tanpa state
 * tambahan, sehingga tidak ada status "loading" yang macet saat quote
 * kosong. Simbol tanpa candle valid (H/L/C > 0) atau tanpa quote dilewati
 * (fail-closed: tidak ada prediksi dari data nol).
 *
 * Caller WAJIB memberi `symbols` & `lastCandles` dengan referensi stabil
 * (useMemo) agar perhitungan tidak diulang di setiap render.
 */

export interface Candle {
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly timestamp?: string;
}

export interface SignalPredictionState {
  readonly predictions: ReadonlyMap<string, SignalResult>;
  readonly srLevels: ReadonlyMap<string, SRLevels>;
  readonly loading: boolean;
  readonly error: string | null;
  /** Timestamp quote terbaru yang dipakai (null bila belum ada prediksi). */
  readonly lastUpdated: string | null;
}

function isValidCandle(candle: Candle | undefined): candle is Candle {
  return (
    candle !== undefined &&
    candle.high > 0 &&
    candle.low > 0 &&
    candle.close > 0 &&
    candle.high >= candle.low
  );
}

export function useSignalPrediction(
  symbols: readonly string[],
  lastCandles: ReadonlyMap<string, Candle>,
  brokerId?: BrokerId,
): SignalPredictionState {
  const {
    quotes: liveQuotes,
    loading: quotesLoading,
    error: quotesError,
  } = useLiveQuotes(symbols, brokerId);

  return useMemo(() => {
    const predictions = new Map<string, SignalResult>();
    const srLevels = new Map<string, SRLevels>();
    let lastUpdated: string | null = null;

    for (const symbol of symbols) {
      const candle = lastCandles.get(symbol);
      const quote = liveQuotes.get(symbol);
      if (!isValidCandle(candle) || quote === undefined) continue;

      try {
        const sr = calculateSRLevels(symbol, candle, [quote]); // T2
        srLevels.set(symbol, sr);
        predictions.set(symbol, analyzeSignal(sr)); // T3
        if (lastUpdated === null || quote.timestamp > lastUpdated) {
          lastUpdated = quote.timestamp;
        }
      } catch (e) {
        console.warn(`Error analyzing signal for ${symbol}:`, e);
      }
    }

    return {
      predictions,
      srLevels,
      loading: quotesLoading,
      error: quotesError,
      lastUpdated,
    };
  }, [symbols, lastCandles, liveQuotes, quotesLoading, quotesError]);
}
