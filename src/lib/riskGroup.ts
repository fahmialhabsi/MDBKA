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
  LOGAM: { id: "LOGAM", label: "Logam", capIdr: 150_000 },
  MINYAK: { id: "MINYAK", label: "Minyak", capIdr: 150_000 },
  INDEKS: { id: "INDEKS", label: "Indeks", capIdr: 150_000 },
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
const MINYAK = new Set(["XTIUSD", "CLU"]);
const INDEKS = new Set(["US30", "US100", "US500", "DE30", "UK100", "HK50", "JP225"]);
const SAHAM_AS_FINEX = new Set([
  "#AAPL", "#AA", "#ADBE", "#AIG", "#AMGN", "#AXP", "#BA", "#BIDU", "#BLK",
  "#CAT", "#CME", "#GE", "#GOOGL", "#GS", "#HD", "#IBM", "#JNJ", "#JPM",
  "#MA", "#MAR", "#MCD", "#META", "#MMM", "#MSFT", "#NKE", "#NVDA", "#ORCL",
  "#RL",
]);

/** Buang akhiran broker: _ORB (OTB), .DEC (kontrak OTB). Huruf besar. */
export function baseRiskSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/_ORB$/, "").replace(/\.DEC$/, "");
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
