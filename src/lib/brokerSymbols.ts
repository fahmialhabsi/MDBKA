import {
  SUPPORTED_SYMBOLS,
  normalizeSymbol,
} from "./instrumentConfig";
import { ORBITRADER_BROKER_ID } from "./brokerRegistry";
import { getOtbInstrumentProfile } from "./otbInstrumentConfig";
import type { BrokerId } from "../types/broker";

/**
 * Tahap 4C/5A — daftar simbol & kanonikalisasi per broker (UI/wiring only).
 * - Finex (default): SUPPORTED_SYMBOLS, perilaku lama byte-identik.
 * - OTB: OTB_ALL_SYMBOLS untuk dropdown; hanya simbol berpreset lengkap
 *   yang dianggap terverifikasi. Simbol OTB dicocokkan EXACT; suffiks
 *   seperti _ORB signifikan.
 */

/** Daftar simbol OTB dari broker (termasuk yang presetnya masih TBD). */
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
  "USDCAD_ORB",
] as const;

/**
 * Simbol OTB yang presetnya terverifikasi dari Specification broker.
 * Kebijakan verifikasi: GBPUSD_ORB (spec awal) + AUDCHF_ORB (Tahap 6E-1,
 * dikonfirmasi dari ekspor CSV terminal OTB 03 Okt 2026:
 * digits=5, tickSize=0.00001, swap -1.5/-1.5 percentage, min/max 0.1/10).
 * + AUDJPY_ORB (Tahap 6E-2, ekspor CSV sama: digits=3, tickSize=0.001,
 *   swap -1.25/-1.75 percentage, min/max 0.1/10).
 * + AUDNZD_ORB (Tahap 6E-3, ekspor CSV sama: digits=5, tickSize=0.00001,
 *   swap 0.00/-2.21 percentage, min/max 0.1/10).
 * + AUDUSD_ORB (Tahap 6E-4, ekspor CSV sama: digits=5, tickSize=0.00001,
 *   swap -1.50/-1.50 percentage, min/max 0.1/10).
 * + CADJPY_ORB (Tahap 6E-5, ekspor CSV sama: digits=3, tickSize=0.001,
 *   swap -1.25/-1.75 percentage, min/max 0.1/10).
 * + CHFJPY_ORB (Tahap 6E-6, ekspor CSV sama: digits=3, tickSize=0.001,
 *   swap -1.75/-1.25 percentage, min/max 0.1/10).
 * + EURAUD_ORB (Tahap 6E-7, ekspor CSV sama: digits=5, tickSize=0.00001,
 *   swap -1.50/-1.50 percentage, min/max 0.1/10).
 * Komisi 33/lot dipertahankan sesuai spec lama (kolom Commission=0.00
 * pada CSV dianggap tidak berlaku). Simbol lain di OTB_ALL_SYMBOLS
 * tetap tampil di dropdown (pending) tetapi wajib menampilkan warning
 * dan TIDAK memakai preset otomatis sampai data Specification lengkap.
 * Untuk memverifikasi simbol baru: tambahkan di sini + lengkapi test.
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
    preset.digits > 0 &&
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
 * - Selain itu: normalizeSymbol lama (alias, suffix broker, label).
 */
export function canonicalSymbolForBroker(
  symbol: string,
  brokerId?: BrokerId
): string {
  if (brokerId === ORBITRADER_BROKER_ID) {
    return symbol.trim().toUpperCase();
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
