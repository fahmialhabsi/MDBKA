/**
 * Butir 4 C2 (9 Okt 2026) — URL halaman kalkulator target harga. MURNI.
 * `/?halaman=kalkulator&broker=finex&symbol=US100&arah=JUAL&lot=0.01&entry=…&sl=…&tp=…`
 * Semua parameter isian opsional (prefill dari detail sinyal / monitor).
 */
import type { BrokerId } from "../types/broker";
import type { CalcDirection } from "./targetCalculator";

export interface CalculatorPrefill {
  readonly broker: BrokerId;
  readonly symbol: string;
  readonly direction: CalcDirection;
  readonly lot: string;
  readonly entry: string;
  readonly sl: string;
  readonly tp: string;
}

export function calculatorPageUrl(p: Partial<CalculatorPrefill> & { broker: BrokerId }): string {
  const q = new URLSearchParams({ halaman: "kalkulator", broker: p.broker });
  if (p.symbol) q.set("symbol", p.symbol);
  if (p.direction) q.set("arah", p.direction);
  if (p.lot) q.set("lot", p.lot);
  if (p.entry) q.set("entry", p.entry);
  if (p.sl) q.set("sl", p.sl);
  if (p.tp) q.set("tp", p.tp);
  return `/?${q.toString()}`;
}

export function parseCalculatorPage(search: string): CalculatorPrefill | null {
  const q = new URLSearchParams(search);
  if (q.get("halaman") !== "kalkulator") return null;
  const b = q.get("broker");
  const broker: BrokerId = b === "orbitraderberjangka" ? "orbitraderberjangka" : "finex";
  return {
    broker,
    symbol: (q.get("symbol") ?? "").trim().toUpperCase(),
    direction: q.get("arah") === "JUAL" ? "JUAL" : "BELI",
    lot: q.get("lot") ?? "0.01",
    entry: q.get("entry") ?? "",
    sl: q.get("sl") ?? "",
    tp: q.get("tp") ?? "",
  };
}

/** Angka dari isian (koma Indonesia diterima): "30748,33" → 30748.33. */
export function parseInputNumber(raw: string): number {
  const s = raw.trim().replace(/\s/g, "");
  if (s === "") return NaN;
  const normalized = s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, "");
  return Number(normalized);
}

/** C3: posisi terbuka MT5 (bentuk minimal dari /api/positions). */
export interface OpenPositionLike {
  readonly ticket: string;
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly volume: number;
  readonly priceOpen: number;
  readonly sl: number;
  readonly tp: number;
}

/** C3: isian kalkulator dari posisi terbuka MT5. SL/TP 0 (belum dipasang) → kosong. */
export function prefillFromPosition(pos: OpenPositionLike, broker: BrokerId): CalculatorPrefill {
  return {
    broker,
    symbol: pos.symbol.trim().toUpperCase(),
    direction: pos.side === "SELL" ? "JUAL" : "BELI",
    lot: String(pos.volume),
    entry: String(pos.priceOpen),
    sl: pos.sl > 0 ? String(pos.sl) : "",
    tp: pos.tp > 0 ? String(pos.tp) : "",
  };
}

/** C3: label pilihan posisi, mis. "US100 JUAL 0.01 @30748.33 (#123)". */
export function positionOptionLabel(pos: OpenPositionLike): string {
  return `${pos.symbol} ${pos.side === "SELL" ? "JUAL" : "BELI"} ${pos.volume} @${pos.priceOpen} (#${pos.ticket})`;
}

/** C3: daftar simbol dropdown: unik, urut; simbol terpilih tetap ada walau tak di Market Watch. */
export function symbolOptions(symbols: readonly string[], current: string): string[] {
  const set = new Set(symbols.map((x) => x.trim().toUpperCase()).filter((x) => x !== ""));
  const cur = current.trim().toUpperCase();
  if (cur !== "") set.add(cur);
  return [...set].sort();
}
