import type { HistoryDeal } from "./historyCsv";

/**
 * #505 - logika murni jurnal pajak Finex (tanpa I/O).
 * - Impor anti-duplikat per dealTicket; kurs & catatan manual TIDAK ditimpa.
 * - Rekap per tahun: profit, swap, komisi, fee, netto USD; setoran/penarikan
 *   dipisah (BALANCE bukan penghasilan). Netto Rupiah memakai kurs pajak
 *   (KMK) yang diisi pengguna per transaksi; transaksi tanpa kurs dihitung
 *   terpisah (tanpaKurs) agar tidak ada angka tebakan.
 * Catatan: alat bantu pencatatan, bukan nasihat pajak/konsultan.
 */
export interface JurnalEntry extends HistoryDeal {
  /** Kurs pajak (KMK) Rp per 1 USD pada tanggal transaksi; null = belum diisi. */
  readonly kursIdr: number | null;
  readonly catatan: string;
}

export interface JurnalYearSummary {
  readonly year: string;
  readonly profitUsd: number;
  readonly swapUsd: number;
  readonly commissionUsd: number;
  readonly feeUsd: number;
  readonly nettoUsd: number;
  readonly depositUsd: number;
  readonly withdrawalUsd: number;
  readonly nettoIdr: number;
  readonly dealCount: number;
  readonly tanpaKurs: number;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

export function isTradeDeal(deal: Pick<HistoryDeal, "type">): boolean {
  return deal.type === "BUY" || deal.type === "SELL";
}

export function dealNettoUsd(
  deal: Pick<HistoryDeal, "profit" | "swap" | "commission" | "fee">,
): number {
  return deal.profit + deal.swap + deal.commission + deal.fee;
}

export function mergeDeals(
  existing: readonly JurnalEntry[],
  incoming: readonly HistoryDeal[],
): { entries: JurnalEntry[]; added: number } {
  const seen = new Set(existing.map((e) => e.dealTicket));
  const entries: JurnalEntry[] = [...existing];
  let added = 0;
  for (const deal of incoming) {
    if (seen.has(deal.dealTicket)) continue;
    seen.add(deal.dealTicket);
    entries.push({ ...deal, kursIdr: null, catatan: "" });
    added++;
  }
  entries.sort((a, b) => a.serverTime.localeCompare(b.serverTime));
  return { entries, added };
}

export function updateEntry(
  entries: readonly JurnalEntry[],
  dealTicket: string,
  patch: { kursIdr?: number | null; catatan?: string },
): JurnalEntry[] | null {
  if (!entries.some((e) => e.dealTicket === dealTicket)) return null;
  return entries.map((e) => {
    if (e.dealTicket !== dealTicket) return e;
    const kurs =
      patch.kursIdr === undefined
        ? e.kursIdr
        : patch.kursIdr !== null &&
            Number.isFinite(patch.kursIdr) &&
            patch.kursIdr > 0
          ? patch.kursIdr
          : null;
    return {
      ...e,
      kursIdr: kurs,
      catatan: patch.catatan === undefined ? e.catatan : patch.catatan.trim(),
    };
  });
}

export function summarizeByYear(
  entries: readonly JurnalEntry[],
): JurnalYearSummary[] {
  const map = new Map<
    string,
    {
      profit: number;
      swap: number;
      commission: number;
      fee: number;
      deposit: number;
      withdrawal: number;
      idr: number;
      count: number;
      tanpaKurs: number;
    }
  >();
  for (const e of entries) {
    const year = e.serverTime.slice(0, 4);
    const y = map.get(year) ?? {
      profit: 0,
      swap: 0,
      commission: 0,
      fee: 0,
      deposit: 0,
      withdrawal: 0,
      idr: 0,
      count: 0,
      tanpaKurs: 0,
    };
    if (e.type === "BALANCE") {
      if (e.profit >= 0) y.deposit += e.profit;
      else y.withdrawal += -e.profit;
    } else if (isTradeDeal(e)) {
      y.profit += e.profit;
      y.swap += e.swap;
      y.commission += e.commission;
      y.fee += e.fee;
      y.count++;
      const net = dealNettoUsd(e);
      if (e.kursIdr !== null) y.idr += net * e.kursIdr;
      else if (net !== 0) y.tanpaKurs++;
    }
    map.set(year, y);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, y]) => ({
      year,
      profitUsd: r2(y.profit),
      swapUsd: r2(y.swap),
      commissionUsd: r2(y.commission),
      feeUsd: r2(y.fee),
      nettoUsd: r2(y.profit + y.swap + y.commission + y.fee),
      depositUsd: r2(y.deposit),
      withdrawalUsd: r2(y.withdrawal),
      nettoIdr: Math.round(y.idr),
      dealCount: y.count,
      tanpaKurs: y.tanpaKurs,
    }));
}
