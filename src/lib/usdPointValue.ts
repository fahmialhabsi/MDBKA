import type { BrokerSettings } from "../types/analysis";
import type { BrokerId } from "../types/broker";
import { convertToUSD, type ExchangeRates } from "../services/fxRateService";
import { ORBITRADER_BROKER_ID } from "./brokerRegistry";
import { getOtbInstrumentProfile } from "./otbInstrumentConfig";

/**
 * pointValue OTB = contractSize dalam mata uang profit (JPY/CAD/CHF/...).
 * Engine dan validator membaca pointValue sebagai USD, jadi keduanya
 * wajib memakai hasil fungsi ini (satu sumber kebenaran).
 * Finex, profit USD, atau kurs belum ada → broker apa adanya.
 */
export function withUsdPointValue(
  broker: BrokerSettings,
  symbol: string,
  brokerId: BrokerId,
  fxRates: ExchangeRates | null,
): BrokerSettings {
  if (brokerId !== ORBITRADER_BROKER_ID || fxRates === null) return broker;
  const otb = getOtbInstrumentProfile(symbol);
  if (otb === null || otb.currencyProfit === "USD") return broker;
  return {
    ...broker,
    pointValue: convertToUSD(broker.pointValue, otb.currencyProfit, fxRates),
  };
}
