import { useEffect, useState } from "react";

/** Jam nyata (ms) yang diperbarui berkala — untuk satpam berbasis jam dunia (O2b). */
export function useNowMs(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
