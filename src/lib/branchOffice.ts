/**
 * C0 (16 Okt 2026) — Kantor Cabang MDBKA: daftar cabang, Formulir R, keputusan Pusat. MURNI.
 * Rancangan: docs/RANCANGAN-2026-10-16-kantor-cabang-mdbka.md.
 * Cabang hanya MEREKOMENDASIKAN; yang memutuskan hanya Kantor Pusat (Fahmi).
 * Keputusan SETUJU/TOLAK final (tidak bisa ditimpa); TUNDA boleh diikuti keputusan lain.
 */

export type BranchCode = "KC-1" | "KC-2" | "KC-3" | "KC-4" | "KC-5";

export interface BranchPost {
  readonly jabatan: string;
  readonly pemegang: string;
  readonly tugas: string;
}

export interface Branch {
  readonly code: BranchCode;
  readonly name: string;
  readonly misi: string;
  readonly hasil: string;
  readonly struktur: readonly BranchPost[];
}

export const BRANCHES: readonly Branch[] = [
  {
    code: "KC-1",
    name: "Pilih Pijakan",
    misi: "Memilih broker latih dan broker uji yang sesuai makna Merangkak Dari Bawah Ke Atas.",
    hasil: "Rekomendasi broker latih (data sejarah) dan broker uji (demo/live) dengan alasan dan angka.",
    struktur: [
      { jabatan: "Kepala Cabang", pemegang: "brokerScorecard (belum dibangun)", tugas: "Menghitung 6 kriteria tetap dan menyusun Formulir R" },
      { jabatan: "Petugas Legalitas", pemegang: "Daftar periksa manual Fahmi", tugas: "Menandai broker terdaftar Bappebti/JFX" },
      { jabatan: "Petugas Biaya", pemegang: "specCompare + file Margin", tugas: "Biaya pulang-pergi per golongan dalam Rp" },
      { jabatan: "Petugas Data", pemegang: "Pemeriksa file _LONG.csv (belum dibangun)", tugas: "Panjang sejarah, lubang data, jam server" },
    ],
  },
  {
    code: "KC-2",
    name: "Jembatan MT5",
    misi: "Menjaga data dari MT5 tetap sehat dan mencari fungsi MT5 yang dibutuhkan cabang lain.",
    hasil: "Laporan kesehatan data harian dan rekomendasi fungsi MT5 baru.",
    struktur: [
      { jabatan: "Kepala Cabang", pemegang: "bridgeHealth (belum dibangun)", tugas: "Menyusun laporan dan Formulir R" },
      { jabatan: "Petugas Harga Live", pemegang: "EA MDBKAMultiLive", tugas: "Kutipan harga live" },
      { jabatan: "Petugas Arsip Candle", pemegang: "ExportLongH1MDBKA + AutoExportMDBKAService", tugas: "Candle sejarah dan candle baru" },
      { jabatan: "Petugas Spesifikasi", pemegang: "ExportMarginMDBKA, SymbolSpecs", tugas: "Spread, margin, ukuran kontrak" },
      { jabatan: "Petugas Swap & History", pemegang: "MDBKASwapLogger, mt5Journal", tugas: "Swap per jam dan riwayat transaksi" },
      { jabatan: "Petugas Katalog Fungsi", pemegang: "Daftar manual (belum dibangun)", tugas: "Fungsi MQL5 tersedia vs dibutuhkan" },
    ],
  },
  {
    code: "KC-3",
    name: "Sekolah Merangkak",
    misi: "Melatih: menggali pola dari data latih lalu try-out, tanpa menyentuh data ujian.",
    hasil: "Buku Pola Calon dengan angka yang dibekukan.",
    struktur: [
      { jabatan: "Kepala Sekolah", pemegang: "patternBook (belum dibangun)", tugas: "Menjaga buku Pola Calon" },
      { jabatan: "Penambang Fakta", pemegang: "Skrip penambang (belum dibangun)", tugas: "Membedah data latih per kondisi" },
      { jabatan: "Penyaring Kebetulan", pemegang: "Aturan statistik tetap (belum dibangun)", tugas: "Membuang pola yang kebetulan" },
      { jabatan: "Pengawas Try-out", pemegang: "Skrip try-out (belum dibangun)", tugas: "Menguji pola di potongan latih yang disisihkan" },
      { jabatan: "Pustakawan", pemegang: "tradeAudit + arsip Lolosyiob", tugas: "Daftar kegagalan yang tidak boleh diulang" },
    ],
  },
  {
    code: "KC-4",
    name: "Ruang Ujian",
    misi: "Menguji Pola Calon sekali di data ujian bersegel, lalu demo dan live lot minimum.",
    hasil: "Vonis LULUS/GAGAL per pola per golongan dan status lampu 1-2-3; ukuran Rp bersih per jam (target Rp5.000–Rp6.000).",
    struktur: [
      { jabatan: "Kepala Ruang Ujian", pemegang: "greenLamps", tugas: "Menyusun vonis; satu pola diuji sekali" },
      { jabatan: "Penguji Data Lama", pemegang: "backtest + backtestReport", tugas: "Lampu 1 (K1–K7, latih/ujian)" },
      { jabatan: "Pengawas Demo", pemegang: "Rangkaian demo Finex", tugas: "Lampu 2" },
      { jabatan: "Pengawas Live Minimum", pemegang: "Rangkaian live lot minimum", tugas: "Lampu 3, setelah lampu 1 & 2 hijau" },
      { jabatan: "Auditor Trade", pemegang: "tradeAudit", tugas: "Sebab rugi per trade" },
    ],
  },
  {
    code: "KC-5",
    name: "Pembukuan & Pajak",
    misi: "Konsultan akuntansi: cicilan Bank Jago, buku besar pribadi, dan bahan SPT Tahunan.",
    hasil: "Pengingat setoran Rp68.506/bulan, laporan bulanan, bahan Lampiran utang SPT (Coretax).",
    struktur: [
      { jabatan: "Kepala Cabang", pemegang: "ledger (belum dibangun)", tugas: "Laporan bulanan dan Formulir R" },
      { jabatan: "Petugas Cicilan", pemegang: "Pengingat setoran (belum dibangun)", tugas: "Tanda LUNAS/BELUM tiap tanggal 14" },
      { jabatan: "Juru Buku", pemegang: "Jurnal berpasangan (belum dibangun)", tugas: "Pokok, bunga, kas dari jadwal resmi" },
      { jabatan: "Petugas Hasil Trading", pemegang: "Jurnal Pajak / History MT5", tugas: "Laba-rugi Finex live dalam Rp" },
      { jabatan: "Petugas SPT", pemegang: "Penyusun lampiran (belum dibangun)", tugas: "Lampiran 1 Bagian B: utang akhir tahun" },
    ],
  },
];

export function branchByCode(code: string | null | undefined): Branch | null {
  return BRANCHES.find((b) => b.code === code) ?? null;
}

// ---------- Formulir R ----------

export interface RecFact {
  readonly teks: string;
  readonly sumber: string;
}

/** Isian Formulir R dari cabang (sebelum diberi nomor oleh arsip). */
export interface RecommendationInput {
  readonly judul: string;
  readonly fakta: readonly RecFact[];
  readonly batasData: string;
  readonly usulan: string;
  readonly risiko: string;
}

export interface Recommendation extends RecommendationInput {
  readonly id: string;
  readonly cabang: BranchCode;
  readonly tanggalUtc: string;
}

export type DecisionKind = "SETUJU" | "TOLAK" | "TUNDA";

export interface Decision {
  readonly keputusan: DecisionKind;
  readonly catatan: string;
  readonly tanggalUtc: string;
}

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

const MAX_TEXT = 2000;

function text(v: unknown, field: string, required = true): Parsed<string> {
  if (typeof v !== "string") return required ? { ok: false, error: `${field} wajib berupa teks` } : { ok: true, value: "" };
  const t = v.trim();
  if (required && t === "") return { ok: false, error: `${field} wajib diisi` };
  if (t.length > MAX_TEXT) return { ok: false, error: `${field} terlalu panjang (maks ${MAX_TEXT} huruf)` };
  return { ok: true, value: t };
}

/** Periksa isian Formulir R. Angka yang tidak diketahui ditulis "…" oleh cabang, bukan ditebak. */
export function parseRecommendationInput(body: unknown): Parsed<RecommendationInput> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "isian harus objek" };
  const b = body as Record<string, unknown>;
  const judul = text(b.judul, "judul");
  if (!judul.ok) return judul;
  if (!Array.isArray(b.fakta) || b.fakta.length === 0) return { ok: false, error: "fakta wajib minimal 1 (angka + sumber file)" };
  if (b.fakta.length > 50) return { ok: false, error: "fakta maksimal 50 baris" };
  const fakta: RecFact[] = [];
  for (const [i, f] of b.fakta.entries()) {
    if (typeof f !== "object" || f === null) return { ok: false, error: `fakta ${i + 1} harus objek` };
    const r = f as Record<string, unknown>;
    const t = text(r.teks, `fakta ${i + 1} teks`);
    if (!t.ok) return t;
    const s = text(r.sumber, `fakta ${i + 1} sumber`);
    if (!s.ok) return s;
    fakta.push({ teks: t.value, sumber: s.value });
  }
  const batasData = text(b.batasData, "batas data");
  if (!batasData.ok) return batasData;
  const usulan = text(b.usulan, "usulan");
  if (!usulan.ok) return usulan;
  const risiko = text(b.risiko, "risiko bila disetujui");
  if (!risiko.ok) return risiko;
  return { ok: true, value: { judul: judul.value, fakta, batasData: batasData.value, usulan: usulan.value, risiko: risiko.value } };
}

export function parseDecisionInput(body: unknown): Parsed<{ keputusan: DecisionKind; catatan: string }> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "isian harus objek" };
  const b = body as Record<string, unknown>;
  if (b.keputusan !== "SETUJU" && b.keputusan !== "TOLAK" && b.keputusan !== "TUNDA") {
    return { ok: false, error: "keputusan harus SETUJU, TOLAK, atau TUNDA" };
  }
  const catatan = text(b.catatan, "catatan", false);
  if (!catatan.ok) return catatan;
  return { ok: true, value: { keputusan: b.keputusan, catatan: catatan.value } };
}

export type RecStatus = "MENUNGGU" | "DITUNDA" | "DISETUJUI" | "DITOLAK";

/** Status satu rekomendasi dari riwayat keputusan (urut waktu). Keputusan final pertama yang berlaku. */
export function recommendationStatus(decisions: readonly Decision[]): RecStatus {
  const final = decisions.find((d) => d.keputusan !== "TUNDA");
  if (final !== undefined) return final.keputusan === "SETUJU" ? "DISETUJUI" : "DITOLAK";
  return decisions.length > 0 ? "DITUNDA" : "MENUNGGU";
}

/** Boleh menambah keputusan? Tidak bila sudah ada SETUJU/TOLAK (tidak boleh ditimpa). */
export function canDecide(decisions: readonly Decision[]): boolean {
  return decisions.every((d) => d.keputusan === "TUNDA");
}

/** Nomor rekomendasi: R-KC-5-20261016T030500Z-001 (jam UTC + urutan). */
export function recommendationId(code: BranchCode, now: Date, seq: number): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return `R-${code}-${stamp}-${String(seq).padStart(3, "0")}`;
}

export function isRecommendationId(id: string): boolean {
  return /^R-KC-[1-5]-\d{8}T\d{6}Z-\d{3}$/.test(id);
}

// ---------- Halaman ----------

/** `/?halaman=cabang` (Kantor Pusat) atau `/?halaman=cabang&kode=KC-5`. */
export interface BranchPageParams {
  readonly code: BranchCode | null;
}

export function branchPageUrl(code: BranchCode | null): string {
  const q = new URLSearchParams({ halaman: "cabang" });
  if (code !== null) q.set("kode", code);
  return `/?${q.toString()}`;
}

export function parseBranchPage(search: string): BranchPageParams | null {
  const q = new URLSearchParams(search);
  if (q.get("halaman") !== "cabang") return null;
  return { code: branchByCode(q.get("kode"))?.code ?? null };
}
