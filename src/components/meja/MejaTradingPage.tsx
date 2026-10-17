import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import { useEquityStream } from "../../hooks/useEquityStream";
import { useSymbolScan } from "../../hooks/useSymbolScan";
import { fetchBackendRates, usdIdrRate, type ExchangeRates } from "../../services/fxRateService";
import { canonicalSymbolForBroker } from "../../lib/brokerSymbols";
import { BROKER_IDS } from "../../lib/brokerRegistry";
import { formatPrice } from "../../lib/tickSize";
import { jarakHarga, jarakText } from "../../lib/pipDistance";
import { profitRangeOf } from "../../lib/profitTarget";
import { mejaTradingUrl } from "../../lib/mejaTradingView";
import type { ScanRow } from "../../lib/symbolScanner";
import type { BrokerId } from "../../types/broker";
import { STATUS_VIEW } from "../analysis/SymbolScannerPanel";
import { ScanCopyButtons } from "../analysis/ScanCopyButtons";
import { AutoPositionsSection } from "../holdings/AutoPositionsSection";
import { StatusKesehatanStrip } from "../dashboard/StatusKesehatanStrip";
import { MiniCandleChart } from "./MiniCandleChart";

const BROKER_NAME: Record<BrokerId, string> = { finex: "Finex", orbitraderberjangka: "OTB", mifx: "MIFX", exness: "Exness" };

function rupiahText(idr: number | null, signed = false): string {
  if (idr === null) return "-";
  const sign = signed ? (idr >= 0 ? "+" : "−") : "";
  return `${sign}Rp${Math.abs(Math.round(idr)).toLocaleString("id-ID")}`;
}

function sinyalLabel(row: ScanRow): { label: string; className: string } {
  if (row.status === "LOLOS" && row.plan) {
    return row.plan.direction === "BELI"
      ? { label: "Sinyal BELI", className: "bg-emerald-400/15 text-emerald-300" }
      : { label: "Sinyal JUAL", className: "bg-rose-400/15 text-rose-300" };
  }
  return STATUS_VIEW[row.status];
}

/**
 * Meja Trading (17 Okt 2026): satu halaman untuk entry cepat — daftar sinyal (pemindai Mode Aman
 * yang SAMA dengan dashboard, src/hooks/useSymbolScan.ts), chart H1, kartu order dengan tombol
 * [Entry] [SL] [TP] (ScanCopyButtons, kunci 10 dtk), dan posisi MT5 terbuka + profit Rupiah.
 * MDBKA hanya menyalin angka; order (Buy Stop / Sell Limit) tetap ditempatkan Fahmi di MT5.
 */
export function MejaTradingPage({ broker: initialBroker }: { readonly broker: BrokerId }) {
  const [broker, setBroker] = useState<BrokerId>(initialBroker);
  const [fx, setFx] = useState<ExchangeRates | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [totalUsd, setTotalUsd] = useState<number | null>(null);

  useEffect(() => {
    void fetchBackendRates(API_BASE_URL).then((r) => setFx(r));
  }, []);

  const equityStream = useEquityStream(5000, broker);
  const equity =
    equityStream.equity !== null && Number.isFinite(equityStream.equity.equity) && equityStream.equity.equity > 0
      ? equityStream.equity.equity
      : null;
  const scan = useSymbolScan(broker, equity ?? 0, fx);
  const kurs = usdIdrRate(fx);

  const row = useMemo(
    () => scan.rows.find((r) => r.symbol === selected) ?? scan.rows.find((r) => r.status === "LOLOS") ?? scan.rows[0] ?? null,
    [scan.rows, selected],
  );
  const item = row === null ? undefined : scan.source.find((i) => canonicalSymbolForBroker(i.symbol, broker) === row.symbol);
  const plan = row !== null && row.status === "LOLOS" ? (row.plan ?? null) : null;
  const toIdr = (usd: number | null | undefined): number | null => (usd === null || usd === undefined || kurs === null ? null : usd * kurs);
  const lolos = scan.rows.filter((r) => r.status === "LOLOS").length;

  const pilihBroker = (b: BrokerId): void => {
    setBroker(b);
    setSelected(null);
    window.history.replaceState(null, "", mejaTradingUrl(b));
  };

  return (
    <div className="min-h-screen bg-slate-950 px-3 py-4 text-white sm:px-6" data-testid="meja-trading-page">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <a href="/" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">
            <ArrowLeft size={16} /> Dashboard
          </a>
          <h1 className="text-xl font-bold">Meja Trading</h1>
          <div className="flex gap-1" data-testid="meja-broker-tabs">
            {BROKER_IDS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => pilihBroker(b)}
                className={`rounded-full border px-3 py-1 text-sm ${b === broker ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200" : "border-white/10 text-slate-300 hover:bg-white/5"}`}
              >
                {BROKER_NAME[b]}
              </button>
            ))}
          </div>
          <StatusKesehatanStrip />
          <button type="button" onClick={scan.rescan} className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">
            <RefreshCw size={14} /> Pindai ulang{scan.fetchedAt !== null ? ` · ${scan.fetchedAt}` : ""}
          </button>
        </div>

        {equity === null && <p className="text-xs text-amber-300">Menunggu equity live {BROKER_NAME[broker]} — sampai tersambung, hitungan risiko memakai equity 0 (sinyal bisa tertahan).</p>}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
              <div className="mb-1 flex items-baseline gap-2 px-1">
                <span className="text-lg font-bold">{row?.symbol ?? "-"}</span>
                <span className="text-xs text-slate-500">H1 · {BROKER_NAME[broker]}</span>
              </div>
              {item !== undefined && row !== null ? (
                <MiniCandleChart csv={item.csv} symbol={row.symbol} plan={plan} />
              ) : (
                <p className="p-6 text-center text-sm text-slate-500">{scan.loading ? "Memindai…" : "Belum ada candle untuk broker ini."}</p>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4" data-testid="meja-order-card">
              {row === null ? (
                <p className="text-sm text-slate-400">Belum ada simbol.</p>
              ) : plan === null ? (
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    {row.symbol}
                    <span className={`rounded-full px-2 py-0.5 text-xs ${sinyalLabel(row).className}`}>{sinyalLabel(row).label}</span>
                  </p>
                  <p className="mt-2 text-sm text-slate-400">{row.reason}</p>
                  <p className="mt-2 text-xs text-slate-500">Tombol salin Entry/SL/TP hanya muncul saat status Lolos (sinyal BELI/JUAL).</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-sm font-bold ${plan.direction === "BELI" ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"}`}>{plan.direction}</span>
                    <span className="text-lg font-bold">{row.symbol}</span>
                    <span className="text-sm text-slate-400">Order MT5: {plan.direction === "BELI" ? "Buy Stop" : "Sell Limit"} · lot {plan.suggestedLot ?? "-"}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl bg-white/5 p-3">
                      <p className="text-xs text-slate-400">Entry (Price)</p>
                      <p className="font-mono text-lg">{formatPrice(plan.entry, row.symbol)}</p>
                    </div>
                    <div className="rounded-xl bg-rose-400/10 p-3">
                      <p className="text-xs text-slate-400">Stop Loss · {jarakText(jarakHarga(row.symbol, plan.entry, plan.stopLoss))}</p>
                      <p className="font-mono text-lg text-rose-200">{formatPrice(plan.stopLoss, row.symbol)}</p>
                    </div>
                    <div className="rounded-xl bg-sky-400/10 p-3">
                      <p className="text-xs text-slate-400">Take Profit · {jarakText(jarakHarga(row.symbol, plan.entry, plan.takeProfit))}</p>
                      <p className="font-mono text-lg text-sky-200">{formatPrice(plan.takeProfit, row.symbol)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="meja-copy">
                    <span className="text-slate-400">Salin ke MT5:</span>
                    <ScanCopyButtons brokerId={broker} symbol={row.symbol} recompute={(q) => scan.recomputePlan(row.symbol, q)} />
                  </div>
                  <p className="text-sm text-slate-300">
                    Profit bila TP kena:{" "}
                    <b className={profitRangeOf(toIdr(plan.profitAtTpUsd)) === "DALAM_RENTANG" ? "text-emerald-300" : "text-white"}>{rupiahText(toIdr(plan.profitAtTpUsd))}</b>
                    {" · "}Risiko lot minimum: <b className="text-white">{rupiahText(toIdr(plan.riskAtMinLot))}</b>
                  </p>
                  <p className="text-xs text-slate-500">
                    Entry disalin apa adanya dari rencana (harga pasar saat dihitung). Buy Stop harus di atas Ask, Sell Limit di atas Bid — geser di MT5 bila ditolak. MDBKA tidak menempatkan order.
                  </p>
                </div>
              )}
            </section>
          </div>

          <aside className="self-start overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]" data-testid="meja-watchlist">
            <div className="flex justify-between border-b border-white/10 px-3 py-2 text-xs text-slate-500">
              <span>Simbol ({scan.rows.length}) · {lolos} sinyal</span>
              <span>Profit di TP</span>
            </div>
            <ul className="max-h-[640px] overflow-y-auto">
              {scan.rows.map((r) => {
                const v = sinyalLabel(r);
                const idr = r.status === "LOLOS" ? toIdr(r.plan?.profitAtTpUsd) : null;
                return (
                  <li key={r.symbol}>
                    <button
                      type="button"
                      onClick={() => setSelected(r.symbol)}
                      data-testid={`meja-row-${r.symbol}`}
                      className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-white/5 px-3 py-2 text-left text-sm hover:bg-white/5 ${row?.symbol === r.symbol ? "bg-white/10" : ""}`}
                    >
                      <span className="font-semibold">{r.symbol}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${v.className}`}>{v.label}</span>
                      <span className={`w-20 text-right text-xs ${profitRangeOf(idr) === "DALAM_RENTANG" ? "text-emerald-300" : "text-slate-400"}`}>
                        {idr === null ? "-" : `${rupiahText(idr)}${profitRangeOf(idr) === "DALAM_RENTANG" ? " ✓" : ""}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4" data-testid="meja-positions">
          <div className="mb-3 flex flex-wrap items-baseline gap-3">
            <span className="text-sm text-slate-400">Profit mengambang total</span>
            <span className={`text-2xl font-bold ${totalUsd !== null && totalUsd < 0 ? "text-rose-300" : "text-emerald-300"}`} data-testid="meja-total-profit">
              {totalUsd === null ? "-" : rupiahText(toIdr(totalUsd), true)}
            </span>
            {totalUsd !== null && <span className="text-xs text-slate-500">{totalUsd >= 0 ? "+" : ""}{totalUsd.toFixed(2)} USD · kurs {kurs === null ? "belum ada" : `Rp${Math.round(kurs).toLocaleString("id-ID")}`}</span>}
          </div>
          <AutoPositionsSection brokerId={broker} fxRates={fx} onTotalProfitChange={setTotalUsd} />
        </section>
      </div>
    </div>
  );
}
