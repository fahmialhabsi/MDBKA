/**
 * KC-1 "Pilih Pijakan" (16 Okt 2026) — penilaian broker paling dekat prinsip MDBKA. MURNI.
 * Rancangan: docs/STRUKTUR-ORGANISASI-KC1-KC3.md (bagian KC-1). Latih + uji memakai AKUN DEMO.
 * Empat petugas prinsip mengisi Kartu Broker; Kepala Cabang menggugurkan dan memilih.
 * Aturan nilai dibekukan di konstanta di bawah. Angka tidak diketahui = null.
 */
import type { RecommendationInput } from "./branchOffice";
import type { LiveSpec } from "./specCompare";

/** Modal kecil acuan "Dari Bawah" (setara saldo Finex ±$28). */
export const MODAL_ACUAN_RP = 500_000;
/** Data cukup: rentang data satu simbol minimal sekian hari (latih 60% + try-out 20% + ujian 20%). */
export const DATA_CUKUP_HARI = 365;
export const LOT_MERANGKAK = 0.01;
/** Golongan yang dinilai (golongan tertahan/tidak lazim tidak ikut). */
export const GOLONGAN_DINILAI = ["FOREX", "FOREX_JPY", "LOGAM", "MINYAK", "INDEKS", "SAHAM_AS"] as const;
export type GolonganDinilai = (typeof GOLONGAN_DINILAI)[number];

export interface FaktaNilai<T> {
  readonly nilai: T | null;
  readonly sumber: string;
}

/** Bahan satu broker (dikumpulkan penjalan dari Common Files + config/kc1-fakta-broker.json). */
export interface BrokerBahan {
  readonly id: string;
  readonly nama: string;
  readonly akunDemoAda: FaktaNilai<boolean>;
  readonly akunLiveAda: FaktaNilai<boolean>;
  readonly legal: FaktaNilai<boolean>;
  readonly setoranMinRp: FaktaNilai<number>;
  /** Spesifikasi akun demo (MDBKA_Specs_<login demo>.csv); null = tidak ada file. */
  readonly specsDemo: { readonly specs: readonly LiveSpec[]; readonly sumber: string } | null;
  readonly specsLive: { readonly specs: readonly LiveSpec[]; readonly sumber: string } | null;
  /** Biaya pulang-pergi pada lot minimum per simbol, Rupiah (spread + komisi). */
  readonly biayaRp: readonly { readonly symbol: string; readonly golongan: string; readonly rp: number }[];
  readonly biayaSumber: string;
  /** Rentang data terpanjang per simbol dari file *_LONG.csv (semua timeframe). */
  readonly sejarah: readonly { readonly symbol: string; readonly golongan: string; readonly hari: number }[];
  readonly golonganOf: (symbol: string) => string;
}

export interface NilaiPrinsip {
  /** 0–100; null = tidak bisa dinilai. */
  readonly nilai: number | null;
  readonly rincian: readonly string[];
  /** Alasan gugur wajib (kosong = tidak gugur). */
  readonly gugur: readonly string[];
}

export interface KartuPenilaian {
  readonly broker: string;
  readonly nama: string;
  readonly merangkak: NilaiPrinsip;
  readonly dariBawah: NilaiPrinsip & { readonly biayaMedianRp: number | null };
  readonly keAtas: NilaiPrinsip;
  readonly terbukti: NilaiPrinsip;
}

const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};
const rp = (v: number): string => `Rp${Math.round(v).toLocaleString("id-ID")}`;
const dinilai = (g: string): g is GolonganDinilai => (GOLONGAN_DINILAI as readonly string[]).includes(g);

// ---------- Petugas Prinsip Merangkak ----------
export function petugasMerangkak(b: BrokerBahan): NilaiPrinsip {
  if (b.specsDemo === null) return { nilai: null, rincian: ["Spesifikasi akun demo tidak ada — lot minimum tidak bisa dibaca"], gugur: ["tidak ada spesifikasi akun demo"] };
  const perGol = new Map<string, number>();
  for (const s of b.specsDemo.specs) {
    const g = b.golonganOf(s.symbol);
    if (!dinilai(g) || !(s.volumeMin > 0)) continue;
    perGol.set(g, Math.min(perGol.get(g) ?? Infinity, s.volumeMin));
  }
  const ada = [...perGol.entries()];
  const kecil = ada.filter(([, v]) => v <= LOT_MERANGKAK + 1e-9);
  const rincian = ada.map(([g, v]) => `${g}: lot minimum ${v}`);
  const gugur = kecil.length === 0 ? [`tidak ada golongan dengan lot minimum ${LOT_MERANGKAK}`] : [];
  const setoran = b.setoranMinRp.nilai;
  rincian.push(setoran === null ? `Setoran minimum: … (${b.setoranMinRp.sumber})` : `Setoran minimum ${rp(setoran)} (${b.setoranMinRp.sumber})`);
  const bagianLot = ada.length === 0 ? 0 : (70 * kecil.length) / GOLONGAN_DINILAI.length;
  const bagianSetoran = setoran !== null && setoran <= MODAL_ACUAN_RP ? 30 : 0;
  return { nilai: Math.round(bagianLot + bagianSetoran), rincian, gugur };
}

// ---------- Petugas Prinsip Dari Bawah ----------
export function petugasDariBawah(b: BrokerBahan): NilaiPrinsip & { readonly biayaMedianRp: number | null } {
  const perGol = new Map<string, number[]>();
  for (const c of b.biayaRp) {
    if (!dinilai(c.golongan) || !(c.rp >= 0)) continue;
    perGol.set(c.golongan, [...(perGol.get(c.golongan) ?? []), c.rp]);
  }
  const medGol = [...perGol.entries()].map(([g, xs]) => [g, median(xs) as number] as const);
  const all = median(medGol.map(([, v]) => v));
  const rincian = medGol.map(([g, v]) => `${g}: biaya 1 trade ${rp(v)} (${((100 * v) / MODAL_ACUAN_RP).toFixed(2).replace(".", ",")}% modal ${rp(MODAL_ACUAN_RP)})`);
  rincian.push(`Sumber: ${b.biayaSumber}`);
  // Nilai relatif diisi Kepala (butuh pembanding broker lain); di sini null.
  return { nilai: null, rincian, gugur: all === null ? ["biaya tidak bisa dihitung"] : [], biayaMedianRp: all };
}

// ---------- Petugas Prinsip Ke Atas ----------
export function petugasKeAtas(b: BrokerBahan): NilaiPrinsip {
  const rincian = [
    `Legal di Indonesia: ${b.legal.nilai === null ? "…" : b.legal.nilai ? "ya" : "tidak"} (${b.legal.sumber})`,
    `Akun live tercatat: ${b.akunLiveAda.nilai === null ? "…" : b.akunLiveAda.nilai ? "ya" : "tidak"} (${b.akunLiveAda.sumber})`,
  ];
  if (b.legal.nilai !== true) return { nilai: 0, rincian, gugur: [b.legal.nilai === false ? "tidak terdaftar Bappebti" : "legalitas belum terverifikasi"] };
  return { nilai: b.akunLiveAda.nilai === true ? 100 : 50, rincian, gugur: [] };
}

// ---------- Petugas Prinsip Terbukti ----------
/** Spesifikasi inti demo vs live sama? null = tidak bisa dibandingkan (tidak ada akun live tercatat). */
export function demoSamaLive(demo: readonly LiveSpec[], live: readonly LiveSpec[]): { sama: boolean; beda: string[]; dibandingkan: number } {
  const liveBy = new Map(live.map((s) => [s.symbol, s]));
  const beda: string[] = [];
  let n = 0;
  for (const d of demo) {
    const l = liveBy.get(d.symbol);
    if (l === undefined) continue;
    n += 1;
    const f: string[] = [];
    if (d.contractSize !== l.contractSize) f.push("ukuran kontrak");
    if (d.tickSize !== l.tickSize) f.push("tick size");
    if (d.volumeMin !== l.volumeMin) f.push("lot minimum");
    if (d.volumeStep !== l.volumeStep) f.push("kelipatan lot");
    if (d.profitCurrency !== l.profitCurrency) f.push("mata uang profit");
    if (f.length > 0) beda.push(`${d.symbol}: ${f.join(", ")}`);
  }
  return { sama: n > 0 && beda.length === 0, beda, dibandingkan: n };
}

export function petugasTerbukti(b: BrokerBahan): NilaiPrinsip {
  const rincian: string[] = [];
  const gugur: string[] = [];
  let nilai = 0;
  if (b.akunDemoAda.nilai === true) {
    nilai += 40;
    rincian.push(`Akun demo ada (${b.akunDemoAda.sumber})`);
  } else {
    gugur.push("tidak ada akun demo");
    rincian.push("Akun demo: tidak ada");
  }
  if (b.specsDemo !== null && b.specsLive !== null) {
    const c = demoSamaLive(b.specsDemo.specs, b.specsLive.specs);
    if (c.sama) nilai += 30;
    rincian.push(c.sama ? `Demo = live (${c.dibandingkan} simbol dibandingkan)` : `Demo ≠ live di ${c.beda.length} simbol: ${c.beda.slice(0, 3).join("; ")}`);
  } else {
    rincian.push("Demo = live: … (tidak ada spesifikasi akun live untuk dibandingkan)");
  }
  const perGol = new Map<string, number>();
  for (const s of b.sejarah) {
    if (!dinilai(s.golongan)) continue;
    perGol.set(s.golongan, Math.max(perGol.get(s.golongan) ?? 0, s.hari));
  }
  const cukup = [...perGol.entries()].filter(([, h]) => h >= DATA_CUKUP_HARI);
  for (const [g, h] of perGol) rincian.push(`${g}: data terpanjang ${Math.round(h)} hari${h >= DATA_CUKUP_HARI ? "" : ` (kurang dari ${DATA_CUKUP_HARI})`}`);
  if (cukup.length === 0) gugur.push(`tidak ada golongan dengan data ≥ ${DATA_CUKUP_HARI} hari`);
  nilai += (30 * cukup.length) / GOLONGAN_DINILAI.length;
  return { nilai: Math.round(nilai), rincian, gugur };
}

// ---------- Kepala Cabang ----------
export interface HasilKepala {
  readonly kartu: readonly (KartuPenilaian & { readonly total: number | null; readonly gugur: readonly string[] })[];
  readonly terpilih: string | null;
  readonly formulir: RecommendationInput;
}

export function nilaiKartu(bahan: readonly BrokerBahan[]): KartuPenilaian[] {
  const raw = bahan.map((b) => ({
    broker: b.id,
    nama: b.nama,
    merangkak: petugasMerangkak(b),
    dariBawah: petugasDariBawah(b),
    keAtas: petugasKeAtas(b),
    terbukti: petugasTerbukti(b),
  }));
  // Dari Bawah relatif PER GOLONGAN: biaya termurah di golongan itu = 100; golongan yang tidak
  // dimiliki broker bernilai 0 (tidak bisa merangkak di sana). Nilai = rata-rata 6 golongan.
  const medOf = (b: BrokerBahan, g: string): number | null =>
    median(b.biayaRp.filter((c) => c.golongan === g && c.rp >= 0).map((c) => c.rp));
  const best = new Map(GOLONGAN_DINILAI.map((g) => [g, Math.min(...bahan.map((b) => medOf(b, g) ?? Infinity))]));
  return raw.map((k, i) => {
    const b = bahan[i] as BrokerBahan;
    const parts = GOLONGAN_DINILAI.map((g) => {
      const own = medOf(b, g);
      const top = best.get(g) ?? Infinity;
      return own === null || !Number.isFinite(top) ? 0 : (100 * top) / Math.max(own, top);
    });
    return { ...k, dariBawah: { ...k.dariBawah, nilai: k.dariBawah.biayaMedianRp === null ? null : Math.round(parts.reduce((s, v) => s + v, 0) / parts.length) } };
  });
}

export function kepalaCabang(bahan: readonly BrokerBahan[], tanggal: string): HasilKepala {
  const kartu = nilaiKartu(bahan).map((k) => {
    const gugur = [...k.merangkak.gugur, ...k.dariBawah.gugur, ...k.keAtas.gugur, ...k.terbukti.gugur];
    const parts = [k.merangkak.nilai, k.dariBawah.nilai, k.keAtas.nilai, k.terbukti.nilai];
    const total = parts.some((p) => p === null) ? null : Math.round(parts.reduce<number>((s, p) => s + (p ?? 0), 0) / 4);
    return { ...k, total, gugur };
  });
  const lolos = kartu
    .filter((k) => k.gugur.length === 0 && k.total !== null)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0) || (a.dariBawah.biayaMedianRp ?? Infinity) - (b.dariBawah.biayaMedianRp ?? Infinity));
  const pilih = lolos[0] ?? null;
  const fakta = kartu.map((k) => ({
    teks: `${k.nama}: ${k.gugur.length > 0 ? `GUGUR (${k.gugur.join("; ")})` : `nilai ${k.total}`} — Merangkak ${k.merangkak.nilai ?? "…"}, Dari Bawah ${k.dariBawah.nilai ?? "…"}, Ke Atas ${k.keAtas.nilai ?? "…"}, Terbukti ${k.terbukti.nilai ?? "…"}`,
    sumber: `Kartu Broker KC-1 ${tanggal}`,
  }));
  const batas = [
    "File *_H1_LONG.csv dibatasi 5.000 candle saat ekspor; panjang data diukur dari timeframe terpanjang yang tersedia per simbol.",
    "Setoran minimum OTB/MIFX/Exness belum diperiksa (…).",
    "Kesamaan demo vs live hanya bisa diperiksa untuk broker yang punya akun live tercatat.",
  ].join(" ");
  const formulir: RecommendationInput = pilih === null
    ? {
        judul: "Broker Terpilih: belum ada broker yang lolos syarat wajib",
        fakta,
        batasData: batas,
        usulan: "Tunda pemilihan broker; KC-2 diminta melengkapi data yang kurang (lihat alasan gugur).",
        risiko: "Pelatihan KC-3 belum bisa dimulai sampai ada broker terpilih.",
      }
    : {
        judul: `Broker Terpilih: ${pilih.nama}`,
        fakta,
        batasData: batas,
        usulan: `Tetapkan ${pilih.nama} sebagai broker pelatihan dan pengujian MDBKA memakai akun demo (nilai ${pilih.total}, paling dekat prinsip MDBKA).`,
        risiko: "Bila kondisi broker berubah (biaya, legalitas), penilaian diulang; tidak ada dana yang dipindah dan tidak ada order yang dikirim.",
      };
  return { kartu, terpilih: pilih?.broker ?? null, formulir };
}
