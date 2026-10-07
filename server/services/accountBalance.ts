import type { HistoryDeal } from "../types/historyCsv";

/**
 * Langkah B (8 Okt 2026) — saldo & setoran per akun dari History MT5.
 *
 * Saldo = jumlah profit + komisi + swap + fee SEMUA deal (setoran,
 * penarikan, trade, biaya) sejak FromDate service. Deal CREDIT tidak
 * dihitung (kredit broker bukan saldo). Berlaku juga untuk akun yang
 * sedang TIDAK login (nilai per ekspor History terakhir).
 * Setoran = deal BALANCE positif; penarikan = deal BALANCE negatif.
 * Murni: tanpa fs, aman diuji.
 */
export interface AccountBalance {
  /** Saldo akun (mata uang akun), dibulatkan 2 desimal. */
  readonly balance: number;
  /** Total setoran (mata uang akun). */
  readonly deposits: number;
  /** Total penarikan (positif, mata uang akun). */
  readonly withdrawals: number;
  /** Total setoran Rupiah asli dari komentar deal (null bila tak ada). */
  readonly depositsIdr: number | null;
  readonly currency: string;
  /** Jam server deal terakhir ("YYYY.MM.DD HH:MM:SS") atau null. */
  readonly lastDealTime: string | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function summarizeAccountBalance(
  deals: readonly HistoryDeal[],
): AccountBalance {
  let balance = 0;
  let deposits = 0;
  let withdrawals = 0;
  let depositsIdr: number | null = null;
  let currency = "";
  let lastDealTime: string | null = null;
  for (const d of deals) {
    if (currency === "" && d.accountCurrency !== "") currency = d.accountCurrency;
    if (lastDealTime === null || d.serverTime > lastDealTime) lastDealTime = d.serverTime;
    if (d.type === "CREDIT") continue;
    balance += d.profit + d.commission + d.swap + d.fee;
    if (d.type === "BALANCE") {
      if (d.profit > 0) {
        deposits += d.profit;
        if (d.idrAmount !== null) depositsIdr = (depositsIdr ?? 0) + d.idrAmount;
      } else if (d.profit < 0) {
        withdrawals += -d.profit;
      }
    }
  }
  return {
    balance: round2(balance),
    deposits: round2(deposits),
    withdrawals: round2(withdrawals),
    depositsIdr,
    currency,
    lastDealTime,
  };
}
