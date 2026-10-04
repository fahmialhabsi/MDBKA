import { useEffect, useState } from "react";

/**
 * Tahap P2 — jam klien untuk label umur data (refresh tiap interval).
 * Dipakai panel live agar label "X mnt lalu" tetap segar tanpa menunggu
 * state lain berubah. Murni React (tanpa DOM API selain timer).
 */
export function useNow(intervalMs: number = 30000): number {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}
