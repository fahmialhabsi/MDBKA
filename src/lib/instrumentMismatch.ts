import type { Candle } from "../calculations/swingDetector";
import { getInstrumentProfile } from "./instrumentConfig";

/**
 * Memvalidasi candle hasil parsing terhadap simbol aktif memakai
 * `getInstrumentProfile()` yang sudah ada (bukan nama file).
 * Mengembalikan pesan mismatch berbahasa Indonesia, atau null bila cocok.
 * Konsumen wajib: jika hasilnya non-null, JANGAN memanggil onDetected
 * dan JANGAN memakai Support/Resistance lama tanpa status invalid.
 */
export function checkInstrumentMismatch(
  candles: Candle[],
  symbol: string,
  currentPrice: number
): string | null {
  if (candles.length === 0) return null;

  const profile = getInstrumentProfile(symbol);

  if (profile.category === "unknown") return null;

  const closes = candles.map((candle) => candle.close);
  const avgClose =
    closes.reduce((sum, value) => sum + value, 0) / closes.length;
  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);

  if (!Number.isFinite(avgClose)) return null;

  const outOfRange =
    avgClose < profile.minPrice ||
    avgClose > profile.maxPrice ||
    minClose < profile.minPrice ||
    maxClose > profile.maxPrice ||
    (Number.isFinite(currentPrice) &&
      currentPrice > 0 &&
      (currentPrice < profile.minPrice ||
        currentPrice > profile.maxPrice));

  if (!outOfRange) return null;

  return (
    `Data candle tidak sesuai dengan simbol ${profile.symbol}. ` +
    `Rata-rata ${avgClose}, min ${minClose}, max ${maxClose} berada di luar ` +
    `rentang ${profile.minPrice}\u2013${profile.maxPrice}. ` +
    `Periksa kembali file CSV atau simbol aktif.`
  );
}
