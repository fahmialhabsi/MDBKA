/**
 * KC-2 "Jembatan MT5" (16 Okt 2026) — daftar data + kesehatan file untuk broker terpilih KC-1. MURNI.
 * Hanya MENILAI file yang sudah diekspor MT5; tidak mengubah EA, skrip, atau .env; tidak mengirim order.
 * Hasil: map DAFTAR_DATA, map KATALOG_FUNGSI, dan satu Formulir R berisi langkah perbaikan bila ada masalah.
 */
import type { RecommendationInput } from "./branchOffice";
import { DATA_CUKUP_HARI } from "./kc1Assessment";

export const TIMEFRAMES = ["H4", "H1", "M15", "M5", "M1"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

/** Jeda lebih dari ini (di luar akhir pekan) dihitung sebagai lubang data. */
export const LUBANG_JAM = 24;
/** Batas umur file sebelum dianggap basi. */
export const UMUR_MAKS = { marginHari: 7, specsHari: 7, candleOtomatisJam: 3 } as const;
/** Candle H1 per tahun ±6.240 (24 jam × 5 hari × 52 minggu); usulan ekspor ±2 tahun. */
export const H1_USULAN_CANDLE = 13_000;

export interface FileData {
  readonly simbol: string;
  readonly golongan: string;
  readonly timeframe: Timeframe;
  readonly dari: string | null;
  readonly sampai: string | null;
  readonly jumlahCandle: number;
  readonly lubang: number;
  readonly hari: number | null;
}

/** "2026.10.15 06:00" → ms UTC (jam server apa adanya). */
export function candleMs(text: string): number | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2})/.exec(text.trim());
  return m === null ? null : Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

const DAY = 86_400_000;

/** Jeda melewati hari Sabtu dan tidak lebih dari 3 hari = akhir pekan (bukan lubang). */
function isWeekendGap(a: number, b: number): boolean {
  if (b - a > 3 * DAY) return false;
  for (let t = a; t <= b; t += 3_600_000) if (new Date(t).getUTCDay() === 6) return true;
  return false;
}

/** Hitung isi satu file candle MT5 (kolom pertama = waktu). */
export function scanCandles(csv: string, simbol: string, golongan: string, timeframe: Timeframe): FileData {
  const times: number[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const t = candleMs(line);
    if (t !== null) times.push(t);
  }
  let lubang = 0;
  for (let i = 1; i < times.length; i += 1) {
    const a = times[i - 1] as number;
    const b = times[i] as number;
    if (b - a > LUBANG_JAM * 3_600_000 && !isWeekendGap(a, b)) lubang += 1;
  }
  const first = times[0];
  const last = times[times.length - 1];
  const iso = (t: number | undefined): string | null => (t === undefined ? null : new Date(t).toISOString().slice(0, 16).replace("T", " "));
  return {
    simbol, golongan, timeframe,
    dari: iso(first), sampai: iso(last),
    jumlahCandle: times.length, lubang,
    hari: first === undefined || last === undefined ? null : (last - first) / DAY,
  };
}

export interface KesehatanInput {
  readonly broker: string;
  readonly brokerNama: string;
  readonly marginUmurHari: number | null;
  readonly specsDemoUmurHari: number | null;
  /** Umur file candle otomatis H1 (MDBKA_<simbol>_H1.csv) terbaru, jam. */
  readonly candleOtomatisUmurJam: number | null;
  /** Akhir pekan: pasar tutup, candle otomatis wajar berhenti. */
  readonly akhirPekan: boolean;
}

export interface Masalah {
  readonly kode: "H1_PENDEK" | "LUBANG" | "MARGIN_BASI" | "SPECS_BASI" | "CANDLE_OTOMATIS_BERHENTI" | "FILE_TIDAK_ADA";
  readonly teks: string;
  readonly langkah: string;
}

export interface RingkasanTf {
  readonly timeframe: Timeframe;
  readonly simbol: number;
  readonly hariMedian: number | null;
  readonly lubang: number;
}

const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

export function ringkas(files: readonly FileData[]): RingkasanTf[] {
  return TIMEFRAMES.map((tf) => {
    const xs = files.filter((f) => f.timeframe === tf);
    return { timeframe: tf, simbol: xs.length, hariMedian: median(xs.flatMap((f) => (f.hari === null ? [] : [f.hari]))), lubang: xs.reduce((s, f) => s + f.lubang, 0) };
  });
}

export function periksaMasalah(files: readonly FileData[], k: KesehatanInput): Masalah[] {
  const out: Masalah[] = [];
  const forexH1 = files.filter((f) => f.timeframe === "H1" && (f.golongan === "FOREX" || f.golongan === "FOREX_JPY"));
  const pendek = forexH1.filter((f) => (f.hari ?? 0) < DATA_CUKUP_HARI);
  if (forexH1.length === 0) {
    out.push({ kode: "FILE_TIDAK_ADA", teks: "File H1_LONG Forex tidak ditemukan", langkah: `Jalankan skrip ExportLongH1MDBKA di terminal ${k.brokerNama}: InpPeriod=H1, InpCandleCount=${H1_USULAN_CANDLE}, InpSymbols kosong.` });
  } else if (pendek.length > 0) {
    const med = median(pendek.flatMap((f) => (f.hari === null ? [] : [f.hari])));
    out.push({
      kode: "H1_PENDEK",
      teks: `${pendek.length} dari ${forexH1.length} file H1 Forex kurang dari ${DATA_CUKUP_HARI} hari (median ${med === null ? "…" : Math.round(med)} hari)`,
      langkah: `Di terminal ${k.brokerNama}: Tools → Options → Charts → "Max bars in chart" = Unlimited, restart MT5, lalu jalankan ExportLongH1MDBKA dengan InpPeriod=H1, InpCandleCount=${H1_USULAN_CANDLE} (±2 tahun), InpSymbols kosong.`,
    });
  }
  const berlubang = files.filter((f) => f.lubang > 0);
  if (berlubang.length > 0) {
    const top = [...berlubang].sort((a, b) => b.lubang - a.lubang).slice(0, 3).map((f) => `${f.simbol} ${f.timeframe} (${f.lubang})`);
    out.push({ kode: "LUBANG", teks: `${berlubang.length} file punya jeda > ${LUBANG_JAM} jam di luar akhir pekan; terbanyak: ${top.join(", ")}`, langkah: "Catat saja: jeda bisa karena hari libur bursa. KC-3 wajib melewati jeda ini saat menghitung (tidak diisi tebakan)." });
  }
  if (k.marginUmurHari === null || k.marginUmurHari > UMUR_MAKS.marginHari) {
    out.push({ kode: "MARGIN_BASI", teks: k.marginUmurHari === null ? "File Margin tidak ada" : `File Margin berumur ${Math.round(k.marginUmurHari)} hari`, langkah: `Jalankan skrip ExportMarginMDBKA di terminal ${k.brokerNama} (spread terbaru untuk hitungan biaya).` });
  }
  if (k.specsDemoUmurHari === null || k.specsDemoUmurHari > UMUR_MAKS.specsHari) {
    out.push({ kode: "SPECS_BASI", teks: k.specsDemoUmurHari === null ? "File Specs akun demo tidak ada" : `File Specs akun demo berumur ${Math.round(k.specsDemoUmurHari)} hari`, langkah: `Login akun demo ${k.brokerNama} di MT5 sebentar agar MDBKACalendarService menulis MDBKA_Specs_<login>.csv.` });
  }
  if (!k.akhirPekan && (k.candleOtomatisUmurJam === null || k.candleOtomatisUmurJam > UMUR_MAKS.candleOtomatisJam)) {
    out.push({ kode: "CANDLE_OTOMATIS_BERHENTI", teks: k.candleOtomatisUmurJam === null ? "Candle otomatis H1 tidak ditemukan" : `Candle otomatis H1 terakhir diperbarui ${Math.round(k.candleOtomatisUmurJam)} jam lalu`, langkah: `Periksa MT5 ${k.brokerNama} menyala dan Service AutoExportMDBKAService berjalan (Navigator → Services).` });
  }
  return out;
}

export function formulirKc2(k: KesehatanInput, masalah: readonly Masalah[], ringkasan: readonly RingkasanTf[], tanggal: string): RecommendationInput | null {
  if (masalah.length === 0) return null;
  return {
    judul: `Perbaikan data MT5 ${k.brokerNama} (${masalah.length} temuan)`,
    fakta: [
      ...masalah.map((m) => ({ teks: m.teks, sumber: `Daftar Data KC-2 ${tanggal}` })),
      ...ringkasan.filter((r) => r.simbol > 0).map((r) => ({ teks: `${r.timeframe}: ${r.simbol} simbol, rentang median ${r.hariMedian === null ? "…" : Math.round(r.hariMedian)} hari, ${r.lubang} lubang`, sumber: "file *_LONG.csv Common Files" })),
    ],
    batasData: "Hanya file yang sudah diekspor MT5 ke Common Files yang dinilai; jeda karena libur bursa ikut terhitung sebagai lubang.",
    usulan: `Lakukan langkah berikut di MT5 ${k.brokerNama}: ${masalah.map((m, i) => `(${i + 1}) ${m.langkah}`).join(" ")}`,
    risiko: "Hanya mengekspor ulang/menyegarkan data; tidak mengubah aturan trading, tidak memindah dana, tidak mengirim order.",
  };
}

// ---------- Katalog fungsi MT5 ----------

export interface FungsiKatalog {
  readonly nama: string;
  readonly fungsiMql5: string;
  readonly status: "SUDAH_DIPAKAI" | "TERSEDIA_BELUM_DIPAKAI" | "PERLU_IZIN";
  readonly dipakaiOleh: string;
  readonly catatan: string;
}

/** Katalog tetap (diperiksa terhadap EA/skrip MDBKA 16 Okt 2026). */
export const KATALOG_FUNGSI: readonly FungsiKatalog[] = [
  { nama: "Candle sejarah", fungsiMql5: "CopyRates", status: "SUDAH_DIPAKAI", dipakaiOleh: "ExportLongH1MDBKA, AutoExportMDBKAService", catatan: "H4/H1/M15/M5/M1 + spread per candle (M5/M1)" },
  { nama: "Harga live bid/ask", fungsiMql5: "SymbolInfoTick", status: "SUDAH_DIPAKAI", dipakaiOleh: "EA MDBKAMultiLive", catatan: "quotes.csv" },
  { nama: "Spesifikasi simbol", fungsiMql5: "SymbolInfoDouble/Integer", status: "SUDAH_DIPAKAI", dipakaiOleh: "MDBKACalendarService (MDBKA_Specs_<login>.csv), ExportMarginMDBKA", catatan: "lot minimum, ukuran kontrak, swap" },
  { nama: "Riwayat transaksi", fungsiMql5: "HistorySelect/HistoryDealGet*", status: "SUDAH_DIPAKAI", dipakaiOleh: "ekspor History MDBKA (Jurnal Pajak, lampu 2)", catatan: "" },
  { nama: "Tick volume", fungsiMql5: "CopyRates (tick_volume)", status: "SUDAH_DIPAKAI", dipakaiOleh: "kolom tick_volume di file candle", catatan: "bahan bakar KC-3 yang belum ditambang" },
  { nama: "Kalender berita (masa depan)", fungsiMql5: "CalendarValueHistory", status: "SUDAH_DIPAKAI", dipakaiOleh: "MDBKACalendarService (Satpam Kalender)", catatan: "hanya jadwal dekat, belum arsip panjang" },
  { nama: "Kalender berita historis (arsip)", fungsiMql5: "CalendarValueHistory (rentang tahunan)", status: "TERSEDIA_BELUM_DIPAKAI", dipakaiOleh: "—", catatan: "dibutuhkan KC-3 untuk menguji bahan 'berita'; perlu skrip ekspor baru (izin Pusat)" },
  { nama: "Tick sejarah (bid/ask per tick)", fungsiMql5: "CopyTicksRange", status: "TERSEDIA_BELUM_DIPAKAI", dipakaiOleh: "—", catatan: "untuk menguji spread nyata per jam; file besar" },
  { nama: "Akses dari Python", fungsiMql5: "paket Python MetaTrader5", status: "PERLU_IZIN", dipakaiOleh: "—", catatan: "usulan API-1; membaca terminal lokal, tanpa API broker" },
];
