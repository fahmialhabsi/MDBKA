/**
 * #508 - kalkulator kewajiban PPh orang pribadi atas penghasilan trading
 * (Finex). Logika murni, tanpa I/O. Dasar yang dipakai (riset 07 Okt 2026):
 *  - Keuntungan trading valas/CFD = penghasilan lain, objek PPh NON-FINAL
 *    (UU PPh Pasal 4 ayat 1), digabung dengan penghasilan lain dan
 *    dilaporkan di SPT Tahunan OP. Tidak ada PPh final atas trading forex
 *    bagi trader pribadi (klaim "final 0,03%" tidak ditemukan di sumber DJP).
 *  - Tarif progresif Pasal 17 ayat (1) huruf a UU PPh (UU 7/2021 HPP):
 *    5% s.d. Rp60jt, 15% s.d. Rp250jt, 25% s.d. Rp500jt, 30% s.d. Rp5M,
 *    35% di atasnya. PKP dibulatkan ke bawah ribuan penuh.
 *  - PTKP: PMK 101/PMK.010/2016 (masih berlaku s.d. TP 2026).
 *  - Komisi & swap diperlakukan sebagai biaya memperoleh penghasilan
 *    (Pasal 6 ayat 1) sehingga netto = profit + swap + komisi + fee.
 *  - Rugi trading TIDAK diasumsikan mengurangi penghasilan lain
 *    (perlakuan fiskal belum dipastikan; konservatif) -> bagian trading 0.
 *  - Kekurangan bayar saat SPT = PPh Pasal 29 OP, kode akun pajak 411125,
 *    kode jenis setoran 200, dibayar sebelum SPT disampaikan (batas 31 Maret).
 * Alat bantu perkiraan, bukan nasihat pajak; konfirmasi ke KPP/konsultan.
 */
export type PtkpStatus =
  | "TK/0"
  | "TK/1"
  | "TK/2"
  | "TK/3"
  | "K/0"
  | "K/1"
  | "K/2"
  | "K/3"
  | "K/I/0"
  | "K/I/1"
  | "K/I/2"
  | "K/I/3";

export const PTKP_STATUSES: readonly PtkpStatus[] = [
  "TK/0",
  "TK/1",
  "TK/2",
  "TK/3",
  "K/0",
  "K/1",
  "K/2",
  "K/3",
  "K/I/0",
  "K/I/1",
  "K/I/2",
  "K/I/3",
];

const PTKP_SELF = 54_000_000;
const PTKP_MARRIED = 4_500_000;
const PTKP_DEPENDENT = 4_500_000;

export function ptkpAmount(status: PtkpStatus): number {
  const dependents = Number(status.slice(-1));
  if (status.startsWith("K/I/")) {
    return PTKP_SELF * 2 + PTKP_MARRIED + dependents * PTKP_DEPENDENT;
  }
  if (status.startsWith("K/")) {
    return PTKP_SELF + PTKP_MARRIED + dependents * PTKP_DEPENDENT;
  }
  return PTKP_SELF + dependents * PTKP_DEPENDENT;
}

const BRACKETS: ReadonlyArray<{ readonly upTo: number; readonly rate: number }> = [
  { upTo: 60_000_000, rate: 0.05 },
  { upTo: 250_000_000, rate: 0.15 },
  { upTo: 500_000_000, rate: 0.25 },
  { upTo: 5_000_000_000, rate: 0.3 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.35 },
];

/** Pajak progresif Pasal 17 untuk PKP (sudah dibulatkan ke bawah ribuan). */
export function progressiveTax(pkp: number): number {
  const base = Math.floor(Math.max(0, pkp) / 1000) * 1000;
  let remaining = base;
  let lower = 0;
  let tax = 0;
  for (const b of BRACKETS) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, b.upTo - lower);
    tax += slice * b.rate;
    remaining -= slice;
    lower = b.upTo;
  }
  return Math.round(tax);
}

export interface TaxLiabilityInput {
  readonly year: number;
  /** Netto trading setahun dalam Rupiah (sudah memakai kurs pajak per transaksi). */
  readonly nettoTradingIdr: number;
  /** Penghasilan neto setahun dari sumber lain (gaji neto, usaha, dll), Rupiah. */
  readonly otherNetIncomeIdr: number;
  readonly ptkpStatus: PtkpStatus;
  /** Kredit pajak: PPh 21/23 yang sudah dipotong, PPh 25 yang sudah dibayar, dll. */
  readonly creditIdr: number;
}

export interface TaxLiability {
  readonly year: number;
  readonly nettoTradingIdr: number;
  readonly tradingTaxableIdr: number;
  readonly tradingLoss: boolean;
  readonly otherNetIncomeIdr: number;
  readonly ptkpStatus: PtkpStatus;
  readonly ptkpIdr: number;
  readonly pkpTotalIdr: number;
  readonly pkpWithoutTradingIdr: number;
  readonly taxTotalIdr: number;
  readonly taxWithoutTradingIdr: number;
  /** Tambahan PPh akibat penghasilan trading (selisih dengan tanpa trading). */
  readonly taxFromTradingIdr: number;
  readonly creditIdr: number;
  /** PPh Pasal 29 OP: kekurangan bayar seluruh SPT (setelah kredit pajak). */
  readonly kurangBayarIdr: number;
  readonly lebihBayarIdr: number;
  readonly jenisPenghasilan: string;
  readonly namaPajak: string;
  readonly dasarHukum: string;
  readonly kodeAkunPajak: string;
  readonly kodeJenisSetoran: string;
  readonly jatuhTempo: string;
}

const nonNeg = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

export function calculateTaxLiability(input: TaxLiabilityInput): TaxLiability {
  const ptkp = ptkpAmount(input.ptkpStatus);
  const trading = Number.isFinite(input.nettoTradingIdr) ? input.nettoTradingIdr : 0;
  const tradingTaxable = nonNeg(trading);
  const other = nonNeg(input.otherNetIncomeIdr);
  const credit = nonNeg(input.creditIdr);

  const pkpTotal = Math.max(0, other + tradingTaxable - ptkp);
  const pkpWithout = Math.max(0, other - ptkp);
  const taxTotal = progressiveTax(pkpTotal);
  const taxWithout = progressiveTax(pkpWithout);

  return {
    year: input.year,
    nettoTradingIdr: Math.round(trading),
    tradingTaxableIdr: Math.round(tradingTaxable),
    tradingLoss: trading < 0,
    otherNetIncomeIdr: Math.round(other),
    ptkpStatus: input.ptkpStatus,
    ptkpIdr: ptkp,
    pkpTotalIdr: Math.floor(pkpTotal / 1000) * 1000,
    pkpWithoutTradingIdr: Math.floor(pkpWithout / 1000) * 1000,
    taxTotalIdr: taxTotal,
    taxWithoutTradingIdr: taxWithout,
    taxFromTradingIdr: taxTotal - taxWithout,
    creditIdr: Math.round(credit),
    kurangBayarIdr: Math.max(0, taxTotal - Math.round(credit)),
    lebihBayarIdr: Math.max(0, Math.round(credit) - taxTotal),
    jenisPenghasilan:
      "Penghasilan lain: keuntungan trading valas/CFD (objek PPh non-final, digabung dengan penghasilan lain)",
    namaPajak: "PPh Pasal 29 Orang Pribadi (kekurangan bayar SPT Tahunan)",
    dasarHukum:
      "UU PPh Pasal 4 ayat (1), Pasal 6 ayat (1), Pasal 17 ayat (1) huruf a (UU 7/2021 HPP); PTKP PMK 101/PMK.010/2016",
    kodeAkunPajak: "411125",
    kodeJenisSetoran: "200",
    jatuhTempo: `${input.year + 1}-03-31`,
  };
}
