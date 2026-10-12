/**
 * X2 (12 Okt 2026) — equity akun ber-mata-uang bukan USD (Exness demo = IDR).
 *
 * Mesin MDBKA (lot, risiko 1%, margin guard) menganggap equity dalam USD.
 * equity.csv EA MDBKAMultiLive TIDAK mencatat mata uang akun, jadi mata uang
 * ditetapkan per broker lewat .env (MT5_ACCOUNT_CURRENCY_EXNESS=IDR), lalu
 * angka uang dibagi kurs USD→Rp ECB (buku data/fx/ecb-usdidr.json, hari kerja
 * terakhir maks 7 hari). Kurs tidak ada → TIDAK ada snapshot (404 jujur),
 * bukan angka Rupiah yang menyamar sebagai USD.
 *
 * Rasio (margin level %) dan leverage tidak berubah oleh kurs.
 */
import type { EquitySnapshot } from "../types/equity";
import type { EquityUpdateCallback } from "./mt5LogReader";

/** Sumber equity minimal yang dipakai route (MT5LogReader memenuhinya). */
export interface EquitySource {
  getLatest(): EquitySnapshot | null;
  refresh(): EquitySnapshot | null;
  onUpdate(callback: EquityUpdateCallback): () => void;
}

/** Mata uang akun yang bisa dikonversi. USD = apa adanya. */
export type AccountCurrency = "USD" | "IDR";

/**
 * Teks .env → mata uang. Kosong/tak dikenal = null → equity TIDAK dilayani
 * (kosong tidak boleh dianggap USD: saldo Rupiah akan terbaca sebagai dolar).
 */
export function parseAccountCurrency(raw: string | undefined): AccountCurrency | null {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "USD") return "USD";
  if (v === "IDR") return "IDR";
  return null;
}

const usd = (v: number, rate: number): number => Math.round((v / rate) * 100) / 100;

/** Snapshot IDR → USD (MURNI). rate = Rupiah per 1 USD (> 0). */
export function convertIdrSnapshot(s: EquitySnapshot, rate: number): EquitySnapshot {
  return {
    ...s,
    balance: usd(s.balance, rate),
    equity: usd(s.equity, rate),
    profit: usd(s.profit, rate),
    ...(s.margin !== undefined ? { margin: usd(s.margin, rate) } : {}),
    ...(s.freeMargin !== undefined ? { freeMargin: usd(s.freeMargin, rate) } : {}),
  };
}

/** Bungkus sumber equity IDR agar keluar dalam USD. getRate() null → tidak ada data. */
export class IdrEquitySource implements EquitySource {
  constructor(
    private readonly inner: EquitySource,
    private readonly getRate: () => number | null,
  ) {}

  private convert(s: EquitySnapshot | null): EquitySnapshot | null {
    if (s === null) return null;
    const rate = this.getRate();
    return rate !== null && rate > 0 ? convertIdrSnapshot(s, rate) : null;
  }

  getLatest(): EquitySnapshot | null {
    return this.convert(this.inner.getLatest());
  }

  refresh(): EquitySnapshot | null {
    return this.convert(this.inner.refresh());
  }

  onUpdate(callback: EquityUpdateCallback): () => void {
    return this.inner.onUpdate((s) => {
      const c = this.convert(s);
      if (c !== null) callback(c);
    });
  }
}
