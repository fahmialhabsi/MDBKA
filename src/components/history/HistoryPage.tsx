import { useEffect, useState } from "react";
import { ArrowLeft, History } from "lucide-react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import {
  accountsForBroker,
  formatIdr,
  formatUsd,
  mt5DirectionText,
  mt5TypeText,
  type HistoryAccountLike,
  type HistoryKind,
} from "../../lib/historyPageView";
import type { BrokerId } from "../../types/broker";

interface Row {
  readonly dealTicket: string;
  readonly serverTime: string;
  readonly symbol: string;
  readonly type: string;
  readonly entry: string;
  readonly volume: number;
  readonly price: number;
  readonly commission: number;
  readonly profit: number;
  readonly swap: number;
  readonly changePct: number | null;
  readonly kurs: { readonly date: string; readonly rate: number } | null;
  readonly commissionIdr: number | null;
  readonly profitIdr: number | null;
}
interface Totals {
  readonly net: number;
  readonly credit: number;
  readonly deposit: number;
  readonly withdrawal: number;
  readonly balance: number;
  readonly commission: number;
  readonly profit: number;
}
interface View {
  readonly currency: string;
  readonly rows: readonly Row[];
  readonly totals: Totals;
  readonly totalsIdr: Totals | null;
  readonly sisa: {
    readonly setoranIdr: number;
    readonly penarikanIdr: number;
    readonly hasilBersihIdr: number;
    readonly sisaIdr: number;
    readonly pct: number | null;
  } | null;
  readonly missingRates: number;
}

const BROKER_NAME: Record<BrokerId, string> = {
  finex: "Finex",
  orbitraderberjangka: "OTB (Orbi Trade Berjangka)",
};

function color(n: number | null): string {
  if (n === null || n === 0) return "text-slate-300";
  return n > 0 ? "text-sky-300" : "text-rose-300";
}

/** Halaman History per broker: tab Live/Demo, kolom Rupiah, Sisa setoran. */
export function HistoryPage({ broker }: { broker: BrokerId }) {
  const [accounts, setAccounts] = useState<readonly HistoryAccountLike[] | null>(null);
  const [kind, setKind] = useState<HistoryKind>("demo");
  const [loaded, setLoaded] = useState<{ readonly login: string; readonly view: View | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${API_BASE_URL}/api/history`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b: { accounts?: HistoryAccountLike[] }) => setAccounts(b.accounts ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const pair = accounts === null ? null : accountsForBroker(accounts, broker);
  const account = pair === null ? null : pair[kind];

  useEffect(() => {
    if (account === null) return;
    let cancelled = false;
    void fetch(`${API_BASE_URL}/api/history/${account.login}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b: { view?: View }) => {
        if (!cancelled) setLoaded({ login: account.login, view: b.view ?? null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  const view = account !== null && loaded !== null && loaded.login === account.login ? loaded.view : null;
  const t = view?.totals;
  const ti = view?.totalsIdr ?? null;
  return (
    <div className="min-h-screen bg-slate-950 px-3 py-4 text-white sm:px-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <a href="/" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">
            <ArrowLeft size={16} /> Dashboard
          </a>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <History size={20} className="text-emerald-400" /> History {BROKER_NAME[broker]}
          </h1>
          <div className="ml-auto flex rounded-full border border-white/15 p-1" data-testid="history-tabs">
            {(["live", "demo"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-full px-4 py-1.5 text-sm ${kind === k ? "bg-emerald-500 font-bold text-slate-950" : "text-slate-300"}`}
              >
                {k === "live" ? "Live" : "Demo"}
                {pair !== null && pair[k] !== null ? ` · ${pair[k]?.login}` : ""}
              </button>
            ))}
          </div>
        </div>

        {error !== null && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">Gagal memuat: {error}</p>}
        {pair !== null && account === null && (
          <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            Belum ada akun {kind === "live" ? "Live" : "Demo"} {BROKER_NAME[broker]} (file History MT5 belum ada).
          </p>
        )}
        {account !== null && view === null && error === null && <p className="text-sm text-slate-400">Memuat History…</p>}

        {view !== null && t !== undefined && (
          <>
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[1200px] text-left text-sm" data-testid="history-table">
                <thead className="bg-white/5 text-xs uppercase text-slate-400">
                  <tr>
                    {["Time", "Symbol", "Deal", "Type", "Direction", "Volume", "Price", "Commission", "Profit", "Change", "Komisi (Rp)", "Profit (Rp)"].map((h) => (
                      <th key={h} className={`px-3 py-2 ${h === "Time" || h === "Symbol" || h === "Type" || h === "Direction" ? "" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => (
                    <tr key={r.dealTicket} className="border-t border-white/5">
                      <td className="px-3 py-1.5 font-mono text-xs text-slate-300">{r.serverTime}</td>
                      <td className="px-3 py-1.5">{r.symbol.toLowerCase()}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-400">{r.dealTicket}</td>
                      <td className="px-3 py-1.5">{mt5TypeText(r.type)}</td>
                      <td className="px-3 py-1.5">{mt5DirectionText(r.type, r.entry)}</td>
                      <td className="px-3 py-1.5 text-right">{r.type === "BALANCE" ? "" : r.volume.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right">{r.type === "BALANCE" ? "" : r.price}</td>
                      <td className={`px-3 py-1.5 text-right ${color(r.commission)}`}>{r.commission === 0 ? "" : formatUsd(r.commission)}</td>
                      <td className={`px-3 py-1.5 text-right ${color(r.profit)}`}>{r.profit === 0 && r.entry === "IN" && r.type !== "BALANCE" ? "" : formatUsd(r.profit)}</td>
                      <td className={`px-3 py-1.5 text-right ${color(r.changePct)}`}>{r.changePct === null ? "" : `${formatUsd(r.changePct)} %`}</td>
                      <td className={`px-3 py-1.5 text-right ${color(r.commissionIdr)}`} title={r.kurs === null ? "kurs tidak ada" : `kurs ${r.kurs.date}: Rp${r.kurs.rate}`}>
                        {r.commission === 0 ? "" : formatIdr(r.commissionIdr)}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-semibold ${color(r.profitIdr)}`} title={r.kurs === null ? "kurs tidak ada" : `kurs ${r.kurs.date}: Rp${r.kurs.rate}`}>
                        {r.profit === 0 && r.type !== "BALANCE" ? "" : formatIdr(r.profitIdr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="text-sm font-semibold" data-testid="history-summary">
                  <tr className="border-t border-white/10 bg-white/5">
                    <td colSpan={7} className="px-3 py-2">
                      Profit: {formatUsd(t.net)} · Credit: {formatUsd(t.credit)} · Deposit: {formatUsd(t.deposit)} · Withdrawal: {formatUsd(t.withdrawal)} · Balance: {formatUsd(t.balance)} {view.currency}
                    </td>
                    <td className="px-3 py-2 text-right">{formatUsd(t.commission)}</td>
                    <td className="px-3 py-2 text-right">{formatUsd(t.profit)}</td>
                    <td colSpan={3} />
                  </tr>
                  <tr className="border-t border-white/10 bg-emerald-400/5 text-emerald-100">
                    <td colSpan={7} className="px-3 py-2">
                      {ti === null
                        ? `Rupiah belum lengkap: ${view.missingRates} baris tanpa kurs ECB.`
                        : `Profit: ${formatIdr(ti.net)} · Credit: ${formatIdr(ti.credit)} · Deposit: ${formatIdr(ti.deposit)} · Withdrawal: ${formatIdr(ti.withdrawal)} · Balance: ${formatIdr(ti.balance)}`}
                    </td>
                    <td colSpan={3} />
                    <td className="px-3 py-2 text-right">{ti === null ? "–" : formatIdr(ti.commission)}</td>
                    <td className="px-3 py-2 text-right">{ti === null ? "–" : formatIdr(ti.profit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {view.sisa !== null && (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4" data-testid="history-sisa">
                <p className="text-sm font-bold text-emerald-200">Sisa setoran</p>
                <p className="mt-2 text-lg">
                  Setoran <b>{formatIdr(view.sisa.setoranIdr - view.sisa.penarikanIdr)}</b>
                  {" + "}hasil bersih <b className={color(view.sisa.hasilBersihIdr)}>{formatIdr(view.sisa.hasilBersihIdr)}</b>
                  {" = "}<b className="text-white">{formatIdr(view.sisa.sisaIdr)}</b>
                  {view.sisa.pct !== null && (
                    <span className={`ml-2 text-sm ${color(view.sisa.pct)}`}>({view.sisa.pct > 0 ? "+" : ""}{formatUsd(view.sisa.pct)}% dari setoran)</span>
                  )}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Rupiah tiap baris memakai kurs ECB pada tanggal transaksi (akhir pekan → hari kerja sebelumnya). Karena itu
                  angka ini bisa sedikit berbeda dari header (Balance USD × kurs hari ini). Arahkan mouse ke angka Rupiah untuk
                  melihat kurs yang dipakai.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
