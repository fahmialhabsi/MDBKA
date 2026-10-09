/**
 * Butir 1 G2 (9 Okt 2026) — model chart candle H1 untuk SVG. MURNI.
 * Masukan candle OHLC (dari CSV MDBKA_<simbol>_H1.csv), keluaran koordinat
 * batang/sumbu siap gambar. Garis tambahan (Bid live, Entry/SL/TP di G3)
 * ikut memperlebar rentang harga agar selalu terlihat.
 */
export interface OhlcLike {
  readonly time: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface ChartLine {
  readonly label: string;
  readonly price: number;
  readonly kind: "bid" | "entry" | "sl" | "tp" | "secure";
}

export interface CandleBar {
  readonly x: number;
  readonly width: number;
  readonly wickTop: number;
  readonly wickBottom: number;
  readonly bodyTop: number;
  readonly bodyHeight: number;
  readonly up: boolean;
}

export interface CandleChartModel {
  readonly width: number;
  readonly height: number;
  readonly plotRight: number;
  readonly bars: CandleBar[];
  readonly yTicks: { y: number; price: number }[];
  readonly xLabels: { x: number; text: string }[];
  readonly lines: (ChartLine & { y: number })[];
  readonly min: number;
  readonly max: number;
}

export const CHART_MAX_BARS = 120;

export function candleChartModel(
  candles: readonly OhlcLike[],
  opts: { width: number; height: number; axisWidth?: number; maxBars?: number; lines?: readonly ChartLine[] },
): CandleChartModel | null {
  const valid = candles.filter((c) =>
    [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0) && c.high >= c.low);
  const shown = valid.slice(-(opts.maxBars ?? CHART_MAX_BARS));
  if (shown.length === 0) return null;
  const lines = (opts.lines ?? []).filter((l) => Number.isFinite(l.price) && l.price > 0);
  let min = Math.min(...shown.map((c) => c.low), ...lines.map((l) => l.price));
  let max = Math.max(...shown.map((c) => c.high), ...lines.map((l) => l.price));
  if (max === min) {
    max += max * 0.001;
    min -= min * 0.001;
  }
  const padV = (max - min) * 0.05;
  min -= padV;
  max += padV;
  const top = 10;
  const bottom = opts.height - 24;
  const plotRight = opts.width - (opts.axisWidth ?? 80);
  const y = (p: number): number => top + ((max - p) / (max - min)) * (bottom - top);
  const step = plotRight / shown.length;
  const bodyW = Math.max(1, step * 0.65);
  const bars = shown.map((c, i) => {
    const cx = i * step + step / 2;
    const yo = y(c.open);
    const yc = y(c.close);
    return {
      x: cx - bodyW / 2,
      width: bodyW,
      wickTop: y(c.high),
      wickBottom: y(c.low),
      bodyTop: Math.min(yo, yc),
      bodyHeight: Math.max(1, Math.abs(yo - yc)),
      up: c.close >= c.open,
    };
  });
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const price = max - ((max - min) * (i + 0.5)) / 5;
    return { y: y(price), price };
  });
  const every = Math.max(1, Math.ceil(shown.length / 6));
  const xLabels = shown
    .map((c, i) => ({ i, c }))
    .filter(({ i }) => i % every === 0)
    .map(({ i, c }) => ({ x: i * step + step / 2, text: c.time.replace(/^\d{4}\./, "").replace(".", "/") }));
  return {
    width: opts.width,
    height: opts.height,
    plotRight,
    bars,
    yTicks,
    xLabels,
    lines: lines.map((l) => ({ ...l, y: y(l.price) })),
    min,
    max,
  };
}

/** Jam candle H1 dari waktu tick MT5: "2026.10.09 14:12:10" → "2026.10.09 14:00". */
export function hourKey(timestamp: string): string | null {
  const m = /^(\d{4}\.\d{2}\.\d{2}) (\d{2}):\d{2}/.exec(timestamp.trim());
  return m === null ? null : `${m[1]} ${m[2]}:00`;
}

/**
 * G2b (9 Okt 2026): CSV H1 hanya ditulis saat candle SELESAI (sekali per jam),
 * jadi candle jam berjalan dirakit dari tick live (Bid) — seperti MT5:
 * open = tick pertama jam itu, high/low = ekstrem Bid, close = Bid terakhir.
 * Jam yang sudah ada di CSV hanya diperluas high/low/close-nya. MURNI.
 */
export function withLiveCandles<T extends OhlcLike>(
  candles: readonly T[],
  ticks: readonly { readonly timestamp: string; readonly bid: number }[],
): OhlcLike[] {
  const out: OhlcLike[] = candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }));
  const lastKey = out.length > 0 ? hourKey(out[out.length - 1].time) : null;
  for (const t of ticks) {
    if (!Number.isFinite(t.bid) || t.bid <= 0) continue;
    const k = hourKey(t.timestamp);
    if (k === null) continue;
    if (lastKey !== null && k < lastKey) continue;
    const last = out[out.length - 1];
    const cur = last !== undefined ? hourKey(last.time) : null;
    if (last !== undefined && cur === k) {
      out[out.length - 1] = {
        time: last.time,
        open: last.open,
        high: Math.max(last.high, t.bid),
        low: Math.min(last.low, t.bid),
        close: t.bid,
      };
    } else if (cur === null || k > cur) {
      out.push({ time: k, open: t.bid, high: t.bid, low: t.bid, close: t.bid });
    }
  }
  return out;
}

