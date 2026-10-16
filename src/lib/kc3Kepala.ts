/**
 * KC-3 Kepala Sekolah (menyusul, 16 Okt 2026) — menetapkan Pembagian Data (latih 60% · try-out 20% ·
 * ujian 20%, segel) dari DAFTAR_DATA (KC-2) + PILIHAN_BROKER (KC-1). MURNI.
 * Memakai timeframe H1 (dipakai backtest, lihat backtestCli.ts) dan IRISAN rentang semua simbol, supaya
 * setiap simbol punya data lengkap di bagian latih/try-out/ujian yang sama. Tidak membuka isi bagian
 * UJIAN — hanya menghitung batas tanggalnya (lihat bolehBaca() di branchArchitecture.ts).
 */
import { splitPeriods, type PembagianData } from "./branchArchitecture";
import type { RecommendationInput } from "./branchOffice";
import { DATA_CUKUP_HARI } from "./kc1Assessment";

export interface FileRentang {
  readonly simbol: string;
  readonly timeframe: string;
  readonly dari: string | null;
  readonly sampai: string | null;
}

const DAY = 86_400_000;

/** Format DAFTAR_DATA KC-2: "2026-01-02 22:00" (UTC) → ISO UTC sah untuk Date.parse. */
function keIso(waktu: string): string {
  return `${waktu.replace(" ", "T")}:00.000Z`;
}

/**
 * Rentang tanggal yang dimiliki BERSAMA semua simbol H1 (irisan dari–sampai tiap simbol).
 * null bila tidak ada file H1 berisi, atau irisannya kosong/terbalik.
 */
export function rentangBersamaH1(files: readonly FileRentang[]): { dari: string; sampai: string } | null {
  const h1 = files.filter((f): f is FileRentang & { dari: string; sampai: string } => f.timeframe === "H1" && f.dari !== null && f.sampai !== null);
  if (h1.length === 0) return null;
  let dari = keIso(h1[0].dari);
  let sampai = keIso(h1[0].sampai);
  for (const f of h1.slice(1)) {
    const d = keIso(f.dari);
    const s = keIso(f.sampai);
    if (d > dari) dari = d;
    if (s < sampai) sampai = s;
  }
  return dari < sampai ? { dari, sampai } : null;
}

export interface HasilKepalaSekolah {
  readonly split: PembagianData | null;
  readonly hariBersama: number | null;
  readonly masalah: string | null;
}

/** Hitung Pembagian Data (60/20/20) dari file H1 DAFTAR_DATA KC-2, untuk broker terpilih KC-1. */
export function kepalaSekolah(broker: string, files: readonly FileRentang[]): HasilKepalaSekolah {
  const rentang = rentangBersamaH1(files);
  if (rentang === null) {
    return { split: null, hariBersama: null, masalah: "Tidak ada file H1 dengan rentang tanggal lengkap yang dimiliki semua simbol (DAFTAR_DATA KC-2 belum cukup)." };
  }
  const split = splitPeriods(broker, rentang.dari, rentang.sampai);
  if (split === null) return { split: null, hariBersama: null, masalah: "Rentang bersama tidak sah." };
  const hariBersama = (Date.parse(split.sampai) - Date.parse(split.dari)) / DAY;
  if (hariBersama < DATA_CUKUP_HARI) {
    return {
      split,
      hariBersama,
      masalah: `Rentang bersama hanya ${Math.round(hariBersama)} hari (kurang dari ${DATA_CUKUP_HARI}); bagian LATIH mungkin tidak cukup untuk Penambang Fakta.`,
    };
  }
  return { split, hariBersama, masalah: null };
}

export function formulirKc3Pembagian(broker: string, hasil: HasilKepalaSekolah, tanggal: string): RecommendationInput | null {
  if (hasil.masalah === null) return null;
  return {
    judul: `Pembagian data KC-3 (${broker}) belum cukup`,
    fakta: [
      { teks: hasil.masalah, sumber: `DAFTAR_DATA KC-2, Pembagian Data KC-3 ${tanggal}` },
      ...(hasil.split === null
        ? []
        : [{ teks: `Rentang bersama ${hasil.split.dari.slice(0, 10)} s/d ${hasil.split.sampai.slice(0, 10)} (${hasil.hariBersama === null ? "…" : Math.round(hasil.hariBersama)} hari)`, sumber: "kepalaSekolah() KC-3" }]),
    ],
    batasData: "Hanya rentang H1 yang dimiliki bersama semua simbol broker terpilih; bagian UJIAN tidak dibuka/dibaca di sini.",
    usulan: "Perbanyak data H1 lewat KC-2 (jalankan ExportLongH1MDBKA dengan InpCandleCount lebih besar) sampai rentang bersama ≥ 365 hari, lalu jalankan ulang KC-3.",
    risiko: "Tidak mengubah data, tidak mengirim order; hanya menandai Pembagian Data belum layak dipakai Penambang Fakta.",
  };
}
