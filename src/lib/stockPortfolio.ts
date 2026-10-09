/**
 * Butir 2 P1 (9 Okt 2026) — portofolio saham dari History MT5. MURNI.
 * Per simbol saham (`.US` OTB, `#…` Finex): lot dibeli (deal IN BUY) &
 * harga beli rata-rata, lot terjual (deal OUT SELL) & harga jual rata-rata,
 * sisa lot dipegang, hasil terealisasi (profit+swap+komisi+fee, USD & Rp
 * kurs ECB tanggal transaksi). Lembar = lot × contract size HANYA bila
 * contract terverifikasi dari MT5 Specification (tanpa tebakan).
 */
export interface DealLike {
  readonly symbol: string;
  readonly type: string;
  readonly entry: string;
  readonly volume: number;
  readonly price: number;
  readonly commission: number;
  readonly swap: number;
  readonly profit: number;
  readonly fee: number;
  readonly commissionIdr: number | null;
  readonly profitIdr: number | null;
  readonly swapIdr: number | null;
}

/** Contract size saham yang SUDAH diverifikasi dari MT5 Specification. */
export const VERIFIED_STOCK_CONTRACT: Readonly<Record<string, number>> = {
  "META.US": 1, // OTB, Specification 9 Okt 2026 (margin 20% ≈ 144,15 USD/lot @720,73)
};

export function isStockSymbol(symbol: string): boolean {
  const s = symbol.trim().toUpperCase();
  return s.endsWith(".US") || (s.startsWith("#") && s.length > 1);
}

export interface StockHolding {
  readonly symbol: string;
  readonly boughtLot: number;
  readonly avgBuy: number | null;
  readonly soldLot: number;
  readonly avgSell: number | null;
  readonly heldLot: number;
  /** null = contract size belum terverifikasi. */
  readonly heldShares: number | null;
  readonly contract: number | null;
  readonly realizedUsd: number;
  /** null bila ada transaksi tanpa kurs ECB. */
  readonly realizedIdr: number | null;
  /** Ada transaksi jual-buka (short) yang tidak masuk hitungan sisa lot. */
  readonly hasShort: boolean;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const lot = (n: number): number => Math.round(n * 1000) / 1000;

export function buildStockPortfolio(deals: readonly DealLike[]): StockHolding[] {
  const map = new Map<string, DealLike[]>();
  for (const d of deals) {
    const s = d.symbol.trim().toUpperCase();
    if (!isStockSymbol(s)) continue;
    map.set(s, [...(map.get(s) ?? []), d]);
  }
  const out: StockHolding[] = [];
  for (const [symbol, list] of map) {
    const type = (d: DealLike): string => d.type.trim().toUpperCase();
    const entry = (d: DealLike): string => d.entry.trim().toUpperCase();
    const buys = list.filter((d) => entry(d) === "IN" && type(d) === "BUY");
    const sells = list.filter((d) => entry(d) === "OUT" && type(d) === "SELL");
    const boughtLot = lot(buys.reduce((s, d) => s + d.volume, 0));
    const soldLot = lot(sells.reduce((s, d) => s + d.volume, 0));
    const avg = (xs: DealLike[], total: number): number | null =>
      total > 0 ? r2(xs.reduce((s, d) => s + d.volume * d.price, 0) / total) : null;
    let usd = 0;
    let idr: number | null = 0;
    for (const d of list) {
      usd += d.profit + d.swap + d.commission + d.fee;
      const parts = [d.profit === 0 ? 0 : d.profitIdr, d.swap === 0 ? 0 : d.swapIdr, d.commission === 0 ? 0 : d.commissionIdr];
      if (idr !== null) idr = parts.some((p) => p === null) ? null : idr + parts.reduce<number>((s, p) => s + (p ?? 0), 0);
    }
    const heldLot = lot(Math.max(0, boughtLot - soldLot));
    const contract = VERIFIED_STOCK_CONTRACT[symbol] ?? null;
    out.push({
      symbol,
      boughtLot,
      avgBuy: avg(buys, boughtLot),
      soldLot,
      avgSell: avg(sells, soldLot),
      heldLot,
      heldShares: contract === null ? null : lot(heldLot * contract),
      contract,
      realizedUsd: r2(usd),
      realizedIdr: idr === null ? null : Math.round(idr),
      hasShort: list.some((d) => entry(d) === "IN" && type(d) === "SELL"),
    });
  }
  return out.sort((a, b) => b.heldLot - a.heldLot || a.symbol.localeCompare(b.symbol));
}
