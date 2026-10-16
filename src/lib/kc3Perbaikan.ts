/**
 * KC-3 Penyaring Kebetulan & Pengawas Try-out (menyusul, 16 Okt 2026) — menyaring Pola Calon dari
 * Penambang Fakta sebelum diuji SEKALI di bagian TRY-OUT, lalu mendiagnosis Jalur Perbaikan (roadmap
 * §6a) bila gagal. MURNI. Dipanggil penjalan dengan trade yang SUDAH disaring ke bagian LATIH/TRY-OUT
 * saja (segel ujian dijaga di luar modul ini — lihat bolehBaca()/bagianOf() di branchArchitecture.ts).
 *
 * Catatan jujur v1: baru SATU bahan (Peringatan Badai) yang pernah ditambang KC-3, jadi pemetaan
 * diagnosis -> jalan di bawah ini masih kasar (lihat komentar tiap cabang). Perlu ditinjau ulang Fahmi
 * begitu Jalur Perbaikan pertama benar-benar terpakai dengan data nyata.
 */
import { jalanBoleh, MAX_PERCOBAAN, type CatatanPerbaikan, type JalanPerbaikan, type PolaCalon } from "./branchArchitecture";
import type { RecommendationInput } from "./branchOffice";
import { BADAI_MIN_TRADE, BADAI_TARGET_RR, type BadaiTrade } from "./kc3Penambang";

/** Titik impas tingkat menang untuk R:R = targetRR (menang×targetRR = (1−menang)×1). */
export function titikImpas(targetRR: number = BADAI_TARGET_RR): number {
  return 1 / (1 + targetRR);
}

/** "2026.01.15 10:00" / "2026-01-15 10:00" → "2026-01" (tahun-bulan UTC apa adanya). */
function tahunBulan(waktu: string): string | null {
  const m = /^(\d{4})[.-](\d{2})/.exec(waktu.trim());
  return m === null ? null : `${m[1]}-${m[2]}`;
}

/** Daftar "YYYY-MM" dari dariIso s/d sampaiIso (UTC), untuk cek pola muncul di SETIAP bulan LATIH. */
export function bulanRentang(dariIso: string, sampaiIso: string): string[] {
  const a = new Date(dariIso);
  const b = new Date(sampaiIso);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || b < a) return [];
  const out: string[] = [];
  let y = a.getUTCFullYear();
  let m = a.getUTCMonth();
  while (y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth())) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

export type StatusSaring = "BELUM_CUKUP" | "LOLOS" | "GAGAL";
export type TahapPerbaikan = "SARING_TIDAK_KONSISTEN" | "SARING_TANPA_KEUNGGULAN" | "TRYOUT_GAGAL";

export interface HasilSaring {
  readonly status: StatusSaring;
  readonly alasan: string;
  /** Hanya diisi saat status GAGAL — dipakai langsung oleh pilihJalan()/catatanPerbaikan(), tidak perlu menebak dari teks alasan. */
  readonly sebab?: Extract<TahapPerbaikan, "SARING_TIDAK_KONSISTEN" | "SARING_TANPA_KEUNGGULAN">;
}

function ringkasTrade(trades: readonly BadaiTrade[]): { menang: number; rataR: number } {
  const n = trades.length;
  const menang = n === 0 ? 0 : trades.filter((t) => t.outcome === "TP").length / n;
  const rataR = n === 0 ? 0 : trades.reduce((s, t) => s + t.rMultiple, 0) / n;
  return { menang, rataR };
}

/**
 * Penyaring Kebetulan: lolos bila (1) n cukup — ambang naik sejalan jumlah pola yang pernah ditambang
 * KC-3 (koreksi kasar "makin banyak dicoba, makin ketat"), (2) muncul di SETIAP bulan kalender LATIH
 * (bukan hanya sebagian — "pola harus muncul di setiap bab latih"), (3) tingkat menang >= titik impas
 * dan rata-rata R > 0.
 */
export function saringKebetulan(trades: readonly BadaiTrade[], bulanLatih: readonly string[], jumlahPolaPernahDitambang: number): HasilSaring {
  const ambangN = BADAI_MIN_TRADE + 10 * Math.max(0, jumlahPolaPernahDitambang - 1);
  if (trades.length < ambangN) {
    return { status: "BELUM_CUKUP", alasan: `${trades.length} percobaan < ambang ${ambangN} (naik sejalan ${jumlahPolaPernahDitambang} pola yang pernah ditambang KC-3)` };
  }
  const bulanAda = new Set(trades.map((t) => tahunBulan(t.signalTime)).filter((b): b is string => b !== null));
  const bulanKosong = bulanLatih.filter((b) => !bulanAda.has(b));
  if (bulanKosong.length > 0) {
    return {
      status: "GAGAL",
      sebab: "SARING_TIDAK_KONSISTEN",
      alasan: `Tidak muncul di ${bulanKosong.length} dari ${bulanLatih.length} bulan LATIH (${bulanKosong.join(", ")}) — kemungkinan kebetulan satu musim, bukan pola tetap.`,
    };
  }
  const { menang, rataR } = ringkasTrade(trades);
  const impas = titikImpas();
  if (menang < impas || !(rataR > 0)) {
    return {
      status: "GAGAL",
      sebab: "SARING_TANPA_KEUNGGULAN",
      alasan: `Muncul di semua ${bulanLatih.length} bulan LATIH, tapi tingkat menang ${(menang * 100).toFixed(1)}% (titik impas ${(impas * 100).toFixed(1)}%) / rata-rata R ${rataR.toFixed(2)} tidak cukup.`,
    };
  }
  return { status: "LOLOS", alasan: `Muncul di semua ${bulanLatih.length} bulan LATIH, menang ${(menang * 100).toFixed(1)}% (>= impas ${(impas * 100).toFixed(1)}%), rata-rata R ${rataR.toFixed(2)}.` };
}

export interface HasilTryout {
  readonly lolos: boolean;
  readonly n: number;
  readonly rataR: number | null;
  readonly alasan: string;
}

/** Pengawas Try-out: uji SEKALI di bagian TRY-OUT (tidak pernah diintip sebelumnya). */
export function pengawasTryout(trades: readonly BadaiTrade[]): HasilTryout {
  if (trades.length === 0) return { lolos: false, n: 0, rataR: null, alasan: "Tidak ada percobaan BADAI di bagian TRY-OUT." };
  const { menang, rataR } = ringkasTrade(trades);
  const impas = titikImpas();
  const lolos = menang >= impas && rataR > 0;
  const bulat = Math.round(rataR * 100) / 100;
  return {
    lolos,
    n: trades.length,
    rataR: bulat,
    alasan: lolos
      ? `Try-out: menang ${(menang * 100).toFixed(1)}% (n=${trades.length}), rata-rata R ${bulat} — konsisten dengan LATIH.`
      : `Try-out: menang ${(menang * 100).toFixed(1)}% atau rata-rata R ${bulat} tidak memenuhi titik impas ${(impas * 100).toFixed(1)}% (n=${trades.length}).`,
  };
}

/**
 * Pilih jalan Jalur Perbaikan dari diagnosis kasar v1 (lihat catatan atas berkas):
 *  - Gagal saring karena TIDAK KONSISTEN antar bulan -> C_GANTI_TEMPAT (uji konteks/golongan lain).
 *  - Gagal saring karena menang/R tidak cukup PADAHAL konsisten -> B_LOGIKA_TEPAT (CU-1 sendiri bilang
 *    BADAI meramal BESAR GERAK, bukan arah — pertanyaan arah mungkin keliru).
 *  - Gagal di TRY-OUT setelah lolos saring (overfit ke satu bahan tunggal) -> A_TAMBAH_BAHAN.
 *  - Percobaan ke-MAX_PERCOBAAN tanpa perbaikan -> WAJIB E_ARSIP (jalanBoleh menegakkan ini).
 */
export function pilihJalan(percobaanKe: number, tahap: TahapPerbaikan): JalanPerbaikan {
  if (percobaanKe >= MAX_PERCOBAAN) return "E_ARSIP";
  if (tahap === "SARING_TIDAK_KONSISTEN") return "C_GANTI_TEMPAT";
  if (tahap === "SARING_TANPA_KEUNGGULAN") return "B_LOGIKA_TEPAT";
  return "A_TAMBAH_BAHAN";
}

export function catatanPerbaikan(polaId: string, percobaanKe: number, tahap: TahapPerbaikan, diagnosis: string): CatatanPerbaikan {
  const jalan = pilihJalan(percobaanKe, tahap);
  if (!jalanBoleh(percobaanKe, jalan)) throw new Error(`jalan ${jalan} tidak boleh di percobaan ke-${percobaanKe}`);
  return { polaId, percobaanKe, diagnosis, jalan, hasil: null };
}

/**
 * SOP KC-3 langkah 8: lolos try-out -> Formulir R "Pola Calon" ke Pusat (informasional; map POLA_CALON
 * sudah tersimpan terpisah oleh penjalan — belum memakai mekanisme lampiran/gerbang SETUJU seperti
 * PILIHAN_BROKER KC-1, karena KC-4 pembacanya belum dibangun; tinjau ulang saat KC-4 mulai dikerjakan).
 */
export function formulirPolaCalon(pola: PolaCalon, tryout: HasilTryout, broker: string, tanggal: string): RecommendationInput {
  return {
    judul: `Pola Calon KC-3 lolos try-out: ${pola.id}`,
    fakta: [
      { teks: `LATIH: ${pola.latih.n} percobaan, rata-rata R ${pola.latih.rataR ?? "…"}`, sumber: `Penambang Fakta KC-3 ${tanggal}` },
      { teks: tryout.alasan, sumber: `Pengawas Try-out KC-3 ${tanggal}` },
    ],
    batasData: "Hanya diuji di bagian LATIH + TRY-OUT broker terpilih; bagian UJIAN tetap bersegel, hanya KC-4 yang boleh membacanya.",
    usulan: `Setujui Pola Calon "${pola.id}" (${pola.kondisi}) broker ${broker} untuk diteruskan ke KC-4 Ruang Ujian.`,
    risiko: "Belum diuji di data ujian bersegel maupun akun demo/live; keputusan ini hanya meneruskan ke tahap uji berikutnya, bukan mengizinkan trading.",
  };
}
