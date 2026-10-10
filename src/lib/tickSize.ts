import { getInstrumentProfile } from "./instrumentConfig";
import { getOtbInstrumentProfile } from "./otbInstrumentConfig";
import { getMifxSpec } from "./mifxSpecs";

/**
 * Ukuran 1 tick untuk simbol (dipakai sebagai spread minimal placeholder
 * saat auto-fill Bid/Ask dari candle CSV). OTB dibaca dari profil
 * Specification (EXACT, _ORB terjaga); selainnya dari instrumentConfig.
 * Selalu > 0 agar guard ask > bid lolos. Dipakai App dan pemindai simbol.
 */
export function tickSizeForSymbol(symbol: string): number {
  // M4a: simbol MIFX (".m", OIL_NEXT) dari Specification MT5 MIFX (NQ.m 0.01, DJ.m 1, USDJPY.m 0.001).
  const mifx = getMifxSpec(symbol);
  if (mifx !== null && mifx.tickSize > 0) return mifx.tickSize;
  const otb = getOtbInstrumentProfile(symbol.trim().toUpperCase());
  if (otb !== null && otb.tickSize > 0) return otb.tickSize;
  const profile = getInstrumentProfile(symbol);
  // decimals 0 (JP225, HK50 = harga bulat) → tick 1, bukan jatuh ke 0.00001.
  if (profile.category !== "unknown" && profile.decimals >= 0) {
    return Math.pow(10, -profile.decimals);
  }
  return 0.00001;
}

/**
 * Jumlah desimal harga simbol, diturunkan dari ukuran tick (sama seperti
 * tampilan MT5): GBPUSD 0.00001 → 5, USDJPY 0.001 → 3, US30 0.01 → 2,
 * tick 0.25 → 2. Dibatasi 0..8.
 */
export function priceDigits(symbol: string): number {
  const tick = tickSizeForSymbol(symbol);
  for (let d = 0; d <= 8; d += 1) {
    const scaled = tick * Math.pow(10, d);
    if (Math.abs(scaled - Math.round(scaled)) < 1e-6) return d;
  }
  return 5;
}

/** Harga dengan desimal simbol, titik desimal (siap tempel ke MT5). */
export function formatPrice(value: number | null, symbol: string): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(priceDigits(symbol));
}
