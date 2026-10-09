import type { HistoryDeal } from "../types/historyCsv";
import { usdIdrOn, type UsdIdrBook } from "./ecbHistory";

/**
 * Halaman History H2a (9 Okt 2026) — tabel History MT5 + kolom Rupiah.
 *
 * Penetapan Fahmi: tiap baris dihitung dengan kurs ECB TANGGAL transaksi
 * (`usdIdrOn`, akhir pekan → hari kerja sebelumnya). Ringkasan meniru
 * baris bawah tab History MT5 (Profit · Credit · Deposit · Withdrawal ·
 * Balance · Komisi · Profit) + versi Rupiah + kotak "Sisa setoran"
 * (= setoran Rp − penarikan Rp + hasil bersih Rp; penjumlahan, bukan
 * perkalian). Setoran yang punya nilai Rupiah asli (komentar "IDR …")
 * memakai nilai asli itu. Kurs tidak ada → Rupiah null (jujur, bukan 0).
 * MURNI: tanpa fs.
 */
export interface HistoryRow {
  readonly dealTicket: string;
  readonly positionId: string;
  readonly serverTime: string;
  readonly symbol: string;
  readonly type: string;
  readonly entry: string;
  readonly volume: number;
  readonly price: number;
  readonly commission: number;
  readonly swap: number;
  readonly profit: number;
  readonly fee: number;
  readonly comment: string;
  /** Change MT5 (%) = gerak harga posisi yang menguntungkan; hanya deal OUT. */
  readonly changePct: number | null;
  /** Kurs USD→Rp yang dipakai baris ini + tanggal kursnya. */
  readonly kurs: { readonly date: string; readonly rate: number } | null;
  readonly commissionIdr: number | null;
  readonly profitIdr: number | null;
  readonly swapIdr: number | null;
}

export interface HistoryTotals {
  /** Hasil bersih trade = profit + komisi + swap + fee (baris "Profit:" MT5). */
  readonly net: number;
  readonly credit: number;
  readonly deposit: number;
  readonly withdrawal: number;
  readonly balance: number;
  readonly commission: number;
  /** Jumlah kolom Profit deal trade saja (kanan bawah MT5). */
  readonly profit: number;
  readonly swap: number;
}

export interface SisaSetoran {
  readonly setoranIdr: number;
  readonly penarikanIdr: number;
  readonly hasilBersihIdr: number;
  readonly sisaIdr: number;
  /** Persen hasil bersih terhadap setoran (null bila setoran 0). */
  readonly pct: number | null;
}

export interface HistoryView {
  readonly currency: string;
  readonly rows: readonly HistoryRow[];
  readonly totals: HistoryTotals;
  /** Ringkasan Rupiah (jumlah Rupiah per baris); null bila ada baris tanpa kurs. */
  readonly totalsIdr: HistoryTotals | null;
  readonly sisa: SisaSetoran | null;
  /** Jumlah baris tanpa kurs (transaksi > 7 hari dari kurs yang tersimpan). */
  readonly missingRates: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const roundIdr = (n: number): number => Math.round(n);
const TRADE = new Set(["BUY", "SELL"]);

export function buildHistoryView(deals: readonly HistoryDeal[], book: UsdIdrBook): HistoryView {
  const sorted = [...deals].sort((a, b) =>
    a.serverTime < b.serverTime ? -1 : a.serverTime > b.serverTime ? 1 : 0,
  );
  const opened = new Map<string, HistoryDeal>();
  const rows: HistoryRow[] = [];
  const t = { net: 0, credit: 0, deposit: 0, withdrawal: 0, commission: 0, profit: 0, swap: 0 };
  const r = { net: 0, credit: 0, deposit: 0, withdrawal: 0, commission: 0, profit: 0, swap: 0 };
  let missing = 0;
  let currency = "";

  for (const d of sorted) {
    if (currency === "" && d.accountCurrency !== "") currency = d.accountCurrency;
    const kurs = usdIdrOn(book, d.serverTime);
    if (kurs === null) missing += 1;
    const toIdr = (usd: number): number | null => (kurs === null ? null : roundIdr(usd * kurs.rate));

    let changePct: number | null = null;
    if (TRADE.has(d.type) && d.entry === "IN") opened.set(d.positionId, d);
    if (TRADE.has(d.type) && (d.entry === "OUT" || d.entry === "OUT_BY")) {
      const open = opened.get(d.positionId);
      if (open !== undefined && open.price > 0) {
        const sign = open.type === "BUY" ? 1 : -1;
        changePct = round2(((d.price - open.price) / open.price) * 100 * sign);
      }
    }

    // Setoran/penarikan Rupiah asli (komentar "IDR …") diutamakan.
    const profitIdr =
      d.type === "BALANCE" && d.idrAmount !== null
        ? (d.profit < 0 ? -1 : 1) * d.idrAmount
        : toIdr(d.profit);
    const row: HistoryRow = {
      dealTicket: d.dealTicket,
      positionId: d.positionId,
      serverTime: d.serverTime,
      symbol: d.symbol,
      type: d.type,
      entry: d.entry,
      volume: d.volume,
      price: d.price,
      commission: d.commission,
      swap: d.swap,
      profit: d.profit,
      fee: d.fee,
      comment: d.comment,
      changePct,
      kurs,
      commissionIdr: toIdr(d.commission),
      profitIdr,
      swapIdr: toIdr(d.swap),
    };
    rows.push(row);

    const feeIdr = toIdr(d.fee) ?? 0;
    if (d.type === "CREDIT") {
      t.credit += d.profit;
      r.credit += profitIdr ?? 0;
    } else if (d.type === "BALANCE") {
      if (d.profit >= 0) {
        t.deposit += d.profit;
        r.deposit += profitIdr ?? 0;
      } else {
        t.withdrawal += -d.profit;
        r.withdrawal += -(profitIdr ?? 0);
      }
    } else {
      t.net += d.profit + d.commission + d.swap + d.fee;
      t.commission += d.commission;
      t.profit += d.profit;
      t.swap += d.swap;
      r.net += (profitIdr ?? 0) + (row.commissionIdr ?? 0) + (row.swapIdr ?? 0) + feeIdr;
      r.commission += row.commissionIdr ?? 0;
      r.profit += profitIdr ?? 0;
      r.swap += row.swapIdr ?? 0;
    }
  }

  const totals: HistoryTotals = {
    net: round2(t.net),
    credit: round2(t.credit),
    deposit: round2(t.deposit),
    withdrawal: round2(t.withdrawal),
    balance: round2(t.deposit - t.withdrawal + t.net),
    commission: round2(t.commission),
    profit: round2(t.profit),
    swap: round2(t.swap),
  };
  const totalsIdr: HistoryTotals | null =
    missing > 0
      ? null
      : {
          net: roundIdr(r.net),
          credit: roundIdr(r.credit),
          deposit: roundIdr(r.deposit),
          withdrawal: roundIdr(r.withdrawal),
          balance: roundIdr(r.deposit - r.withdrawal + r.net),
          commission: roundIdr(r.commission),
          profit: roundIdr(r.profit),
          swap: roundIdr(r.swap),
        };
  const sisa: SisaSetoran | null =
    totalsIdr === null
      ? null
      : {
          setoranIdr: totalsIdr.deposit,
          penarikanIdr: totalsIdr.withdrawal,
          hasilBersihIdr: totalsIdr.net,
          sisaIdr: totalsIdr.balance,
          pct: totalsIdr.deposit > 0 ? round2((totalsIdr.net / totalsIdr.deposit) * 100) : null,
        };
  return { currency, rows, totals, totalsIdr, sisa, missingRates: missing };
}
