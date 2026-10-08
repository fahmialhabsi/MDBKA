import { MAX_COST_SHARE_OF_RISK } from "../calculations/decisionEngine";
import type { AnalysisResult } from "../types/analysis";

/** Porsi 0..1 jadi persen satu desimal gaya Indonesia: 0.104 → "10,4". */
export function formatSharePercent(share: number): string {
  return (Math.round(share * 1000) / 10).toFixed(1).replace(".", ",");
}

/**
 * Alasan singkat keputusan Mode Aman untuk panel header (murni, teruji).
 * Selaras dengan BeginnerGuide di hasil analisa.
 */
export function signalReason(result: AnalysisResult): string {
  if (result.heldBy === "biaya") {
    const share =
      typeof result.costShareOfRisk === "number"
        ? formatSharePercent(result.costShareOfRisk)
        : "-";
    return `Ditahan: biaya ${share}% (maks ${Math.round(MAX_COST_SHARE_OF_RISK * 100)}%)`;
  }
  if (result.heldBy === "risiko") return "Ditahan: risiko lot minimum";
  if (result.heldBy === "korelasi") return result.heldReason ?? "Ditahan: taruhan ganda";
  if (result.decision === "TUNGGU") return "Skor belum kompak";
  return result.riskStatus === "MEMENUHI batas risiko"
    ? "Lolos biaya & risiko · belum terbukti"
    : "Risiko belum memenuhi";
}
