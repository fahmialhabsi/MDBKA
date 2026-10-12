import { MAX_COST_SHARE_OF_RISK } from "../calculations/decisionEngine";
import type { AnalysisResult } from "../types/analysis";
import { proofNote, type EvalTradeStats } from "./evaluationView";

/** Porsi 0..1 jadi persen satu desimal gaya Indonesia: 0.104 → "10,4". */
export function formatSharePercent(share: number): string {
  return (Math.round(share * 1000) / 10).toFixed(1).replace(".", ",");
}

/**
 * Alasan singkat keputusan Mode Aman untuk panel header (murni, teruji).
 * Selaras dengan BeginnerGuide di hasil analisa.
 */
export function signalReason(
  result: AnalysisResult,
  /** F4: bukti History MT5 kelompok LOLOS broker ini (absen = teks lama "belum terbukti"). */
  proof?: EvalTradeStats | null,
): string {
  if (result.heldBy === "biaya") {
    const share =
      typeof result.costShareOfRisk === "number"
        ? formatSharePercent(result.costShareOfRisk)
        : "-";
    return `Ditahan: biaya ${share}% (maks ${Math.round(MAX_COST_SHARE_OF_RISK * 100)}%)`;
  }
  if (result.heldBy === "risiko") return result.heldReason ?? "Ditahan: risiko lot minimum";
  if (result.heldBy === "korelasi") return result.heldReason ?? "Ditahan: taruhan ganda";
  if (result.heldBy === "jeda") return result.heldReason ?? "Jeda: 3 kali rugi berturut-turut";
  if (result.heldBy === "berita") return result.heldReason ?? "Ditahan: dekat berita Tinggi";
  if (result.heldBy === "spek") return result.heldReason ?? "Ditahan: spesifikasi simbol berubah";
  if (result.heldBy === "buka") return result.heldReason ?? "Ditahan: dekat pembukaan bursa";
  if (result.heldBy === "bukti") return result.heldReason ?? "Ditahan: terbukti rugi di History MT5";
  if (result.decision === "TUNGGU") return "Skor belum kompak";
  return result.riskStatus === "MEMENUHI batas risiko"
    ? proof === undefined
      ? "Lolos biaya & risiko · belum terbukti"
      : `Lolos biaya & risiko · ${proofNote(proof)}`
    : "Risiko belum memenuhi";
}
