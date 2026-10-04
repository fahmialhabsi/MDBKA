import type { JSX } from "react";
import { useHoldingsQuotes } from "../../hooks/useHoldingsQuotes";
import { convertToUSD, type ExchangeRates } from "../../services/fxRateService";
import {
  checkMarginGuard,
  checkRewardRisk,
  evaluateExitSignal,
  type ExitSignal,
  type Holding,
} from "../../lib/exitMonitor";
import type { BrokerId } from "../../types/broker";

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

/**
 * Tahap F1 — dashboard monitor posisi manual (display-only).
 * Harga live dari REST polling; sinyal dari evaluateExitSignal.
 * Tanpa order, tanpa ubah decision engine.
 */
export function HoldingsDashboard({
  holdings,
  brokerId,
  fxRates,
  onRemove,
}: {
  readonly holdings: readonly Holding[];
  readonly brokerId: BrokerId | undefined;
  readonly fxRates: ExchangeRates | null;
  readonly onRemove: (id: string) => void;
}): JSX.Element {
  const symbols = [...new Set(holdings.map((h) => h.symbol))];
  const { quotes, isConnected } = useHoldingsQuotes(symbols, brokerId);
  const convert = (amount: number, currency: string): number | null => {
    if (currency === "USD") return amount;
    if (fxRates === null) return null;
    return convertToUSD(amount, currency, fxRates);
  };

  if (holdings.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Belum ada posisi. Tambahkan via form di atas (entry manual sesuai
        posisi MT5 Anda).
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="holdings-dashboard">
      {!isConnected && (
        <p className="text-xs text-slate-500">
          Menghubungkan harga live… (butuh backend + EA menulis tick simbol ini)
        </p>
      )}
      {holdings.map((holding) => {
        const live = quotes[holding.symbol];
        const evaluation =
          live === undefined
            ? null
            : evaluateExitSignal(holding, live.bid, live.ask, convert);
        const marginWarning = checkMarginGuard(holding, convert);
        const rrWarning = checkRewardRisk(
          holding.entryPrice,
          holding.sl,
          holding.tp,
        );
        const badge =
          evaluation !== null
            ? SIGNAL_STYLE[evaluation.signal].label
            : "Menunggu harga";
        const badgeClass =
          evaluation !== null
            ? SIGNAL_STYLE[evaluation.signal].className
            : "rounded-lg bg-slate-400/10 px-2 py-1 text-xs text-slate-400";
        return (
          <div
            key={holding.id}
            className="rounded-xl border border-white/10 bg-slate-950/50 p-3"
            data-testid={`holding-${holding.id}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-white">{holding.symbol}</span>
              <span className="text-xs text-slate-400">
                {holding.direction} {holding.lot} lot @ {holding.entryPrice}
              </span>
              <span className={badgeClass}>{badge}</span>
              <button
                type="button"
                onClick={() => onRemove(holding.id)}
                className="ml-auto text-xs text-slate-500 hover:text-red-300"
              >
                Hapus
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div>
                <span className="text-slate-500">Live </span>
                <span className="text-white">
                  {live === undefined
                    ? "-"
                    : `${live.bid} / ${live.ask}`}
                </span>
              </div>
              <div>
                <span className="text-slate-500">P&amp;L </span>
                <span className="font-bold text-white">
                  {money(
                    evaluation?.pnl ?? null,
                    evaluation?.pnlCurrency ?? "USD",
                  )}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Risiko/Rwd </span>
                <span className="text-white">
                  {money(
                    evaluation?.risk ?? null,
                    evaluation?.planCurrency ?? "USD",
                  )}{" "}
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
            {evaluation !== null &&
              evaluation.signal !== "HOLD" &&
              evaluation.reasons.map((reason) => (
                <p key={reason} className="mt-1 text-xs text-amber-200">
                  • {reason}
                </p>
              ))}
            {marginWarning !== null && (
              <p className="mt-1 text-xs text-red-300">• {marginWarning}</p>
            )}
            {rrWarning !== null && (
              <p className="mt-1 text-xs text-amber-200">• {rrWarning}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
