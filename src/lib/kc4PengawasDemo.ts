/**
 * KC-4 Pengawas Demo (17 Okt 2026) — serah-terima hasil trade akun DEMO ke Kantor Cabang (lampu 2).
 * MURNI. TIDAK menghitung lampu sendiri: status lampu 2 per golongan diambil dari lampRows()
 * (greenLamps.ts, syarat K-10: ≥20 rangkaian demo setara Live, rata-rata R>0, terburuk ≥−1,1R, tanpa
 * entry saat data ditahan). Tugas modul ini hanya (1) merekap trade demo yang sudah dicatat tim lama
 * (History MT5 + catatan entry) jadi rekap yang bisa dibaca KC-4 dan (2) menyusun Formulir R ke Pusat
 * bila lampu 2 sudah punya vonis (HIJAU/MERAH). Tidak mengirim order, tidak mengubah Buku Aturan.
 *
 * Aturan bukti (docs/SOP-2026-10-13-tim-mdbka.md aturan 8 & no. 17): hanya trade setara Live yang
 * menyalakan lampu 2; trade uji (komentar MDBKA-UJI) dan akun pembelajaran tetap DICATAT tapi ditandai
 * tidak dihitung.
 */
import type { RecommendationInput } from "./branchOffice";
import { lampRows, type LampCard, type LampState } from "./greenLamps";

/** Bentuk minimum trade tertutup (cocok dengan EvaluatedTrade server — struktural, tanpa impor server). */
export interface DemoTradeInput {
  readonly positionId: string;
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly volume: number;
  readonly openTime: string;
  readonly closeTime: string;
  readonly net: number;
  readonly exit: "TP" | "SL" | "MANUAL";
  readonly rMultiple: number | null;
  /** Status pemindai saat entry ("LOLOS", "UJI", ...). */
  readonly group: string;
  readonly durationMin: number | null;
}

export interface DemoDecision {
  readonly setaraLive: boolean | null;
  readonly jenisAkun: "demo" | "live" | "tidak-terbukti" | null;
}

export interface DemoAkunInput {
  readonly login: string;
  readonly label: string;
  readonly mataUang: string;
  readonly trades: readonly DemoTradeInput[];
}

export interface TradeDemoCatatan {
  readonly login: string;
  readonly positionId: string;
  readonly simbol: string;
  readonly arah: "BUY" | "SELL";
  readonly lot: number;
  readonly buka: string;
  readonly tutup: string;
  readonly keluar: "TP" | "SL" | "MANUAL";
  readonly net: number;
  readonly mataUang: string;
  readonly r: number | null;
  readonly kelompokEntry: string;
  readonly setaraLive: boolean | null;
}

export interface RingkasanTradeDemo {
  readonly n: number;
  readonly tp: number;
  readonly sl: number;
  readonly manual: number;
  readonly setaraLive: number;
  readonly tidakSetaraLive: number;
  /** Rata-rata R hanya dari trade yang R-nya diketahui (SL awal tercatat); null = tak satu pun. */
  readonly rataR: number | null;
  readonly nBerR: number;
  /** Trade akun broker ini yang BUKAN akun demo terbukti — tidak direkap (dilaporkan, bukan disembunyikan). */
  readonly dikecualikan: number;
}

export interface LampuDemoBaris {
  readonly group: string;
  readonly label: string;
  readonly state: LampState;
  readonly text: string;
}

export interface RangkaianDemo {
  readonly broker: string;
  readonly akun: readonly { readonly login: string; readonly label: string; readonly mataUang: string }[];
  readonly ringkasan: RingkasanTradeDemo;
  /** Terbaru dulu, dibatasi MAKS_TRADE_DICATAT. */
  readonly trades: readonly TradeDemoCatatan[];
  readonly lampu2: readonly LampuDemoBaris[];
}

export const MAKS_TRADE_DICATAT = 30;

function demoAtauTidak(label: string, d: DemoDecision | undefined): boolean {
  if (d !== undefined && d.jenisAkun !== null) return d.jenisAkun === "demo";
  // Tanpa catatan entry: hanya dianggap demo bila label akun jelas menyebut demo (bukan tebakan dari login).
  return /demo/i.test(label);
}

/** Rekap trade demo + status lampu 2 per golongan (dari lampRows, tanpa rapor backtest = lampu 1 tidak dinilai di sini). */
export function susunRangkaianDemo(i: {
  readonly broker: string;
  readonly akun: readonly DemoAkunInput[];
  readonly keputusan: ReadonlyMap<string, DemoDecision>;
  readonly lampCards: readonly LampCard[];
}): RangkaianDemo {
  const catatan: TradeDemoCatatan[] = [];
  const akunDemo = new Set<string>();
  let dikecualikan = 0;
  for (const a of i.akun) {
    for (const t of a.trades) {
      const d = i.keputusan.get(t.positionId);
      if (!demoAtauTidak(a.label, d)) {
        dikecualikan += 1;
        continue;
      }
      akunDemo.add(a.login);
      catatan.push({
        login: a.login,
        positionId: t.positionId,
        simbol: t.symbol,
        arah: t.side,
        lot: t.volume,
        buka: t.openTime,
        tutup: t.closeTime,
        keluar: t.exit,
        net: t.net,
        mataUang: a.mataUang,
        r: t.rMultiple,
        kelompokEntry: t.group,
        setaraLive: d?.setaraLive ?? null,
      });
    }
  }
  catatan.sort((x, y) => y.tutup.localeCompare(x.tutup));
  const rs = catatan.map((c) => c.r).filter((r): r is number => r !== null);
  const ringkasan: RingkasanTradeDemo = {
    n: catatan.length,
    tp: catatan.filter((c) => c.keluar === "TP").length,
    sl: catatan.filter((c) => c.keluar === "SL").length,
    manual: catatan.filter((c) => c.keluar === "MANUAL").length,
    setaraLive: catatan.filter((c) => c.setaraLive === true).length,
    tidakSetaraLive: catatan.filter((c) => c.setaraLive !== true).length,
    rataR: rs.length === 0 ? null : Math.round((rs.reduce((s, r) => s + r, 0) / rs.length) * 100) / 100,
    nBerR: rs.length,
    dikecualikan,
  };
  return {
    broker: i.broker,
    akun: i.akun.filter((a) => akunDemo.has(a.login)).map((a) => ({ login: a.login, label: a.label, mataUang: a.mataUang })),
    ringkasan,
    trades: catatan.slice(0, MAKS_TRADE_DICATAT),
    lampu2: lampRows(i.lampCards, []).map((r) => ({ group: r.group, label: r.label, state: r.lamp2.state, text: r.lamp2.text })),
  };
}

/** Formulir R untuk golongan yang lampu 2-nya sudah punya vonis (HIJAU/MERAH); BELUM → null (tidak ada yang diputuskan Pusat). */
export function formulirLampu2(broker: string, baris: LampuDemoBaris, tanggal: string): RecommendationInput | null {
  if (baris.state === "BELUM") return null;
  const hijau = baris.state === "HIJAU";
  return {
    judul: `Lampu 2 ${baris.label} (${broker}): ${baris.state}`,
    fakta: [
      { teks: baris.text, sumber: `Pengawas Demo KC-4 ${tanggal} (History MT5 + catatan entry akun demo)` },
      { teks: "Lampu 2 hanya menghitung rangkaian akun DEMO yang entry-nya setara Live; trade uji (MDBKA-UJI) dan bayangan tidak dihitung.", sumber: "docs/SOP-2026-10-13-tim-mdbka.md aturan 8" },
    ],
    batasData: "Hanya akun demo broker terpilih; rangkaian lengkap (kartu pola) dengan entry setara Live — bukan data historis KC-3.",
    usulan: hijau
      ? `Lampu 2 golongan ${baris.label} hijau. Naik ke PERCOBAAN_LIVE butuh lampu 1 hijau juga dan persetujuan Pusat (Buku Aturan); Pengawas Demo tidak mengubah status sendiri.`
      : `Lampu 2 golongan ${baris.label} merah — tinjau aturan/strategi golongan ini sebelum dilanjutkan; Pengawas Demo tidak mengubah status sendiri.`,
    risiko: "Tidak mengirim order dan tidak mengubah Buku Aturan; hanya melaporkan hasil trade demo yang sudah tercatat.",
  };
}
