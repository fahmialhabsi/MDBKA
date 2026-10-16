/**
 * KC-5 Petugas Cicilan (menyusul, 16 Okt 2026) — pengingat setoran pinjaman Bank Jago. Data pinjaman
 * dari Fahmi 16 Okt 2026: pokok Rp500.000, cair 14 Okt 2026, tenor 9 bulan, bayar tiap tanggal 14
 * (Nov 2026 – Jul 2027), cicilan Rp68.506/bulan (dikonfirmasi Fahmi; angka Rp250.000 sebelumnya
 * keliru), bunga flat 2,59%/bulan, total bayar Rp616.553, tujuan trading (dicatat Juru Buku sebagai
 * "Kas di broker", terpisah dari utang — Juru Buku BELUM dibangun, menunggu jadwal angsuran resmi
 * Bank Jago untuk pembagian pokok/bunga per bulan; tanpa itu angka "..." bukan dibagi rata).
 * MURNI. LUNAS/BELUM memakai mekanisme Formulir R yang SUDAH ADA (Pusat SETUJU = sudah disetor) —
 * tidak perlu map/penyimpanan baru untuk status pembayaran.
 */
import type { RecommendationInput } from "./branchOffice";

export const PINJAMAN = {
  pokokRp: 500_000,
  cairTanggal: "2026-10-14",
  tenorBulan: 9,
  cicilanRp: 68_506,
  tanggalJatuhTempo: 14,
  bungaFlatPersenBulan: 2.59,
  totalBayarRp: 616_553,
} as const;

/** Trade (lot minimum) jatuh tempo sebelum kena denda. */
export const H_PERINGATAN = 3;

export interface JadwalSetoran {
  readonly ke: number;
  readonly tanggal: string; // YYYY-MM-DD (UTC, tanggal kalender)
  readonly jumlahRp: number;
}

/** 9 tanggal jatuh tempo (14 tiap bulan, mulai satu bulan setelah pinjaman cair). */
export function jadwalSetoran(): readonly JadwalSetoran[] {
  const [tahunCair, bulanCair] = PINJAMAN.cairTanggal.split("-").map(Number) as [number, number];
  return Array.from({ length: PINJAMAN.tenorBulan }, (_, i) => {
    const bulan0 = bulanCair + i; // 0-indexed bulan setelah cair (bulanCair sudah 1-indexed, +1 bulan = +i mulai 0)
    const tahun = tahunCair + Math.floor(bulan0 / 12);
    const bulan = (bulan0 % 12) + 1;
    return { ke: i + 1, tanggal: `${tahun}-${String(bulan).padStart(2, "0")}-${String(PINJAMAN.tanggalJatuhTempo).padStart(2, "0")}`, jumlahRp: PINJAMAN.cicilanRp };
  });
}

/** Judul Formulir R satu setoran — SAMA dipakai untuk mencocokkan status (SETUJU = LUNAS). */
export function judulSetoran(s: JadwalSetoran): string {
  return `Setoran Bank Jago ke-${s.ke}/${PINJAMAN.tenorBulan} jatuh tempo ${s.tanggal}`;
}

export function formulirSetoran(s: JadwalSetoran): RecommendationInput {
  return {
    judul: judulSetoran(s),
    fakta: [{ teks: `Cicilan ke-${s.ke} dari ${PINJAMAN.tenorBulan}, Rp${s.jumlahRp.toLocaleString("id-ID")}, jatuh tempo ${s.tanggal}.`, sumber: "Data pinjaman Bank Jago, dikonfirmasi Fahmi 16 Okt 2026" }],
    batasData: "Pembagian pokok/bunga bulan ini belum diketahui (jadwal angsuran resmi Bank Jago belum ada) — dicatat \"…\", bukan dibagi rata.",
    usulan: `Setor Rp${s.jumlahRp.toLocaleString("id-ID")} ke Bank Jago paling lambat ${s.tanggal}, lalu tandai Setuju di sini sebagai bukti sudah disetor.`,
    risiko: "Keterlambatan setoran bisa kena denda/bunga berjalan menurut syarat Bank Jago; MDBKA hanya mengingatkan, tidak melakukan pembayaran.",
  };
}

export type StatusSetoran = "BELUM_JATUH_TEMPO" | "PERLU_DIINGATKAN" | "TERLAMBAT" | "LUNAS";

/** `sudahDisetujui` = true bila Formulir R setoran ini sudah SETUJU Pusat (lihat judulSetoran()). */
export function statusSetoran(s: JadwalSetoran, now: Date, sudahDisetujui: boolean): StatusSetoran {
  if (sudahDisetujui) return "LUNAS";
  const jatuhTempoMs = Date.parse(`${s.tanggal}T00:00:00.000Z`);
  const hariKe = (jatuhTempoMs - now.getTime()) / 86_400_000;
  if (hariKe > H_PERINGATAN) return "BELUM_JATUH_TEMPO";
  if (hariKe >= 0) return "PERLU_DIINGATKAN";
  return "TERLAMBAT";
}
