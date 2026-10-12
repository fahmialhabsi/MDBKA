import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import { mergeGroupStats, type EvalAccount, type EvalTradeStats } from "../lib/evaluationView";
import type { BrokerId } from "../types/broker";

const REFRESH_MS = 5 * 60_000;

/**
 * F4/F5 (12 Okt 2026): bukti History MT5 kelompok "LOLOS" broker aktif
 * (semua akun broker itu, demo + live) dari /api/evaluation. Tanpa data → null
 * (satpam bukti tidak menahan; label "belum terbukti").
 */
export function useLolosProof(brokerId: BrokerId): EvalTradeStats | null {
  const [accounts, setAccounts] = useState<readonly EvalAccount[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/evaluation`);
        if (!res.ok) return;
        const body = (await res.json()) as { accounts?: EvalAccount[] };
        if (!cancelled) setAccounts(Array.isArray(body.accounts) ? body.accounts : []);
      } catch {
        // Tanpa data evaluasi: tidak menahan (bukan angka fiktif).
      }
    };
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  return useMemo(() => mergeGroupStats(accounts, brokerId, "LOLOS"), [accounts, brokerId]);
}
