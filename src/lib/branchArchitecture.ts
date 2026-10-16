/**
 * A-1 (16 Okt 2026) — Arsitektur KC-1 s/d KC-4. MURNI.
 * Rancangan: docs/ARSITEKTUR-2026-10-16-kc1-kc3.md (KC-4 menyusul, belum didokumenkan terpisah).
 * Kerangka saja: kontrak hasil tiap cabang, alur antar-cabang, status petugas,
 * dan pembagian data latih / try-out / ujian (segel). Semua petugas KC-1, KC-2, KC-3 AKTIF (dibangun
 * 16 Okt 2026) — KC-3: Kepala Sekolah (Pembagian Data), Penambang Fakta (bahan pertama: Peringatan
 * Badai jadi pemicu arah), Penyaring Kebetulan & Pengawas Try-out + Jalur Perbaikan
 * (src/lib/kc3Penambang.ts, src/lib/kc3Perbaikan.ts).
 * KC-4 Kepala Ruang Ujian & Penguji Data Lama AKTIF (lampu 1 saja — K1-K7 di bagian UJIAN bersegel,
 * src/lib/kc4Kepala.ts); Pengawas Demo/Live Minimum (lampu 2/3) dan Auditor Trade belum dibangun
 * (butuh trade demo/live nyata berjalan, bukan data historis).
 * Angka tidak diketahui = null (bukan tebakan).
 */
import type { BranchCode } from "./branchOffice";

// ---------- Petugas ----------

export type PetugasStatus = "DITUNDA" | "AKTIF";

export interface PetugasSlot {
  readonly id: string;
  readonly cabang: BranchCode;
  readonly jabatan: string;
  /** Jenis hasil yang dibaca petugas ini (dari cabang sendiri atau cabang lain). */
  readonly membaca: readonly HasilKind[];
  /** Jenis hasil yang ditulis petugas ini. */
  readonly menulis: HasilKind;
  readonly status: PetugasStatus;
}

// ---------- Kontrak hasil ----------

export type HasilKind =
  | "KARTU_BROKER" // KC-1: penilaian 6 kriteria satu broker
  | "PILIHAN_BROKER" // KC-1: satu broker untuk latih + uji
  | "DAFTAR_DATA" // KC-2: isi & kesehatan file data broker terpilih
  | "KATALOG_FUNGSI" // KC-2: fungsi MT5 tersedia vs dibutuhkan
  | "PEMBAGIAN_DATA" // KC-3: batas latih / try-out / ujian (segel)
  | "POLA_CALON" // KC-3: pola lolos latih + try-out, angka dibekukan
  | "CATATAN_PERBAIKAN" // KC-3: diagnosis + jalan Jalur Perbaikan
  | "VONIS_UJIAN"; // KC-4: K1-K7 di bagian UJIAN bersegel, vonis LULUS/GAGAL + lampu 1

export const HASIL_OWNER: Readonly<Record<HasilKind, BranchCode>> = {
  KARTU_BROKER: "KC-1",
  PILIHAN_BROKER: "KC-1",
  DAFTAR_DATA: "KC-2",
  KATALOG_FUNGSI: "KC-2",
  PEMBAGIAN_DATA: "KC-3",
  POLA_CALON: "KC-3",
  CATATAN_PERBAIKAN: "KC-3",
  VONIS_UJIAN: "KC-4",
};

/** Satu nilai bernomor + sumbernya; null = belum diketahui. */
export interface Fakta<T> {
  readonly nilai: T | null;
  readonly sumber: string;
}

/** Satu kartu per broker, diisi 4 petugas prinsip (akun DEMO untuk latih + uji). */
export interface KartuBroker {
  readonly broker: string;
  /** Merangkak: setoran awal minimum, Rupiah. */
  readonly setoranMinRp: Fakta<number>;
  readonly legalLive: Fakta<boolean>;
  readonly lotMinimum: Fakta<number>;
  /** Biaya pulang-pergi lot minimum per golongan, Rupiah. */
  readonly biayaRpPerGolongan: Readonly<Record<string, Fakta<number>>>;
  /** Panjang sejarah candle per golongan, hari. */
  readonly sejarahHariPerGolongan: Readonly<Record<string, Fakta<number>>>;
  readonly akunDemoAda: Fakta<boolean>;
  readonly demoSamaLive: Fakta<boolean>;
  readonly eksporBerjalan: Fakta<boolean>;
}

/** Satu broker untuk pelatihan (KC-3) sekaligus pengujian (KC-4) — keputusan Fahmi 16 Okt 2026. */
export interface PilihanBroker {
  readonly broker: string | null;
  readonly alasan: string;
}

export interface FileData {
  readonly simbol: string;
  readonly timeframe: "M1" | "M5" | "M15" | "H1" | "H4";
  readonly dari: string | null;
  readonly sampai: string | null;
  readonly jumlahCandle: number | null;
  readonly lubang: number | null;
}

export interface DaftarData {
  readonly broker: string;
  readonly files: readonly FileData[];
}

export interface FungsiMt5 {
  readonly nama: string;
  readonly tersedia: boolean | null;
  readonly dibutuhkanOleh: readonly BranchCode[];
  readonly catatan: string;
}

export interface KatalogFungsi {
  readonly fungsi: readonly FungsiMt5[];
}

export interface PembagianData {
  readonly broker: string;
  readonly dari: string;
  readonly latihSampai: string;
  readonly tryoutSampai: string;
  /** Mulai di sini = data ujian bersegel; hanya KC-4 yang boleh membaca. */
  readonly ujianDari: string;
  readonly sampai: string;
}

export interface PolaCalon {
  readonly id: string;
  readonly kondisi: string;
  readonly bahan: readonly string[];
  readonly angkaBeku: Readonly<Record<string, number>>;
  readonly latih: { readonly n: number; readonly rataR: number | null };
  readonly tryout: { readonly n: number; readonly rataR: number | null };
}

export type JalanPerbaikan = "A_TAMBAH_BAHAN" | "B_LOGIKA_TEPAT" | "C_GANTI_TEMPAT" | "D_GANTI_UKURAN" | "E_ARSIP";

export interface CatatanPerbaikan {
  readonly polaId: string;
  readonly percobaanKe: number;
  readonly diagnosis: string;
  readonly jalan: JalanPerbaikan;
  readonly hasil: string | null;
}

/** Batas Jalur Perbaikan: percobaan ke-7 tanpa perbaikan → wajib E_ARSIP. */
export const MAX_PERCOBAAN = 7;

export function jalanBoleh(percobaanKe: number, jalan: JalanPerbaikan): boolean {
  if (!Number.isInteger(percobaanKe) || percobaanKe < 1) return false;
  return percobaanKe >= MAX_PERCOBAAN ? jalan === "E_ARSIP" : true;
}

// ---------- Petugas KC-1..KC-4 ----------

export const PETUGAS: readonly PetugasSlot[] = [
  { id: "kc1-kepala", cabang: "KC-1", jabatan: "Kepala Cabang (Penilai Akhir)", membaca: ["KARTU_BROKER"], menulis: "PILIHAN_BROKER", status: "AKTIF" },
  { id: "kc1-merangkak", cabang: "KC-1", jabatan: "Petugas Prinsip Merangkak", membaca: [], menulis: "KARTU_BROKER", status: "AKTIF" },
  { id: "kc1-daribawah", cabang: "KC-1", jabatan: "Petugas Prinsip Dari Bawah", membaca: [], menulis: "KARTU_BROKER", status: "AKTIF" },
  { id: "kc1-keatas", cabang: "KC-1", jabatan: "Petugas Prinsip Ke Atas", membaca: [], menulis: "KARTU_BROKER", status: "AKTIF" },
  { id: "kc1-terbukti", cabang: "KC-1", jabatan: "Petugas Prinsip Terbukti", membaca: ["DAFTAR_DATA"], menulis: "KARTU_BROKER", status: "AKTIF" },
  { id: "kc2-kepala", cabang: "KC-2", jabatan: "Kepala Cabang", membaca: ["PILIHAN_BROKER"], menulis: "DAFTAR_DATA", status: "AKTIF" },
  { id: "kc2-katalog", cabang: "KC-2", jabatan: "Petugas Katalog Fungsi", membaca: ["CATATAN_PERBAIKAN"], menulis: "KATALOG_FUNGSI", status: "AKTIF" },
  { id: "kc3-kepala", cabang: "KC-3", jabatan: "Kepala Sekolah", membaca: ["DAFTAR_DATA", "PILIHAN_BROKER"], menulis: "PEMBAGIAN_DATA", status: "AKTIF" },
  { id: "kc3-penambang", cabang: "KC-3", jabatan: "Penambang Fakta", membaca: ["PEMBAGIAN_DATA", "KATALOG_FUNGSI"], menulis: "POLA_CALON", status: "AKTIF" },
  { id: "kc3-perbaikan", cabang: "KC-3", jabatan: "Penyaring Kebetulan & Pengawas Try-out", membaca: ["POLA_CALON"], menulis: "CATATAN_PERBAIKAN", status: "AKTIF" },
  { id: "kc4-kepala", cabang: "KC-4", jabatan: "Kepala Ruang Ujian & Penguji Data Lama", membaca: ["POLA_CALON"], menulis: "VONIS_UJIAN", status: "AKTIF" },
];

/** Alur antar-cabang dari kontrak petugas: [dari cabang, ke cabang, jenis hasil]. */
export function branchFlows(slots: readonly PetugasSlot[] = PETUGAS): { dari: BranchCode; ke: BranchCode; hasil: HasilKind }[] {
  const seen = new Set<string>();
  const out: { dari: BranchCode; ke: BranchCode; hasil: HasilKind }[] = [];
  for (const p of slots) {
    for (const kind of p.membaca) {
      const dari = HASIL_OWNER[kind];
      if (dari === p.cabang) continue;
      const key = `${dari}>${p.cabang}:${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ dari, ke: p.cabang, hasil: kind });
    }
  }
  return out;
}

/** Petugas hanya boleh menulis hasil milik cabangnya sendiri. */
export function contractErrors(slots: readonly PetugasSlot[] = PETUGAS): string[] {
  return slots.filter((p) => HASIL_OWNER[p.menulis] !== p.cabang).map((p) => `${p.id} menulis ${p.menulis} milik ${HASIL_OWNER[p.menulis]}`);
}

// ---------- Pembagian data (segel ujian) ----------

export const SPLIT = { latih: 0.6, tryout: 0.2, ujian: 0.2 } as const;

/**
 * Bagi rentang waktu data menjadi latih 60% · try-out 20% · ujian 20% (segel).
 * Waktu ISO (UTC). Rentang tidak sah → null.
 */
export function splitPeriods(broker: string, dariIso: string, sampaiIso: string): PembagianData | null {
  const a = Date.parse(dariIso);
  const b = Date.parse(sampaiIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  const at = (f: number): string => new Date(a + Math.round((b - a) * f)).toISOString();
  return {
    broker,
    dari: new Date(a).toISOString(),
    latihSampai: at(SPLIT.latih),
    tryoutSampai: at(SPLIT.latih + SPLIT.tryout),
    ujianDari: at(SPLIT.latih + SPLIT.tryout),
    sampai: new Date(b).toISOString(),
  };
}

export type BagianData = "LATIH" | "TRYOUT" | "UJIAN";

export function bagianOf(split: PembagianData, timeIso: string): BagianData | null {
  const t = Date.parse(timeIso);
  if (!Number.isFinite(t) || t < Date.parse(split.dari) || t > Date.parse(split.sampai)) return null;
  if (t < Date.parse(split.latihSampai)) return "LATIH";
  if (t < Date.parse(split.ujianDari)) return "TRYOUT";
  return "UJIAN";
}

/** Segel: KC-1..KC-3 tidak boleh membaca bagian UJIAN; hanya KC-4. */
export function bolehBaca(cabang: BranchCode, bagian: BagianData): boolean {
  return bagian !== "UJIAN" || cabang === "KC-4";
}
