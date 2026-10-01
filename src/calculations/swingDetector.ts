export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SwingPoint {
  index: number;
  time: string;
  price: number;
  type: "swing-high" | "swing-low";
}

export interface SwingLevels {
  support: number | null;
  resistance: number | null;
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
}

export type SwingLevelSource =
  | "strength-1"
  | "strength-2"
  | "strength-3"
  | "extreme"
  | "none";

export interface ResolvedSwingLevels {
  support: number | null;
  resistance: number | null;
  source: SwingLevelSource;
  triedStrengths: number[];
}

/**
 * Fallback extreme dari candle valid: low terendah di bawah harga
 * referensi sebagai support, high tertinggi di atasnya sebagai resistance.
 * Berlabel jelas sebagai fallback (bukan swing terkonfirmasi).
 */
export function detectExtremeLevels(
  candles: Candle[],
  currentPrice: number
): { support: number | null; resistance: number | null } {
  let support: number | null = null;
  let resistance: number | null = null;

  for (const candle of candles) {
    if (
      candle.low < currentPrice &&
      (support === null || candle.low < support)
    ) {
      support = candle.low;
    }
    if (
      candle.high > currentPrice &&
      (resistance === null || candle.high > resistance)
    ) {
      resistance = candle.high;
    }
  }

  return { support, resistance };
}

/**
 * Rantai resolusi otomatis: strength pilihan -> strength 2 -> strength 1
 * -> extreme fallback. Mengembalikan sumber agar UI menandainya jelas.
 */
export function resolveSwingLevels(
  candles: Candle[],
  currentPrice: number,
  strength = 2
): ResolvedSwingLevels {
  const tried = [strength, 2, 1].filter(
    (value, index, all) =>
      Number.isInteger(value) && value >= 1 && all.indexOf(value) === index
  );
  const triedStrengths: number[] = [];

  for (const level of tried) {
    triedStrengths.push(level);
    if (candles.length < level * 2 + 1) continue;

    const detected = detectSwingLevels(candles, currentPrice, level);

    if (detected.support !== null && detected.resistance !== null) {
      return {
        support: detected.support,
        resistance: detected.resistance,
        source: `strength-${level}` as SwingLevelSource,
        triedStrengths,
      };
    }
  }

  const extreme = detectExtremeLevels(candles, currentPrice);

  if (extreme.support !== null && extreme.resistance !== null) {
    return { ...extreme, source: "extreme", triedStrengths };
  }

  return { support: null, resistance: null, source: "none", triedStrengths };
}

export function detectSwingLevels(
  candles: Candle[],
  currentPrice: number,
  strength = 2
): SwingLevels {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];

  for (
    let index = strength;
    index < candles.length - strength;
    index++
  ) {
    const current = candles[index];

    const left = candles.slice(
      index - strength,
      index
    );

    const right = candles.slice(
      index + 1,
      index + strength + 1
    );

    const isSwingHigh =
      left.every((candle) => current.high > candle.high) &&
      right.every((candle) => current.high > candle.high);

    const isSwingLow =
      left.every((candle) => current.low < candle.low) &&
      right.every((candle) => current.low < candle.low);

    if (isSwingHigh) {
      swingHighs.push({
        index,
        time: current.time,
        price: current.high,
        type: "swing-high"
      });
    }

    if (isSwingLow) {
      swingLows.push({
        index,
        time: current.time,
        price: current.low,
        type: "swing-low"
      });
    }
  }

  const supports = swingLows
    .filter((point) => point.price < currentPrice)
    .sort((a, b) => b.price - a.price);

  const resistances = swingHighs
    .filter((point) => point.price > currentPrice)
    .sort((a, b) => a.price - b.price);

  return {
    support: supports[0]?.price ?? null,
    resistance: resistances[0]?.price ?? null,
    swingHighs,
    swingLows
  };
}
