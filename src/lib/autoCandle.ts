/**
 * Langkah A (8 Okt 2026) — analisa otomatis tanpa upload CSV.
 *
 * Saat simbol dipilih dan belum ada CSV terhubung, App mengambil
 * GET /api/candles?broker= (CSV H1 yang diekspor AutoExportMDBKAService)
 * lalu memasukkannya ke alur yang SAMA dengan upload manual
 * (handleCsvLoaded). Modul ini murni agar bisa diuji.
 */
export interface CandleItemLike {
  readonly symbol: string;
  readonly csv: string;
  readonly modified?: string;
}

/** Cari CSV simbol: persis dulu, lalu tanpa beda huruf besar/kecil. */
export function findCandleItem<T extends CandleItemLike>(
  items: readonly T[],
  symbol: string,
): T | null {
  const wanted = symbol.trim();
  if (wanted === "") return null;
  const exact = items.find((item) => item.symbol === wanted);
  if (exact !== undefined) return exact;
  const upper = wanted.toUpperCase();
  return items.find((item) => item.symbol.toUpperCase() === upper) ?? null;
}

/** Nama file sintetis agar deteksi simbol/timeframe handleCsvLoaded tetap berlaku. */
export function autoCsvFileName(symbol: string): string {
  return `MDBKA_${symbol}_H1.csv`;
}

/**
 * Kunci muat otomatis. null = jangan memuat (simbol kosong, atau CSV
 * sudah terhubung — upload manual pengguna tidak ditimpa).
 */
export function autoLoadKey(
  brokerId: string,
  symbol: string,
  connectedCsvName: string,
): string | null {
  if (symbol.trim() === "") return null;
  if (connectedCsvName.trim() !== "") return null;
  return `${brokerId}|${symbol.trim()}`;
}
