import { Pause, TrendingDown, TrendingUp } from "lucide-react";
import type { AnalysisResult } from "../../types/analysis";
import { signalReason } from "../../lib/signalReason";

/**
 * Ringkasan keputusan di header (Mode Aman, 8 Okt 2026).
 *
 * Satu sumber kebenaran: menampilkan hasil analyzeMarket yang sama dengan
 * panel "Hasil analisa" (keputusan, skor, alasan ditahan), bukan hitungan
 * terpisah. Versi lama (T2/T3) selalu "TUNGGU 60%" karena trend dari satu
 * quote selalu 0 — lihat jurnal 7 Okt 2026.
 */
interface LiveSignalsPanelProps {
  readonly symbol: string;
  readonly result: AnalysisResult;
  readonly bid: number | null;
}

export function LiveSignalsPanel({ symbol, result, bid }: LiveSignalsPanelProps) {
  const { decision, score } = result;
  const color =
    decision === "BELI"
      ? "text-green-400"
      : decision === "JUAL"
        ? "text-red-400"
        : "text-amber-400";

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs whitespace-nowrap">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-white">{symbol}</span>
        <span className={`flex items-center gap-1 font-bold ${color}`}>
          {decision === "BELI" ? (
            <TrendingUp size={12} />
          ) : decision === "JUAL" ? (
            <TrendingDown size={12} />
          ) : (
            <Pause size={12} />
          )}
          {decision}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-slate-300">
        <span>B: {bid === null ? "-" : bid}</span>
        <span>Skor {score}/5</span>
      </div>
      <div className="text-[10px] text-slate-400">{signalReason(result)}</div>
    </div>
  );
}
