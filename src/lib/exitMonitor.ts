import {
  getInstrumentSpec32,
} from "./instrumentSpecs32";
import { getSpec32SwapPreview } from "./spec32Wiring";
import { parseSnapshotTime } from "./dataFreshness";
import { priceDigits, tickSizeForSymbol } from "./tickSize";
import { riskGroupOf } from "./riskGroup";
import type { BrokerId } from "../types/broker";
import type { BrokerPosition } from "../../server/types/positions";

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
  /** Equity akun USD saat entry (opsional, untuk margin guard 10%). */
  readonly accountEquity?: number;
  /** SW1: swap asli dari MT5 (USD, posisi otomatis); absen = pakai perkiraan. */
  readonly brokerSwap?: number;
  /**
   * Status posisi (Tahap v1.3.0): OPEN aktif dipantau; EXITED sudah
   * ditandai keluar MANUAL oleh pengguna (BUKAN eksekusi order —
   * konfirmasi di MT5 tetap wajib). Absen = OPEN (migrasi data lama).
   */
  readonly status?: "OPEN" | "EXITED";
  readonly exitPrice?: number;
  readonly exitTime?: string;
  readonly realizedPnl?: number;
  readonly realizedCurrency?: string;
  readonly swapAtExit?: number;
  readonly exitNote?: string;
}

export type ExitSignal =
  | "EXIT_TAKE_PROFIT"
  | "EXIT_STOP_LOSS"
  | "WARN_NEAR_TP"
  | "WARN_NEAR_SL"
  | "WARN_PRICE_DRIFT"
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
  /** Komisi broker USD (null bila simbol tak dikenal). */
  readonly commission: number | null;
  /** P&L bersih = pnl − komisi (null bila salah satu null). */
  readonly pnlNet: number | null;
  /** Estimasi swap menginap (null bila intraday/unknown; lihat HoldingSwap). */
  readonly swap: HoldingSwap | null;
  /** Risiko terencana (null bila tak terhitung). */
  readonly risk: number | null;
  /** Reward terencana (null bila tak terhitung). */
  readonly reward: number | null;
  /** Mata uang risk/reward (sama konvensi dengan pnlCurrency). */
  readonly planCurrency: string;
}

/**
 * Komisi broker USD untuk holding (Tahap NET): OTB 33/lot, Finex
 * 1.00/lot (kolom Commission CSV, sudah di spec32 sejak 6G).
 * Round-trip penuh dibebankan di muka secara jujur-konservatif
 * (label jelas di UI); null bila simbol tak punya spec.
 */
export function commissionForHolding(
  symbol: string,
  lot: number,
): number | null {
  if (!Number.isFinite(lot) || lot <= 0) return null;
  const spec = getInstrumentSpec32(symbol.trim());
  if (spec === null) return null;
  if (!Number.isFinite(spec.commission) || spec.commission < 0) return null;
  return round2(spec.commission * lot);
}

/**
 * 9 Okt 2026: komisi SAHAM belum pernah terbukti dari History (META.US OTB:
 * deal IN komisi 0,00; Equity MT5 hanya turun sebesar P&L harga). Selama
 * belum terverifikasi, komisi saham TIDAK dikurangkan dari P&L monitor
 * (bukan tebakan 33/lot). Forex/logam/indeks tetap seperti semula.
 */
export function stockCommissionUnverified(symbol: string): boolean {
  const s = symbol.trim().toUpperCase();
  // OTB `.US` TERVERIFIKASI 9 Okt (META.US ditutup: komisi IN & OUT 0,00) →
  // spec32 commission 0. Tersisa saham Finex `#…` yang belum terbukti.
  return s.startsWith("#") && s.length > 1;
}

function evalCommission(symbol: string, lot: number): number | null {
  if (stockCommissionUnverified(symbol)) return Number.isFinite(lot) && lot > 0 ? 0 : null;
  return commissionForHolding(symbol, lot);
}

/** Ambang dekat TP/SL: 15% dari rentang TP−SL. */
export const NEAR_LEVEL_PCT = 15;
/** Ambang drift: rugi berjalan ≥ 50% risiko terencana. */
export const ADVERSE_DRIFT_PCT = 50;
/** Ambang drift harga: merugikan ≥ 0,5% dari entry (−2% tak terpicu: SL tipikal 0,6–1,2%). */
export const PRICE_DRIFT_PCT = 0.5;
/** Guard margin: risiko terencana > 10% equity → warning pasif. */
export const MARGIN_GUARD_PCT = 10;
/** R:R minimal layak: reward ≥ 2× risiko. */
export const MIN_REWARD_RISK = 2;

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

/** Jumlah desimal angka (mis. 0.69811 → 5), dibatasi 0..8. */
function decimalsOf(value: number): number {
  for (let d = 0; d <= 8; d += 1) {
    if (Math.abs(value * Math.pow(10, d) - Math.round(value * Math.pow(10, d))) < 1e-6) return d;
  }
  return 8;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Jarak harga untuk teks badge. round2 memotong jarak forex (0.00186)
 * menjadi "0"; presisi mengikuti besaran jarak (forex 5 desimal,
 * indeks/saham 2 desimal).
 */
export function formatPriceDistance(distance: number): string {
  const d = Math.abs(distance);
  if (!Number.isFinite(d)) return "-";
  if (d >= 10) return d.toFixed(2);
  if (d >= 1) return d.toFixed(3);
  return d.toFixed(5);
}

/**
 * Evaluasi sinyal exit untuk satu holding pada harga berjalan.
 * Urutan: TP tersentuh → SL tersentuh → dekat TP/SL → drift harga 0,5%
 * → drift risiko 50% → HOLD. Tak pernah throw; input invalid → HOLD.
 */
export function evaluateExitSignal(
  holding: Holding,
  bid: number,
  ask: number,
  convertToUsd?: (amount: number, currency: string) => number | null,
  nowMs: number = Date.now(),
): ExitEvaluation {
  const fallback: ExitEvaluation = {
    signal: "HOLD",
    reasons: ["Harga berjalan invalid; tak dapat dievaluasi."],
    pnl: null,
    pnlCurrency: "USD",
    commission: evalCommission(holding.symbol, holding.lot),
    pnlNet: null,
    swap: null,
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
    !Number.isFinite(holding.lot) ||
    holding.lot <= 0
  ) {
    return fallback;
  }
  // 9 Okt (META.US OTB): posisi TANPA SL/TP tetap dihitung P&L-nya (dulu "–"),
  // risiko/reward tak terdefinisi → null, dengan peringatan jelas.
  if (!Number.isFinite(holding.sl) || holding.sl <= 0 || !Number.isFinite(holding.tp) || holding.tp <= 0) {
    const pnlOnly = calculateHoldingPnL(holding, bid, ask, convertToUsd);
    const comm = evalCommission(holding.symbol, holding.lot);
    return {
      ...fallback,
      reasons: ["Posisi tanpa SL/TP: rugi tidak dibatasi. Pasang SL di MT5 (saat pasar buka)."],
      pnl: pnlOnly?.value ?? null,
      pnlCurrency: pnlOnly?.currency ?? "USD",
      pnlNet: pnlOnly !== null && comm !== null ? round2(pnlOnly.value - comm) : null,
      swap: calculateHoldingSwap(holding, nowMs),
    };
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
  const commission = evalCommission(holding.symbol, holding.lot);
  const pnlNet =
    pnlValue !== null && commission !== null
      ? round2(pnlValue - commission)
      : null;
  const swap = calculateHoldingSwap(holding, nowMs);

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
      commission,
      pnlNet,
      swap,
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
      commission,
      pnlNet,
      swap,
      risk: riskValue,
      reward: reward?.value ?? null,
      planCurrency: planCcy,
    };
  }

  const base = {
    pnl: pnlValue,
    pnlCurrency: pnlCcy,
    commission,
    pnlNet,
    swap,
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
          `Dekat target (${formatPriceDistance(ref - holding.tp)} lagi). Siapkan exit bertahap.`,
        ],
        ...base,
      };
    }
    if (Math.abs(ref - holding.sl) <= nearBand) {
      return {
        signal: "WARN_NEAR_SL",
        reasons: [
          `Dekat stop loss (${formatPriceDistance(ref - holding.sl)} lagi). Jangan geser SL.`,
        ],
        ...base,
      };
    }
  }

  if (
    pnlValue !== null &&
    riskValue !== null &&
    riskValue > 0 &&
    pnlCcy === planCcy
  ) {
    const adversePct =
      holding.direction === "BELI"
        ? ((holding.entryPrice - ref) / holding.entryPrice) * 100
        : ((ref - holding.entryPrice) / holding.entryPrice) * 100;
    if (adversePct >= PRICE_DRIFT_PCT) {
      return {
        signal: "WARN_PRICE_DRIFT",
        reasons: [
          `Harga ${adversePct.toFixed(2)}% merugikan dari entry (≥${PRICE_DRIFT_PCT}%). Pertimbangkan keluar dini.`,
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
 * Margin guard pasif Phase 2: risiko terencana vs equity akun.
 * Warning bila risiko > MARGIN_GUARD_PCT% equity. Butuh converter untuk
 * profit-ccy non-USD (risiko vs equity USD harus se-mata-uang);
 * tanpa converter yang memadai → null (jujur, bukan tebakan).
 * Tak pernah throw.
 */
export function checkMarginGuard(
  holding: Pick<
    Holding,
    "symbol" | "lot" | "entryPrice" | "sl" | "accountEquity"
  >,
  convertToUsd?: (amount: number, currency: string) => number | null,
): string | null {
  const equity = holding.accountEquity;
  if (equity === undefined) return null;
  if (!Number.isFinite(equity) || equity <= 0) return null;
  const risk = plannedValue(
    holding.symbol,
    holding.lot,
    Math.abs(holding.entryPrice - holding.sl),
    convertToUsd,
  );
  if (risk === null || !Number.isFinite(risk.value) || risk.value <= 0) {
    return null;
  }
  let riskUsd: number | null = null;
  if (risk.currency === "USD") {
    riskUsd = risk.value;
  } else if (convertToUsd !== undefined) {
    const converted = convertToUsd(risk.value, risk.currency);
    if (converted !== null && Number.isFinite(converted)) riskUsd = converted;
  }
  if (riskUsd === null) return null;
  const pct = (riskUsd / equity) * 100;
  if (pct <= MARGIN_GUARD_PCT) return null;
  return (
    `Risiko terencana $${riskUsd.toFixed(2)} = ${pct.toFixed(1)}% equity ` +
    `($${equity.toFixed(2)}) > ${MARGIN_GUARD_PCT}%. Kecilkan lot atau rapatkan SL.`
  );
}

/**
 * Rasio reward:risk dari jarak harga (mata uang saling meniadakan).
 * Null bila input invalid atau risiko nol.
 */
export function rewardRiskRatio(
  entryPrice: number,
  sl: number,
  tp: number,
): number | null {
  if (
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    !Number.isFinite(sl) ||
    sl <= 0 ||
    !Number.isFinite(tp) ||
    tp <= 0
  ) {
    return null;
  }
  const risk = Math.abs(entryPrice - sl);
  if (risk <= 0) return null;
  return Math.abs(tp - entryPrice) / risk;
}

/**
 * Peringatan R:R suboptimal Phase 2: reward < MIN_REWARD_RISK × risiko.
 * Non-blokir (form tetap bisa submit; dashboard tampilkan badge).
 */
export function checkRewardRisk(
  entryPrice: number,
  sl: number,
  tp: number,
): string | null {
  const ratio = rewardRiskRatio(entryPrice, sl, tp);
  if (ratio === null) return null;
  if (ratio >= MIN_REWARD_RISK) return null;
  return (
    `Reward/risk 1:${ratio.toFixed(2)} < 1:${MIN_REWARD_RISK} ` +
    `(TP terlalu dekat atau SL terlalu jauh).`
  );
}

/**
 * Ambang breakeven Mode Aman (8 Okt 2026): profit (jarak harga) ≥ 0,5×
 * risiko terencana — amankan lebih awal; profit kecil > rugi.
 */
export const BREAKEVEN_R_MULTIPLE = 0.5;

export interface BreakevenSignal {
  /** Kelipatan-R posisi saat ini (profit harga / risiko harga). */
  readonly multiple: number;
  /**
   * Target SL baru: entry ± jarak biaya (opsi 5) bila diketahui, selain
   * itu harga entry persis.
   */
  readonly slTarget: number;
  /** Jarak biaya yang dipakai (satuan harga), 0 bila tanpa biaya. */
  readonly costDistance: number;
  readonly message: string;
}

/**
 * Opsi 5 (8 Okt 2026) — jarak harga yang menutup komisi posisi, agar SL
 * breakeven benar-benar impas (bukan rugi kecil karena komisi).
 *   jarak = komisi USD ÷ (USD per 1 satuan harga) ;
 *   USD per satuan harga = convert(contractSize × lot, quoteCurrency).
 * Spread tidak ditambah (sudah terbayar lewat harga isi saat entry);
 * swap diabaikan (time-stop 3 jam = tidak menginap). Dibulatkan NAIK ke
 * kelipatan tick. null bila spec/komisi/kurs tidak diketahui (jujur:
 * tanpa angka tebakan). MURNI.
 */
export function breakevenCostDistance(
  holding: Pick<Holding, "symbol" | "lot">,
  convertToUsd: (amount: number, currency: string) => number | null,
): number | null {
  const commission = commissionForHolding(holding.symbol, holding.lot);
  if (commission === null) return null;
  if (commission === 0) return 0;
  const spec = getInstrumentSpec32(holding.symbol.trim());
  if (spec === null || !Number.isFinite(spec.leverage) || spec.leverage <= 0) {
    return null;
  }
  const usdPerUnit = convertToUsd(spec.leverage * holding.lot, spec.quoteCurrency);
  if (usdPerUnit === null || !Number.isFinite(usdPerUnit) || usdPerUnit <= 0) {
    return null;
  }
  const tick = tickSizeForSymbol(holding.symbol);
  const ticks = Math.ceil(commission / usdPerUnit / tick - 1e-9);
  return Number((ticks * tick).toFixed(priceDigits(holding.symbol)));
}

/**
 * Sinyal pindahkan SL ke breakeven (MODUL MURNI, CJS-safe).
 * Terpicu bila profit berjalan (jarak HARGA dari entry, bukan USD)
 * ≥ 1× risiko terencana DAN SL masih di sisi rugi (ada risiko yang
 * layak diamankan). Mengembalikan null bila: input invalid, SL tidak
 * di sisi rugi yang benar (risiko tak terdefinisi), atau profit belum
 * 1R. Murni teks display — modify order tetap manual di MT5 (app
 * tidak menempatkan order).
 */
export function checkBreakeven(
  holding: Pick<Holding, "direction" | "entryPrice" | "sl">,
  bid: number,
  ask: number,
  /** Opsi 5: hasil breakevenCostDistance; null/absen = SL di entry. */
  costDistance: number | null = null,
): BreakevenSignal | null {
  if (!Number.isFinite(bid) || bid <= 0) return null;
  if (!Number.isFinite(ask) || ask <= 0) return null;
  if (!Number.isFinite(holding.entryPrice) || holding.entryPrice <= 0) {
    return null;
  }
  if (!Number.isFinite(holding.sl) || holding.sl <= 0) return null;
  const riskDist =
    holding.direction === "BELI"
      ? holding.entryPrice - holding.sl
      : holding.sl - holding.entryPrice;
  if (!(riskDist > 0)) return null;
  const ref = exitReferencePrice(holding.direction, bid, ask);
  const profitDist =
    holding.direction === "BELI"
      ? ref - holding.entryPrice
      : holding.entryPrice - ref;
  if (!(profitDist > 0)) return null;
  const multiple = profitDist / riskDist;
  // Toleransi float: 1.321-1.32 tidak tepat 0.001 dalam biner.
  // Epsilon dipakai di pemicu DAN pembulatan agar tampilan konsisten
  // (tidak pernah "0.99R (≥1R)").
  const multipleAdj = multiple + 1e-9;
  if (!(multipleAdj >= BREAKEVEN_R_MULTIPLE)) return null;
  const rounded = Math.floor(multipleAdj * 100) / 100;
  // Biaya hanya dipakai bila target masih di sisi untung harga sekarang
  // (selain itu SL di atas bid / di bawah ask = tak bisa dipasang).
  const cost =
    costDistance !== null && costDistance > 0 && costDistance < profitDist
      ? costDistance
      : 0;
  const slTarget =
    cost === 0
      ? holding.entryPrice
      : holding.direction === "BELI"
        ? holding.entryPrice + cost
        : holding.entryPrice - cost;
  const decimals = Math.max(
    decimalsOf(holding.entryPrice),
    cost === 0 ? 0 : decimalsOf(cost),
  );
  const slText = slTarget.toFixed(decimals);
  const note =
    cost > 0
      ? `(entry ${holding.entryPrice} ${holding.direction === "BELI" ? "+" : "−"} biaya komisi, agar benar-benar impas)`
      : costDistance === null
        ? "(= entry; biaya komisi belum terhitung)"
        : "(= entry)";
  return {
    multiple: rounded,
    slTarget: Number(slText),
    costDistance: cost,
    message:
      `Profit ${rounded.toFixed(2)}R (≥${String(BREAKEVEN_R_MULTIPLE).replace(".", ",")}R). Amankan di MT5: klik kanan ` +
      `posisi → Modify → isi Stop Loss = ${slText} ${note} → OK. ` +
      `TP jangan diubah.`,
  };
}

/**
 * Time-stop Mode Aman (8 Okt 2026): horizon analisa 3 jam. Lewat itu
 * sinyal awal sudah tidak berlaku — tutup posisi, jangan ditahan
 * berhari-hari (3 posisi yang ditahan berhari-hari = ±89% rugi OTB).
 * Penetapan Fahmi 9 Okt 2026: horizon 3 jam HANYA untuk golongan Forex &
 * Forex JPY; golongan lain (logam, minyak, indeks, saham) tanpa batas waktu.
 */
export const TIME_STOP_HOURS = 3;

/** Golongan risiko yang memakai time-stop (lihat `riskGroup.ts`). */
export const TIME_STOP_GROUPS: readonly string[] = ["FOREX", "FOREX_JPY"];

/** true bila simbol (akhiran _ORB/.DEC diabaikan) memakai time-stop. */
export function timeStopApplies(symbol: string): boolean {
  return TIME_STOP_GROUPS.includes(riskGroupOf(symbol).id);
}

export interface TimeStopSignal {
  readonly hoursHeld: number;
  readonly message: string;
}

const MT5_TIME = /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * Sinyal time-stop (MODUL MURNI). Lama posisi = jam quote live − jam
 * buka, KEDUANYA jam server MT5 ("YYYY.MM.DD HH:MM:SS") agar tidak salah
 * zona waktu. Format lain (holding manual ISO) → null. Display-only.
 * Simbol di luar golongan Forex/Forex JPY → null (tanpa batas waktu).
 */
export function checkTimeStop(
  holding: Pick<Holding, "entryTime" | "symbol">,
  serverNow: string,
): TimeStopSignal | null {
  if (!timeStopApplies(holding.symbol)) return null;
  if (!MT5_TIME.test(holding.entryTime.trim()) || !MT5_TIME.test(serverNow.trim())) {
    return null;
  }
  const openMs = parseSnapshotTime(holding.entryTime);
  const nowMs = parseSnapshotTime(serverNow);
  if (openMs === null || nowMs === null) return null;
  const hours = (nowMs - openMs) / 3_600_000;
  if (!(hours >= TIME_STOP_HOURS)) return null;
  const shown =
    hours >= 48
      ? `${(hours / 24).toFixed(1).replace(".", ",")} hari`
      : `${(Math.floor(hours * 10) / 10).toFixed(1).replace(".", ",")} jam`;
  return {
    hoursHeld: Math.floor(hours * 10) / 10,
    message:
      `Posisi sudah terbuka ${shown} (batas Mode Aman ${TIME_STOP_HOURS} jam). ` +
      `Sinyal awal sudah kedaluwarsa: tutup di MT5 sekarang — untung kecil ` +
      `atau rugi kecil lebih baik daripada ditahan dan rugi membesar.`,
  };
}

/**
 * Tandai holding keluar MANUAL (Tahap v1.3.0): BUKAN eksekusi order.
 * Mengunci realized P&L BERSIH (harga − komisi) pada harga exit + waktu
 * + catatan. Murni.
 */
export function markHoldingExited(
  holding: Holding,
  exit: {
    readonly exitPrice: number;
    readonly exitTime: string;
    readonly note: string;
  },
  convertToUsd?: (amount: number, currency: string) => number | null,
): Holding | null {
  if (!Number.isFinite(exit.exitPrice) || exit.exitPrice <= 0) return null;
  if (holding.status === "EXITED") return null;
  const pnl = calculateExitPnL(holding, exit.exitPrice, convertToUsd);
  if (pnl === null) return null;
  const commission = commissionForHolding(holding.symbol, holding.lot);
  const endMs = Date.parse(exit.exitTime);
  const swapAtExit = Number.isFinite(endMs)
    ? (calculateHoldingSwap(holding, endMs)?.value ?? 0)
    : 0;
  const net = round2(
    pnl.value - (commission ?? 0) + swapAtExit,
  );
  return {
    ...holding,
    status: "EXITED",
    exitPrice: exit.exitPrice,
    exitTime: exit.exitTime,
    realizedPnl: net,
    realizedCurrency: pnl.currency,
    swapAtExit: round2(swapAtExit),
    exitNote: exit.note,
  };
}

/**
 * P&L realisasi pada harga exit manual (first-principles, sama seperti
 * calculateHoldingPnL tetapi memakai harga exit, bukan bid/ask live).
 * Tervalidasi: USDCHF buy 0.01 @0.83231 exit 0.83349 ≈ +1.42 USD.
 */
export function calculateExitPnL(
  holding: Pick<Holding, "symbol" | "direction" | "lot" | "entryPrice">,
  exitPrice: number,
  convertToUsd?: (amount: number, currency: string) => number | null,
): HoldingPnL | null {
  if (!Number.isFinite(exitPrice) || exitPrice <= 0) return null;
  if (
    !Number.isFinite(holding.lot) ||
    holding.lot <= 0 ||
    !Number.isFinite(holding.entryPrice) ||
    holding.entryPrice <= 0
  ) {
    return null;
  }
  const spec = getInstrumentSpec32(holding.symbol);
  if (spec === null) return null;
  if (!Number.isFinite(spec.leverage) || spec.leverage <= 0) return null;
  const signed =
    holding.direction === "BELI"
      ? exitPrice - holding.entryPrice
      : holding.entryPrice - exitPrice;
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

/**
 * Estimasi swap menginap posisi (Tahap SWP, display-only).
 * Via preview spec32 (USD/lot, triple-day aware) × lot; hari =
 * floor((now − entry)/24 jam), format entry ISO maupun MT5
 * ("YYYY.MM.DD HH:MM:SS", via parseSnapshotTime).
 * Intraday (0 hari) → 0 jujur; entry invalid/simbol unknown → null.
 * Nilai ESTIMASI (konvensi rollover broker bisa beda) — selalu
 * dilabel "est." di UI, tak pernah dilipat diam-diam ke P&L.
 */
export interface HoldingSwap {
  readonly value: number;
  readonly currency: string;
  readonly daysHeld: number;
  /** SW1b: "MT5" = swap asli dari broker (positions.csv); "PERKIRAAN" = rumus spec32. */
  readonly source: "MT5" | "PERKIRAAN";
}

export function calculateHoldingSwap(
  holding: Pick<Holding, "symbol" | "direction" | "lot" | "entryTime" | "brokerSwap">,
  nowMs: number = Date.now(),
): HoldingSwap | null {
  if (
    !Number.isFinite(holding.lot) ||
    holding.lot <= 0 ||
    !Number.isFinite(nowMs)
  ) {
    return null;
  }
  const entryMs = parseSnapshotTime(holding.entryTime);
  if (entryMs === null) return null;
  const daysHeld = Math.floor((nowMs - entryMs) / 86400000);
  // SW1b: swap asli MT5 (sudah dipotong broker) didahulukan dari rumus.
  if (holding.brokerSwap !== undefined && Number.isFinite(holding.brokerSwap)) {
    return { value: round2(holding.brokerSwap), currency: "USD", daysHeld: Math.max(0, daysHeld), source: "MT5" };
  }
  if (daysHeld <= 0) return { value: 0, currency: "USD", daysHeld: 0, source: "PERKIRAAN" };
  const preview = getSpec32SwapPreview({
    symbol: holding.symbol,
    daysHeld,
    direction: holding.direction === "BELI" ? "LONG" : "SHORT",
    tradeDatetime: new Date(entryMs),
  });
  if (preview === null) return null;
  return {
    value: round2(preview.swapUSD * holding.lot),
    currency: "USD",
    daysHeld,
    source: "PERKIRAAN",
  };
}

/**
 * Petakan posisi broker MT5 → Holding read-only (murni, untuk test).
 * Status absen = OPEN (dipantau seperti manual).
 */
export function toAutoHolding(
  position: BrokerPosition,
  brokerId: BrokerId,
): Holding {
  return {
    id: `mt5-${position.ticket}`,
    symbol: position.symbol,
    brokerId,
    direction: position.side === "BUY" ? "BELI" : "JUAL",
    lot: position.volume,
    entryPrice: position.priceOpen,
    sl: position.sl,
    tp: position.tp,
    entryTime: position.timeOpen,
    createdAt: position.timeOpen,
    ...(position.swap !== undefined ? { brokerSwap: position.swap } : {}),
  };
}

/**
 * Filter holdings per broker untuk tab monitor (murni).
 * Status apa pun ikut (OPEN dipantau, EXITED jadi log).
 */
export function filterHoldingsByBroker(
  holdings: readonly Holding[],
  brokerId: BrokerId,
): Holding[] {
  return holdings.filter((holding) => holding.brokerId === brokerId);
}

/** Hitung ringkasan tab: {open, total}. */
export function countHoldings(
  holdings: readonly Holding[],
): { readonly open: number; readonly total: number } {
  const open = holdings.filter(
    (holding) => (holding.status ?? "OPEN") === "OPEN",
  ).length;
  return { open, total: holdings.length };
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
  /** Equity USD opsional (untuk margin guard; invalid bila diisi sembarang). */
  readonly accountEquity?: number;
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
  if (
    input.accountEquity !== undefined &&
    input.accountEquity !== null &&
    (!Number.isFinite(input.accountEquity) || input.accountEquity <= 0)
  ) {
    errors.push("Equity harus angka > 0 bila diisi.");
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
