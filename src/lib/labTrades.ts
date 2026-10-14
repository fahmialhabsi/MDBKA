/**
 * LAB-2/LAB-3 (13 Okt 2026) — demo laboratorium, Opsi A (rancangan tim 11.2).
 * MURNI. Di akun TERBUKTI demo dengan mode DEMO, sinyal yang ditahan penjaga
 * LUNAK (biaya, risiko, jeda, berita, pembukaan bursa, korelasi) ditampilkan
 * sebagai "trade uji" lot minimum. Penjaga KERAS tetap menahan. MDBKA tidak
 * mengirim order: Fahmi membuka sendiri di MT5 dengan komentar MDBKA-UJI,
 * sehingga trade uji dikenali di History dan dipisah dari bukti Live.
 */
import type { StrategySetup } from "../calculations/decisionEngine";
import type { BrokerSettings } from "../types/analysis";
import type { BrokerId } from "../types/broker";
import { classifyScanStatus } from "./guardClass";
import { applyBrokerPreset } from "./marketReset";
import type { ScanRow, ScanStatus } from "./symbolScanner";
import type { TradingMode } from "./tradingMode";

export const LAB_COMMENT = "MDBKA-UJI";
export const GROUP_LAB = "UJI";

const STATUS_TEXT: Partial<Record<ScanStatus, string>> = {
  DITAHAN_BIAYA: "biaya mahal",
  DITAHAN_RISIKO: "risiko > batas",
  DITAHAN_JEDA: "jeda 3 rugi",
  DITAHAN_BERITA: "dekat berita",
  DITAHAN_BUKA: "pembukaan bursa",
  DITAHAN_KORELASI: "korelasi / taruhan ganda",
};

export interface LabTicket {
  readonly symbol: string;
  readonly direction: "BELI" | "JUAL";
  readonly entry: number;
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly rr: number;
  /** null = lot minimum broker tidak diketahui (isi sendiri di MT5). */
  readonly lot: number | null;
  readonly heldBy: ScanStatus;
  readonly penjagaDilewati: string;
  readonly komentar: string;
}

/** Laboratorium hanya untuk akun terbukti demo DAN mode DEMO. */
export function labAllowed(jenisAkun: "demo" | "live" | "tidak-terbukti", mode: TradingMode): boolean {
  return jenisAkun === "demo" && mode === "DEMO";
}

const ZERO: BrokerSettings = {
  equity: 0, riskPercent: 0, minLot: 0, lotStep: 0, pointValue: 0,
  contractSize: 0, commission: 0, slippage: 0, buffer: 0, atrMultiplier: 0, targetRR: 0,
};

export function minLotFor(symbol: string, brokerId: BrokerId): number | null {
  const lot = applyBrokerPreset({ ...ZERO }, symbol, brokerId).minLot;
  return Number.isFinite(lot) && lot > 0 ? lot : null;
}

/** Tiket trade uji, atau null bila bukan sinyal tertahan penjaga lunak dengan SL/TP sah. */
export function labTicket(row: ScanRow, setup: StrategySetup | null, minLot: number | null): LabTicket | null {
  if (!row.held || setup === null) return null;
  if (row.direction !== "BELI" && row.direction !== "JUAL") return null;
  if (setup.decision !== row.direction) return null;
  if (classifyScanStatus(row.status) !== "LUNAK") return null;
  const { entry, stopLoss, takeProfit } = setup;
  if (stopLoss === null || takeProfit === null) return null;
  const buy = row.direction === "BELI";
  if (!(buy ? stopLoss < entry && entry < takeProfit : takeProfit < entry && entry < stopLoss)) return null;
  const risk = Math.abs(entry - stopLoss);
  return {
    symbol: row.symbol,
    direction: row.direction,
    entry,
    stopLoss,
    takeProfit,
    rr: Math.round((Math.abs(takeProfit - entry) / risk) * 100) / 100,
    lot: minLot,
    heldBy: row.status,
    penjagaDilewati: STATUS_TEXT[row.status] ?? row.status,
    komentar: LAB_COMMENT,
  };
}

/** LAB-3: deal History ber-komentar MDBKA-UJI (tidak peka huruf besar/kecil). */
export function isLabComment(comment: string): boolean {
  return comment.toUpperCase().includes(LAB_COMMENT);
}
