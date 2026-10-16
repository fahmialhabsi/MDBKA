import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import type { BrokerId } from "../types/broker";

export interface StatusBroker {
  readonly broker: BrokerId;
  readonly lulus: boolean;
  readonly alasan: string | null;
  readonly catatan?: string;
}

/**
 * Audit A-3 (16 Okt 2026) — strip status kesehatan SEMUA broker sekaligus (GET /api/data-quality/semua),
 * diperbarui tiap 30 dtk. Dibangun setelah EA MDBKAMultiLive (quotes.csv Finex) lepas dari chart ±4 jam
 * tanpa terdeteksi siapa pun — equity.csv (EA lain) tetap jalan, harga live yang diam-diam beku.
 * null = server belum terjangkau (perilaku jujur: jangan tampilkan status palsu "aman").
 */
export function useDataQualitySemua(pollIntervalMs: number = 30_000): readonly StatusBroker[] | null {
  const [state, setState] = useState<readonly StatusBroker[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      fetch(`${API_BASE_URL}/api/data-quality/semua`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { broker?: StatusBroker[] } | null) => {
          if (!cancelled && Array.isArray(j?.broker)) setState(j.broker);
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pollIntervalMs]);
  return state;
}
