import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, RefreshCw } from "lucide-react";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import type { LiveQuoteLike } from "../../lib/csvQuote";
import type { OpenPositionLike } from "../../lib/correlationGuard";
import { checkLossStreak, tradesForBroker, type StreakAccount } from "../../lib/lossStreakGuard";
import type { NewsEventLike } from "../../lib/newsGuard";
import { lastCandleTimeMs, scanSymbol, type ScanRow } from "../../lib/symbolScanner";
import { formatPrice } from "../../lib/tickSize";
import { fetchBackendRates, usdIdrRate, type ExchangeRates } from "../../services/fxRateService";
import type { BrokerId } from "../../types/broker";

interface CandleItem {
  readonly symbol: string;
  readonly csv: string;
  readonly quote: LiveQuoteLike | null;
}

const BROKER_NAME: Record<BrokerId, string> = { finex: "Finex", orbitraderberjangka: "OTB" };

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API_BASE_URL}${path}`);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Halaman detail satu simbol dari pemindai (butir 3). Dihitung ULANG
 * dengan mesin & satpam yang sama (biaya, risiko/golongan, jeda, berita,
 * taruhan ganda). Tombol Salin SL/TP hanya muncul bila masih LOLOS.
 */
export function SignalDetailPage({ broker, symbol, equity }: { broker: BrokerId; symbol: string; equity: number }) {
  const [row, setRow] = useState<ScanRow | null>(null);
  const [fx, setFx] = useState<ExchangeRates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [candles, rates, positions, evaluation, calendar] = await Promise.all([
      getJson<{ items?: CandleItem[] }>(`/api/candles?broker=${broker}`),
      fetchBackendRates(API_BASE_URL),
      getJson<{ positions?: { symbol: string; side: string }[] }>(`/api/positions?broker=${broker}`),
      getJson<{ accounts?: StreakAccount[] }>("/api/evaluation"),
      getJson<{ available?: boolean; events?: NewsEventLike[] }>(`/api/calendar?broker=${broker}`),
    ]);
    const items = candles?.items ?? [];
    const item = items.find((i) => i.symbol.toUpperCase() === symbol.toUpperCase());
    if (item === undefined) {
      setError(`Data candle ${symbol} tidak ditemukan untuk ${BROKER_NAME[broker]}.`);
      return;
    }
    const nowServer = items.reduce<string | null>(
      (max, i) => (i.quote !== null && (max === null || i.quote.timestamp > max) ? i.quote.timestamp : max),
      null,
    );
    const reference = items.reduce<number | null>((max, i) => {
      const t = lastCandleTimeMs(i.csv);
      return t !== null && (max === null || t > max) ? t : max;
    }, null);
    const pause = checkLossStreak(tradesForBroker(evaluation?.accounts ?? [], broker), nowServer);
    const open: OpenPositionLike[] = (positions?.positions ?? []).map((p) => ({ symbol: p.symbol, side: p.side }));
    setFx(rates);
    setRow(
      scanSymbol({
        symbol: item.symbol,
        brokerId: broker,
        csv: item.csv,
        quote: item.quote,
        equity,
        fxRates: rates,
        referenceCandleMs: reference,
        openPositions: open,
        pauseReason: pause.paused ? pause.reason : null,
        newsEvents: calendar?.available === true && Array.isArray(calendar.events) ? calendar.events : null,
        newsNow: nowServer ?? undefined,
      }),
    );
    setError(null);
    setAt(new Date().toLocaleTimeString("id-ID"));
  }, [broker, symbol, equity]);

  useEffect(() => {
    // Muat sekali saat halaman dibuka; selanjutnya tombol "Hitung ulang".
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const plan = row?.plan ?? null;
  const kurs = usdIdrRate(fx);
  const slText = plan === null ? null : formatPrice(plan.stopLoss, symbol);
  const tpText = plan === null ? null : formatPrice(plan.takeProfit, symbol);
  const riskIdr = useMemo(
    () => (plan === null || plan.riskAtMinLot === null || kurs === null ? null : Math.round(plan.riskAtMinLot * kurs)),
    [plan, kurs],
  );

  const copy = (text: string | null, key: string): void => {
    if (text === null) return;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 px-3 py-4 text-white sm:px-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <a href="/" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">
            <ArrowLeft size={16} /> Dashboard
          </a>
          <h1 className="text-xl font-bold">
            {symbol} <span className="text-sm font-normal text-slate-400">· {BROKER_NAME[broker]}</span>
          </h1>
          <button
            type="button"
            onClick={() => void load()}
            className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
          >
            <RefreshCw size={14} /> Hitung ulang{at !== null ? ` · ${at}` : ""}
          </button>
        </div>

        {error !== null && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
        {row === null && error === null && <p className="text-sm text-slate-400">Menghitung…</p>}

        {row !== null && plan === null && (
          <div data-testid="signal-not-lolos" className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5">
            <p className="font-semibold text-amber-200">Sinyal tidak lagi Lolos — JANGAN entry.</p>
            <p className="mt-2 text-sm text-amber-100">{row.reason}</p>
            <p className="mt-2 text-xs text-slate-400">Harga, berita, atau posisi terbuka sudah berubah sejak pemindaian. Tidak ada angka SL/TP untuk disalin.</p>
          </div>
        )}

        {row !== null && plan !== null && (
          <div data-testid="signal-plan" className="space-y-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-5">
            <p className="text-lg font-bold">
              <span className={plan.direction === "BELI" ? "text-emerald-300" : "text-rose-300"}>{plan.direction}</span>{" "}
              {symbol} · lot {plan.suggestedLot ?? "-"}
              <span className="ml-2 text-sm font-normal text-slate-400">({row.reason})</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white/5 p-3">
                <p className="text-xs text-slate-400">Entry (perkiraan)</p>
                <p className="font-mono text-lg">{formatPrice(plan.entry, symbol)}</p>
              </div>
              <div className="rounded-xl bg-rose-400/10 p-3">
                <p className="text-xs text-slate-400">Stop Loss</p>
                <p className="font-mono text-lg text-rose-200">{slText}</p>
              </div>
              <div className="rounded-xl bg-sky-400/10 p-3">
                <p className="text-xs text-slate-400">Take Profit</p>
                <p className="font-mono text-lg text-sky-200">{tpText}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                data-testid="detail-copy-sl"
                onClick={() => copy(slText, "sl")}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-400/15 px-5 py-3 text-base font-bold text-rose-200 hover:bg-rose-400/25"
              >
                <Copy size={16} /> {copied === "sl" ? "SL disalin ✓" : `Salin SL ${slText}`}
              </button>
              <button
                type="button"
                data-testid="detail-copy-tp"
                onClick={() => copy(tpText, "tp")}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-400/15 px-5 py-3 text-base font-bold text-sky-200 hover:bg-sky-400/25"
              >
                <Copy size={16} /> {copied === "tp" ? "TP disalin ✓" : `Salin TP ${tpText}`}
              </button>
            </div>
            <p className="text-sm text-slate-300">
              Risiko lot minimum: <b>{riskIdr === null ? "-" : `Rp${riskIdr.toLocaleString("id-ID")}`}</b>
              {plan.riskAtMinLot !== null && ` ($${plan.riskAtMinLot.toFixed(2)})`} · batas yang dipakai ${plan.maxRiskUsd.toFixed(2)}
            </p>
            <p className="text-xs text-slate-400">
              Angka dihitung ulang saat halaman dibuka dengan semua satpam Mode Aman. Tempel SL & TP ke kolom MT5,
              periksa harga sekali lagi sebelum menekan Buy/Sell. MDBKA tidak menempatkan order.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
