import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import { formatIdr, formatUsd } from "../../lib/historyPageView";
import { buildStockPortfolio, type DealLike, type StockHolding } from "../../lib/stockPortfolio";
import type { BrokerId } from "../../types/broker";

interface Account {
  readonly login: string;
  readonly label: string;
  readonly broker: BrokerId | null;
}

/** Butir 2 P1: tabel portofolio saham per akun broker (dari History MT5). */
export function StockPortfolio({ broker }: { broker: BrokerId }) {
  const [data, setData] = useState<{ broker: BrokerId; items: { account: Account; rows: StockHolding[] }[] } | null>(null);

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
            return { account, rows: buildStockPortfolio(b.view?.rows ?? []) };
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
  const filled = now?.items.filter((i) => i.rows.length > 0) ?? [];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid="stock-portfolio">
      <h2 className="text-lg font-bold">Portofolio saham</h2>
      <p className="mb-3 text-xs text-slate-400">
        Dari History MT5 tiap akun. Lembar = lot × contract size (hanya simbol yang sudah dicek di MT5 Specification). Hasil = untung/rugi yang sudah ditutup, kurs ECB tanggal transaksi.
      </p>
      {now === null ? (
        <p className="text-sm text-slate-400">memuat…</p>
      ) : filled.length === 0 ? (
        <p className="text-sm text-slate-400">Belum ada transaksi saham di akun {broker === "finex" ? "Finex" : "OTB"}.</p>
      ) : (
        filled.map(({ account, rows }) => (
          <div key={account.login} className="mb-3 overflow-x-auto">
            <p className="mb-1 text-sm font-semibold text-slate-200">{account.label} ({account.login})</p>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-2 py-1 text-left">Simbol</th>
                  <th className="px-2 py-1 text-right">Dibeli (lot)</th>
                  <th className="px-2 py-1 text-right">Harga beli rata-rata</th>
                  <th className="px-2 py-1 text-right">Terjual (lot)</th>
                  <th className="px-2 py-1 text-right">Harga jual rata-rata</th>
                  <th className="px-2 py-1 text-right">Dipegang</th>
                  <th className="px-2 py-1 text-right">Hasil ditutup</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol} className="border-t border-white/5">
                    <td className="px-2 py-1 font-mono">{r.symbol}</td>
                    <td className="px-2 py-1 text-right">{r.boughtLot}</td>
                    <td className="px-2 py-1 text-right font-mono">{r.avgBuy === null ? "-" : r.avgBuy.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">{r.soldLot}</td>
                    <td className="px-2 py-1 text-right font-mono">{r.avgSell === null ? "-" : r.avgSell.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">
                      {r.heldLot} lot
                      <span className="block text-xs text-slate-400">
                        {r.heldShares === null ? "lembar: contract belum dicek" : `= ${String(r.heldShares).replace(".", ",")} lembar`}
                      </span>
                    </td>
                    <td className={`px-2 py-1 text-right ${r.realizedUsd < 0 ? "text-rose-300" : r.realizedUsd > 0 ? "text-sky-300" : "text-slate-300"}`}>
                      {formatIdr(r.realizedIdr)}
                      <span className="block text-xs">{formatUsd(r.realizedUsd)} USD</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.some((r) => r.hasShort) && (
              <p className="mt-1 text-xs text-amber-300">Ada transaksi jual-buka (short) — tidak dihitung sebagai saham dipegang.</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
