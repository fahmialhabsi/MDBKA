import type { MarketData } from "../types/analysis";
import {
  getInstrumentPreset,
  normalizeSymbol
} from "../lib/instrumentConfig";

export interface ScaleIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export function detectScaleMismatch(
  market: MarketData
): ScaleIssue[] {
  const preset = getInstrumentPreset(market.symbol);
  const code = normalizeSymbol(market.symbol);
  const issues: ScaleIssue[] = [];

  const values: Array<[string, number]> = [
    ["Bid", market.bid],
    ["Ask", market.ask],
    ["Close", market.close],
    ["Open", market.open],
    ["High", market.high],
    ["Low", market.low],
    ["MA50", market.ma50],
    ["Support", market.support],
    ["Resistance", market.resistance]
  ];

  if (code === "UNKNOWN") {
    issues.push({
      field: "symbol",
      message:
        "Instrumen belum dikenali. Periksa skala harga dan parameter broker secara manual.",
      severity: "warning"
    });

    return issues;
  }

  for (const [field, value] of values) {
    if (!Number.isFinite(value) || value <= 0) {
      issues.push({
        field,
        message: `${field} belum diisi dengan angka valid.`,
        severity: "error"
      });
      continue;
    }

    if (value < preset.minPrice || value > preset.maxPrice) {
      issues.push({
        field,
        message:
          `${field} = ${value} tidak sesuai skala ${preset.symbol}. ` +
          `Contoh nilai yang benar: ${preset.expectedPriceExample}. ` +
          `Kemungkinan data instrumen lain masih tercampur.`,
        severity: "error"
      });
    }
  }

  if (market.ask <= market.bid) {
    issues.push({
      field: "Bid/Ask",
      message: "Ask harus lebih besar daripada Bid.",
      severity: "error"
    });
  }

  if (market.support >= market.resistance) {
    issues.push({
      field: "Support/Resistance",
      message: "Support harus lebih rendah daripada resistance.",
      severity: "error"
    });
  }

  return issues;
}

