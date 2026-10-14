/**
 * Tahap 13 (13 Okt 2026) — saklar mode A: LIVE / DEMO. MURNI.
 * Keputusan Fahmi (audit rancangan): default LIVE; DEMO hanya untuk login
 * yang TERBUKTI demo oleh server broker (F3). K-4: jeda 3 rugi dan bukti F5
 * hanya menghitung trade akun yang sedang aktif (login terbukti), sehingga
 * rugi di akun demo tidak menjeda akun Live.
 *
 * Mode DEMO: jeda 3 rugi beruntun TIDAK mengunci (tetap ditampilkan sebagai
 * peringatan) dan entry dicatat "tidak setara Live" (J2). Penjaga lain
 * (biaya, risiko, berita, sesi, spesifikasi, bukti, korelasi, data) tetap.
 * Hasil analisa (App.tsx) TIDAK diubah (aturan mutlak 1).
 */
import type { ProvenKind } from "./accountIdentity";

export type TradingMode = "LIVE" | "DEMO";

export interface EffectiveMode {
  readonly requested: TradingMode;
  readonly mode: TradingMode;
  readonly alasan: string;
}

export function effectiveMode(requested: TradingMode, jenisAkun: ProvenKind): EffectiveMode {
  if (requested === "DEMO" && jenisAkun === "demo") {
    return { requested, mode: "DEMO", alasan: "Mode Demo: akun terbukti demo — jeda 3 rugi tidak mengunci, entry tidak setara Live" };
  }
  if (requested === "DEMO") {
    return { requested, mode: "LIVE", alasan: `Mode Demo ditolak: akun ${jenisAkun === "live" ? "LIVE" : "belum terbukti demo"} — tetap aturan Live` };
  }
  return { requested, mode: "LIVE", alasan: "Mode Live: semua penjaga berlaku" };
}

/** Jeda 3 rugi beruntun mengunci sinyal hanya di mode LIVE. */
export function pauseLocks(mode: TradingMode): boolean {
  return mode === "LIVE";
}

/** J2: entry di mode LIVE = setara Live (bukti boleh dipakai untuk Live). */
export function isLiveEquivalent(mode: TradingMode): boolean {
  return mode === "LIVE";
}

/**
 * K-4: akun History yang dihitung untuk jeda & bukti F5 = akun broker itu
 * dengan login aktif. Login aktif tidak diketahui (EA lama) → semua akun
 * broker (perilaku lama, fail-safe: lebih banyak rugi terhitung).
 */
export function accountsForActiveLogin<T extends { readonly broker: string | null; readonly login?: string }>(
  accounts: readonly T[],
  broker: string,
  activeLogin: string | null,
): T[] {
  const ofBroker = accounts.filter((a) => a.broker === broker);
  return activeLogin === null ? ofBroker : ofBroker.filter((a) => a.login === activeLogin);
}

export function parseTradingMode(raw: unknown): TradingMode | null {
  return raw === "LIVE" || raw === "DEMO" ? raw : null;
}
