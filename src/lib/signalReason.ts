import { MAX_COST_SHARE_OF_RISK } from "../calculations/decisionEngine";
import type { AnalysisResult } from "../types/analysis";

/**
 * Alasan singkat keputusan Mode Aman untuk panel header (murni, teruji).
 * Selaras dengan BeginnerGuide di hasil analisa.
 */
export function signalReason(result: AnalysisResult): string {
  if (result.heldBy === "biaya") {
    const share =
      typeof result.costShareOfRisk === "number"
        ? Math.round(result.costShareOfRisk * 100)
        : null;
    return `Ditahan: biaya ${share ?? "-"}% (maks ${Math.round(MAX_COST_SHARE_OF_RISK * 100)}%)`;
  }
  if (result.heldBy === "risiko") return "Ditahan: risiko lot minimum";
  if (result.decision === "TUNGGU") return "Skor belum kompak";
  return result.riskStatus === "MEMENUHI batas risiko"
    ? "Lolos Mode Aman"
    : "Risiko belum memenuhi";
}
