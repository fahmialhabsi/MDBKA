/**
 * Langkah 4c-2 (Mode Aman, 8 Okt 2026) — helper tampilan panel "Evaluasi trade".
 *
 * Tipe di sini mencerminkan respons GET /api/evaluation
 * (server/services/tradeEvaluation.ts + server/routes/evaluationRoutes.ts).
 * Prinsip: hasil disebut "terbukti" hanya bila sampel cukup (n ≥ 20) —
 * sebelum itu angka ditampilkan apa adanya tanpa klaim.
 */
import { priceDigits } from "./tickSize";

export interface EvalTradeStats {
  readonly n: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number | null;
  readonly net: number;
  readonly avgWin: number | null;
  readonly avgLoss: number | null;
  readonly expectancy: number | null;
  readonly avgR: number | null;
  readonly rCount: number;
}

export interface EvalTrade {
  readonly positionId: string;
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly volume: number;
  readonly openTime: string;
  readonly closeTime: string;
  readonly net: number;
  /** Langkah 5e (opsional: server lama tidak mengirim). */
  readonly openPrice?: number;
  readonly closePrice?: number;
  readonly grossProfit?: number;
  readonly durationMin: number | null;
  readonly exit: "TP" | "SL" | "MANUAL";
  readonly rMultiple: number | null;
  readonly group: string;
}

export interface EvalAccount {
  readonly login: string;
  readonly label: string;
  readonly company: string;
  readonly broker: string | null;
  readonly evaluation: {
    readonly trades: readonly EvalTrade[];
    readonly overall: EvalTradeStats;
    readonly byGroup: Readonly<Record<string, EvalTradeStats>>;
    readonly bySymbol: Readonly<Record<string, EvalTradeStats>>;
    readonly openPositions: number;
  };
  /** Langkah 5c: MFE/MAE per positionId (opsional: server lama tidak mengirim). */
  readonly excursions?: Readonly<Record<string, EvalExcursion>>;
}

/** Cermin TradeExcursion (server/services/tradeExcursion.ts). */
export interface EvalExcursion {
  readonly coverage: "PENUH" | "PARSIAL" | "TANPA_DATA";
  readonly ticks: number;
  readonly mfe: number | null;
  readonly mae: number | null;
  readonly mfeR: number | null;
  readonly maeR: number | null;
}

export const MIN_PROVEN_TRADES = 20;

export const LEGACY_GROUPS: readonly string[] = ["TANPA_CATATAN", "SEBELUM_PENCATATAN"];

const GROUP_LABELS: Readonly<Record<string, string>> = {
  TANPA_CATATAN: "Sebelum Mode Aman (tanpa catatan)",
  SEBELUM_PENCATATAN: "Sudah terbuka saat pencatatan dimulai",
  LOLOS: "Mode Aman: lolos",
  DITAHAN_BIAYA: "Entry saat ditahan biaya",
  DITAHAN_RISIKO: "Entry saat ditahan risiko",
  DITAHAN_KORELASI: "Entry saat taruhan ganda",
  DITAHAN_JEDA: "Entry saat jeda rugi beruntun",
  DITAHAN_BERITA: "Entry dekat berita Tinggi (±30 menit)",
  DITAHAN_SESI: "Entry jelang pasar tutup / saham jelang libur",
  TUNGGU: "Entry saat sinyal TUNGGU",
  PASAR_TUTUP: "Entry saat data pasar basi",
  DATA: "Entry tanpa data cukup",
};

export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}

export function isLegacyGroup(group: string): boolean {
  return LEGACY_GROUPS.includes(group);
}

/** Urutan tampil: grup Mode Aman dulu (LOLOS paling atas), trade lama terakhir. */
export function sortGroups(groups: readonly string[]): string[] {
  const order = Object.keys(GROUP_LABELS);
  const rank = (g: string): number => {
    if (isLegacyGroup(g)) return 100 + LEGACY_GROUPS.indexOf(g);
    const i = order.indexOf(g);
    return i === -1 ? 50 : i;
  };
  return [...groups].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export type ProofStatus = "BELUM_CUKUP" | "TERBUKTI_POSITIF" | "TERBUKTI_NEGATIF";

export function proofStatus(stats: EvalTradeStats): ProofStatus {
  if (stats.n < MIN_PROVEN_TRADES || stats.expectancy === null) return "BELUM_CUKUP";
  return stats.expectancy > 0 ? "TERBUKTI_POSITIF" : "TERBUKTI_NEGATIF";
}

export function proofLabel(stats: EvalTradeStats): string {
  switch (proofStatus(stats)) {
    case "TERBUKTI_POSITIF":
      return "Terbukti untung (n ≥ 20)";
    case "TERBUKTI_NEGATIF":
      return "Terbukti rugi (n ≥ 20)";
    default:
      return `Belum cukup data (${stats.n}/${MIN_PROVEN_TRADES})`;
  }
}

const numberId = (v: number, digits: number): string =>
  v.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** −183.18 → "−$183,18" */
export function formatUsd(v: number | null): string {
  if (v === null) return "-";
  const sign = v < 0 ? "−" : v > 0 ? "+" : "";
  return `${sign}$${numberId(Math.abs(v), 2)}`;
}

/** USD → "−Rp3.271.000" (dibulatkan ke ribuan); null bila kurs belum ada. */
export function formatRupiah(usd: number | null, kurs: number | null): string | null {
  if (usd === null || kurs === null || !Number.isFinite(kurs) || kurs <= 0) return null;
  const idr = Math.round((usd * kurs) / 1000) * 1000;
  const sign = idr < 0 ? "−" : idr > 0 ? "+" : "";
  return `${sign}Rp${numberId(Math.abs(idr), 0)}`;
}

/** 0.2667 → "26,7%" */
export function formatWinRate(rate: number | null): string {
  return rate === null ? "-" : `${numberId(rate * 100, 1)}%`;
}

/** Menit → "45 mnt" / "3,2 jam" / "2,1 hari". */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "-";
  if (minutes < 60) return `${minutes} mnt`;
  if (minutes < 48 * 60) return `${numberId(minutes / 60, 1)} jam`;
  return `${numberId(minutes / 1440, 1)} hari`;
}

/**
 * Langkah 4d — gabungkan statistik satu kelompok (mis. "LOLOS") dari semua
 * akun satu broker (demo + live). Null bila broker belum punya trade itu.
 */
export function mergeGroupStats(
  accounts: readonly EvalAccount[],
  broker: string,
  group: string,
): EvalTradeStats | null {
  const list = accounts
    .filter((a) => a.broker === broker)
    .map((a) => a.evaluation.byGroup[group])
    .filter((x): x is EvalTradeStats => x !== undefined);
  if (list.length === 0) return null;
  const n = list.reduce((s, x) => s + x.n, 0);
  const wins = list.reduce((s, x) => s + x.wins, 0);
  const net = Math.round(list.reduce((s, x) => s + x.net, 0) * 100) / 100;
  return {
    n,
    wins,
    losses: n - wins,
    winRate: n > 0 ? wins / n : null,
    net,
    avgWin: null,
    avgLoss: null,
    expectancy: n > 0 ? Math.round((net / n) * 100) / 100 : null,
    avgR: null,
    rCount: 0,
  };
}

/** Label status LOLOS di pemindai: klaim "terbukti" hanya bila n ≥ 20. */
export function lolosLabel(stats: EvalTradeStats | null): string {
  const n = stats?.n ?? 0;
  if (stats === null || proofStatus(stats) === "BELUM_CUKUP") {
    return `Lolos · belum terbukti (${n}/${MIN_PROVEN_TRADES})`;
  }
  const wr = formatWinRate(stats.winRate);
  return proofStatus(stats) === "TERBUKTI_POSITIF"
    ? `Lolos · win rate ${wr} (n=${n})`
    : `Lolos · terbukti rugi, win rate ${wr} (n=${n})`;
}

/**
 * Langkah 5d — isi sel "Untung terbaik" (MFE) / "Rugi terdalam" (MAE).
 * Dalam R bila SL awal diketahui, selain itu selisih harga (desimal simbol).
 * PARSIAL diberi tanda "≈"; TANPA_DATA "–"; belum tercatat "…".
 */
export interface ExcursionCell {
  readonly text: string;
  readonly title: string;
  readonly tone: "untung" | "rugi" | "netral";
}

/**
 * Langkah 5e — USD per 1,00 gerak harga, dari angka asli broker:
 * profit kotor ÷ gerak harga trade (searah posisi). Null bila tidak bisa
 * (data lama, atau ditutup tepat di harga entry → gerak 0).
 */
export function usdPerPriceUnit(t: EvalTrade): number | null {
  if (t.openPrice === undefined || t.closePrice === undefined || t.grossProfit === undefined) {
    return null;
  }
  const move = t.side === "BUY" ? t.closePrice - t.openPrice : t.openPrice - t.closePrice;
  if (!Number.isFinite(move) || Math.abs(move) < 1e-9) return null;
  const perUnit = t.grossProfit / move;
  return Number.isFinite(perUnit) && perUnit > 0 ? perUnit : null;
}

export function excursionCell(
  e: EvalExcursion | undefined,
  symbol: string,
  which: "mfe" | "mae",
  usdPerUnit: number | null = null,
  kurs: number | null = null,
): ExcursionCell {
  if (e === undefined) {
    return { text: "…", title: "Sedang dihitung (paling lambat 10 menit)", tone: "netral" };
  }
  const value = which === "mfe" ? e.mfe : e.mae;
  const r = which === "mfe" ? e.mfeR : e.maeR;
  if (e.coverage === "TANPA_DATA" || value === null) {
    return { text: "–", title: "Tanpa rekaman harga (arsip tick mulai 5 Okt 2026)", tone: "netral" };
  }
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const rText = r !== null ? `${sign}${numberId(Math.abs(r), 2)}R` : null;
  const priceText = `${sign}${numberId(Math.abs(value), priceDigits(symbol))}`;
  const usd = usdPerUnit !== null ? value * usdPerUnit : null;
  const rupiah = formatRupiah(usd, kurs);
  const body = rupiah ?? rText ?? priceText;
  const partial = e.coverage === "PARSIAL";
  return {
    text: partial ? `≈${body}` : body,
    title:
      (which === "mfe" ? "Untung terbaik yang sempat tersedia" : "Rugi terdalam yang sempat dialami") +
      (rupiah !== null
        ? ` ≈ ${formatUsd(Math.round((usd ?? 0) * 100) / 100)} (perkiraan, kurs hari ini) · ${rText ?? priceText}`
        : r !== null
          ? " (dalam R = kelipatan risiko SL)"
          : " (selisih harga)") +
      (partial ? ` · rekaman sebagian (${e.ticks} harga)` : ` · rekaman lengkap (${e.ticks} harga)`),
    tone: value > 0 ? "untung" : value < 0 ? "rugi" : "netral",
  };
}
