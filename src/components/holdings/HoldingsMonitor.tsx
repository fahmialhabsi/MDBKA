import { useState, type JSX } from "react";
import { HoldingsForm, type NewHolding } from "./HoldingsForm";
import { HoldingsDashboard, type ExitRequest } from "./HoldingsDashboard";
import { DEFAULT_BROKER_ID } from "../../lib/brokerRegistry";
import {
  countHoldings,
  filterHoldingsByBroker,
  markHoldingExited,
  type Holding,
} from "../../lib/exitMonitor";
import {
  buildUsdConverter,
  type ExchangeRates,
} from "../../services/fxRateService";
import type { BrokerId } from "../../types/broker";

const STORAGE_KEY = "mdbka-holdings-v1";

const TABS: readonly BrokerId[] = ["finex", "orbitraderberjangka"];

function makeId(): string {
  return `h${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function loadHoldings(): Holding[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null || raw === "") return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Holding =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { id?: unknown }).id === "string" &&
          typeof (item as { symbol?: unknown }).symbol === "string",
      )
      .map((item) => ({
        ...item,
        // Migrasi data lama (pra-v1.3.0): tanpa status = OPEN.
        status: item.status ?? "OPEN",
      }));
  } catch {
    return [];
  }
}

function saveHoldings(holdings: readonly Holding[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
  } catch {
    // Storage penuh/diblokir: state sesi tetap jalan tanpa persist.
  }
}

/**
 * Tahap F1/v1.3.0 — monitor posisi manual (display-only, tanpa order).
 * Tab per broker (Finex | OTB): form + daftar difilter per tab, counter
 * "POSISI OPEN (n/m)" per tab. Persist localStorage per browser.
 */
export function HoldingsMonitor({
  brokerId,
  fxRates,
}: {
  readonly brokerId: BrokerId | undefined;
  readonly fxRates: ExchangeRates | null;
}): JSX.Element {
  const [holdings, setHoldings] = useState<Holding[]>(() => loadHoldings());
  const [tab, setTab] = useState<BrokerId>(brokerId ?? DEFAULT_BROKER_ID);

  const add = (input: NewHolding): void => {
    const next: Holding[] = [
      ...holdings,
      {
        ...input,
        id: makeId(),
        createdAt: new Date().toISOString(),
      },
    ];
    setHoldings(next);
    saveHoldings(next);
  };

  const remove = (id: string): void => {
    const next = holdings.filter((holding) => holding.id !== id);
    setHoldings(next);
    saveHoldings(next);
  };

  const exit = (id: string, request: ExitRequest): void => {
    const target = holdings.find((holding) => holding.id === id);
    if (target === undefined) return;
    const exited = markHoldingExited(
      target,
      {
        exitPrice: request.exitPrice,
        exitTime: new Date().toISOString(),
        note: request.note,
      },
      buildUsdConverter(fxRates),
    );
    if (exited === null) return;
    const next = holdings.map((holding) =>
      holding.id === id ? exited : holding,
    );
    setHoldings(next);
    saveHoldings(next);
  };

  return (
    <div className="space-y-4" data-testid="holdings-monitor">
      <div className="flex gap-2" role="tablist" aria-label="Monitor per broker">
        {TABS.map((broker) => {
          const inTab = filterHoldingsByBroker(holdings, broker);
          const counts = countHoldings(inTab);
          const active = tab === broker;
          return (
            <button
              key={broker}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`holdings-tab-${broker}`}
              onClick={() => setTab(broker)}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${
                active
                  ? "bg-emerald-400/20 text-emerald-200"
                  : "bg-white/5 text-slate-400 hover:bg-white/10"
              }`}
            >
              {broker === "finex" ? "Finex" : "OTB"} · POSISI OPEN (
              {counts.open}/{counts.total})
            </button>
          );
        })}
      </div>
      <HoldingsForm brokerId={tab} onAdd={add} />
      <HoldingsDashboard
        holdings={filterHoldingsByBroker(holdings, tab)}
        brokerId={tab}
        fxRates={fxRates}
        onExit={exit}
        onRemove={remove}
      />
      <p className="text-xs text-slate-500">
        Entri manual sesuai posisi MT5 Anda — app tidak membaca posisi
        broker dan tidak menempatkan order. "Tandai Keluar" hanya mencatat
        log lokal; konfirmasi penutupan tetap di MT5. Harga live butuh
        backend + EA menulis tick simbol terkait.
      </p>
    </div>
  );
}
