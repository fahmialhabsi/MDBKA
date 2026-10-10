import { useEffect, useState, type JSX } from "react";
import {
  useHoldingsQuotes,
  type HoldingsQuote,
} from "../../hooks/useHoldingsQuotes";
import {
  buildUsdConverter,
  profitToIdr,
  usdIdrRate,
  type ExchangeRates,
} from "../../services/fxRateService";
import {
  breakevenCostDistance,
  checkBreakeven,
  commissionForHolding,
  checkTimeStop,
  TIME_STOP_HOURS,
  checkMarginGuard,
  checkRewardRisk,
  evaluateExitSignal,
  type ExitSignal,
  stockCommissionUnverified,
  type Holding,
} from "../../lib/exitMonitor";
import type { BrokerId } from "../../types/broker";
import { calculatorUrlFromHolding } from "../../lib/calculatorPageView";
import { serverNowText, sessionNotice, sessionState, type TradeSession } from "../../lib/sessionGuard";
import { mandatoryStop } from "../../lib/mandatoryStop";
import { serverUtcOffsetHours } from "../../lib/serverClock";
import { useTradeSessions } from "../../hooks/useTradeSessions";

const SIGNAL_STYLE: Record<ExitSignal, { label: string; className: string }> = {
  EXIT_TAKE_PROFIT: {
    label: "TP tersentuh — amankan",
    className:
      "rounded-lg bg-emerald-400/15 px-2 py-1 text-xs font-bold text-emerald-200",
  },
  EXIT_STOP_LOSS: {
    label: "SL tersentuh — keluar",
    className:
      "rounded-lg bg-red-400/15 px-2 py-1 text-xs font-bold text-red-200",
  },
  WARN_NEAR_TP: {
    label: "Dekat TP",
    className:
      "rounded-lg bg-amber-400/15 px-2 py-1 text-xs font-bold text-amber-200",
  },
  WARN_NEAR_SL: {
    label: "Dekat SL",
    className:
      "rounded-lg bg-amber-400/15 px-2 py-1 text-xs font-bold text-amber-200",
  },
  WARN_PRICE_DRIFT: {
    label: "Drift harga",
    className:
      "rounded-lg bg-orange-400/15 px-2 py-1 text-xs font-bold text-orange-200",
  },
  WARN_ADVERSE_DRIFT: {
    label: "Drift merugikan",
    className:
      "rounded-lg bg-orange-400/15 px-2 py-1 text-xs font-bold text-orange-200",
  },
  HOLD: {
    label: "Tahan",
    className:
      "rounded-lg bg-slate-400/10 px-2 py-1 text-xs font-semibold text-slate-300",
  },
};

function money(value: number | null, currency: string): string {
  if (value === null) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} ${currency}`;
}

/** Rupiah bertanda; hanya P&L berdenominasi USD yang dikonversi. */
function rupiah(
  value: number | null,
  currency: string,
  kurs: number | null,
): string {
  if (value === null || currency !== "USD") return "-";
  const idr = profitToIdr(value, kurs);
  if (idr === null) return "-";
  return `${idr >= 0 ? "+" : "-"}Rp${Math.abs(idr).toLocaleString("id-ID")}`;
}

export interface ExitRequest {
  readonly exitPrice: number;
  readonly note: string;
}

/**
 * Tahap v1.3.0 — kartu satu posisi: ringkas (klik untuk expand),
 * detail + form exit manual ("Tandai Keluar", BUKAN eksekusi order),
 * tampilan KELUAR (log: harga/waktu/P&L/catatan) + hapus permanen.
 */
function HoldingCard({
  holding,
  live,
  convert,
  kurs,
  onExit,
  onRemove,
  readOnly,
  sessions,
  serverNow,
  serverOffset,
}: {
  readonly sessions: readonly TradeSession[];
  readonly serverNow: string;
  readonly serverOffset: number;
  readonly holding: Holding;
  readonly live: HoldingsQuote | undefined;
  readonly convert: (amount: number, currency: string) => number | null;
  readonly kurs: number | null;
  readonly onExit: (id: string, exit: ExitRequest) => void;
  readonly onRemove: (id: string) => void;
  readonly readOnly?: boolean;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitPrice, setExitPrice] = useState("");
  const [exitNote, setExitNote] = useState("");
  const exited = (holding.status ?? "OPEN") === "EXITED";

  const evaluation =
    exited || live === undefined
      ? null
      : evaluateExitSignal(holding, live.bid, live.ask, convert);
  const breakeven =
    exited || live === undefined
      ? null
      : checkBreakeven(
          holding,
          live.bid,
          live.ask,
          // Opsi 5-2: SL breakeven + biaya komisi agar benar-benar impas.
          breakevenCostDistance(holding, convert),
        );
  const breakevenCommission =
    breakeven !== null && breakeven.costDistance > 0
      ? commissionForHolding(holding.symbol, holding.lot)
      : null;
  const timeStop =
    exited || live === undefined ? null : checkTimeStop(holding, live.timestamp);
  const marginWarning = exited ? null : checkMarginGuard(holding, convert);
  // S4 Satpam Sesi: pasar tutup / segera tutup (jam resmi broker).
  const marketNotice = exited
    ? null
    : sessionNotice(holding.symbol, sessionState(holding.symbol, serverNow, sessions), serverOffset);
  const rrWarning = checkRewardRisk(holding.entryPrice, holding.sl, holding.tp);
  // S5 (10 Okt 2026): SEMUA posisi tanpa SL → SL wajib dihitung MDBKA (batas golongan Rupiah).
  const stopPlan = exited
    ? null
    : mandatoryStop(holding, live?.bid ?? null, live?.ask ?? null, convert, kurs);
  const [slCopied, setSlCopied] = useState(false);
  const copyMandatorySl = (text: string): void => {
    void navigator.clipboard?.writeText(text).then(() => {
      setSlCopied(true);
      window.setTimeout(() => setSlCopied(false), 2000);
    });
  };
  const badge = exited
    ? "KELUAR — konfirmasi di MT5"
    : evaluation !== null
      ? SIGNAL_STYLE[evaluation.signal].label
      : "Menunggu harga";
  const badgeClass = exited
    ? "rounded-lg bg-slate-400/10 px-2 py-1 text-xs font-bold text-slate-300"
    : evaluation !== null
      ? SIGNAL_STYLE[evaluation.signal].className
      : "rounded-lg bg-slate-400/10 px-2 py-1 text-xs text-slate-400";
  const liveRef = holding.direction === "BELI" ? live?.bid : live?.ask;

  const confirmExit = (): void => {
    const price = Number(exitPrice);
    if (!Number.isFinite(price) || price <= 0) return;
    onExit(holding.id, { exitPrice: price, note: exitNote.trim() });
    setExitOpen(false);
    setExitPrice("");
    setExitNote("");
  };

  return (
    <div
      className={`rounded-xl border border-white/10 bg-slate-950/50 p-3 ${exited ? "opacity-70" : ""}`}
      data-testid={`holding-${holding.id}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((previous) => !previous)}
        className="flex w-full flex-wrap items-center gap-2 text-left"
      >
        <span className="font-bold text-white">{holding.symbol}</span>
        <span className="text-xs text-slate-400">
          {holding.direction} {holding.lot} lot @ {holding.entryPrice}
        </span>
        <span className={badgeClass}>{badge}</span>
        <span className="ml-auto text-xs text-slate-500">
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {!exited && (
        <a
          href={calculatorUrlFromHolding(holding)}
          target="_blank"
          rel="noopener"
          data-testid={`holding-calc-${holding.id}`}
          className="mt-1 inline-block text-xs font-semibold text-emerald-300 hover:underline"
        >
          Kalkulator ↗
        </a>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <span className="text-slate-500">Live </span>
          <span className="text-white">
            {live === undefined ? "-" : `${live.bid} / ${live.ask}`}
          </span>
        </div>
        <div>
          <span className="text-slate-500">P&amp;L bersih </span>
          <span className="font-bold text-white">
            {exited
              ? money(
                  holding.realizedPnl ?? null,
                  holding.realizedCurrency ?? "USD",
                )
              : money(
                  evaluation?.pnlNet ?? null,
                  evaluation?.pnlCurrency ?? "USD",
                )}
          </span>
          {!exited && (
            <span
              data-testid={`holding-pnl-idr-${holding.id}`}
              className="block text-[11px] font-semibold text-slate-300"
            >
              ≈{" "}
              {rupiah(
                evaluation?.pnlNet ?? null,
                evaluation?.pnlCurrency ?? "USD",
                kurs,
              )}
            </span>
          )}
          {!exited && stockCommissionUnverified(holding.symbol) && (
            <span data-testid={`holding-commission-unverified-${holding.id}`} className="block text-[11px] text-amber-300/80">
              komisi saham belum terverifikasi (belum dikurangkan)
            </span>
          )}
          {!exited &&
            evaluation?.commission !== null &&
            evaluation?.commission !== undefined &&
            evaluation.commission > 0 && (
              <span className="block text-[11px] text-slate-500">
                incl. komisi ${evaluation.commission.toFixed(2)}
              </span>
            )}
        </div>
        <div>
          <span className="text-slate-500">Risiko/Rwd </span>
          <span className="text-white">
            {money(evaluation?.risk ?? null, evaluation?.planCurrency ?? "USD")}{" "}
            /{" "}
            {money(
              evaluation?.reward ?? null,
              evaluation?.planCurrency ?? "USD",
            )}
          </span>
        </div>
        <div>
          <span className="text-slate-500">SL/TP </span>
          <span className="text-white">
            {holding.sl} / {holding.tp}
          </span>
        </div>
      </div>

      {marketNotice !== null && (
        <div
          data-testid={`holding-session-${holding.id}`}
          className={`mt-2 rounded-xl border p-3 ${marketNotice.level === "closed" ? "border-rose-400/40 bg-rose-400/10" : "border-amber-400/40 bg-amber-400/10"}`}
        >
          <p className={`text-sm font-bold ${marketNotice.level === "closed" ? "text-rose-200" : "text-amber-200"}`}>
            {marketNotice.level === "closed" ? "PASAR TUTUP" : "PASAR SEGERA TUTUP"}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-100">{marketNotice.text}</p>
        </div>
      )}

      {stopPlan !== null && stopPlan.kind !== "ADA_SL" && (
        <div
          data-testid={`holding-mandatory-sl-${holding.id}`}
          className="mt-2 rounded-xl border border-rose-500/60 bg-rose-500/15 p-3"
        >
          <p className="text-sm font-bold text-rose-100">
            {stopPlan.kind === "PASANG" ? "WAJIB PASANG SL — rugi sekarang tidak dibatasi" : "POSISI TANPA SL"}
          </p>
          <p className="mt-1 text-sm leading-6 text-rose-50">{stopPlan.message}.</p>
          {stopPlan.kind === "PASANG" && (
            <button
              type="button"
              data-testid={`holding-mandatory-sl-copy-${holding.id}`}
              onClick={() => copyMandatorySl(stopPlan.slText)}
              className="mt-2 rounded-lg border border-rose-300/60 bg-rose-500/25 px-3 py-1 text-sm font-semibold text-rose-50 hover:bg-rose-500/35"
            >
              {slCopied ? "SL disalin ✓" : `Salin SL ${stopPlan.slText}`}
            </button>
          )}
          <p className="mt-2 text-xs text-rose-200/80">
            Tempel di MT5: klik kanan posisi → Modify → Stop Loss.
            {marketNotice !== null && marketNotice.level === "closed" ? " Pasar sedang tutup — pasang saat pasar buka (lihat kotak di atas)." : ""}
          </p>
        </div>
      )}

      {timeStop !== null && (
        <div className="mt-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3">
          <p className="text-sm font-bold text-amber-200">
            TIME-STOP — lewat {TIME_STOP_HOURS} jam
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-100">{timeStop.message}</p>
        </div>
      )}

      {breakeven !== null && (
        <div className="mt-2 rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3">
          <p className="text-sm font-bold text-emerald-200">
            BREAKEVEN SEKARANG — profit {breakeven.multiple.toFixed(2)}R
          </p>
          <p className="mt-1 text-sm leading-6 text-emerald-100">
            {breakeven.message}
          </p>
          {breakevenCommission !== null && (
            <p
              className="mt-1 text-xs text-emerald-200/80"
              data-testid="breakeven-cost"
            >
              Biaya komisi {rupiah(breakevenCommission, "USD", kurs).replace(/^[+-]/, "")} (
              {breakevenCommission.toFixed(2)} USD) sudah ditutup oleh SL ini —
              bila kena SL, hasil ≈ impas, bukan rugi kecil.
            </p>
          )}
        </div>
      )}

      {expanded && (
        <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
          {evaluation !== null &&
            evaluation.signal !== "HOLD" &&
            evaluation.reasons.map((reason) => (
              <p key={reason} className="text-xs text-amber-200">
                • {reason}
              </p>
            ))}
          {marginWarning !== null && (
            <p className="text-xs text-red-300">• {marginWarning}</p>
          )}
          {rrWarning !== null && (
            <p className="text-xs text-amber-200">• {rrWarning}</p>
          )}
          {evaluation?.swap !== null &&
            evaluation?.swap !== undefined &&
            evaluation.swap.source === "MT5" &&
            (evaluation.swap.value !== 0 || evaluation.swap.daysHeld > 0) && (
              <p className="text-xs text-slate-300" data-testid={`holding-swap-mt5-${holding.id}`}>
                Swap MT5 {money(evaluation.swap.value, evaluation.swap.currency)} ≈{" "}
                {rupiah(evaluation.swap.value, evaluation.swap.currency, kurs)} (sudah dipotong broker)
              </p>
            )}
          {evaluation?.swap !== null &&
            evaluation?.swap !== undefined &&
            evaluation.swap.source === "PERKIRAAN" &&
            evaluation.swap.daysHeld > 0 && (
              <p className="text-xs text-slate-400">
                Swap est.{" "}
                {money(evaluation.swap.value, evaluation.swap.currency)} (
                {evaluation.swap.daysHeld} hari menginap)
              </p>
            )}
          {exited ? (
            <div className="text-xs text-slate-400">
              <p>
                Keluar @ {holding.exitPrice} · {holding.exitTime ?? "-"}
                {holding.exitNote !== undefined && holding.exitNote !== ""
                  ? ` · “${holding.exitNote}”`
                  : ""}
              </p>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onRemove(holding.id)}
                  className="mt-1 text-xs text-slate-500 hover:text-red-300"
                >
                  Hapus permanen
                </button>
              )}
            </div>
          ) : readOnly ? (
            <p className="mt-1 text-xs text-slate-500">
              Posisi MT5 (otomatis, read-only) — tutup/ubah di terminal.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {!exitOpen ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (liveRef !== undefined) setExitPrice(String(liveRef));
                      setExitOpen(true);
                    }}
                    className="rounded-lg bg-sky-400/15 px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-400/25"
                  >
                    Tandai Keluar (manual, bukan order)
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(holding.id)}
                    className="text-xs text-slate-500 hover:text-red-300"
                  >
                    Hapus
                  </button>
                </>
              ) : (
                <div className="w-full space-y-2 rounded-lg border border-white/10 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-slate-400">
                      Volume (auto)
                      <input
                        value={holding.lot}
                        readOnly
                        className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-white"
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      Exit price (live, bisa ubah)
                      <input
                        value={exitPrice}
                        onChange={(e) => setExitPrice(e.target.value)}
                        inputMode="decimal"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-white"
                      />
                    </label>
                  </div>
                  <label className="block text-xs text-slate-400">
                    Catatan (opsional)
                    <input
                      value={exitNote}
                      onChange={(e) => setExitNote(e.target.value)}
                      placeholder="mis. TP tercapai di MT5"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-white"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={confirmExit}
                      className="rounded-lg bg-emerald-400/15 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-400/25"
                    >
                      Tandai Keluar
                    </button>
                    <button
                      type="button"
                      onClick={() => setExitOpen(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Tahap F1/v1.3.0 — dashboard monitor posisi manual (display-only).
 * Harga live dari REST polling; sinyal dari evaluateExitSignal.
 * Tanpa order, tanpa ubah decision engine.
 */
export function HoldingsDashboard({
  holdings,
  brokerId,
  fxRates,
  onExit,
  onRemove,
  readOnly = false,
  onTotalProfitChange,
  heading,
  emptyText,
}: {
  readonly holdings: readonly Holding[];
  readonly brokerId: BrokerId | undefined;
  readonly fxRates: ExchangeRates | null;
  readonly onExit?: (id: string, exit: ExitRequest) => void;
  readonly onRemove?: (id: string) => void;
  readonly readOnly?: boolean;
  readonly heading?: string;
  readonly emptyText?: string;
  readonly onTotalProfitChange?: (usd: number | null) => void;
}): JSX.Element {
  const symbols = [...new Set(holdings.map((h) => h.symbol))];
  const { quotes, isConnected } = useHoldingsQuotes(symbols, brokerId);
  const sessions = useTradeSessions(brokerId);
  // Jam server dari quote TERSEGAR (quote simbol yang pasarnya tutup basi).
  const freshestTs = Object.values(quotes).reduce<string | null>(
    (best, q) => (q !== undefined && (best === null || q.timestamp > best) ? q.timestamp : best),
    null,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const serverOffset = serverUtcOffsetHours(brokerId ?? "finex", freshestTs, nowMs);
  const serverNow = serverNowText(nowMs, serverOffset);
  const convert = buildUsdConverter(fxRates);
  const kurs = usdIdrRate(fxRates);
  // Total P&L per simbol (hanya posisi OPEN dengan P&L USD yang tersedia).
  const perSymbol = symbols.map((symbol) => {
    let usd = 0;
    let count = 0;
    for (const h of holdings) {
      if (h.symbol !== symbol || (h.status ?? "OPEN") === "EXITED") continue;
      const live = quotes[symbol];
      if (live === undefined) continue;
      const ev = evaluateExitSignal(h, live.bid, live.ask, convert);
      if (ev.pnlNet === null || ev.pnlCurrency !== "USD") continue;
      usd += ev.pnlNet;
      count++;
    }
    return { symbol, usd, count };
  });
  // Total P&L USD semua posisi OPEN (null = harga live belum tersedia).
  const hasOpen = holdings.some((h) => (h.status ?? "OPEN") !== "EXITED");
  const totalProfitUsd: number | null = !hasOpen
    ? 0
    : perSymbol.some((s) => s.count > 0)
      ? perSymbol.reduce((sum, s) => sum + s.usd, 0)
      : null;
  useEffect(() => {
    if (onTotalProfitChange === undefined) return undefined;
    onTotalProfitChange(totalProfitUsd);
    return () => onTotalProfitChange(null);
  }, [totalProfitUsd, onTotalProfitChange]);
  const noopExit = (): void => {};
  const noopRemove = (): void => {};

  if (holdings.length === 0) {
    return (
      <div className="space-y-2">
        {heading !== undefined && (
          <h4 className="text-sm font-bold text-slate-200">{heading}</h4>
        )}
        <p className="text-sm text-slate-400">
          {emptyText ??
            "Belum ada posisi. Tambahkan via form di atas (entry manual sesuai posisi MT5 Anda)."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="holdings-dashboard">
      {heading !== undefined && (
        <h4 className="text-sm font-bold text-slate-200">{heading}</h4>
      )}
      {!isConnected && (
        <p className="text-xs text-slate-500">
          Menghubungkan harga live… (butuh backend + EA menulis tick simbol ini)
        </p>
      )}
      {perSymbol.some((s) => s.count > 0) && (
        <div
          data-testid="holdings-per-symbol"
          className="rounded-xl border border-white/10 bg-slate-950/50 p-3 text-xs text-slate-300"
        >
          <p className="mb-1 font-semibold text-slate-200">
            Profit per simbol × kurs
            {kurs === null ? " (kurs belum tersedia)" : ""}
          </p>
          {perSymbol
            .filter((s) => s.count > 0)
            .map((s) => (
              <p key={s.symbol}>
                {s.symbol} ({s.count} posisi): {money(s.usd, "USD")} →{" "}
                <span className="font-bold text-white">
                  {rupiah(s.usd, "USD", kurs)}
                </span>
              </p>
            ))}
        </div>
      )}
      {holdings.map((holding) => (
        <HoldingCard
          key={holding.id}
          holding={holding}
          live={quotes[holding.symbol]}
          convert={convert}
          kurs={kurs}
          onExit={onExit ?? noopExit}
          onRemove={onRemove ?? noopRemove}
          readOnly={readOnly}
          sessions={sessions}
          serverNow={serverNow}
          serverOffset={serverOffset}
        />
      ))}
    </div>
  );
}
