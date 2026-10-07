/**
 * Langkah C (8 Okt 2026) — tampilan saldo & setoran semua akun di header.
 * Sumber: field `balance` GET /api/evaluation (dihitung dari History MT5,
 * jadi akun yang tidak login tetap terbaca). Murni, aman diuji.
 */
export interface BalanceInfo {
  readonly balance: number;
  readonly deposits: number;
  readonly withdrawals: number;
  readonly depositsIdr: number | null;
  readonly currency: string;
  readonly lastDealTime: string | null;
}

export interface BalanceAccount {
  readonly login: string;
  readonly label: string;
  readonly balance?: BalanceInfo;
}

export interface BalanceRow {
  readonly login: string;
  readonly label: string;
  readonly isLive: boolean;
  /** "Rp152.000" atau "$8,50" bila kurs belum ada. */
  readonly balanceText: string;
  readonly balanceUsdText: string;
  /** Setoran Rupiah: nominal asli dari komentar setoran bila ada. */
  readonly depositText: string;
  readonly lastDealTime: string | null;
}

const idr = (v: number): string =>
  `Rp${Math.round(v).toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
const usd = (v: number): string =>
  `$${v.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Nominal USD → Rupiah dibulatkan ke ribuan (indikatif, kurs ECB). */
export function usdToIdrText(v: number, kurs: number | null): string | null {
  if (kurs === null || !Number.isFinite(kurs) || kurs <= 0) return null;
  return idr(Math.round((v * kurs) / 1000) * 1000);
}

export function buildBalanceRows(
  accounts: readonly BalanceAccount[],
  kurs: number | null,
): BalanceRow[] {
  const rows: BalanceRow[] = [];
  for (const a of accounts) {
    const b = a.balance;
    if (b === undefined) continue;
    const isLive = /live|real/i.test(a.label);
    const depositIdr =
      b.depositsIdr !== null ? idr(b.depositsIdr) : usdToIdrText(b.deposits, kurs);
    rows.push({
      login: a.login,
      label: a.label,
      isLive,
      balanceText: usdToIdrText(b.balance, kurs) ?? usd(b.balance),
      balanceUsdText: usd(b.balance),
      depositText: depositIdr ?? usd(b.deposits),
      lastDealTime: b.lastDealTime,
    });
  }
  // Akun live (uang nyata) di depan, lalu urut label.
  return rows.sort((x, y) =>
    x.isLive !== y.isLive ? (x.isLive ? -1 : 1) : x.label.localeCompare(y.label),
  );
}
