import { getInstrumentProfile } from "./instrumentConfig";

function parseBasicNumber(raw: string): number | null {
  const value = raw
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function parseInstrumentPrice(
  raw: string,
  symbol: string
): number | null {
  const profile = getInstrumentProfile(symbol);

  const direct = parseBasicNumber(raw);

  if (direct !== null) {
    if (
      direct >= profile.minPrice &&
      direct <= profile.maxPrice
    ) {
      return direct;
    }
  }

  // Memperbaiki OCR seperti:
  // 3075339 -> 30753.39 untuk US100
  // 132449  -> 1.32449 untuk GBPUSD
  const digits = raw.replace(/[^0-9]/g, "");

  if (!digits) return null;

  const candidates: number[] = [];

  for (let decimalPosition = 0; decimalPosition <= digits.length; decimalPosition++) {
    const splitAt = digits.length - decimalPosition;

    const integerPart =
      digits.slice(0, splitAt) || "0";

    const decimalPart =
      digits.slice(splitAt);

    const candidate = Number(
      decimalPart.length > 0
        ? `${integerPart}.${decimalPart}`
        : integerPart
    );

    if (
      Number.isFinite(candidate) &&
      candidate >= profile.minPrice &&
      candidate <= profile.maxPrice
    ) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Pilih jumlah desimal yang paling wajar untuk instrumen.
  const preferred = candidates.find((candidate) => {
    const text = candidate.toFixed(profile.decimals);
    return text.split(".")[1]?.length === profile.decimals;
  });

  if (preferred !== undefined) {
    return preferred;
  }

  return candidates[0];
}
