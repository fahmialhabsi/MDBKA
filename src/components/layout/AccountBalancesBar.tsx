import { useEffect, useState, type JSX } from "react";
import { historyPageUrl } from "../../lib/historyPageView";
import { calculatorPageUrl } from "../../lib/calculatorPageView";
import { groupPageUrl } from "../../lib/groupPageView";
import { API_BASE_URL } from "../../lib/apiBaseUrl";
import {
  buildBalanceRows,
  type BalanceAccount,
} from "../../lib/accountBalanceView";
import { usdIdrRate, type ExchangeRates } from "../../services/fxRateService";

const REFRESH_MS = 5 * 60_000;

/**
 * Langkah C — saldo & setoran semua akun (Finex/OTB, demo/live) dalam
 * Rupiah di header. Saldo = saldo tertutup dari History MT5 (tanpa profit
 * posisi yang masih terbuka). Hanya tampilan.
 */
export function AccountBalancesBar({
  fxRates,
}: {
  readonly fxRates: ExchangeRates | null;
}): JSX.Element | null {
  const [accounts, setAccounts] = useState<BalanceAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/evaluation`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { accounts?: BalanceAccount[] };
        if (cancelled) return;
        setAccounts(body.accounts ?? []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (error !== null && accounts === null) {
    return (
      <p className="text-xs text-slate-500">Saldo akun belum terbaca ({error}).</p>
    );
  }
  if (accounts === null) return null;
  const rows = buildBalanceRows(accounts, usdIdrRate(fxRates));
  if (rows.length === 0) return null;

  return (
    <div
      data-testid="account-balances-bar"
      className="flex flex-wrap gap-2 text-xs"
    >
      {rows.map((row) => (
        <div
          key={row.login}
          title={`Login ${row.login} · saldo ${row.balanceUsdText} · transaksi terakhir ${row.lastDealTime ?? "-"} (jam server). Saldo tanpa profit posisi terbuka.`}
          className={[
            "rounded-lg border px-3 py-1.5",
            row.isLive
              ? "border-amber-400/30 bg-amber-400/10"
              : "border-white/10 bg-white/[0.03]",
          ].join(" ")}
        >
          <span className={row.isLive ? "font-bold text-amber-200" : "font-semibold text-slate-300"}>
            {row.label}
          </span>
          <span className="ml-2 font-bold text-white">{row.balanceText}</span>
          <span className="ml-2 text-slate-400">setoran {row.depositText}</span>
        </div>
      ))}
      {/* Halaman History H3: dibuka di tab baru (Live & Demo per broker). */}
      <div className="ml-auto flex gap-2">
        {(["finex", "orbitraderberjangka"] as const).map((b) => (
          <a
            key={b}
            href={historyPageUrl(b)}
            target="_blank"
            rel="noreferrer"
            data-testid={`history-link-${b}`}
            className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 font-semibold text-emerald-200 hover:bg-emerald-400/20"
          >
            History {b === "finex" ? "Finex" : "OTB"} ↗
          </a>
        ))}
        <a
          href={calculatorPageUrl({ broker: "finex" })}
          target="_blank"
          rel="noreferrer"
          data-testid="calculator-link"
          className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 font-semibold text-sky-200 hover:bg-sky-400/20"
        >
          Kalkulator ↗
        </a>
        <a
          href={groupPageUrl({ broker: "finex" })}
          target="_blank"
          rel="noreferrer"
          data-testid="group-link"
          className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 font-semibold text-emerald-200 hover:bg-emerald-400/20"
        >
          Golongan ↗
        </a>
      </div>
    </div>
  );
}
