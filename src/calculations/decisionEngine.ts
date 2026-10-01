import type {
  AnalysisResult,
  BrokerSettings,
  Decision,
  MarketData
} from "../types/analysis";
import { getInstrumentProfile } from "../lib/instrumentConfig";

function round(value: number, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function floorToStep(value: number, step: number) {
  if (!step || step <= 0) return value;
  return Math.floor(value / step) * step;
}

export function analyzeMarket(
  market: MarketData,
  broker: BrokerSettings
): AnalysisResult {
  // Satuan pembulatan mengikuti desimal instrumen aktif
  // (forex 5/3 desimal, indeks 2 desimal), bukan nilai tetap.
  const priceDecimals = getInstrumentProfile(market.symbol).decimals;
  const trendScore =
    market.close > market.ma50
      ? 2
      : market.close < market.ma50
        ? -2
        : 0;

  const cciScore =
    market.cci > 100 ? 1 : market.cci < -100 ? -1 : 0;

  const macdScore =
    market.macd > market.macdSignal
      ? 1
      : market.macd < market.macdSignal
        ? -1
        : 0;

  const rsiScore =
    market.rsi > 50 && market.rsi < 70
      ? 1
      : market.rsi < 50 && market.rsi > 30
        ? -1
        : 0;

  const score = trendScore + cciScore + macdScore + rsiScore;

  let decision: Decision = "TUNGGU";

  if (score >= 3 && market.close > market.ma50) {
    decision = "BELI";
  } else if (score <= -3 && market.close < market.ma50) {
    decision = "JUAL";
  }

  const entry =
    decision === "BELI"
      ? market.ask
      : decision === "JUAL"
        ? market.bid
        : (market.bid + market.ask) / 2;

  let stopLoss: number | null = null;
  let takeProfit: number | null = null;
  let riskDistance: number | null = null;
  let targetDistance: number | null = null;

  if (decision === "BELI") {
    const supportBasedSL = market.support - broker.buffer;
    const atrBasedSL = entry - market.atr * broker.atrMultiplier;

    stopLoss = Math.min(supportBasedSL, atrBasedSL);
    riskDistance = entry - stopLoss;
    takeProfit = entry + riskDistance * broker.targetRR;
    targetDistance = takeProfit - entry;
  }

  if (decision === "JUAL") {
    const resistanceBasedSL = market.resistance + broker.buffer;
    const atrBasedSL = entry + market.atr * broker.atrMultiplier;

    stopLoss = Math.max(resistanceBasedSL, atrBasedSL);
    riskDistance = stopLoss - entry;
    takeProfit = entry - riskDistance * broker.targetRR;
    targetDistance = entry - takeProfit;
  }

  const maxRiskUsd = broker.equity * (broker.riskPercent / 100);

  let riskAtMinLot: number | null = null;
  let theoreticalLot: number | null = null;
  let suggestedLot: number | null = null;
  let riskPercentAtMinLot: number | null = null;
  let riskStatus = "Belum ada setup";

  if (riskDistance !== null && riskDistance > 0) {
    const spread = Math.abs(market.ask - market.bid);
    const effectiveDistance = riskDistance + spread + broker.slippage;

    const riskPerOneLot =
      effectiveDistance * broker.pointValue + broker.commission;

    riskAtMinLot = riskPerOneLot * broker.minLot;

    theoreticalLot =
      riskPerOneLot > 0 ? maxRiskUsd / riskPerOneLot : null;

    suggestedLot =
      theoreticalLot !== null
        ? floorToStep(theoreticalLot, broker.lotStep)
        : null;

    riskPercentAtMinLot =
      broker.equity > 0 ? (riskAtMinLot / broker.equity) * 100 : null;

    if (
      suggestedLot !== null &&
      suggestedLot < broker.minLot
    ) {
      riskStatus =
        "TIDAK MEMENUHI \u2014 lot teoritis di bawah minimum broker";
    } else if (riskAtMinLot > maxRiskUsd) {
      riskStatus =
        "TIDAK MEMENUHI \u2014 risiko lot minimum melebihi batas";
    } else {
      riskStatus = "MEMENUHI batas risiko";
    }
  }

  const factors: string[] = [];

  if (trendScore > 0) {
    factors.push("Harga berada di atas MA50");
  } else if (trendScore < 0) {
    factors.push("Harga berada di bawah MA50");
  } else {
    factors.push("Harga berada di sekitar MA50");
  }

  if (cciScore > 0) factors.push("CCI menunjukkan tekanan bullish");
  if (cciScore < 0) factors.push("CCI menunjukkan tekanan bearish");

  if (macdScore > 0) factors.push("MACD berada di atas signal");
  if (macdScore < 0) factors.push("MACD berada di bawah signal");

  if (rsiScore > 0) factors.push("RSI mendukung momentum bullish");
  if (rsiScore < 0) factors.push("RSI mendukung momentum bearish");

  const warnings: string[] = [];

  if (decision === "TUNGGU") {
    warnings.push(
      "Skor belum cukup kuat atau indikator belum searah."
    );
  }

  if (riskAtMinLot !== null && riskAtMinLot > maxRiskUsd) {
    warnings.push(
      "Risiko pada lot minimum broker melebihi batas risiko equity."
    );
  }

  if (suggestedLot !== null && suggestedLot < broker.minLot) {
    warnings.push(
      "Lot teoritis lebih kecil dari minimum broker."
    );
  }

  warnings.push(
    "Nilai point, contract size, komisi, spread, dan slippage wajib diverifikasi dari broker."
  );

  let explanation: string;

  if (decision === "BELI") {
    explanation =
      "Bias bullish terdeteksi, tetapi tetap periksa konfirmasi candle dan risiko sebelum mengambil keputusan.";
  } else if (decision === "JUAL") {
    explanation =
      "Bias bearish terdeteksi, tetapi tetap periksa konfirmasi candle dan risiko sebelum mengambil keputusan.";
  } else {
    explanation =
      "Lebih baik menunggu karena skor belum cukup kuat atau indikator masih bertentangan.";
  }

  return {
    decision,
    score,
    trendScore,
    cciScore,
    macdScore,
    rsiScore,
    entry: round(entry, priceDecimals),
    stopLoss: stopLoss === null ? null : round(stopLoss, priceDecimals),
    takeProfit: takeProfit === null ? null : round(takeProfit, priceDecimals),
    riskDistance:
      riskDistance === null ? null : round(riskDistance, priceDecimals),
    targetDistance:
      targetDistance === null ? null : round(targetDistance, priceDecimals),
    maxRiskUsd: round(maxRiskUsd, 2),
    riskAtMinLot:
      riskAtMinLot === null ? null : round(riskAtMinLot, 2),
    theoreticalLot:
      theoreticalLot === null ? null : round(theoreticalLot, 4),
    suggestedLot:
      suggestedLot === null ? null : round(suggestedLot, 4),
    riskPercentAtMinLot:
      riskPercentAtMinLot === null
        ? null
        : round(riskPercentAtMinLot, 2),
    riskStatus,
    explanation,
    factors,
    warnings
  };
}

