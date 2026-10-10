/**
 * Batas risiko per golongan simbol (Mode Aman, penetapan Fahmi 8 Okt 2026).
 *
 * Masalah yang dijawab: lot minimum 0,01 punya "harga risiko" berbeda per
 * simbol (forex ±Rp12–31 rb, minyak ±Rp113–143 rb). Batas 1% equity saja
 * meloloskan semuanya di akun demo. Tiap golongan diberi batas Rupiah
 * sendiri; golongan "ditahan" (capIdr null) tidak boleh diperdagangkan.
 * Simbol tak dikenal = ditahan (fail-safe). MODUL MURNI (CJS-safe).
 */

export type RiskGroupId =
  | "FOREX"
  | "FOREX_JPY"
  | "FOREX_TIDAK_LAZIM"
  | "LOGAM"
  | "MINYAK"
  | "INDEKS"
  | "SAHAM_AS"
  | "SAHAM_LAIN"
  | "LAINNYA";

export interface RiskGroup {
  readonly id: RiskGroupId;
  /** Nama golongan untuk ditampilkan. */
  readonly label: string;
  /** Batas risiko per trade dalam Rupiah; null = golongan ditahan. */
  readonly capIdr: number | null;
}

/** Penetapan Fahmi (8 Okt 2026). Ubah angka di sini saja. */
export const RISK_GROUPS: Readonly<Record<RiskGroupId, RiskGroup>> = {
  FOREX: { id: "FOREX", label: "Forex", capIdr: 35_000 },
  FOREX_JPY: { id: "FOREX_JPY", label: "Forex JPY", capIdr: 35_000 },
  FOREX_TIDAK_LAZIM: { id: "FOREX_TIDAK_LAZIM", label: "Forex tidak lazim", capIdr: null },
  // 9 Okt 2026: Logam & Indeks Rp150 rb → Rp500 rb (penetapan Fahmi; lot 0,01 risikonya ±Rp325–442 rb).
  LOGAM: { id: "LOGAM", label: "Logam", capIdr: 500_000 },
  MINYAK: { id: "MINYAK", label: "Minyak", capIdr: 150_000 },
  INDEKS: { id: "INDEKS", label: "Indeks", capIdr: 500_000 },
  SAHAM_AS: { id: "SAHAM_AS", label: "Saham AS", capIdr: 50_000 },
  SAHAM_LAIN: { id: "SAHAM_LAIN", label: "Saham Eropa & Hong Kong", capIdr: null },
  LAINNYA: { id: "LAINNYA", label: "Belum digolongkan", capIdr: null },
};

const FOREX = new Set([
  "AUDCAD", "AUDCHF", "AUDNZD", "AUDUSD", "EURAUD", "EURCAD", "EURCHF",
  "EURGBP", "EURNZD", "EURUSD", "GBPAUD", "GBPCAD", "GBPCHF", "GBPNZD",
  "GBPUSD", "NZDCAD", "NZDCHF", "NZDUSD", "USDCAD", "USDCHF",
]);
const FOREX_JPY = new Set([
  "AUDJPY", "CADJPY", "CHFJPY", "EURJPY", "GBPJPY", "NZDJPY", "USDJPY",
]);
const FOREX_TIDAK_LAZIM = new Set(["USDEUR", "USDGBP", "USDHKD", "GBXUSD"]);
const LOGAM = new Set(["XAUUSD", "XAGUSD"]);
const MINYAK = new Set(["XTIUSD", "CLU", "CLS10", "OIL_NEXT"]);
const INDEKS = new Set(["US30", "US100", "US500", "DE30", "UK100", "HK50", "JP225"]);
const SAHAM_AS_FINEX = new Set([
  "#AAPL", "#AA", "#ADBE", "#AIG", "#AMGN", "#AXP", "#BA", "#BIDU", "#BLK",
  "#CAT", "#CME", "#GE", "#GOOGL", "#GS", "#HD", "#IBM", "#JNJ", "#JPM",
  "#MA", "#MAR", "#MCD", "#META", "#MMM", "#MSFT", "#NKE", "#NVDA", "#ORCL",
  "#RL",
]);

/** Saham "#" Eropa & Hong Kong yang dikenal (untuk tampilan daftar). */
const SAHAM_LAIN_DIKENAL = [
  "#ADS", "#ALV", "#BMW", "#SAP", "#VOW", "#BP", "#GSK", "#HSBA", "#VOD",
  "#168", "#388", "#700", "#763",
];

export interface RiskGroupRow {
  readonly group: RiskGroup;
  readonly symbols: readonly string[];
  readonly note: string;
}

/**
 * Daftar golongan → simbol untuk panel "Batas risiko per golongan"
 * (sumber sama dengan riskGroupOf, jadi tampilan = aturan yang dipakai).
 */
export function riskGroupTable(): RiskGroupRow[] {
  return [
    { group: RISK_GROUPS.FOREX, symbols: [...FOREX], note: "OTB: nama sama + akhiran _ORB; MIFX: + .m" },
    { group: RISK_GROUPS.FOREX_JPY, symbols: [...FOREX_JPY], note: "OTB: nama sama + akhiran _ORB; MIFX: + .m" },
    { group: RISK_GROUPS.LOGAM, symbols: [...LOGAM], note: "XAU = emas, XAG = perak; OTB + _ORB; MIFX: + .m" },
    { group: RISK_GROUPS.MINYAK, symbols: [...MINYAK], note: "MIFX: CLS10.m, OIL_NEXT" },
    { group: RISK_GROUPS.INDEKS, symbols: [...INDEKS], note: "OTB: US30/US100/US500 juga .DEC; MIFX: DJ.m=US30, NQ.m=US100, SP.m=US500, NK.m=JP225, HK.m=HK50" },
    { group: RISK_GROUPS.SAHAM_AS, symbols: [...SAHAM_AS_FINEX], note: "Finex (#); OTB: semua simbol berakhiran .US" },
    { group: RISK_GROUPS.FOREX_TIDAK_LAZIM, symbols: [...FOREX_TIDAK_LAZIM], note: "" },
    { group: RISK_GROUPS.SAHAM_LAIN, symbols: SAHAM_LAIN_DIKENAL, note: "Juga saham # lain yang belum terdaftar" },
    { group: RISK_GROUPS.LAINNYA, symbols: [], note: "Simbol yang belum ada di buku ini (mis. BTCUSD)" },
  ];
}

/**
 * M2b (10 Okt 2026): nama indeks MIFX → nama baku MDBKA (golongan Indeks,
 * mata uang berita, bursa asal). DJ = Dow Jones, NQ = Nasdaq, SP = S&P 500,
 * NK = Nikkei, HK = Hang Seng.
 */
const INDEX_ALIASES: Readonly<Record<string, string>> = {
  DJ: "US30", NQ: "US100", SP: "US500", NK: "JP225", HK: "HK50",
};

/** Buang akhiran broker: _ORB (OTB), .DEC (kontrak OTB), .m (MIFX); alias indeks MIFX. Huruf besar. */
export function baseRiskSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase().replace(/_ORB$/, "").replace(/\.DEC$/, "").replace(/\.M$/, "");
  return INDEX_ALIASES[s] ?? s;
}

/**
 * Batas golongan untuk mesin analisa (RiskCapInput). Kurs USD→Rp tidak
 * ada → usd null (ditahan; tanpa batas Rupiah tidak ada sinyal lolos).
 */
export function riskCapFor(
  symbol: string,
  usdIdr: number | null,
): { label: string; idr: number | null; usd: number | null; usdIdr: number | null } {
  const g = riskGroupOf(symbol);
  const kurs = usdIdr !== null && Number.isFinite(usdIdr) && usdIdr > 0 ? usdIdr : null;
  return {
    label: g.label,
    idr: g.capIdr,
    usd: g.capIdr === null || kurs === null ? null : g.capIdr / kurs,
    usdIdr: kurs,
  };
}

export function riskGroupOf(symbol: string): RiskGroup {
  const s = baseRiskSymbol(symbol);
  if (FOREX.has(s)) return RISK_GROUPS.FOREX;
  if (FOREX_JPY.has(s)) return RISK_GROUPS.FOREX_JPY;
  if (FOREX_TIDAK_LAZIM.has(s)) return RISK_GROUPS.FOREX_TIDAK_LAZIM;
  if (LOGAM.has(s)) return RISK_GROUPS.LOGAM;
  if (MINYAK.has(s)) return RISK_GROUPS.MINYAK;
  if (INDEKS.has(s)) return RISK_GROUPS.INDEKS;
  if (s.endsWith(".US") || SAHAM_AS_FINEX.has(s)) return RISK_GROUPS.SAHAM_AS;
  // Saham "#" lain (Eropa, Hong Kong, atau yang belum dikenal) = ditahan.
  if (s.startsWith("#")) return RISK_GROUPS.SAHAM_LAIN;
  return RISK_GROUPS.LAINNYA;
}
