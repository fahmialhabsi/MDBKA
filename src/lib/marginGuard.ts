/**
 * Guard margin (item e): batasi lot agar margin tidak melebihi
 * MARGIN_USAGE_MAX_PCT dari free margin. Margin per lot berasal dari
 * OrderCalcMargin MT5 (Common\Files\MDBKA_Margin_<broker>.csv).
 * Modul murni: tanpa I/O, tanpa React.
 */
export const MARGIN_USAGE_MAX_PCT = 50;

export interface MarginCapInput {
  readonly suggestedLot: number | null;
  readonly minLot: number;
  readonly lotStep: number;
  readonly marginPerLot: number | null;
  readonly freeMargin: number | null;
  readonly maxUsagePct?: number;
}

export interface MarginCapResult {
  readonly maxLotByMargin: number | null;
  readonly cappedLot: number | null;
  readonly requiredMargin: number | null;
  readonly blocked: boolean;
  readonly warning: string | null;
}

function floorToStep(value: number, step: number): number {
  if (!(step > 0)) return value;
  return Math.round(Math.floor(value / step + 1e-9) * step * 1e8) / 1e8;
}

export function checkMarginCap(input: MarginCapInput): MarginCapResult {
  const { suggestedLot, minLot, lotStep, marginPerLot, freeMargin } = input;
  const pct = input.maxUsagePct ?? MARGIN_USAGE_MAX_PCT;
  if (suggestedLot === null || !(suggestedLot > 0)) {
    return {
      maxLotByMargin: null,
      cappedLot: suggestedLot,
      requiredMargin: null,
      blocked: false,
      warning: null,
    };
  }
  if (
    marginPerLot === null ||
    !(marginPerLot > 0) ||
    freeMargin === null ||
    !Number.isFinite(freeMargin)
  ) {
    return {
      maxLotByMargin: null,
      cappedLot: suggestedLot,
      requiredMargin: null,
      blocked: false,
      warning:
        "Data margin belum tersedia — cek margin di terminal sebelum entry.",
    };
  }
  const budget = (Math.max(0, freeMargin) * pct) / 100;
  const maxLot = floorToStep(budget / marginPerLot, lotStep);
  if (maxLot < minLot) {
    const need = minLot * marginPerLot;
    return {
      maxLotByMargin: maxLot,
      cappedLot: null,
      requiredMargin: need,
      blocked: true,
      warning: `Margin tidak cukup: minimum ${minLot} lot butuh $${need.toFixed(2)}, batas ${pct}% free margin $${budget.toFixed(2)}. JANGAN entry.`,
    };
  }
  if (suggestedLot > maxLot) {
    return {
      maxLotByMargin: maxLot,
      cappedLot: maxLot,
      requiredMargin: maxLot * marginPerLot,
      blocked: false,
      warning: `Lot dipangkas ${suggestedLot} → ${maxLot}: ${suggestedLot} lot butuh margin $${(suggestedLot * marginPerLot).toFixed(2)}, melebihi ${pct}% free margin ($${budget.toFixed(2)}).`,
    };
  }
  return {
    maxLotByMargin: maxLot,
    cappedLot: suggestedLot,
    requiredMargin: suggestedLot * marginPerLot,
    blocked: false,
    warning: null,
  };
}
