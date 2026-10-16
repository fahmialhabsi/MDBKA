/**
 * F2 (13 Okt 2026) — gerbang kualitas data. MURNI. Sinyal hanya boleh
 * dinilai bila data dari terminal bisa dipercaya:
 *  1. Ekspor EA hidup: equity.csv diperbarui ≤ 120 dtk lalu (EA tulis tiap 2 dtk).
 *  2. Koneksi akun ke server broker TERSAMBUNG (urutan kejadian Journal).
 *  3. (Audit A-3, 16 Okt 2026) Harga live: quotes.csv diperbarui ≤ 120 dtk lalu — DIPISAH dari #1
 *     karena terbukti nyata bisa berbeda: EA MDBKAMultiLive (quotes.csv) sempat lepas dari chart
 *     Finex ±4 jam sementara equity.csv TETAP diperbarui EA lain, jadi #1 saja tidak cukup untuk
 *     menjamin harga live benar-benar hidup.
 * Gagal → status pemindai DATA (TUNGGU, lebih aman). Tidak diketahui
 * (log/berkas tidak terbaca) → TIDAK_DINILAI, tidak menahan (perilaku lama).
 */
import type { GuardEntry } from "./jsonlRecord";
import type { TerminalHealth } from "./mt5Journal";

export const MAX_EXPORT_AGE_SEC = 120;

export interface DataQualityInput {
  readonly nowMs: number;
  /** mtime equity.csv (ms); null = tidak terbaca. */
  readonly equityModifiedMs: number | null;
  /** mtime quotes.csv (ms); null = tidak terbaca. Sumber SAMA dengan equity (EA MDBKAMultiLive) tapi diperiksa terpisah — lihat catatan di atas. */
  readonly quotesModifiedMs: number | null;
  readonly health: TerminalHealth | null;
}

export interface DataQuality {
  readonly lulus: boolean;
  readonly alasan: string | null;
  readonly pemeriksaan: readonly GuardEntry[];
}

export function evaluateDataQuality(input: DataQualityInput): DataQuality {
  const checks: GuardEntry[] = [];
  const age = input.equityModifiedMs === null ? null : Math.round((input.nowMs - input.equityModifiedMs) / 1000);
  checks.push({
    nama: "ekspor_ea",
    hasil: age === null ? "TIDAK_DINILAI" : age <= MAX_EXPORT_AGE_SEC ? "LULUS" : "GAGAL",
    kodeAlasan: age !== null && age > MAX_EXPORT_AGE_SEC ? "EKSPOR_EA_BERHENTI" : null,
    sumberData: "equity.csv",
    umurDataDetik: age,
  });
  const quotesAge = input.quotesModifiedMs === null ? null : Math.round((input.nowMs - input.quotesModifiedMs) / 1000);
  checks.push({
    nama: "harga_live",
    hasil: quotesAge === null ? "TIDAK_DINILAI" : quotesAge <= MAX_EXPORT_AGE_SEC ? "LULUS" : "GAGAL",
    kodeAlasan: quotesAge !== null && quotesAge > MAX_EXPORT_AGE_SEC ? "HARGA_LIVE_BERHENTI" : null,
    sumberData: "quotes.csv",
    umurDataDetik: quotesAge,
  });
  const h = input.health;
  checks.push({
    nama: "koneksi_terminal",
    hasil: h === null || h.koneksi === "TIDAK_DIKETAHUI" ? "TIDAK_DINILAI" : h.koneksi === "TERSAMBUNG" ? "LULUS" : "GAGAL",
    kodeAlasan: h !== null && h.koneksi === "PUTUS" ? (h.loginGagal ? "LOGIN_GAGAL" : "KONEKSI_PUTUS") : null,
    sumberData: "Logs/<YYYYMMDD>.log",
    umurDataDetik: null,
  });
  const failed = checks.filter((c) => c.hasil === "GAGAL");
  const alasan =
    failed.length === 0
      ? null
      : `Data tidak bisa dipercaya: ${failed
          .map((c) =>
            c.kodeAlasan === "EKSPOR_EA_BERHENTI"
              ? `ekspor EA berhenti ${age} dtk`
              : c.kodeAlasan === "HARGA_LIVE_BERHENTI"
                ? `harga live (quotes.csv) berhenti ${quotesAge} dtk — EA MDBKAMultiLive mungkin lepas dari chart`
                : c.kodeAlasan === "LOGIN_GAGAL"
                  ? "login terminal gagal"
                  : `koneksi terminal putus sejak ${h?.sejak ?? "?"}`,
          )
          .join("; ")}`;
  return { lulus: failed.length === 0, alasan, pemeriksaan: checks };
}
