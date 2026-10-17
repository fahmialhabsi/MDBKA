import { riskGroupOf } from "./riskGroup";
import { tickSizeForSymbol } from "./tickSize";

/**
 * Jarak harga dalam pip (Forex) atau poin (lainnya) — penetapan Fahmi 17 Okt 2026:
 * 1 pip Forex = 10 tick (EURUSD 0,00001 -> 0,0001; GBPJPY 0,001 -> 0,01); emas, minyak, indeks,
 * saham dll. memakai poin = 1 tick simbol (tickSizeForSymbol, sumber yang sama dengan format harga).
 * MURNI. null = harga tidak sah.
 */
export const PIP_TICKS_FOREX = 10;

export interface JarakHarga {
  readonly nilai: number;
  readonly satuan: "pip" | "poin";
}

export function jarakHarga(symbol: string, dari: number, ke: number): JarakHarga | null {
  if (!Number.isFinite(dari) || !Number.isFinite(ke) || dari <= 0 || ke <= 0) return null;
  const tick = tickSizeForSymbol(symbol);
  if (!(tick > 0)) return null;
  const forex = riskGroupOf(symbol).id.startsWith("FOREX");
  const unit = forex ? tick * PIP_TICKS_FOREX : tick;
  return { nilai: Math.round((Math.abs(dari - ke) / unit) * 10) / 10, satuan: forex ? "pip" : "poin" };
}

export function jarakText(j: JarakHarga | null): string {
  if (j === null) return "-";
  return `${j.nilai.toLocaleString("id-ID", { maximumFractionDigits: 1 })} ${j.satuan}`;
}
