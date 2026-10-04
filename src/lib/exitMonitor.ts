import {
  getInstrumentSpec32,
} from "./instrumentSpecs32";
import type { BrokerId } from "../types/broker";

/**
 * Tahap F1 — monitor posisi manual + sinyal exit (MODUL MURNI, CJS-safe:
 * tanpa import.meta, tanpa DOM — pola src/lib/dataFreshness.ts).
 *
 * - Holding diisi MANUAL via form (belum ada ekspor posisi otomatis MT5).
 * - Harga berjalan dari stream quotes (LiveQuotes); P&L memakai tickValue
 *   + pip spec32 Finex. Tervalidasi vs histori real: USDCHF buy 0.01
 *   @0.83231 → bid 0.83349 = +1.42 USD (match laporan 91811209).
 * - Sinyal exit rule-based transparan (BUKAN prediksi): TP/SL tersentuh,
 *   dekat TP/SL (±15% rentang), drift merugikan (rugi ≥50% risiko
 *   terencana). Tak menyentuh decision engine / S/R / sizing.
 */

export type HoldingDirection = "BELI" | "JUAL";

export interface Holding {
  readonly id: string;
  readonly symbol: string;
  readonly brokerId: BrokerId;
  readonly direction: HoldingDirection;
  /** Lot terisi (mis. 0.01). */
  readonly lot: number;
  readonly entryPrice: number;
  readonly sl: number;
  readonly tp: number;
  /** ISO entry (opsional, untuk umur posisi). */
  readonly entryTime: string;
  readonly createdAt: string;
}

export type ExitSignal =
  | "EXIT_TAKE_PROFIT"
  | "EXIT_STOP_LOSS"
  | "WARN_NEAR_TP"
  | "WARN_NEAR_SL"
  | "WARN_ADVERSE_DRIFT"
  | "HOLD";

export interface ExitEvaluation {
  readonly signal: ExitSignal;
  /** Alasan Indonesia (untuk badge + tooltip). */
  readonly reasons: string[];
  /** P&L berjalan (null bila tak terhitung). */
  readonly pnl: number | null;
  /** Mata uang pnl ("USD" bila terkonversi, else profit currency). */
  readonly pnlCurrency: string;
  /** Risiko terencana (null bila tak terhitung). */
  readonly risk: number | null;
  /** Reward terencana (null bila tak terhitung). */
  readonly reward: number | null;
  /** Mata uang risk/reward (sama konvensi dengan pnlCurrency). */
  readonly planCurrency: string;
}

/** Ambang dekat TP/SL: 15% dari rentang TP−SL. */
export const NEAR_LEVEL_PCT = 15;
/** Ambang drift: rugi berjalan ≥ 50% risiko terencana. */
export const ADVERSE_DRIFT_PCT = 50;

/** Harga acuan keluar: BELI keluar di bid, JUAL keluar di ask. */
export function exitReferencePrice(
  direction: HoldingDirection,
  bid: number,
  ask: number,
): number {
  return direction === "BELI" ? bid : ask;
}

/**
 * P&L berjalan dari first principles (tervalidasi vs laporan broker
 * 91811209):
 *   quoteAmount = signedDiff × contractSize × lot   (satuan profit ccy)
 *   usd         = convertToUsd(quoteAmount, profitCcy) bila tersedia
 * Contoh cocok persis: GBPUSD buy 0.01 @1.32483→1.32339 = −$1.44;
 * USDCHF buy 0.01 @0.83231→0.83349 ≈ +$1.42; AUDCAD buy 0.01
 * @0.99345→0.99154 ≈ −$1.35 (via konversi, bukan tick mentah).
 * Tanpa converter → nilai profit-ccy berlabel jujur (bukan klaim USD).
 */
export interface HoldingPnL {
  readonly value: number;
  readonly currency: string;
}

export function calculateHoldingPnL(
  holding: Pick<Holding, "symbol" | "direction" | "lot" | "entryPrice">,
  bid: number,
  ask: number,
  convertToUsd?: (amount: number, currency: string) => number | null,
): HoldingPnL | null {
  if (
    !Number.isFinite(holding.lot) ||
    holding.lot <= 0 ||
    !Number.isFinite(holding.entryPrice) ||
    holding.entryPrice <= 0 ||
    !Number.isFinite(bid) ||
    bid <= 0 ||
    !Number.isFinite(ask) ||
    ask <= 0
  ) {
    return null;
  }
  const spec = getInstrumentSpec32(holding.symbol);
  if (spec === null) return null;
  if (!Number.isFinite(spec.leverage) || spec.leverage <= 0) return null;
  const ref = exitReferencePrice(holding.direction, bid, ask);
  const signed =
    holding.direction === "BELI" ? ref - holding.entryPrice : holding.entryPrice - ref;
  const quoteAmount = round2(signed * spec.leverage * holding.lot);
  const profitCcy = spec.quoteCurrency;
  if (profitCcy === "USD") return { value: quoteAmount, currency: "USD" };
  if (convertToUsd !== undefined) {
    const usd = convertToUsd(quoteAmount, profitCcy);
    if (usd !== null && Number.isFinite(usd)) {
      return { value: round2(usd), currency: "USD" };
    }
  }
  return { value: quoteAmount, currency: profitCcy };
}

/** Nilai terencana: jarak harga → quote ccy → USD bila converter ada. */
function plannedValue(
  symbol: string,
  lot: number,
  priceDistance: number,
  convertToUsd?: (amount: number, currency: string) => number | null,
): { value: number; currency: string } | null {
  const spec = getInstrumentSpec32(symbol);
  if (spec === null) return null;
  if (
    !Number.isFinite(lot) ||
    lot <= 0 ||
    !Number.isFinite(priceDistance) ||
    priceDistance < 0 ||
    !Number.isFinite(spec.leverage) ||
    spec.leverage <= 0
  ) {
    return null;
  }
  const quoteAmount = round2(priceDistance * spec.leverage * lot);
  if (spec.quoteCurrency === "USD") {
    return { value: quoteAmount, currency: "USD" };
  }
  if (convertToUsd !== undefined) {
    const usd = convertToUsd(quoteAmount, spec.quoteCurrency);
    if (usd !== null && Number.isFinite(usd)) {
      return { value: round2(usd), currency: "USD" };
    }
  }
  return { value: quoteAmount, currency: spec.quoteCurrency };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Evaluasi sinyal exit untuk satu holding pada harga berjalan.
 * Urutan: TP tersentuh → SL tersentuh → dekat TP/SL → drift merugikan
 * → HOLD. Tak pernah throw; input invalid → HOLD + alasan.
 */
export function evaluateExitSignal(
  holding: Holding,
  bid: number,
  ask: number,
  convertToUsd?: (amount: number, currency: string) => number | null,
): ExitEvaluation {
  const fallback: ExitEvaluation = {
    signal: "HOLD",
    reasons: ["Harga berjalan invalid; tak dapat dievaluasi."],
    pnl: null,
    pnlCurrency: "USD",
    risk: null,
    reward: null,
    planCurrency: "USD",
  };
  if (
    !Number.isFinite(bid) ||
    bid <= 0 ||
    !Number.isFinite(ask) ||
    ask <= 0 ||
    !Number.isFinite(holding.entryPrice) ||
    holding.entryPrice <= 0 ||
    !Number.isFinite(holding.sl) ||
    holding.sl <= 0 ||
    !Number.isFinite(holding.tp) ||
    holding.tp <= 0 ||
    !Number.isFinite(holding.lot) ||
    holding.lot <= 0
  ) {
    return fallback;
  }

  const ref = exitReferencePrice(holding.direction, bid, ask);
  const pnl = calculateHoldingPnL(holding, bid, ask, convertToUsd);
  const risk = plannedValue(
    holding.symbol,
    holding.lot,
    Math.abs(holding.entryPrice - holding.sl),
    convertToUsd,
  );
  const reward = plannedValue(
    holding.symbol,
    holding.lot,
    Math.abs(holding.tp - holding.entryPrice),
    convertToUsd,
  );
  const pnlValue = pnl?.value ?? null;
  const pnlCcy = pnl?.currency ?? "USD";
  const riskValue = risk?.value ?? null;
  const planCcy = risk?.currency ?? reward?.currency ?? "USD";

  const tpHit =
    holding.direction === "BELI" ? ref >= holding.tp : ref <= holding.tp;
  if (tpHit) {
    return {
      signal: "EXIT_TAKE_PROFIT",
      reasons: [
        `Target profit tersentuh (${holding.tp}). Amankan hasil${pnlValue !== null ? ` ${pnlValue >= 0 ? "+" : ""}${pnlValue.toFixed(2)} ${pnlCcy}` : ""}.`,
      ],
      pnl: pnlValue,
      pnlCurrency: pnlCcy,
      risk: riskValue,
      reward: reward?.value ?? null,
      planCurrency: planCcy,
    };
  }

  const slHit =
    holding.direction === "BELI" ? ref <= holding.sl : ref >= holding.sl;
  if (slHit) {
    return {
      signal: "EXIT_STOP_LOSS",
      reasons: [
        `Stop loss tersentuh (${holding.sl}). Keluar sesuai rencana${pnlValue !== null ? ` ${pnlValue.toFixed(2)} ${pnlCcy}` : ""}.`,
      ],
      pnl: pnlValue,
      pnlCurrency: pnlCcy,
      risk: riskValue,
      reward: reward?.value ?? null,
      planCurrency: planCcy,
    };
  }

  const base = {
    pnl: pnlValue,
    pnlCurrency: pnlCcy,
    risk: riskValue,
    reward: reward?.value ?? null,
    planCurrency: planCcy,
  };

  const range = Math.abs(holding.tp - holding.sl);
  if (range > 0) {
    const nearBand = (range * NEAR_LEVEL_PCT) / 100;
    if (Math.abs(ref - holding.tp) <= nearBand) {
      return {
        signal: "WARN_NEAR_TP",
        reasons: [
          `Dekat target (${round2(Math.abs(ref - holding.tp))} lagi). Siapkan exit bertahap.`,
        ],
        ...base,
      };
    }
    if (Math.abs(ref - holding.sl) <= nearBand) {
      return {
        signal: "WARN_NEAR_SL",
        reasons: [
          `Dekat stop loss (${round2(Math.abs(ref - holding.sl))} lagi). Jangan geser SL.`,
        ],
        ...base,
      };
    }
  }

  if (
    pnlValue !== null &&
    riskValue !== null &&
    riskValue > 0 &&
    pnlValue < 0 &&
    pnlCcy === planCcy &&
    Math.abs(pnlValue) >= (riskValue * ADVERSE_DRIFT_PCT) / 100
  ) {
    return {
      signal: "WARN_ADVERSE_DRIFT",
      reasons: [
        `Rugi berjalan ${Math.abs(pnlValue).toFixed(2)} ${pnlCcy} ≥ ${ADVERSE_DRIFT_PCT}% risiko terencana (${riskValue.toFixed(2)} ${planCcy}). Tinjau ulang sebelum SL.`,
      ],
      ...base,
    };
  }

  return { signal: "HOLD", reasons: ["Dalam koridor rencana. Tahan."], ...base };
}

/**
 * Validasi input form holding. [] = valid. Sisi SL/TP dicek per arah
 * (BELI: SL<entry<TP; JUAL: TP<entry<SL}).
 */
export function validateHoldingInput(input: {
  readonly symbol: string;
  readonly direction: HoldingDirection;
  readonly lot: number;
  readonly entryPrice: number;
  readonly sl: number;
  readonly tp: number;
}): string[] {
  const errors: string[] = [];
  if (input.symbol.trim() === "") errors.push("Simbol wajib diisi.");
  if (!Number.isFinite(input.lot) || input.lot <= 0) {
    errors.push("Lot harus angka > 0.");
  }
  for (const [name, value] of [
    ["Entry", input.entryPrice],
    ["SL", input.sl],
    ["TP", input.tp],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`${name} harus angka > 0.`);
    }
  }
  if (errors.length > 0) return errors;
  if (input.direction === "BELI") {
    if (!(input.sl < input.entryPrice && input.entryPrice < input.tp)) {
      errors.push("BELI butuh SL < entry < TP.");
    }
  } else {
    if (!(input.tp < input.entryPrice && input.entryPrice < input.sl)) {
      errors.push("JUAL butuh TP < entry < SL.");
    }
  }
  if (getInstrumentSpec32(input.symbol.trim()) === null) {
    errors.push(`Simbol ${input.symbol.trim()} tak punya data spec (P&L tak terhitung).`);
  }
  return errors;
}
