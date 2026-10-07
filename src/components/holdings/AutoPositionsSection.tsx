import type { JSX } from "react";
import { HoldingsDashboard } from "./HoldingsDashboard";
import { useBrokerPositions } from "../../hooks/useBrokerPositions";
import { DEFAULT_BROKER_ID } from "../../lib/brokerRegistry";
import { toAutoHolding } from "../../lib/exitMonitor";
import type { ExchangeRates } from "../../services/fxRateService";
import type { BrokerId } from "../../types/broker";

/** Posisi terbuka MT5 otomatis (read-only) untuk broker aktif. */
export function AutoPositionsSection({
  brokerId,
  fxRates,
  onTotalProfitChange,
}: {
  readonly brokerId: BrokerId | undefined;
  readonly fxRates: ExchangeRates | null;
  readonly onTotalProfitChange?: (usd: number | null) => void;
}): JSX.Element {
  const active: BrokerId = brokerId ?? DEFAULT_BROKER_ID;
  const auto = useBrokerPositions(active);
  const holdings = auto.positions.map((position) =>
    toAutoHolding(position, active),
  );
  return (
    <div data-testid="auto-positions-section">
      <HoldingsDashboard
        holdings={holdings}
        brokerId={active}
        fxRates={fxRates}
        readOnly
        onTotalProfitChange={
          auto.sourceMissing ? undefined : onTotalProfitChange
        }
        heading={`4. Posisi MT5 otomatis (${holdings.length})`}
        emptyText={
          auto.sourceMissing
            ? "EA ExportPositions belum dipasang di terminal ini - lihat ea/ExportPositions.mq5."
            : "Tidak ada posisi terbuka di MT5."
        }
      />
    </div>
  );
}
