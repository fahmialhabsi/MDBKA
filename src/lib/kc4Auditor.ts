/**
 * KC-4 Auditor Trade (menyusul, 16 Okt 2026) — sebab rugi per trade UJIAN: tolak pola bila lebih dari
 * separuh trade rugi "melawan sejak masuk" (MFE < AUDIT_RULES.againstMfeR — SAMA dengan ambang yang
 * sudah dipakai sistem lama T-AUDIT/Tim 4 Pembelajaran Rugi, src/lib/tradeAudit.ts, bukan angka baru)
 * atau lebih dari separuh keluar karena batas waktu.
 * Catatan jujur: bahan "Peringatan Badai jadi pemicu arah" (kc3Penambang.ts) saat ini TIDAK memakai
 * batas waktu sama sekali — keluarKarenaWaktu akan selalu 0% untuk bahan ini; pengecekan tetap
 * disiapkan di sini untuk bahan masa depan yang memakai timeStopHours.
 * Gerbang TERPISAH dari K1-K7 (kc4Kepala.ts) — tidak menambah/mengubah K1-K7 yang sudah ditetapkan
 * Fahmi untuk riset strategi versi MDBKA; lulus K1-K7 TIDAK otomatis lulus Auditor Trade.
 * MURNI.
 */
import { AUDIT_RULES } from "./tradeAudit";
import type { BadaiTrade } from "./kc3Penambang";

/** Lebih dari separuh trade = ditolak (roadmap §7: "tolak pola yang >50% ..."). */
export const AUDITOR_AMBANG_PERSEN = 0.5;

export interface HasilAuditor {
  readonly n: number;
  readonly melawanSejakMasuk: number;
  readonly keluarKarenaWaktu: number;
  readonly persenMelawan: number | null;
  readonly persenWaktu: number | null;
  readonly tolak: boolean;
  readonly sebab: readonly string[];
}

/** Sebab rugi per trade UJIAN; tolak bila >50% melawan sejak masuk atau >50% keluar karena waktu. */
export function auditTrade(trades: readonly BadaiTrade[]): HasilAuditor {
  const n = trades.length;
  const rugi = trades.filter((t) => t.rMultiple < 0);
  const melawanSejakMasuk = rugi.filter((t) => t.mfeR < AUDIT_RULES.againstMfeR).length;
  const keluarKarenaWaktu = trades.filter((t) => t.outcome === "WAKTU").length;
  const persenMelawan = n === 0 ? null : melawanSejakMasuk / n;
  const persenWaktu = n === 0 ? null : keluarKarenaWaktu / n;

  const sebab: string[] = [];
  if (persenMelawan !== null && persenMelawan > AUDITOR_AMBANG_PERSEN) {
    sebab.push(`${Math.round(persenMelawan * 100)}% trade melawan sejak masuk (MFE < ${AUDIT_RULES.againstMfeR}R sebelum kena SL)`);
  }
  if (persenWaktu !== null && persenWaktu > AUDITOR_AMBANG_PERSEN) {
    sebab.push(`${Math.round(persenWaktu * 100)}% trade keluar karena batas waktu`);
  }

  return {
    n,
    melawanSejakMasuk,
    keluarKarenaWaktu,
    persenMelawan: persenMelawan === null ? null : Math.round(persenMelawan * 10000) / 10000,
    persenWaktu: persenWaktu === null ? null : Math.round(persenWaktu * 10000) / 10000,
    tolak: sebab.length > 0,
    sebab,
  };
}
