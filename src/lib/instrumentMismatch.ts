import type { Candle } from "../calculations/swingDetector";
import { getInstrumentProfile } from "./instrumentConfig";

/**
 * Memvalidasi candle hasil parsing terhadap simbol aktif memakai
 * `getInstrumentProfile()` yang sudah ada (bukan nama file).
 * Mengembalikan pesan mismatch berbahasa Indonesia, atau null bila cocok.
 * Konsumen wajib: jika hasilnya non-null, JANGAN memanggil onDetected
 * dan JANGAN memakai Support/Resistance lama tanpa status invalid.
 */

/**
 * Batas deviasi relatif rata-rata CSV terhadap harga berjalan.
 * 10% meloloskan tren wajar (pergerakan 2 hari jarang >5%) tetapi
 * menangkap CSV pair se-skala yang salah (mis. AUDCAD ~0.99 ditempel
 * untuk GBPUSD ~1.32 = ~25%). Pasangan se-skala BERDEKATAN (AUDJPY vs
 * CADJPY) dan lintas-broker pair SAMA tidak terdeteksi via harga —
 * keterbatasan jujur (CSV MT5 tidak memuat nama simbol/broker).
 */
export const DEVIATION_WARN_PCT = 10;

/**
 * Peringatan deviasi: rata-rata close CSV jauh dari harga berjalan.
 * Non-blokir secara kontrak (string | null seperti mismatch), tetapi
 * pemanggil (SwingLevelsForm) memperlakukannya sama: jangan terapkan
 * level sampai data diperiksa. Dilewati bila harga acuan invalid.
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

/**
 * Deviasi relatif (persen) rata-rata close CSV terhadap harga berjalan.
 * Null bila salah satu sisi invalid (jangan menuduh tanpa data).
 */
export function checkPriceDeviation(
  candles: Candle[],
  currentPrice: number
): string | null {
  if (candles.length === 0) return null;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const closes = candles.map((candle) => candle.close);
  const avgClose =
    closes.reduce((sum, value) => sum + value, 0) / closes.length;

  if (!Number.isFinite(avgClose) || avgClose <= 0) return null;

  const deviationPct = (Math.abs(avgClose - currentPrice) / currentPrice) * 100;

  if (deviationPct <= DEVIATION_WARN_PCT) return null;

  return (
    `Rata-rata close CSV (${avgClose}) menyimpang ` +
    `${deviationPct.toFixed(1)}% dari harga berjalan (${currentPrice}). ` +
    `Kemungkinan CSV pair/broker lain. Periksa kembali file CSV.`
  );
}
