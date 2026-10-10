import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import { formatIdr, formatUsd } from "../../lib/historyPageView";
import { formatPrice } from "../../lib/tickSize";
import { riskGroupOf, type RiskGroupId } from "../../lib/riskGroup";
import { buildTradeSummary, type DealLike, type StockHolding } from "../../lib/stockPortfolio";
import type { BrokerId } from "../../types/broker";
import { BROKER_SHORT_LABEL } from "../../lib/brokerRegistry";

interface Account {
  readonly login: string;
  readonly label: string;
  readonly broker: BrokerId | null;
}

const lembar = (n: number | null): string => (n === null ? "lembar: contract belum dicek" : `= ${String(n).replace(".", ",")} lembar`);
const harga = (n: number | null, symbol: string): string => (n === null ? "-" : formatPrice(n, symbol));

/**
 * Butir 2 (9 Okt 2026): ringkasan transaksi per simbol dari History MT5,
 * untuk golongan aktif halaman Golongan. Saham → "Portofolio saham"
 * (dibeli/terjual/dipegang + lembar); lainnya → buka BELI/JUAL, ditutup, terbuka.
 */
export function StockPortfolio({ broker, group }: { broker: BrokerId; group: RiskGroupId }) {
  const [data, setData] = useState<{ broker: BrokerId; items: { account: Account; deals: DealLike[] }[] } | null>(null);
  const isStock = group === "SAHAM_AS";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/history`);
        const body = (await res.json()) as { accounts?: Account[] };
        const mine = (body.accounts ?? []).filter((a) => a.broker === broker);
        const items = await Promise.all(
          mine.map(async (account) => {
            const r = await fetch(`${API_BASE_URL}/api/history/${account.login}`);
            const b = r.ok ? ((await r.json()) as { view?: { rows?: DealLike[] } }) : {};
            return { account, deals: b.view?.rows ?? [] };
          }),
        );
        if (!cancelled) setData({ broker, items });
      } catch {
        if (!cancelled) setData({ broker, items: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [broker]);

  const now = data !== null && data.broker === broker ? data : null;
  const filled = (now?.items ?? [])
    .map((i) => ({ account: i.account, rows: buildTradeSummary(i.deals, (s) => riskGroupOf(s).id === group) }))
    .filter((i) => i.rows.length > 0);
  const tone = (n: number): string => (n < 0 ? "text-rose-300" : n > 0 ? "text-sky-300" : "text-slate-300");
  const hasil = (r: StockHolding) => (
    <td className={`px-2 py-1 text-right ${tone(r.realizedUsd)}`}>
      {formatIdr(r.realizedIdr)}
      <span className="block text-xs">{formatUsd(r.realizedUsd)} USD</span>
    </td>
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid="stock-portfolio">
      <h2 className="text-lg font-bold">{isStock ? "Portofolio saham" : "Ringkasan transaksi"}</h2>
      <p className="mb-3 text-xs text-slate-400">
        Dari History MT5 tiap akun.{" "}
        {isStock
          ? "Lembar = lot × contract size (hanya simbol yang sudah dicek di MT5 Specification)."
          : "Buka BELI / buka JUAL = posisi yang dibuka; ditutup = lot yang sudah ditutup."}{" "}
        Hasil = untung/rugi yang sudah ditutup (+ komisi/swap), kurs ECB tanggal transaksi.
      </p>
      {now === null ? (
        <p className="text-sm text-slate-400">memuat…</p>
      ) : filled.length === 0 ? (
        <p className="text-sm text-slate-400">Belum ada transaksi golongan ini di akun {BROKER_SHORT_LABEL[broker]}.</p>
      ) : (
        filled.map(({ account, rows }) => (
          <div key={account.login} className="mb-3 overflow-x-auto">
            <p className="mb-1 text-sm font-semibold text-slate-200">{account.label} ({account.login})</p>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-400">
                {isStock ? (
                  <tr>
                    <th className="px-2 py-1 text-left">Simbol</th>
                    <th className="px-2 py-1 text-right">Dibeli</th>
                    <th className="px-2 py-1 text-right">Harga beli rata-rata</th>
                    <th className="px-2 py-1 text-right">Terjual</th>
                    <th className="px-2 py-1 text-right">Harga jual rata-rata</th>
                    <th className="px-2 py-1 text-right">Sisa dipegang</th>
                    <th className="px-2 py-1 text-right">Hasil ditutup</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="px-2 py-1 text-left">Simbol</th>
                    <th className="px-2 py-1 text-right">Buka BELI (lot · harga rata2)</th>
                    <th className="px-2 py-1 text-right">Buka JUAL (lot · harga rata2)</th>
                    <th className="px-2 py-1 text-right">Ditutup (lot)</th>
                    <th className="px-2 py-1 text-right">Masih terbuka (lot)</th>
                    <th className="px-2 py-1 text-right">Hasil ditutup</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.map((r) =>
                  isStock ? (
                    <tr key={r.symbol} className="border-t border-white/5">
                      <td className="px-2 py-1 font-mono">{r.symbol}</td>
                      <td className="px-2 py-1 text-right">{r.boughtLot} lot<span className="block text-xs text-slate-400">{lembar(r.boughtShares)}</span></td>
                      <td className="px-2 py-1 text-right font-mono">{harga(r.avgBuy, r.symbol)}</td>
                      <td className="px-2 py-1 text-right">{r.soldLot} lot<span className="block text-xs text-slate-400">{lembar(r.soldShares)}</span></td>
                      <td className="px-2 py-1 text-right font-mono">{harga(r.avgSell, r.symbol)}</td>
                      <td className="px-2 py-1 text-right">{r.heldLot} lot<span className="block text-xs text-slate-400">{lembar(r.heldShares)}</span></td>
                      {hasil(r)}
                    </tr>
                  ) : (
                    <tr key={r.symbol} className="border-t border-white/5">
                      <td className="px-2 py-1 font-mono">{r.symbol}</td>
                      <td className="px-2 py-1 text-right">{r.boughtLot}<span className="block text-xs text-slate-400">{harga(r.avgBuy, r.symbol)}</span></td>
                      <td className="px-2 py-1 text-right">{r.openSellLot}<span className="block text-xs text-slate-400">{harga(r.avgOpenSell, r.symbol)}</span></td>
                      <td className="px-2 py-1 text-right">{r.closedLot}</td>
                      <td className={`px-2 py-1 text-right ${r.openLot > 0 ? "font-bold text-amber-200" : ""}`}>{r.openLot}</td>
                      {hasil(r)}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            {isStock && rows.some((r) => r.hasShort) && (
              <p className="mt-1 text-xs text-amber-300">Ada transaksi jual-buka (short) — tidak dihitung sebagai saham dipegang.</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
