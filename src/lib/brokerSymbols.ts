import {
  SUPPORTED_SYMBOLS,
  normalizeSymbol,
} from "./instrumentConfig";
import { ORBITRADER_BROKER_ID } from "./brokerRegistry";
import {
  OTB_PRESETS,
  getOtbInstrumentProfile,
} from "./otbInstrumentConfig";
import type { BrokerId } from "../types/broker";

/**
 * Tahap 4C — daftar simbol & kanonikalisasi per broker (UI/wiring only).
 * - Finex (default): SUPPORTED_SYMBOLS, perilaku lama byte-identik.
 * - OTB: hanya simbol berpreset lengkap (digits + contractSize > 0).
 *   Simbol OTB dicocokkan EXACT; suffiks seperti _ORB signifikan.
 */

/** True bila preset OTB cukup lengkap untuk ditampilkan/dipakai. */
function isCompleteOtbPreset(symbol: string): boolean {
  const preset = getOtbInstrumentProfile(symbol);
  return (
    preset !== null && preset.digits > 0 && preset.contractSize > 0
  );
}

/**
 * Daftar simbol untuk dropdown mengikuti broker aktif.
 * Tanpa broker (undefined) = jalur Finex lama.
 */
export function getAvailableSymbols(brokerId?: BrokerId): string[] {
  if (brokerId === ORBITRADER_BROKER_ID) {
    return Object.keys(OTB_PRESETS).filter(isCompleteOtbPreset);
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
