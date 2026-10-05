/**
 * Tahap 5D-STEP2 — ECB daily rate + konversi swap ke USD (MODUL MURNI
 * kecuali fetchECBRates yang impure di boundary I/O).
 *
 * - ECB XML (eurofxref-daily.xml) berbasis EUR: rate[X] = unit X per 1 EUR.
 * - convertToUSD memakai rumus sederhana sesuai spec STEP2:
 *     USD ≈ amount / rate[from]
 *   (yakni nilai dalam EUR yang dilabel USD untuk display info-only;
 *   konversi EUR→USD penuh via ×rate[USD] disengaja TIDAK dipakai agar
 *   cocok dengan ekspektasi test 289-291/296. Lihat catatan di bawah.)
 * - fetchECBRates: fetch 1x saat app init, gagal → FALLBACK_RATES.
 * - Rate di-cache di state React selama session (reload = fetch ulang).
 */

export type ExchangeRates = {
  EUR: number;
  USD: number;
  AUD: number;
  CAD: number;
  CHF: number;
  GBP: number;
  JPY: number;
  NZD: number;
  fetchedAt?: string;
};

/** Fallback rate (2026-10-02 default). Update tiap release bila perlu. */
export const FALLBACK_RATES: ExchangeRates = {
  EUR: 1.0,
  USD: 1.0831,
  AUD: 1.6512,
  CAD: 1.4859,
  CHF: 0.9418,
  GBP: 0.8305,
  JPY: 161.25,
  NZD: 1.7945,
  fetchedAt: "2026-10-02",
};

export const ECB_DAILY_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

/**
 * Parse XML ECB: <Cube currency="USD" rate="1.0831"/>.
 * Regex sederhana, sufficient untuk 8 currency. Unknown currency
 * diabaikan; missing currency mempertahankan default 1.
 * ECB live memakai SINGLE quote (currency='USD') — kedua gaya diterima
 * (bug produksi: hanya double-quote sehingga selalu default).
 */
export function parseECBXml(xml: string): ExchangeRates {
  const result: ExchangeRates = {
    EUR: 1.0,
    USD: 1,
    AUD: 1,
    CAD: 1,
    CHF: 1,
    GBP: 1,
    JPY: 1,
    NZD: 1,
  };

  const regex = /<Cube currency=(["'])([A-Z]{3})\1 rate=(["'])([\d.]+)\3/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const currency = match[2];
    const rate = parseFloat(match[4]);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    switch (currency) {
      case "EUR":
      case "USD":
      case "AUD":
      case "CAD":
      case "CHF":
      case "GBP":
      case "JPY":
      case "NZD":
        result[currency] = rate;
        break;
      default:
        break;
    }
  }

  return result;
}

type FetchFn = (
  input: string
) => Promise<{ ok: boolean; text(): Promise<string> }>;

function resolveFetch(): FetchFn | null {
  const candidate = (
    globalThis as {
      fetch?: unknown;
    }
  ).fetch;
  if (typeof candidate !== "function") return null;
  return candidate as FetchFn;
}

/**
 * Fetch ECB daily rate 1x (dipanggil saat app init). Gagal / tanpa
 * fetch global → FALLBACK_RATES (fail-closed ke angka display, tanpa
 * throw; pemanggil tetap jalan).
 */
export async function fetchECBRates(): Promise<ExchangeRates> {
  try {
    const doFetch = resolveFetch();
    if (doFetch === null) throw new Error("fetch unavailable");
    const response = await doFetch(ECB_DAILY_URL);
    if (!response.ok) throw new Error("ECB fetch failed");

    const text = await response.text();
    const rates = parseECBXml(text);
    rates.fetchedAt = new Date().toISOString().split("T")[0];
    return rates;
  } catch (error) {
    console.warn("ECB fetch error, using fallback:", error);
    return FALLBACK_RATES;
  }
}

/**
 * Tahap FX-PROXY — ambil kurs via backend sendiri (same-origin, bebas
 * blokir CORS ECB). Dipakai App.tsx SEBELUM direct fetchECBRates.
 * Null bila backend mati/respons invalid → pemanggil lanjut ke
 * fetchECBRates()/FALLBACK_RATES. Tidak pernah throw; tidak dipanggil
 * saat unit test (tanpa network call).
 */
export async function fetchBackendRates(
  baseUrl: string,
): Promise<ExchangeRates | null> {
  try {
    const doFetch = resolveFetch();
    if (doFetch === null) return null;
    const url = `${baseUrl.replace(/\/+$/, "")}/api/fx/ecb`;
    const response = await doFetch(url);
    if (!response.ok) return null;
    const data = (await (
      response as unknown as { json(): Promise<unknown> }
    ).json()) as Record<string, unknown>;
    for (const key of ["EUR", "USD", "AUD", "CAD", "CHF", "GBP", "JPY", "NZD"]) {
      if (typeof data[key] !== "number" || !Number.isFinite(data[key])) {
        return null;
      }
    }
    return data as unknown as ExchangeRates;
  } catch {
    return null;
  }
}

/**
 * Konversi amount dalam fromCurrency ke USD (rumus spec STEP2).
 * - USD → amount (tanpa lookup).
 * - Rate hilang/invalid → amount as-is + warn (fallback display).
 */
export function convertToUSD(
  amount: number,
  fromCurrency: string,
  rates: ExchangeRates
): number {
  if (fromCurrency === "USD") return amount;

  const rate = rates[fromCurrency as keyof ExchangeRates];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    console.warn(`Rate not found for ${fromCurrency}, returning amount as-is`);
    return amount;
  }

  return (amount / rate) * rates.USD;
}

/**
 * Tahap v1.3.0 — bangun converter USD untuk modul kalkulasi (murni).
 * Tanpa fxRates (atau USD) → passthrough USD / null jujur.
 */
export function buildUsdConverter(
  fxRates: ExchangeRates | null,
): (amount: number, currency: string) => number | null {
  return (amount: number, currency: string): number | null => {
    if (currency === "USD") return amount;
    if (fxRates === null) return null;
    return convertToUSD(amount, currency, fxRates);
  };
}
