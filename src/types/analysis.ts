export type Decision = "BELI" | "JUAL" | "TUNGGU";

export interface MarketData {
  symbol: string;
  timeframe: string;
  bid: number;
  ask: number;
  close: number;
  open: number;
  high: number;
  low: number;
  ma50: number;
  cci: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  atr: number;
  support: number;
  resistance: number;
}

/**
 * Mode Aman R2 (8 Okt 2026): batas risiko golongan simbol. usd null =
 * ditahan (golongan tidak diperdagangkan, atau kurs Rupiah belum ada).
 */
export interface RiskCapInput {
  label: string;
  idr: number | null;
  usd: number | null;
  usdIdr: number | null;
}

export interface BrokerSettings {
  /** Batas golongan (opsional); absen = hanya batas % equity. */
  riskCap?: RiskCapInput | null;
  equity: number;
  riskPercent: number;
  minLot: number;
  lotStep: number;
  pointValue: number;
  contractSize: number;
  commission: number;
  slippage: number;
  buffer: number;
  atrMultiplier: number;
  targetRR: number;
}

export interface AnalysisResult {
  decision: Decision;
  score: number;
  trendScore: number;
  cciScore: number;
  macdScore: number;
  rsiScore: number;
  entry: number;
  stopLoss: number | null;
  takeProfit: number | null;
  riskDistance: number | null;
  targetDistance: number | null;
  maxRiskUsd: number;
  riskAtMinLot: number | null;
  theoreticalLot: number | null;
  suggestedLot: number | null;
  riskPercentAtMinLot: number | null;
  riskStatus: string;
  explanation: string;
  factors: string[];
  warnings: string[];
  /** Mode Aman: porsi biaya terhadap risiko per lot (0..1); null bila tanpa setup. */
  costShareOfRisk?: number | null;
  /** Mode Aman: alasan setup BELI/JUAL ditahan menjadi TUNGGU (null = tidak ditahan). */
  heldBy?: "biaya" | "risiko" | "korelasi" | "jeda" | null;
  /** Langkah D: alasan tahanan korelasi (taruhan ganda) untuk ditampilkan. */
  heldReason?: string | null;
  /** Arah asli (BELI/JUAL) sebelum ditahan Mode Aman; null bila tidak ditahan. */
  heldDecision?: Decision | null;
}

