import { useEffect, useState } from "react";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import { calculatorUrlFromHolding } from "../../lib/calculatorPageView";
import { accountMetrics, GROUP_TABS, groupSymbolTabs, type GroupPageParams } from "../../lib/groupPageView";
import { formatIdr, formatUsd } from "../../lib/historyPageView";
import { formatPrice } from "../../lib/tickSize";
import type { RiskGroupId } from "../../lib/riskGroup";
import { useBrokerPositions } from "../../hooks/useBrokerPositions";
import { useEquityStream } from "../../hooks/useEquityStream";
import { fetchBackendRates, usdIdrRate, type ExchangeRates } from "../../services/fxRateService";
import type { BrokerId } from "../../types/broker";

/** Butir 1 G1: halaman per golongan — tab golongan, tab simbol ala MT5, metrik akun USD + Rp. */
export function GroupPage({ params }: { params: GroupPageParams }) {
  const [broker, setBroker] = useState<BrokerId>(params.broker);
  const [group, setGroup] = useState<RiskGroupId>(params.group);
  const [selected, setSelected] = useState(params.symbol);
  const [fx, setFx] = useState<ExchangeRates | null>(null);
  const [book, setBook] = useState<{ broker: BrokerId; symbols: string[] } | null>(null);
  const [live, setLive] = useState<{ key: string; bid: number; ask: number } | null>(null);
  const { equity } = useEquityStream(5000, broker);
  const { positions } = useBrokerPositions(broker, 5000);

  useEffect(() => {
    void fetchBackendRates(API_BASE_URL).then(setFx);
  }, []);

  // Simbol Market Watch broker (GET /api/quotes?broker=).
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/quotes?broker=${broker}`)
      .then((r) => (r.ok ? r.json() : { symbols: [] }))
      .then((j: { symbols?: unknown }) => {
        const list = Array.isArray(j.symbols) ? j.symbols.filter((x): x is string => typeof x === "string") : [];
        if (!cancelled) setBook({ broker, symbols: list });
      })
      .catch(() => {
        if (!cancelled) setBook({ broker, symbols: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [broker]);

  const kurs = usdIdrRate(fx);
  const tabs = groupSymbolTabs(
    book?.broker === broker ? book.symbols : [],
    positions.map((p) => p.symbol),
    group,
  );
  const active = tabs.some((t) => t.symbol === selected) ? selected : (tabs[0]?.symbol ?? "");
  const liveKey = `${broker}|${active}`;

  // Harga live simbol aktif, tiap 3 detik.
  useEffect(() => {
    if (active === "") return;
    let cancelled = false;
    const load = (): void => {
      fetch(`${API_BASE_URL}/api/quotes/${encodeURIComponent(active)}?broker=${broker}&limit=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { data?: { bid?: unknown; ask?: unknown }[] } | null) => {
          const q = j?.data?.[j.data.length - 1];
          if (cancelled || q === undefined || typeof q.bid !== "number" || typeof q.ask !== "number") return;
          setLive({ key: `${broker}|${active}`, bid: q.bid, ask: q.ask });
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [broker, active]);
  const liveNow = live !== null && live.key === liveKey ? live : null;
  const activePositions = positions.filter((p) => p.symbol.trim().toUpperCase() === active);
  const metrics = accountMetrics(equity, kurs);

  const pill = (on: boolean): string =>
    `min-h-11 rounded-xl px-4 text-sm font-semibold ${on ? "bg-emerald-700 text-white" : "border border-white/15 text-slate-300 hover:bg-white/5"}`;

  return (
    <div className="min-h-screen bg-slate-950 px-3 py-4 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <a href="/" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">
            <ArrowLeft size={16} /> Dashboard
          </a>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <LayoutGrid size={20} className="text-emerald-400" /> Golongan
          </h1>
          <div className="ml-auto inline-flex gap-2">
            <button type="button" className={pill(broker === "finex")} onClick={() => { setBroker("finex"); setSelected(""); }}>Finex</button>
            <button type="button" className={pill(broker === "orbitraderberjangka")} onClick={() => { setBroker("orbitraderberjangka"); setSelected(""); }}>OTB</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="group-metrics">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase text-slate-400">{m.label}</p>
              {m.percent !== undefined ? (
                <p className="text-lg font-bold text-sky-300">{m.percent === null ? "-" : `${m.percent.toFixed(2).replace(".", ",")}%`}</p>
              ) : (
                <>
                  <p className="text-lg font-bold">{m.usd === null ? "-" : `$${formatUsd(m.usd)}`}</p>
                  <p className="text-xs text-slate-400">{m.idr === null ? "-" : formatIdr(m.idr)}</p>
                </>
              )}
            </div>
          ))}
        </div>

        <div role="tablist" aria-label="Golongan" className="flex flex-wrap gap-2" data-testid="group-tabs">
          {GROUP_TABS.map((g) => (
            <button key={g.id} type="button" role="tab" aria-selected={g.id === group} className={pill(g.id === group)} onClick={() => { setGroup(g.id); setSelected(""); }}>
              {g.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
          <div className="min-h-64 p-4" data-testid="group-chart">
            {active === "" ? (
              <p className="text-sm text-slate-400">{book?.broker === broker ? "Tidak ada simbol golongan ini di Market Watch broker." : "memuat…"}</p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="text-xl font-bold">{active}</span>
                  <span className="ml-auto font-mono text-lg text-sky-300">
                    {liveNow === null ? "harga live belum ada" : `${formatPrice(liveNow.bid, active)} / ${formatPrice(liveNow.ask, active)}`}
                  </span>
                </div>
                {activePositions.map((p) => (
                  <p key={p.ticket} className="text-sm text-slate-300">
                    {p.side === "SELL" ? "JUAL" : "BELI"} {p.volume} lot @ {p.priceOpen} · SL {p.sl || "-"} · TP {p.tp || "-"}{" "}
                    <a
                      className="font-semibold text-emerald-300 hover:underline"
                      target="_blank"
                      rel="noopener"
                      href={calculatorUrlFromHolding({ brokerId: broker, symbol: p.symbol, direction: p.side === "SELL" ? "JUAL" : "BELI", lot: p.volume, entryPrice: p.priceOpen, sl: p.sl, tp: p.tp })}
                    >
                      Kalkulator ↗
                    </a>
                  </p>
                ))}
                <p className="text-xs text-slate-500">Chart candle H1 menyusul (langkah G2).</p>
              </div>
            )}
          </div>
          <div role="tablist" aria-label="Simbol" className="flex flex-wrap border-t border-white/10 bg-slate-950/60" data-testid="group-symbol-tabs">
            {tabs.map((t) => (
              <button
                key={t.symbol}
                type="button"
                role="tab"
                aria-selected={t.symbol === active}
                onClick={() => setSelected(t.symbol)}
                className={`min-h-11 border-r border-white/10 px-4 font-mono text-xs ${t.symbol === active ? "bg-slate-900 text-white shadow-[inset_0_3px_0_#10b981]" : "text-slate-400 hover:bg-white/5"}`}
              >
                {t.symbol}
                {t.openCount > 0 && <span className="ml-2 rounded bg-emerald-700 px-1.5 text-[10px] text-white">{t.openCount} posisi</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
