import { useState, type JSX } from "react";
import { HoldingsForm, type NewHolding } from "./HoldingsForm";
import { HoldingsDashboard } from "./HoldingsDashboard";
import { DEFAULT_BROKER_ID } from "../../lib/brokerRegistry";
import type { Holding } from "../../lib/exitMonitor";
import type { ExchangeRates } from "../../services/fxRateService";
import type { BrokerId } from "../../types/broker";

const STORAGE_KEY = "mdbka-holdings-v1";

function makeId(): string {
  return `h${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function loadHoldings(): Holding[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null || raw === "") return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Holding =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { symbol?: unknown }).symbol === "string",
    );
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
 * Tahap F1 — monitor posisi manual (display-only, tanpa order).
 * Persist localStorage per browser; harga live dari backend stream.
 */
export function HoldingsMonitor({
  brokerId,
  fxRates,
}: {
  readonly brokerId: BrokerId | undefined;
  readonly fxRates: ExchangeRates | null;
}): JSX.Element {
  const [holdings, setHoldings] = useState<Holding[]>(() => loadHoldings());

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

  return (
    <div className="space-y-4" data-testid="holdings-monitor">
      <HoldingsForm brokerId={brokerId ?? DEFAULT_BROKER_ID} onAdd={add} />
      <HoldingsDashboard
        holdings={holdings}
        brokerId={brokerId}
        fxRates={fxRates}
        onRemove={remove}
      />
      <p className="text-xs text-slate-500">
        Entri manual sesuai posisi MT5 Anda — app tidak membaca posisi
        broker dan tidak menempatkan order. Harga live butuh backend +
        EA menulis tick simbol terkait.
      </p>
    </div>
  );
}
