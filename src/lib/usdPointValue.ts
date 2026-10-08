import type { BrokerSettings } from "../types/analysis";
import type { BrokerId } from "../types/broker";
import { convertToUSD, type ExchangeRates } from "../services/fxRateService";
import { FINEX_BROKER_ID, ORBITRADER_BROKER_ID } from "./brokerRegistry";
import { getInstrumentSpec32 } from "./instrumentSpecs32";
import { getOtbInstrumentProfile } from "./otbInstrumentConfig";

/**
 * pointValue OTB = contractSize dalam mata uang profit (JPY/CAD/CHF/...).
 * Engine dan validator membaca pointValue sebagai USD, jadi keduanya
 * wajib memakai hasil fungsi ini (satu sumber kebenaran).
 * Finex (perbaikan 8 Okt 2026): pointValue preset Finex juga = contract
 * size dalam mata uang KUOTASI (USDJPY → yen), dulu dianggap USD sehingga
 * risiko USDJPY terbaca ±150× (Rp3,6 jt, padahal ±Rp24 rb). Mata uang
 * kuotasi dari spec32. Profit USD atau kurs belum ada → apa adanya.
 */
export function withUsdPointValue(
  broker: BrokerSettings,
  symbol: string,
  brokerId: BrokerId,
  fxRates: ExchangeRates | null,
): BrokerSettings {
  if (fxRates === null) return broker;
  if (brokerId === FINEX_BROKER_ID) {
    const spec = getInstrumentSpec32(symbol.trim());
    if (spec === null || spec.broker !== "finex" || spec.quoteCurrency === "USD") {
      return broker;
    }
    return {
      ...broker,
      pointValue: convertToUSD(broker.pointValue, spec.quoteCurrency, fxRates),
    };
  }
  if (brokerId !== ORBITRADER_BROKER_ID) return broker;
  const otb = getOtbInstrumentProfile(symbol);
  if (otb === null || otb.currencyProfit === "USD") return broker;
  return {
    ...broker,
    pointValue: convertToUSD(broker.pointValue, otb.currencyProfit, fxRates),
  };
}
