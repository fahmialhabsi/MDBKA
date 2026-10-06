/**
 * #502 — prediksi swap 1 malam per posisi dari spec yang dicatat EA
 * (MODUL MURNI). Mode INTEREST_CURRENT = bunga TAHUNAN dari harga
 * berjalan, tahun bank 360 hari (dokumentasi MQL5 ENUM_SYMBOL_SWAP_MODE).
 * Hasil dalam mata uang profit simbol. Mode lain → null (belum dipetakan).
 */
export interface SwapPredictionInput {
  readonly type: string;
  readonly volume: number | null;
  readonly priceCurrent: number | null;
  readonly contractSize: number | null;
  readonly swapMode: string;
  readonly swapLong: number | null;
  readonly swapShort: number | null;
  readonly profitCurrency: string;
}

export function predictDailySwap(
  row: SwapPredictionInput,
): { value: number; currency: string } | null {
  if (row.swapMode === "SYMBOL_SWAP_MODE_DISABLED") {
    return { value: 0, currency: row.profitCurrency };
  }
  if (row.swapMode !== "SYMBOL_SWAP_MODE_INTEREST_CURRENT") return null;
  const rate = row.type === "SELL" ? row.swapShort : row.swapLong;
  if (
    rate === null ||
    row.volume === null ||
    row.priceCurrent === null ||
    row.contractSize === null
  ) {
    return null;
  }
  const value =
    (row.priceCurrent * row.contractSize * row.volume * rate) / 100 / 360;
  return { value, currency: row.profitCurrency };
}
