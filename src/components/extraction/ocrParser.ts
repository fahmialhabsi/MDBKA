import type { MarketData } from "../../types/analysis";
import { SUPPORTED_SYMBOLS } from "../../lib/instrumentConfig";
import { parseInstrumentPrice } from "../../lib/priceParser";

// Daftar kanonis tunggal dari instrumentConfig, ditambah alias yang hanya
// muncul di OCR (nama broker/lintas simbol). Jangan membuat daftar
// kanonis kedua di file ini.
const OCR_SYMBOLS: readonly string[] = [
  ...SUPPORTED_SYMBOLS,
  "NAS100",
  "NASDAQ",
  "USTEC",
  "USDCAD"
];

const TIMEFRAMES = [
  "M1",
  "M5",
  "M15",
  "M30",
  "H1",
  "H4",
  "D1",
  "W1",
  "MN1"
];

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePlainNumber(
  raw: string | undefined
): number | null {
  if (!raw) return null;

  const cleaned = raw
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");

  const value = Number(cleaned);

  return Number.isFinite(value) ? value : null;
}

function findSymbol(text: string): string | null {
  const names = OCR_SYMBOLS.join("|");
  const chartMatch = text.match(
    new RegExp(
      `\\b(${names})\\s*[,/ ]\\s*(M1|M5|M15|M30|H1|H4|D1|W1|MN1)\\b`,
      "i"
    )
  );

  if (chartMatch) {
    const symbol = chartMatch[1].toUpperCase();

    if (symbol === "NASDAQ") return "NAS100";
    if (symbol === "USTEC") return "US100";

    return symbol;
  }

  for (const symbol of OCR_SYMBOLS) {
    if (
      new RegExp(`\\b${symbol}\\b`, "i").test(text)
    ) {
      if (symbol === "NASDAQ") return "NAS100";
      if (symbol === "USTEC") return "US100";
      return symbol;
    }
  }

  return null;
}

function findTimeframe(
  text: string,
  fallback: string
): string {
  const found = TIMEFRAMES.find((timeframe) =>
    new RegExp(`\\b${timeframe}\\b`, "i").test(text)
  );

  return found ?? fallback;
}

function findLabeledRawNumber(
  text: string,
  labels: string[]
): string | null {
  for (const label of labels) {
    const regex = new RegExp(
      `${label}\\s*(?:\\([^)]*\\))?\\s*[:=]?\\s*(-?\\d+(?:[.,]\\d+)?)`,
      "i"
    );

    const match = text.match(regex);

    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function parsePriceLabel(
  text: string,
  labels: string[],
  symbol: string
): number | null {
  const raw = findLabeledRawNumber(text, labels);

  if (raw === null) return null;

  return parseInstrumentPrice(raw, symbol);
}

function parseIndicatorLabel(
  text: string,
  labels: string[]
): number | null {
  const raw = findLabeledRawNumber(text, labels);

  return parsePlainNumber(raw ?? undefined);
}

function findQuote(
  text: string,
  symbol: string
): { bid: number; ask: number } | null {
  const regex = new RegExp(
    `${symbol}\\s+(-?\\d+(?:[.,]\\d+)?)\\s+(-?\\d+(?:[.,]\\d+)?)`,
    "i"
  );

  const match = text.match(regex);

  if (!match) return null;

  const bid = parseInstrumentPrice(match[1], symbol);
  const ask = parseInstrumentPrice(match[2], symbol);

  if (
    bid === null ||
    ask === null ||
    ask <= bid
  ) {
    return null;
  }

  return { bid, ask };
}

export function parseOcrText(
  rawText: string,
  previous: MarketData
): Partial<MarketData> {
  const text = normalizeText(rawText);
  const symbol = findSymbol(text) ?? previous.symbol;
  const timeframe = findTimeframe(
    text,
    previous.timeframe
  );

  const result: Partial<MarketData> = {
    symbol,
    timeframe
  };

  const quote = findQuote(text, symbol);

  if (quote) {
    result.bid = quote.bid;
    result.ask = quote.ask;
  }

  const close = parsePriceLabel(
    text,
    ["Close", "\\bC\\b"],
    symbol
  );

  const open = parsePriceLabel(
    text,
    ["Open", "\\bO\\b"],
    symbol
  );

  const high = parsePriceLabel(
    text,
    ["High", "\\bH\\b"],
    symbol
  );

  const low = parsePriceLabel(
    text,
    ["Low", "\\bL\\b"],
    symbol
  );

  const ma50 = parsePriceLabel(
    text,
    ["MA\\s*\\(?50\\)?", "MA50"],
    symbol
  );

  const support = parsePriceLabel(
    text,
    ["Support"],
    symbol
  );

  const resistance = parsePriceLabel(
    text,
    ["Resistance"],
    symbol
  );

  if (close !== null) result.close = close;
  if (open !== null) result.open = open;
  if (high !== null) result.high = high;
  if (low !== null) result.low = low;
  if (ma50 !== null) result.ma50 = ma50;
  if (support !== null) result.support = support;
  if (resistance !== null) result.resistance = resistance;

  const rsi = parseIndicatorLabel(
    text,
    ["RSI"]
  );

  const cci = parseIndicatorLabel(
    text,
    ["CCI"]
  );

  const atr = parseIndicatorLabel(
    text,
    ["ATR"]
  );

  if (rsi !== null) result.rsi = rsi;
  if (cci !== null) result.cci = cci;
  if (atr !== null) result.atr = atr;

  const macdMatch = text.match(
    /MACD\s*\(\s*12\s*,\s*26\s*,\s*9\s*\)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)/i
  );

  if (macdMatch) {
    const macd = parsePlainNumber(macdMatch[1]);
    const signal = parsePlainNumber(macdMatch[2]);

    if (macd !== null) result.macd = macd;
    if (signal !== null) result.macdSignal = signal;
  } else {
    const macd = parseIndicatorLabel(
      text,
      ["MACD"]
    );

    const signal = parseIndicatorLabel(
      text,
      ["Signal"]
    );

    if (macd !== null) result.macd = macd;
    if (signal !== null) result.macdSignal = signal;
  }

  return result;
}
