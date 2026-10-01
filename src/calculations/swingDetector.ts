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
