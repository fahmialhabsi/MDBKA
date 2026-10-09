import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calculator } from "lucide-react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import {
  parseInputNumber,
  positionOptionLabel,
  prefillFromPosition,
  symbolOptions,
  type CalculatorPrefill,
} from "../../lib/calculatorPageView";
import { useBrokerPositions } from "../../hooks/useBrokerPositions";
import { formatIdr, formatUsd } from "../../lib/historyPageView";
import { calculateTargets, type CalcDirection } from "../../lib/targetCalculator";
import {
  buildUsdConverter,
  fetchBackendRates,
  usdIdrRate,
  type ExchangeRates,
} from "../../services/fxRateService";
import type { BrokerId } from "../../types/broker";

function tone(n: number): string {
  return n > 0 ? "text-sky-300" : n < 0 ? "text-rose-300" : "text-slate-300";
}

/** Halaman Kalkulator target harga (butir 4): hasil TP/SL, impas, tangga harga Rp. */
export function CalculatorPage({ prefill }: { prefill: CalculatorPrefill }) {
  const [broker, setBroker] = useState<BrokerId>(prefill.broker);
  const [symbol, setSymbol] = useState(prefill.symbol);
  const [direction, setDirection] = useState<CalcDirection>(prefill.direction);
  const [lot, setLot] = useState(prefill.lot);
  const [entry, setEntry] = useState(prefill.entry);
  const [sl, setSl] = useState(prefill.sl);
  const [tp, setTp] = useState(prefill.tp);
  const [fx, setFx] = useState<ExchangeRates | null>(null);
  const [symbolBook, setSymbolBook] = useState<{ broker: BrokerId; symbols: string[] } | null>(null);
  const [pickedTicket, setPickedTicket] = useState("");
  const { positions } = useBrokerPositions(broker, 10_000);

  useEffect(() => {
    void fetchBackendRates(API_BASE_URL).then(setFx);
  }, []);

  // C3: simbol Market Watch broker terpilih (GET /api/quotes?broker=).
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/quotes?broker=${broker}`)
      .then((r) => (r.ok ? r.json() : { symbols: [] }))
      .then((j: { symbols?: unknown }) => {
        const list = Array.isArray(j.symbols) ? j.symbols.filter((x): x is string => typeof x === "string") : [];
        if (!cancelled) setSymbolBook({ broker, symbols: list });
      })
      .catch(() => {
        if (!cancelled) setSymbolBook({ broker, symbols: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [broker]);

  const symbols = symbolOptions(symbolBook?.broker === broker ? symbolBook.symbols : [], symbol);

  function changeBroker(next: BrokerId): void {
    setBroker(next);
    setSymbol("");
    setPickedTicket("");
  }

  function pickPosition(ticket: string): void {
    setPickedTicket(ticket);
    const pos = positions.find((x) => x.ticket === ticket);
    if (pos === undefined) return;
    const p = prefillFromPosition(pos, broker);
    setSymbol(p.symbol);
    setDirection(p.direction);
    setLot(p.lot);
    setEntry(p.entry);
    setSl(p.sl);
    setTp(p.tp);
  }

  const kurs = usdIdrRate(fx);
  const result = useMemo(() => {
    if (symbol.trim() === "" || entry.trim() === "" || sl.trim() === "" || tp.trim() === "") return null;
    return calculateTargets(
      {
        symbol: symbol.trim().toUpperCase(),
        direction,
        lot: parseInputNumber(lot),
        entry: parseInputNumber(entry),
        sl: parseInputNumber(sl),
        tp: parseInputNumber(tp),
      },
      buildUsdConverter(fx),
      kurs,
    );
  }, [symbol, direction, lot, entry, sl, tp, fx, kurs]);

  const field = "w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 font-mono text-white";
  return (
    <div className="min-h-screen bg-slate-950 px-3 py-4 text-white sm:px-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <a href="/" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">
            <ArrowLeft size={16} /> Dashboard
          </a>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Calculator size={20} className="text-emerald-400" /> Kalkulator target harga
          </h1>
          <span className="ml-auto text-xs text-slate-400">Kurs USD→Rp: {kurs === null ? "memuat…" : `Rp${Math.round(kurs).toLocaleString("id-ID")}`}</span>
        </div>

        <label className="block rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-emerald-200">
          Ambil dari posisi terbuka MT5 ({broker === "finex" ? "Finex" : "OTB"})
          <select value={pickedTicket} onChange={(e) => pickPosition(e.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 font-mono text-white" data-testid="calc-position">
            <option value="">{positions.length === 0 ? "— tidak ada posisi terbuka —" : "— pilih posisi (isi otomatis simbol, arah, lot, entry, SL, TP) —"}</option>
            {positions.map((pos) => (
              <option key={pos.ticket} value={pos.ticket}>{positionOptionLabel(pos)}</option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-4" data-testid="calc-form">
          <label className="text-xs text-slate-400">Broker
            <select value={broker} onChange={(e) => changeBroker(e.target.value as BrokerId)} className={field}>
              <option value="finex">Finex</option>
              <option value="orbitraderberjangka">OTB</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">Simbol
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className={field} data-testid="calc-symbol">
              <option value="">{symbolBook?.broker === broker ? "— pilih simbol —" : "memuat…"}</option>
              {symbols.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">Arah
            <select value={direction} onChange={(e) => setDirection(e.target.value as CalcDirection)} className={field}>
              <option value="BELI">BELI (buy)</option>
              <option value="JUAL">JUAL (sell)</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">Lot
            <input value={lot} onChange={(e) => setLot(e.target.value)} inputMode="decimal" className={field} />
          </label>
          <label className="text-xs text-slate-400">Harga entry
            <input value={entry} onChange={(e) => setEntry(e.target.value)} inputMode="decimal" className={field} />
          </label>
          <label className="text-xs text-rose-300">Stop Loss (S/L)
            <input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" className={field} />
          </label>
          <label className="text-xs text-sky-300">Take Profit (T/P)
            <input value={tp} onChange={(e) => setTp(e.target.value)} inputMode="decimal" className={field} />
          </label>
        </div>

        {result === null && <p className="text-sm text-slate-400">Isi simbol, entry, SL dan TP untuk melihat hasil.</p>}
        {result !== null && !result.ok && (
          <p data-testid="calc-error" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">⚠ {result.error}</p>
        )}
        {result !== null && result.ok && (
          <>
            <div className="grid gap-3 sm:grid-cols-4" data-testid="calc-summary">
              <div className="rounded-xl bg-sky-400/10 p-3">
                <p className="text-xs text-slate-400">Bila TP kena (+{result.tpDistance})</p>
                <p className="text-lg font-bold text-sky-300">{formatIdr(result.tpNetIdr)}</p>
                <p className="text-xs text-slate-400">{formatUsd(result.tpNetUsd)} USD</p>
              </div>
              <div className="rounded-xl bg-rose-400/10 p-3">
                <p className="text-xs text-slate-400">Bila SL kena (−{result.slDistance})</p>
                <p className="text-lg font-bold text-rose-300">{formatIdr(result.slNetIdr)}</p>
                <p className="text-xs text-slate-400">{formatUsd(result.slNetUsd)} USD</p>
              </div>
              <div className="rounded-xl bg-white/5 p-3">
                <p className="text-xs text-slate-400">Titik impas</p>
                <p className="font-mono text-lg">{result.breakeven === null ? "-" : result.breakeven.toFixed(result.digits)}</p>
                <p className="text-xs text-slate-400">komisi ${result.commissionUsd.toFixed(2)}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-3">
                <p className="text-xs text-slate-400">Untung : rugi</p>
                <p className="text-lg font-bold">1 : {result.rr.toFixed(2).replace(".", ",")}</p>
                <p className="text-xs text-slate-400">{result.rr >= 1.5 ? "layak" : "untung terlalu kecil dibanding risiko"}</p>
              </div>
            </div>

            {result.capIdr !== null && (
              <p data-testid="calc-cap" className={`rounded-xl border p-3 text-sm ${result.overCap ? "border-rose-400/40 bg-rose-400/10 text-rose-100" : "border-emerald-400/30 bg-emerald-400/5 text-emerald-100"}`}>
                {result.overCap ? "⛔ Rugi bila SL kena MELEBIHI" : "✓ Rugi bila SL kena masih di bawah"} batas golongan {result.group} {formatIdr(result.capIdr)}.
                {result.capSl !== null && ` SL terjauh yang sesuai batas: ${result.capSl.toFixed(result.digits)}.`}
              </p>
            )}

            <div className="overflow-x-clip rounded-2xl border border-white/10">
              <table className="w-full text-sm" data-testid="calc-ladder">
                <thead className="bg-white/5 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Bila harga ({result.closeSide}) sampai di</th>
                    <th className="px-3 py-2 text-right">Harga</th>
                    <th className="px-3 py-2 text-right">Gerak</th>
                    <th className="px-3 py-2 text-right">Hasil USD</th>
                    <th className="px-3 py-2 text-right">Hasil Rupiah</th>
                  </tr>
                </thead>
                <tbody>
                  {result.ladder.map((r) => (
                    <tr key={r.label} className="border-t border-white/5">
                      <td className="px-3 py-2">{r.label}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.price.toFixed(result.digits)}</td>
                      <td className={`px-3 py-2 text-right ${tone(r.move)}`}>{r.move > 0 ? "+" : ""}{r.move}</td>
                      <td className={`px-3 py-2 text-right ${tone(r.netUsd)}`}>{formatUsd(r.netUsd)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${tone(r.netUsd)}`}>{formatIdr(r.netIdr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400">
              Hasil sudah dikurangi komisi. Posisi {direction === "BELI" ? "BELI ditutup di harga Bid" : "JUAL ditutup di harga Ask"};
              garis harga di chart MT5 umumnya Bid, jadi spread ikut menentukan kapan SL/TP kena. Kurs ECB hari ini (perkiraan).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
