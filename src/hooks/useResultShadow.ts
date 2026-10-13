import { useEffect, useRef } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import { shadowDedupKey, summarizeShown } from "../lib/resultShadow";
import type { AnalysisResult } from "../types/analysis";
import type { BrokerId } from "../types/broker";

/**
 * S3 (13 Okt 2026) — kirim ringkasan Hasil analisa yang tampil ke server
 * untuk dinilai shadow (fondasi A8). Tidak mengembalikan apa pun dan tidak
 * merender apa pun. Hanya BELI/JUAL, sekali per simbol per candle H1.
 * Gagal kirim diabaikan diam-diam: tampilan tidak boleh terganggu.
 */
export function useResultShadow(
  brokerId: BrokerId,
  symbol: string,
  serverNow: string | null,
  shown: AnalysisResult | null,
): void {
  const sent = useRef<Set<string>>(new Set());
  useEffect(() => {
    try {
      if (shown === null || symbol === "" || serverNow === null) return;
      if (shown.decision !== "BELI" && shown.decision !== "JUAL") return;
      const key = shadowDedupKey(brokerId, symbol, serverNow);
      if (sent.current.has(key)) return;
      sent.current.add(key);
      const body = JSON.stringify({ broker: brokerId, symbol, serverNow, shown: summarizeShown(shown) });
      fetch(`${API_BASE_URL}/api/keputusan/shadow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => undefined);
    } catch {
      // Shadow gagal → abaikan; Hasil analisa tetap utuh.
    }
  }, [brokerId, symbol, serverNow, shown]);
}
