import { getInstrumentProfile } from "./instrumentConfig";
import { getOtbInstrumentProfile } from "./otbInstrumentConfig";

/**
 * Ukuran 1 tick untuk simbol (dipakai sebagai spread minimal placeholder
 * saat auto-fill Bid/Ask dari candle CSV). OTB dibaca dari profil
 * Specification (EXACT, _ORB terjaga); selainnya dari instrumentConfig.
 * Selalu > 0 agar guard ask > bid lolos. Dipakai App dan pemindai simbol.
 */
export function tickSizeForSymbol(symbol: string): number {
  const otb = getOtbInstrumentProfile(symbol.trim().toUpperCase());
  if (otb !== null && otb.tickSize > 0) return otb.tickSize;
  const profile = getInstrumentProfile(symbol);
  if (profile.category !== "unknown" && profile.decimals > 0) {
    return Math.pow(10, -profile.decimals);
  }
  return 0.00001;
}
