import type {
  BrokerSettings,
  MarketData
} from "../types/analysis";
import type { BrokerId } from "../types/broker";
import { ORBITRADER_BROKER_ID } from "../lib/brokerRegistry";
import { getOtbInstrumentProfile } from "../lib/otbInstrumentConfig";
import { getInstrumentProfile } from "../lib/instrumentConfig";
import { traceOcrStage } from "../lib/debugTrace";

export type ValidationSeverity = "error" | "warning";

export interface ValidationItem {
  field: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationSummary {
  valid: boolean;
  errors: ValidationItem[];
  warnings: ValidationItem[];
  spread: number;
  spreadPips: number;
  maxRiskUsd: number;
  minimumLotRiskUsd: number | null;
  minimumLotRiskPercent: number | null;
}

function item(
  field: string,
  message: string,
  severity: ValidationSeverity
): ValidationItem {
  return { field, message, severity };
}

export function validateAnalysisInputs(
  market: MarketData,
  broker: BrokerSettings,
  brokerId?: BrokerId
): ValidationSummary {
  const errors: ValidationItem[] = [];
  const warnings: ValidationItem[] = [];

  const profile = getInstrumentProfile(market.symbol);
  const spread = market.ask - market.bid;

  // Satuan spread mengikuti profil instrumen:
  // forex dalam pip, indeks dalam index points.
  const spreadPips =
    profile.pipSize > 0 ? spread / profile.pipSize : spread;

  const maxRiskUsd =
    broker.equity * (broker.riskPercent / 100);

  if (!market.symbol.trim()) {
    errors.push(item("symbol", "Pilih simbol sebelum melakukan analisa.", "error"));
  } else if (profile.category === "unknown") {
    errors.push(
      item(
        "symbol",
        "Simbol belum dikenali. Pilih simbol dari daftar.",
        "error"
      )
    );
  }

  if (!market.timeframe.trim()) {
    errors.push(item("timeframe", "Timeframe wajib diisi.", "error"));
  }

  if (!Number.isFinite(market.bid) || market.bid <= 0) {
    errors.push(item("bid", "Bid harus lebih besar dari 0.", "error"));
  }

  if (!Number.isFinite(market.ask) || market.ask <= 0) {
    errors.push(item("ask", "Ask harus lebih besar dari 0.", "error"));
  }

  if (Number.isFinite(market.bid) && Number.isFinite(market.ask)) {
    if (market.ask <= market.bid) {
      errors.push(
        item(
          "spread",
          "Ask harus lebih besar daripada Bid.",
          "error"
        )
      );
    }

    if (spreadPips < 0) {
      errors.push(
        item(
          "spread",
          "Spread tidak boleh negatif.",
          "error"
        )
      );
    } else if (
      profile.category === "forex"
        ? spreadPips > 5
        : spreadPips > 50
    ) {
      warnings.push(
        item(
          "spread",
          `Spread cukup besar: ${spreadPips.toFixed(1)} ${profile.spreadLabel}.`,
          "warning"
        )
      );
    }
  }

  const ohlcEntries: Array<[string, number, string]> = [
    ["open", market.open, "Open harus lebih besar dari 0."],
    ["high", market.high, "High harus lebih besar dari 0."],
    ["low", market.low, "Low harus lebih besar dari 0."],
    ["close", market.close, "Close harus lebih besar dari 0."],
  ];

  for (const [field, value, message] of ohlcEntries) {
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(item(field, message, "error"));
    }
  }

  if (
    Number.isFinite(market.high) &&
    Number.isFinite(market.low) &&
    market.high < market.low
  ) {
    errors.push(
      item("high-low", "High tidak boleh lebih rendah daripada Low.", "error")
    );
  }

  if (
    Number.isFinite(market.high) &&
    Number.isFinite(market.open) &&
    Number.isFinite(market.close) &&
    (market.high < market.open || market.high < market.close)
  ) {
    errors.push(
      item(
        "high",
        "High tidak boleh lebih rendah daripada Open atau Close.",
        "error"
      )
    );
  }

  if (
    Number.isFinite(market.low) &&
    Number.isFinite(market.open) &&
    Number.isFinite(market.close) &&
    (market.low > market.open || market.low > market.close)
  ) {
    errors.push(
      item(
        "low",
        "Low tidak boleh lebih tinggi daripada Open atau Close.",
        "error"
      )
    );
  }

  if (!Number.isFinite(market.rsi) || market.rsi < 0 || market.rsi > 100) {
    errors.push(
      item(
        "rsi",
        "RSI harus berada antara 0 sampai 100.",
        "error"
      )
    );
  }

  if (!Number.isFinite(market.ma50) || market.ma50 <= 0) {
    errors.push(
      item("ma50", "MA50 wajib diisi dengan angka valid.", "error")
    );
  }

  if (!Number.isFinite(market.atr) || market.atr <= 0) {
    errors.push(
      item("atr", "ATR harus lebih besar dari 0.", "error")
    );
  }

  if (!Number.isFinite(market.support) || market.support <= 0) {
    errors.push(
      item(
        "support",
        "Support wajib diisi dengan angka valid.",
        "error"
      )
    );
  }

  if (!Number.isFinite(market.resistance) || market.resistance <= 0) {
    errors.push(
      item(
        "resistance",
        "Resistance wajib diisi dengan angka valid.",
        "error"
      )
    );
  }

  if (
    Number.isFinite(market.support) &&
    Number.isFinite(market.resistance) &&
    market.support >= market.resistance
  ) {
    errors.push(
      item(
        "support-resistance",
        "Support harus lebih rendah daripada resistance.",
        "error"
      )
    );
  }

  if (
    Number.isFinite(market.close) &&
    Number.isFinite(market.support) &&
    market.close < market.support
  ) {
    warnings.push(
      item(
        "support",
        "Close berada di bawah support yang dimasukkan. Periksa kembali level support.",
        "warning"
      )
    );
  }

  if (
    Number.isFinite(market.close) &&
    Number.isFinite(market.resistance) &&
    market.close > market.resistance
  ) {
    warnings.push(
      item(
        "resistance",
        "Close berada di atas resistance yang dimasukkan. Periksa kembali level resistance.",
        "warning"
      )
    );
  }

  if (!Number.isFinite(broker.equity) || broker.equity <= 0) {
    errors.push(
      item(
        "equity",
        "Equity harus lebih besar dari 0.",
        "error"
      )
    );
  }

  if (
    !Number.isFinite(broker.riskPercent) ||
    broker.riskPercent <= 0 ||
    broker.riskPercent > 100
  ) {
    errors.push(
      item(
        "riskPercent",
        "Risiko maksimum harus lebih besar dari 0 dan tidak lebih dari 100%.",
        "error"
      )
    );
  }

  if (!Number.isFinite(broker.pointValue) || broker.pointValue <= 0) {
    errors.push(
      item(
        "pointValue",
        "Nilai point broker harus lebih besar dari 0.",
        "error"
      )
    );
  }

  if (!Number.isFinite(broker.minLot) || broker.minLot <= 0) {
    errors.push(
      item(
        "minLot",
        "Minimum lot broker harus lebih besar dari 0.",
        "error"
      )
    );
  }

  // Tahap 4B: minimum lot khusus OTB sebagai warning non-blokir (tidak
  // force naik). Hanya bila broker aktif OTB, minLot valid > 0, dan ada
  // preset OTB terverifikasi untuk simbol exact. Tanpa preset: tidak ada
  // guard (tidak boleh mengarang batas).
  if (
    brokerId === ORBITRADER_BROKER_ID &&
    Number.isFinite(broker.minLot) &&
    broker.minLot > 0
  ) {
    const otbMinimum = getOtbInstrumentProfile(market.symbol)?.minVolume;

    if (otbMinimum !== undefined && broker.minLot < otbMinimum) {
      warnings.push(
        item(
          "minLot",
          `Minimum lot ${broker.minLot} di bawah minimum ` +
            `OrbiTraderBerjangka (${otbMinimum} lot). Sesuaikan sebelum order.`,
          "warning"
        )
      );
    }
  }

  if (!Number.isFinite(broker.lotStep) || broker.lotStep <= 0) {
    errors.push(
      item(
        "lotStep",
        "Lot step broker harus lebih besar dari 0.",
        "error"
      )
    );
  }

  if (
    Number.isFinite(broker.minLot) &&
    Number.isFinite(broker.lotStep) &&
    broker.lotStep > broker.minLot
  ) {
    warnings.push(
      item(
        "lotStep",
        "Lot step lebih besar daripada minimum lot. Pastikan sesuai spesifikasi broker.",
        "warning"
      )
    );
  }

  if (!Number.isFinite(broker.contractSize) || broker.contractSize <= 0) {
    errors.push(
      item(
        "contractSize",
        "Contract size broker harus lebih besar dari 0. Verifikasi dari broker.",
        "error"
      )
    );
  }

  if (!Number.isFinite(broker.commission) || broker.commission < 0) {
    errors.push(
      item(
        "commission",
        "Komisi tidak boleh negatif.",
        "error"
      )
    );
  }

  if (!Number.isFinite(broker.slippage) || broker.slippage < 0) {
    errors.push(
      item(
        "slippage",
        "Slippage tidak boleh negatif.",
        "error"
      )
    );
  }

  if (!Number.isFinite(broker.buffer) || broker.buffer < 0) {
    errors.push(
      item(
        "buffer",
        "Buffer tidak boleh negatif.",
        "error"
      )
    );
  }

  if (!Number.isFinite(broker.atrMultiplier) || broker.atrMultiplier <= 0) {
    errors.push(
      item(
        "atrMultiplier",
        "Pengali ATR harus lebih besar dari 0.",
        "error"
      )
    );
  }

  if (!Number.isFinite(broker.targetRR) || broker.targetRR <= 0) {
    errors.push(
      item(
        "targetRR",
        "Target RR harus lebih besar dari 0.",
        "error"
      )
    );
  }

  const riskDistance =
    market.atr * broker.atrMultiplier;

  const minimumLotRiskUsd =
    Number.isFinite(riskDistance) &&
    riskDistance > 0 &&
    broker.pointValue > 0 &&
    broker.minLot > 0
      ? (riskDistance + Math.max(spread, 0) + broker.slippage) *
          broker.pointValue *
          broker.minLot +
        broker.commission * broker.minLot
      : null;

  // Equity hanya dapat dipakai sebagai pembanding bila finite dan > 0.
  // NaN/0/negatif/Infinity membuat persen null agar pesan "belum dapat
  // dibandingkan" yang tampil, bukan undefined%/NaN%/Infinity%.
  const equityUsable =
    Number.isFinite(broker.equity) && broker.equity > 0;

  const minimumLotRiskPercent =
    minimumLotRiskUsd !== null && equityUsable
      ? (minimumLotRiskUsd / broker.equity) * 100
      : null;

  if (
    minimumLotRiskUsd !== null &&
    (!equityUsable || minimumLotRiskUsd > maxRiskUsd)
  ) {
    // Guard: minimumLotRiskPercent hanya terisi bila equity valid (> 0).
    // Tanpa guard, optional chaining mencetak "undefined%" saat equity
    // kosong/0/NaN/negatif. Format dan angka saat equity valid tidak berubah.
    const riskMessage =
      minimumLotRiskPercent !== null
        ? `Risiko minimum lot sekitar $${minimumLotRiskUsd.toFixed(2)} atau ${minimumLotRiskPercent.toFixed(1)}% equity, melebihi batas $${maxRiskUsd.toFixed(2)}.`
        : "Risiko minimum lot belum dapat dibandingkan karena Equity USD belum diisi.";
    warnings.push(item("risk", riskMessage, "warning"));
  }

  const summary: ValidationSummary = {
    valid: errors.length === 0,
    errors,
    warnings,
    spread,
    spreadPips,
    maxRiskUsd,
    minimumLotRiskUsd,
    minimumLotRiskPercent
  };

  traceOcrStage("validate", {
    symbol: market.symbol,
    valid: summary.valid,
    errorFields: errors.map((error) => error.field),
    warningFields: warnings.map((warning) => warning.field),
    bid: market.bid,
    ask: market.ask,
  });

  return summary;
}

