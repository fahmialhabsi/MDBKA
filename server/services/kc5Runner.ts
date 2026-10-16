import { join } from "node:path";
import { recommendationStatus, type Recommendation, type RecStatus } from "../../src/lib/branchOffice";
import { formulirSetoran, jadwalSetoran, judulSetoran, statusSetoran, type JadwalSetoran, type StatusSetoran } from "../../src/lib/kc5Cicilan";
import { summarizeByYear, type JurnalYearSummary } from "../types/jurnalPajak";
import { createJurnalPajakStore } from "./jurnalPajakStore";
import { readBranch, saveHasil, saveRecommendation } from "./branchStore";

/**
 * KC-5 (16 Okt 2026) — penjalan Kepala Cabang + Petugas Cicilan. Berjalan sendiri setiap bulan, tidak
 * membaca map cabang lain (lihat roadmap §9 — KC-5 paling akhir, berdiri sendiri).
 *  - Petugas Cicilan: untuk tiap setoran (9 tanggal 14, Nov 2026–Jul 2027), kirim Formulir R SEKALI
 *    saat H-3 atau sudah lewat jatuh tempo (idempotent — tidak dobel bila sudah pernah dikirim); SETUJU
 *    Pusat pada Formulir R itu = sudah disetor (LUNAS), tanpa map/penyimpanan baru.
 *  - Petugas Hasil Trading: SUDAH DIBANGUN LENGKAP di luar kerangka KC (server/services/jurnalPajakStore.ts
 *    + server/types/jurnalPajak.ts) — di sini HANYA DIBACA (load(), bukan sync() — tidak memicu baca
 *    ulang History MT5) untuk ringkasan tahun berjalan di laporan bulanan KC-5.
 *  - Kepala Cabang: gabungkan status cicilan + ringkasan hasil trading jadi satu map LAPORAN_BULANAN.
 * Juru Buku (jurnal berpasangan pokok/bunga) dan Petugas SPT (lampiran utang) BELUM dibangun — menunggu
 * jadwal angsuran resmi Bank Jago dan NPWP Bank Jago dari Fahmi (lihat src/lib/kc5Cicilan.ts).
 * HANYA MEMBACA berkas jurnal pajak yang sudah ada; tidak mengubah EA/skrip/.env; tidak mengirim order.
 */
export interface StatusBaris {
  readonly jadwal: JadwalSetoran;
  readonly status: StatusSetoran;
}

export interface Kc5Run {
  readonly cicilan: readonly StatusBaris[];
  readonly diingatkan: readonly Recommendation[];
  readonly hasilTrading: JurnalYearSummary | null;
}

export function runKc5(opts: {
  readonly dataDir: string;
  readonly commonDir: string;
  readonly now: Date;
  readonly login?: string;
  readonly jurnalPajakFile?: string;
}): Kc5Run {
  const login = opts.login ?? ((process.env?.["SWAPLOG_LOGIN_FINEX"] ?? "").trim() || "91811209");
  const existing = readBranch(opts.dataDir, "KC-5");
  const statusDiputuskan = (judul: string): RecStatus | null => {
    const found = existing.find((x) => x.rec.judul === judul);
    return found === undefined ? null : recommendationStatus(found.decisions);
  };

  const diingatkan: Recommendation[] = [];
  const cicilan: StatusBaris[] = jadwalSetoran().map((j) => {
    const judul = judulSetoran(j);
    const diputuskan = statusDiputuskan(judul);
    const status = statusSetoran(j, opts.now, diputuskan === "DISETUJUI");
    if ((status === "PERLU_DIINGATKAN" || status === "TERLAMBAT") && diputuskan === null) {
      diingatkan.push(saveRecommendation(opts.dataDir, "KC-5", formulirSetoran(j), opts.now));
    }
    return { jadwal: j, status };
  });

  // Sama dengan resolveJurnalPajakFile() (jurnalPajakStore.ts), tapi diturunkan dari dataDir yang
  // DIBERIKAN (bukan process.cwd() langsung) supaya teruji terisolasi; di produksi dataDir = <cwd>/data,
  // jadi hasilnya sama persis.
  const jurnalPajakFile = opts.jurnalPajakFile ?? ((process.env?.["JURNAL_PAJAK_FILE"] ?? "").trim() || join(opts.dataDir, "jurnal-pajak-finex.json"));
  const hasilTrading = ((): JurnalYearSummary | null => {
    try {
      const store = createJurnalPajakStore({ commonDir: opts.commonDir, file: jurnalPajakFile, login });
      const tahun = String(opts.now.getUTCFullYear());
      return summarizeByYear(store.load()).find((s) => s.year === tahun) ?? null;
    } catch {
      return null;
    }
  })();

  saveHasil(opts.dataDir, "KC-5", "LAPORAN_BULANAN", { cicilan, hasilTrading }, opts.now);

  return { cicilan, diingatkan, hasilTrading };
}
