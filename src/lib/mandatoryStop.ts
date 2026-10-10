/**
 * S5a (10 Okt 2026) — SL WAJIB untuk SEMUA posisi tanpa SL (penetapan Fahmi:
 * berlaku semua golongan, bukan hanya saham). MODUL MURNI.
 *
 * Sistem yang merencanakan (GUARD 10b): posisi tanpa SL = rugi tak terbatas,
 * jadi MDBKA menghitung harga SL yang membuat rugi maksimal = batas risiko
 * golongan (riskGroup.ts, Rupiah), dengan rumus yang sama dengan kalkulator
 * target (jarak × contractSize × lot dalam mata uang kuotasi → USD, + komisi).
 * - Harga tutup sekarang (BELI = Bid, JUAL = Ask) sudah melewati titik itu
 *   → LEWAT_BATAS: rugi sudah ≥ batas, pertimbangkan tutup (tanpa angka SL
 *   yang akan langsung kena).
 * - Golongan ditahan (batas null) → TUTUP.
 * - Spesifikasi/kurs belum ada → TIDAK_DIKETAHUI (pasang SL manual).
 * MDBKA tidak memasang/menutup order; hanya angka untuk disalin ke MT5.
 */
import { commissionForHolding, type Holding } from "./exitMonitor";
import { getInstrumentSpec32 } from "./instrumentSpecs32";
import { riskGroupOf } from "./riskGroup";
import { priceDigits, tickSizeForSymbol } from "./tickSize";

export type MandatoryStop =
  | { readonly kind: "ADA_SL" }
  | {
      readonly kind: "PASANG";
      readonly sl: number;
      readonly slText: string;
      /** Rugi bila SL ini kena (Rupiah, termasuk komisi). */
      readonly lossIdr: number;
      readonly capIdr: number;
      readonly groupLabel: string;
      readonly message: string;
    }
  | { readonly kind: "LEWAT_BATAS"; readonly capIdr: number; readonly groupLabel: string; readonly message: string }
  | { readonly kind: "TUTUP"; readonly groupLabel: string; readonly message: string }
  | { readonly kind: "TIDAK_DIKETAHUI"; readonly message: string };

const rupiah = (n: number): string => `Rp${Math.round(n).toLocaleString("id-ID")}`;

export function mandatoryStop(
  holding: Pick<Holding, "symbol" | "direction" | "lot" | "entryPrice" | "sl">,
  bid: number | null,
  ask: number | null,
  convertToUsd: (amount: number, currency: string) => number | null,
  usdIdr: number | null,
): MandatoryStop {
  if (Number.isFinite(holding.sl) && holding.sl > 0) return { kind: "ADA_SL" };
  const symbol = holding.symbol.trim();
  const group = riskGroupOf(symbol);
  if (group.capIdr === null) {
    return {
      kind: "TUTUP",
      groupLabel: group.label,
      message: `Golongan ${group.label} ditahan MDBKA dan posisi ini tanpa SL — sebaiknya tutup posisi di MT5`,
    };
  }
  const spec = getInstrumentSpec32(symbol);
  const usdPerUnit = spec === null || !(spec.leverage > 0) ? null : convertToUsd(spec.leverage * holding.lot, spec.quoteCurrency);
  if (usdIdr === null || !(usdIdr > 0) || usdPerUnit === null || !(usdPerUnit > 0) || !(holding.entryPrice > 0)) {
    return {
      kind: "TIDAK_DIKETAHUI",
      message: "Spesifikasi/kurs belum tersedia — pasang SL manual di MT5 sekarang (rugi tanpa SL tidak terbatas)",
    };
  }
  const commission = commissionForHolding(symbol, holding.lot) ?? 0;
  const tick = tickSizeForSymbol(symbol);
  const digits = priceDigits(symbol);
  const capUsd = group.capIdr / usdIdr;
  const dist = Math.floor((capUsd - commission) / usdPerUnit / tick + 1e-9) * tick;
  const sign = holding.direction === "BELI" ? 1 : -1;
  if (!(dist > 0)) {
    return {
      kind: "LEWAT_BATAS",
      capIdr: group.capIdr,
      groupLabel: group.label,
      message: `Lot ini terlalu besar untuk batas ${group.label} ${rupiah(group.capIdr)} — pertimbangkan tutup posisi`,
    };
  }
  const sl = Number((holding.entryPrice - sign * dist).toFixed(digits));
  const exit = holding.direction === "BELI" ? bid : ask;
  if (exit !== null && Number.isFinite(exit) && exit > 0 && (sign === 1 ? exit <= sl : exit >= sl)) {
    return {
      kind: "LEWAT_BATAS",
      capIdr: group.capIdr,
      groupLabel: group.label,
      message: `Rugi sudah melewati batas ${group.label} ${rupiah(group.capIdr)} (SL wajib ${sl.toFixed(digits)} sudah terlewati) — pertimbangkan tutup posisi`,
    };
  }
  const lossIdr = Math.round((Math.abs(holding.entryPrice - sl) * usdPerUnit + commission) * usdIdr);
  return {
    kind: "PASANG",
    sl,
    slText: sl.toFixed(digits),
    lossIdr,
    capIdr: group.capIdr,
    groupLabel: group.label,
    message: `Pasang SL ${sl.toFixed(digits)} — rugi maksimal ±${rupiah(lossIdr)} (batas ${group.label} ${rupiah(group.capIdr)})`,
  };
}
