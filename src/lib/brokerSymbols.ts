import {
  SUPPORTED_SYMBOLS,
  normalizeSymbol,
} from "./instrumentConfig";
import { ORBITRADER_BROKER_ID } from "./brokerRegistry";
import { getOtbInstrumentProfile } from "./otbInstrumentConfig";
import type { BrokerId } from "../types/broker";
import { getMifxSpec } from "./mifxSpecs";

/**
 * Tahap 4C/5A — daftar simbol & kanonikalisasi per broker (UI/wiring only).
 * - Finex (default): SUPPORTED_SYMBOLS, perilaku lama byte-identik.
 * - OTB: OTB_ALL_SYMBOLS untuk dropdown; hanya simbol berpreset lengkap
 *   yang dianggap terverifikasi. Simbol OTB dicocokkan EXACT; suffiks
 *   seperti _ORB signifikan.
 */

/** Daftar simbol OTB dari broker (68/68 verified sejak 6I). */
// Tahap 6I (06 Okt 2026): 68/68 simbol dari bulk export
// SymbolSpecs_OTB_1791247136.csv (semua terverifikasi, pola 6E/6H).
export const OTB_ALL_SYMBOLS = [
  "AUDCAD_ORB",
  "AUDCHF_ORB",
  "AUDJPY_ORB",
  "AUDNZD_ORB",
  "AUDUSD_ORB",
  "CADJPY_ORB",
  "CHFJPY_ORB",
  "EURAUD_ORB",
  "EURCAD_ORB",
  "EURCHF_ORB",
  "GBPAUD_ORB",
  "GBPUSD_ORB",
  "NZDJPY_ORB",
  "USDCAD_ORB",
  "USDCHF_ORB",
  "USDJPY_ORB",
  "EURGBP_ORB",
  "EURJPY_ORB",
  "EURNZD_ORB",
  "EURUSD_ORB",
  "GBPCAD_ORB",
  "GBPJPY_ORB",
  "GBPNZD_ORB",
  "NZDUSD_ORB",
  "XAGUSD_ORB",
  "XAUUSD_ORB",
  "CLU",
  "US100.DEC",
  "US30.DEC",
  "US500.DEC",
  "AAPL.US",
  "AIG.US",
  "AMAZON.US",
  "AMZN.US",
  "APPLE.US",
  "AXP.US",
  "BA.US",
  "BABA.US",
  "BAC.US",
  "BOA.US",
  "CITI.US",
  "CSCO.US",
  "CVX.US",
  "DISNEY.US",
  "EBAY.US",
  "FB.US",
  "GE.US",
  "GOOG.US",
  "GS.US",
  "HPQ.US",
  "IBM.US",
  "INTC.US",
  "JNJ.US",
  "JPM.US",
  "KO.US",
  "MA.US",
  "MCD.US",
  "META.US",
  "MSFT.US",
  "NVDA.US",
  "ORCL.US",
  "PFE.US",
  "PG.US",
  "SBUX.US",
  "T.US",
  "V.US",
  "WMT.US",
  "XOM.US",
] as const;

/**
 * Simbol OTB yang presetnya terverifikasi dari Specification broker.
 * GBPUSD_ORB (spec awal) + 10 simbol Tahap 6E-1..6E-10 + AUDCAD_ORB dan
 * EURCHF_ORB (Tahap 6E-11/12, dikonfirmasi ekspor CSV terminal OTB
 * 03 Okt 2026 kolom baru: Stops_Level=20, Volume_Step=0.10,
 * Initial/Maintenance/Hedged = 100000/100000/50000, Forex,
 * Profit=quote, Margin=USD, Commission 33.00) = 13/13 terverifikasi.
 * Tahap 6H: + NZDJPY_ORB, USDCHF_ORB, USDJPY_ORB (preset baru dari CSV) =
 * 16/16 terverifikasi.
 * spreadMode floating = default kelas (tidak ada di ekspor CSV).
 * Komisi 33/lot dipertahankan (kolom Commission CSV 33.00 cocok).
 */
export const VERIFIED_OTB_SYMBOLS: readonly string[] = Object.freeze([
  "GBPUSD_ORB",
  "AUDCHF_ORB",
  "AUDJPY_ORB",
  "AUDNZD_ORB",
  "AUDUSD_ORB",
  "CADJPY_ORB",
  "CHFJPY_ORB",
  "EURAUD_ORB",
  "EURCAD_ORB",
  "GBPAUD_ORB",
  "USDCAD_ORB",
  "AUDCAD_ORB",
  "EURCHF_ORB",
  "NZDJPY_ORB",
  "USDCHF_ORB",
  "USDJPY_ORB",
  "EURGBP_ORB",
  "EURJPY_ORB",
  "EURNZD_ORB",
  "EURUSD_ORB",
  "GBPCAD_ORB",
  "GBPJPY_ORB",
  "GBPNZD_ORB",
  "NZDUSD_ORB",
  "XAGUSD_ORB",
  "XAUUSD_ORB",
  "CLU",
  "US100.DEC",
  "US30.DEC",
  "US500.DEC",
  "AAPL.US",
  "AIG.US",
  "AMAZON.US",
  "AMZN.US",
  "APPLE.US",
  "AXP.US",
  "BA.US",
  "BABA.US",
  "BAC.US",
  "BOA.US",
  "CITI.US",
  "CSCO.US",
  "CVX.US",
  "DISNEY.US",
  "EBAY.US",
  "FB.US",
  "GE.US",
  "GOOG.US",
  "GS.US",
  "HPQ.US",
  "IBM.US",
  "INTC.US",
  "JNJ.US",
  "JPM.US",
  "KO.US",
  "MA.US",
  "MCD.US",
  "META.US",
  "MSFT.US",
  "NVDA.US",
  "ORCL.US",
  "PFE.US",
  "PG.US",
  "SBUX.US",
  "T.US",
  "V.US",
  "WMT.US",
  "XOM.US",
]);

/** True bila simbol OTB terverifikasi (exact, case-sensitive). */
export function isOtbSymbolVerified(symbol: string): boolean {
  return (VERIFIED_OTB_SYMBOLS as readonly string[]).includes(symbol);
}

/**
 * True bila preset OTB boleh dipakai tanpa warning: objek preset ada,
 * field dasar valid, DAN simbol terverifikasi. Objek preset yang ada di
 * kode untuk simbol pending adalah fixture/data-layer (untuk kalkulasi
 * murni seperti swap), bukan dasar auto-fill atau klaim terverifikasi.
 */
function isCompleteOtbPreset(symbol: string): boolean {
  const preset = getOtbInstrumentProfile(symbol);
  return (
    preset !== null &&
    // digits 0 valid (indeks tanpa desimal seperti HK50/JP225).
    Number.isFinite(preset.digits) &&
    preset.digits >= 0 &&
    preset.contractSize > 0 &&
    isOtbSymbolVerified(symbol)
  );
}

/**
 * Daftar simbol untuk dropdown mengikuti broker aktif.
 * Finex/default: SUPPORTED_SYMBOLS. OTB: seluruh daftar broker
 * (termasuk preset-TBD; kelengkapan dicek via hasOtbPresetForSymbol).
 */
export function getAvailableSymbols(brokerId?: BrokerId): string[] {
  if (brokerId === ORBITRADER_BROKER_ID) {
    return [...OTB_ALL_SYMBOLS];
  }

  return [...SUPPORTED_SYMBOLS];
}

/**
 * True bila tidak ada warning verifikasi untuk (simbol, broker):
 * Finex selalu true; OTB true hanya bila preset lengkap.
 */
export function hasOtbPresetForSymbol(
  symbol: string,
  brokerId?: BrokerId
): boolean {
  if (brokerId !== ORBITRADER_BROKER_ID) return true;

  return isCompleteOtbPreset(symbol);
}

/**
 * Kanonikalisasi simbol sesuai broker:
 * - OTB: trimmed + uppercase EXACT (tanpa normalizeSymbol agar _ORB
 *   tidak terpangkas menjadi nama Finex).
 * - Finex: nama terdaftar dikembalikan persis (simbol bertitik seperti
 *   "GOOG.US" dan bertanda seperti "#AAPL" tidak boleh dinormalisasi
 *   menjadi kosong); selain itu: normalizeSymbol lama (alias, suffix
 *   broker, label).
 */
export function canonicalSymbolForBroker(
  symbol: string,
  brokerId?: BrokerId
): string {
  if (brokerId === ORBITRADER_BROKER_ID) {
    return symbol.trim().toUpperCase();
  }
  // M4a: MIFX — nama persis Specification ("EURUSD.m"), JANGAN dinormalisasi
  // ke nama Finex ("EURUSD"); simbol tak dikenal MIFX = "" (Simbol tidak dikenal).
  if (brokerId === "mifx") {
    return getMifxSpec(symbol)?.symbol ?? "";
  }

  const raw = symbol.trim().toUpperCase();
  if ((SUPPORTED_SYMBOLS as readonly string[]).includes(raw)) {
    return raw;
  }

  return normalizeSymbol(symbol);
}

/**
 * Nama simbol OTB kanonis bila terdaftar di daftar broker
 * (case-insensitive, whitespace-tolerant), atau null.
 * Dipakai agar suffix _ORB tidak dinormalisasi menjadi nama Finex
 * pada jalur identitas simbol (BUKAN untuk skala/harga).
 */
export function exactOtbSymbol(symbol: string): string | null {
  const canonical = symbol.trim().toUpperCase();

  if (canonical === "") return null;

  return (OTB_ALL_SYMBOLS as readonly string[]).includes(canonical)
    ? canonical
    : null;
}

/**
 * Deteksi simbol OTB dari teks bebas (mis. OCR): nama terdaftar pertama
 * yang muncul utuh (batas kata; "_" dihitung karakter kata sehingga
 * "GBPUSD" biasa tidak cocok di dalam "GBPUSD_ORB").
 */
export function findOtbSymbolInText(text: string): string | null {
  for (const symbol of OTB_ALL_SYMBOLS) {
    if (new RegExp(`\\b${symbol}\\b`, "i").test(text)) {
      return symbol;
    }
  }

  return null;
}

/**
 * Saran pindah broker (sufficient: broker non-OTB + simbol berpreset
 * lengkap). Murni display; TIDAK memindahkan state (pemanggil memakai
 * handleBrokerChange agar cleanup tetap jalan).
 */
export function getOtbDetectedNotice(
  brokerId: BrokerId | undefined,
  symbol: string
): string | null {
  const trimmed = symbol.trim();

  if (trimmed === "") return null;
  if (brokerId === ORBITRADER_BROKER_ID) return null;
  if (!hasOtbPresetForSymbol(trimmed, ORBITRADER_BROKER_ID)) return null;

  return (
    `Terdeteksi simbol OTB (${trimmed}). ` +
    `Klik untuk pindah broker.`
  );
}
