import type { MarketData } from "../types/analysis";
import {
  getInstrumentPreset,
  normalizeSymbol
} from "../lib/instrumentConfig";

export type ScaleIssueCode = "missing" | "scale-mismatch" | "structure";

export interface ScaleIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
  /**
   * Klasifikasi untuk prioritas tampilan:
   * - "missing": field 0/belum valid (bukan mismatch instrumen),
   * - "scale-mismatch": angka nonzero di luar skala profil,
   * - "structure": relasi invalid antar field yang sudah terisi.
   */
  code: ScaleIssueCode;
}

export function detectScaleMismatch(
  market: MarketData
): ScaleIssue[] {
  const preset = getInstrumentPreset(market.symbol);
  const normalized = normalizeSymbol(market.symbol);
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

  if (normalized === "UNKNOWN") {
    issues.push({
      field: "symbol",
      message:
        "Instrumen belum dikenali. Periksa skala harga dan parameter broker secara manual.",
      severity: "warning",
      code: "structure"
    });

    return issues;
  }

  for (const [field, value] of values) {
    if (!Number.isFinite(value) || value <= 0) {
      issues.push({
        field,
        message: `${field} belum diisi dengan angka valid.`,
        severity: "error",
        code: "missing"
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
        severity: "error",
        code: "scale-mismatch"
      });
    }
  }

  // Relasi struktural hanya dinilai bila kedua field sudah terisi;
  // field kosong (0) sudah dilaporkan sebagai "missing", bukan mismatch.
  if (
    Number.isFinite(market.ask) &&
    Number.isFinite(market.bid) &&
    market.ask > 0 &&
    market.bid > 0 &&
    market.ask <= market.bid
  ) {
    issues.push({
      field: "Bid/Ask",
      message: "Ask harus lebih besar daripada Bid.",
      severity: "error",
      code: "structure"
    });
  }

  if (
    Number.isFinite(market.support) &&
    Number.isFinite(market.resistance) &&
    market.support > 0 &&
    market.resistance > 0 &&
    market.support >= market.resistance
  ) {
    issues.push({
      field: "Support/Resistance",
      message: "Support harus lebih rendah daripada resistance.",
      severity: "error",
      code: "structure"
    });
  }

  return issues;
}

