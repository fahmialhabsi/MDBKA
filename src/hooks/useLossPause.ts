import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import {
  checkLossStreak,
  tradesForBroker,
  type LossPause,
  type StreakAccount,
} from "../lib/lossStreakGuard";
import type { BrokerId } from "../types/broker";

const REFRESH_MS = 5 * 60_000;

/**
 * Langkah F: status jeda broker aktif dari History MT5 (/api/evaluation).
 * `nowServer` = jam server MT5 terbaru (mis. timestamp quote live).
 */
export function useLossPause(
  brokerId: BrokerId,
  nowServer: string | null,
): LossPause {
  const [accounts, setAccounts] = useState<readonly StreakAccount[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/evaluation`);
        if (!res.ok) return;
        const body = (await res.json()) as { accounts?: StreakAccount[] };
        if (!cancelled) setAccounts(Array.isArray(body.accounts) ? body.accounts : []);
      } catch {
        // Tanpa data evaluasi: tidak ada jeda (bukan angka fiktif).
      }
    };
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  // Jam quote berubah tiap detik; dibulatkan ke menit agar tidak hitung ulang terus.
  const nowMinute = nowServer === null ? null : nowServer.slice(0, 16);
  return useMemo(
    () => checkLossStreak(tradesForBroker(accounts, brokerId), nowMinute),
    [accounts, brokerId, nowMinute],
  );
}
