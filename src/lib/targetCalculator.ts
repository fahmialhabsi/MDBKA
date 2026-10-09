/**
 * Butir 4 C1 (9 Okt 2026) — Kalkulator target harga. MODUL MURNI.
 *
 * Input: simbol, arah, lot, entry, SL, TP. Output: hasil bila TP/SL kena
 * (USD & Rupiah, BERSIH setelah komisi), jarak, R:R, titik impas
 * (entry ± biaya komisi, `breakevenCostDistance`), tabel tangga harga,
 * peringatan batas golongan + SL yang sesuai batas. Rumus sama dengan
 * monitor posisi: hasil = jarak harga × contractSize × lot (mata uang
 * kuotasi → USD). Contoh uji US100 Finex SELL 0,01 @30748.33.
 * Validasi sisi: BELI → SL < entry < TP; JUAL → TP < entry < SL.
 */
import { breakevenCostDistance, commissionForHolding } from "./exitMonitor";
import { getInstrumentSpec32 } from "./instrumentSpecs32";
import { riskGroupOf } from "./riskGroup";
import { priceDigits, tickSizeForSymbol } from "./tickSize";

export type CalcDirection = "BELI" | "JUAL";

export interface TargetInput {
  readonly symbol: string;
  readonly direction: CalcDirection;
  readonly lot: number;
  readonly entry: number;
  readonly sl: number;
  readonly tp: number;
}

export interface LadderRow {
  readonly label: string;
  readonly price: number;
  /** Jarak dari entry ke arah untung (+) / rugi (−), satuan harga. */
  readonly move: number;
  readonly netUsd: number;
  readonly netIdr: number | null;
}

export interface TargetResult {
  readonly ok: true;
  readonly symbol: string;
  readonly digits: number;
  readonly usdPerUnit: number;
  readonly commissionUsd: number;
  readonly tpDistance: number;
  readonly slDistance: number;
  readonly rr: number;
  readonly tpNetUsd: number;
  readonly tpNetIdr: number | null;
  readonly slNetUsd: number;
  readonly slNetIdr: number | null;
  readonly breakeven: number | null;
  readonly ladder: readonly LadderRow[];
  readonly group: string;
  readonly capIdr: number | null;
  /** true bila rugi SL (Rupiah) melebihi batas golongan. */
  readonly overCap: boolean;
  /** SL yang membuat rugi = batas golongan (null bila tanpa kurs/batas). */
  readonly capSl: number | null;
  /** Catatan arah transaksi: harga mana yang menutup posisi. */
  readonly closeSide: "Bid" | "Ask";
}

export interface TargetError {
  readonly ok: false;
  readonly error: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Jarak SL/TP lebih dari 20% dari entry = hampir pasti salah ketik / simbol lain. */
export const MAX_DISTANCE_PCT = 20;

export function calculateTargets(
  input: TargetInput,
  convertToUsd: (amount: number, currency: string) => number | null,
  usdIdr: number | null,
): TargetResult | TargetError {
  const { symbol, direction, lot, entry, sl, tp } = input;
  if (![lot, entry, sl, tp].every((n) => Number.isFinite(n) && n > 0)) {
    return { ok: false, error: "Isi lot, entry, SL dan TP dengan angka lebih dari 0." };
  }
  const buy = direction === "BELI";
  if (buy ? !(sl < entry && entry < tp) : !(tp < entry && entry < sl)) {
    return {
      ok: false,
      error: buy
        ? "Untuk BELI: SL harus DI BAWAH harga entry dan TP DI ATAS harga entry. Cek simbol & angka."
        : "Untuk JUAL: TP harus DI BAWAH harga entry dan SL DI ATAS harga entry. Cek simbol & angka.",
    };
  }
  const far = Math.max(Math.abs(sl - entry), Math.abs(tp - entry)) / entry * 100;
  if (far > MAX_DISTANCE_PCT) {
    return {
      ok: false,
      error: `SL/TP berjarak ${far.toFixed(0)}% dari harga entry — terlalu jauh, kemungkinan angka dari simbol lain. Cek simbol & angka.`,
    };
  }
  const spec = getInstrumentSpec32(symbol.trim());
  if (spec === null || !(spec.leverage > 0)) {
    return { ok: false, error: `Spesifikasi ${symbol} belum dikenal MDBKA.` };
  }
  const usdPerUnit = convertToUsd(spec.leverage * lot, spec.quoteCurrency);
  if (usdPerUnit === null || !Number.isFinite(usdPerUnit) || usdPerUnit <= 0) {
    return { ok: false, error: "Kurs mata uang kuotasi belum tersedia." };
  }
  const commission = commissionForHolding(symbol, lot) ?? 0;
  const digits = priceDigits(symbol);
  const tick = tickSizeForSymbol(symbol);
  const fix = (p: number): number => Number(p.toFixed(digits));
  const toIdr = (usd: number): number | null => (usdIdr === null ? null : Math.round(usd * usdIdr));
  const sign = buy ? 1 : -1;
  const netAt = (price: number): number => round2((price - entry) * sign * usdPerUnit - commission);

  const tpDistance = fix(Math.abs(tp - entry));
  const slDistance = fix(Math.abs(sl - entry));
  const beDist = breakevenCostDistance({ symbol, lot }, convertToUsd);
  const breakeven = beDist === null ? null : fix(entry + sign * beDist);

  const row = (label: string, price: number): LadderRow => {
    const p = fix(price);
    const netUsd = netAt(p);
    return { label, price: p, move: fix((p - entry) * sign), netUsd, netIdr: toIdr(netUsd) };
  };
  const toward = (target: number, frac: number): number =>
    Math.round((entry + (target - entry) * frac) / tick) * tick;
  const ladder: LadderRow[] = [
    row("TP (target untung)", tp),
    row("¾ jalan ke TP", toward(tp, 0.75)),
    row("½ jalan ke TP", toward(tp, 0.5)),
    row("¼ jalan ke TP", toward(tp, 0.25)),
    ...(breakeven === null ? [] : [row("Titik impas (entry ∓ komisi)", breakeven)]),
    row("½ jalan ke SL", toward(sl, 0.5)),
    row("SL (batas rugi)", sl),
  ];

  const tpNetUsd = netAt(tp);
  const slNetUsd = netAt(sl);
  const group = riskGroupOf(symbol);
  const slIdr = toIdr(slNetUsd);
  const overCap = group.capIdr !== null && slIdr !== null && -slIdr > group.capIdr;
  let capSl: number | null = null;
  if (group.capIdr !== null && usdIdr !== null) {
    const capUsd = group.capIdr / usdIdr;
    const dist = Math.floor((capUsd - commission) / usdPerUnit / tick) * tick;
    if (dist > 0) capSl = fix(entry - sign * dist);
  }
  return {
    ok: true,
    symbol,
    digits,
    usdPerUnit,
    commissionUsd: commission,
    tpDistance,
    slDistance,
    rr: slDistance > 0 ? round2(tpDistance / slDistance) : 0,
    tpNetUsd,
    tpNetIdr: toIdr(tpNetUsd),
    slNetUsd,
    slNetIdr: slIdr,
    breakeven,
    ladder,
    group: group.label,
    capIdr: group.capIdr,
    overCap,
    capSl,
    closeSide: buy ? "Bid" : "Ask",
  };
}
