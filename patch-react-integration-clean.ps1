# ==========================================================
# MDBKA CLEAN REACT INTEGRATION PATCH
# App.tsx, instrumentConfig.ts, ocrParser.ts
# ==========================================================

$ProjectRoot = "E:\MDBKA"
Set-Location $ProjectRoot

function Write-ProjectFile {
    param(
        [string]$RelativePath,
        [string]$Content
    )

    $FullPath = Join-Path $ProjectRoot $RelativePath
    $Parent = Split-Path $FullPath -Parent

    if (!(Test-Path $Parent)) {
        New-Item -ItemType Directory -Path $Parent -Force | Out-Null
    }

    Set-Content -Path $FullPath -Value $Content -Encoding UTF8
    Write-Host "Tersimpan: $RelativePath" -ForegroundColor Green
}

# ==========================================================
# 1. instrumentConfig.ts
# ==========================================================

Write-ProjectFile "src\lib\instrumentConfig.ts" @'
export type InstrumentCategory =
  | "forex"
  | "index"
  | "unknown";

export interface InstrumentProfile {
  symbol: string;
  category: InstrumentCategory;
  decimals: number;
  pipSize: number;
  spreadUnit: "pip" | "index points";
  defaultPointValue: number;
  contractSize: number;
  defaultBuffer: number;
  minPrice: number;
  maxPrice: number;
  expectedPriceExample: string;
  brokerNote: string;
}

const profiles: InstrumentProfile[] = [
  {
    symbol: "GBPUSD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.5,
    maxPrice: 3,
    expectedPriceExample: "1.32480",
    brokerNote:
      "GBPUSD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "EURUSD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.5,
    maxPrice: 3,
    expectedPriceExample: "1.10000",
    brokerNote:
      "EURUSD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "AUDCAD",
    category: "forex",
    decimals: 5,
    pipSize: 0.0001,
    spreadUnit: "pip",
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.00005,
    minPrice: 0.5,
    maxPrice: 3,
    expectedPriceExample: "0.91234",
    brokerNote:
      "AUDCAD biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "CADJPY",
    category: "forex",
    decimals: 3,
    pipSize: 0.01,
    spreadUnit: "pip",
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.005,
    minPrice: 50,
    maxPrice: 250,
    expectedPriceExample: "110.125",
    brokerNote:
      "CADJPY biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "USDJPY",
    category: "forex",
    decimals: 3,
    pipSize: 0.01,
    spreadUnit: "pip",
    defaultPointValue: 100000,
    contractSize: 100000,
    defaultBuffer: 0.005,
    minPrice: 50,
    maxPrice: 250,
    expectedPriceExample: "150.125",
    brokerNote:
      "USDJPY biasanya menggunakan contract size 100000. Verifikasi kepada broker."
  },
  {
    symbol: "US100",
    category: "index",
    decimals: 2,
    pipSize: 1,
    spreadUnit: "index points",
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 10,
    minPrice: 1000,
    maxPrice: 100000,
    expectedPriceExample: "30683.37",
    brokerNote:
      "US100 berbeda antarbroker. Point value dan contract size wajib diverifikasi."
  },
  {
    symbol: "NAS100",
    category: "index",
    decimals: 2,
    pipSize: 1,
    spreadUnit: "index points",
    defaultPointValue: 1,
    contractSize: 1,
    defaultBuffer: 10,
    minPrice: 1000,
    maxPrice: 100000,
    expectedPriceExample: "30683.37",
    brokerNote:
      "NAS100 berbeda antarbroker. Point value dan contract size wajib diverifikasi."
  }
];

const fallbackProfile: InstrumentProfile = {
  symbol: "UNKNOWN",
  category: "unknown",
  decimals: 5,
  pipSize: 0.0001,
  spreadUnit: "pip",
  defaultPointValue: 1,
  contractSize: 1,
  defaultBuffer: 0,
  minPrice: 0,
  maxPrice: Number.MAX_SAFE_INTEGER,
  expectedPriceExample: "isi manual",
  brokerNote:
    "Instrumen belum dikenali. Isi parameter broker secara manual."
};

export function normalizeSymbol(symbol: string): string {
  const value = symbol.trim().toUpperCase();

  if (value === "USTEC") return "US100";
  if (value === "NASDAQ") return "NAS100";

  return value;
}

export function getInstrumentProfile(
  symbol: string
): InstrumentProfile {
  const normalized = normalizeSymbol(symbol);

  return (
    profiles.find(
      (profile) => profile.symbol === normalized
    ) ?? fallbackProfile
  );
}

/**
 * Alias kompatibilitas untuk kode lama App.tsx.
 */
export function getInstrumentPreset(
  symbol: string
): InstrumentProfile {
  return getInstrumentProfile(symbol);
}

export function getSpreadLabel(symbol: string): string {
  return getInstrumentProfile(symbol).spreadUnit;
}

export function formatInstrumentPrice(
  value: number,
  symbol: string
): string {
  const profile = getInstrumentProfile(symbol);

  if (!Number.isFinite(value)) return "-";

  return value.toLocaleString("en-US", {
    minimumFractionDigits: profile.decimals,
    maximumFractionDigits: profile.decimals
  });
}

export function formatSpread(
  bid: number,
  ask: number,
  symbol: string
): string {
  if (
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    ask <= bid
  ) {
    return "-";
  }

  const profile = getInstrumentProfile(symbol);
  const spread = (ask - bid) / profile.pipSize;

  return spread.toFixed(
    profile.category === "forex" ? 1 : 2
  );
}
'@

# ==========================================================
# 2. App.tsx bersih
# ==========================================================

Write-ProjectFile "src\App.tsx" @'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  Activity,
  BarChart3,
  Calculator,
  FileCheck2,
  ShieldCheck,
  Sparkles
} from "lucide-react";

import ScreenshotDropzone from "./components/screenshot/ScreenshotDropzone";
import OcrExtractor from "./components/extraction/OcrExtractor";
import ExtractedDataForm from "./components/extraction/ExtractedDataForm";
import BrokerSettingsForm from "./components/analysis/BrokerSettingsForm";
import ValidationSummaryCard from "./components/analysis/ValidationSummaryCard";
import SwingLevelsForm from "./components/analysis/SwingLevelsForm";
import AnalysisResult from "./components/result/AnalysisResult";

import { analyzeMarket } from "./calculations/decisionEngine";
import { detectScaleMismatch } from "./calculations/scaleValidator";
import { validateAnalysisInputs } from "./calculations/inputValidator";
import {
  getInstrumentPreset,
  normalizeSymbol
} from "./lib/instrumentConfig";

import type {
  BrokerSettings,
  MarketData
} from "./types/analysis";

const initialMarket: MarketData = {
  symbol: "GBPUSD",
  timeframe: "H1",
  bid: 1.32474,
  ask: 1.32480,
  close: 1.32449,
  open: 1.32499,
  high: 1.32507,
  low: 1.32443,
  ma50: 1.324651,
  cci: -197.12,
  rsi: 50,
  macd: 0.000041,
  macdSignal: 0.000427,
  atr: 0.00094,
  support: 1.32443,
  resistance: 1.32507
};

const initialBroker: BrokerSettings = {
  equity: 8.99,
  riskPercent: 10,
  minLot: 0.01,
  lotStep: 0.01,
  pointValue: 100000,
  contractSize: 100000,
  commission: 0,
  slippage: 0,
  buffer: 0.00005,
  atrMultiplier: 1.2,
  targetRR: 1.5
};

const emptyMarket: MarketData = {
  symbol: "",
  timeframe: "",
  bid: 0,
  ask: 0,
  close: 0,
  open: 0,
  high: 0,
  low: 0,
  ma50: 0,
  cci: 0,
  rsi: 0,
  macd: 0,
  macdSignal: 0,
  atr: 0,
  support: 0,
  resistance: 0
};

const emptyBroker: BrokerSettings = {
  equity: 0,
  riskPercent: 0,
  minLot: 0,
  lotStep: 0,
  pointValue: 0,
  contractSize: 0,
  commission: 0,
  slippage: 0,
  buffer: 0,
  atrMultiplier: 0,
  targetRR: 0
};

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketData>(initialMarket);
  const [broker, setBroker] = useState<BrokerSettings>(initialBroker);
  const [rawOcr, setRawOcr] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<
    ReturnType<typeof analyzeMarket> | null
  >(null);

  const lastSymbol = useRef(initialMarket.symbol);

  const scaleIssues = useMemo(
    () => detectScaleMismatch(market),
    [market]
  );

  const validation = useMemo(
    () => validateAnalysisInputs(market, broker),
    [market, broker]
  );

  const analysis = useMemo(
    () => analyzeMarket(market, broker),
    [market, broker]
  );

  // Menyesuaikan parameter broker ketika simbol diganti.
  useEffect(() => {
    const symbol = normalizeSymbol(market.symbol);

    if (!symbol) return;

    if (symbol === lastSymbol.current) return;

    const preset = getInstrumentPreset(symbol);

    setBroker((previous) => ({
      ...previous,
      pointValue: preset.defaultPointValue,
      contractSize: preset.contractSize,
      buffer: preset.defaultBuffer
    }));

    lastSymbol.current = symbol;
  }, [market.symbol]);

  const handleExtracted = useCallback(
    (
      data: Partial<MarketData>,
      rawText: string
    ) => {
      setMarket((previous) => ({
        ...previous,
        ...data
      }));
      setRawOcr(rawText);
      setConfirmed(false);
      setResult(null);
    },
    []
  );

  function runAnalysis() {
    if (!validation.valid || scaleIssues.length > 0) {
      setConfirmed(false);
      setResult(null);
      return;
    }

    setConfirmed(true);
    setResult(analysis);
  }

  function clearAll() {
    setImage(null);
    setMarket(emptyMarket);
    setBroker(emptyBroker);
    setRawOcr("");
    setConfirmed(false);
    setResult(null);
    lastSymbol.current = "";
  }

  function resetToDefault() {
    setImage(null);
    setMarket(initialMarket);
    setBroker(initialBroker);
    setRawOcr("");
    setConfirmed(false);
    setResult(null);
    lastSymbol.current = initialMarket.symbol;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <div>
            <p className="text-xs font-bold tracking-[0.35em] text-emerald-400">
              MDBKA
            </p>
            <h1 className="mt-1 text-lg font-bold">
              Merangkak Dari Bawah Ke Atas
            </h1>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300 sm:flex">
            <Activity size={16} />
            Analisa Manual
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-5 py-8 lg:px-8">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-7 lg:p-10">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
              <Sparkles size={14} />
              Analisa trading lebih terstruktur
            </div>

            <h2 className="text-4xl font-black leading-tight md:text-6xl">
              Mulai dari screenshot,
              <span className="text-emerald-400">
                {" "}pahami keputusannya.
              </span>
            </h2>

            <p className="mt-5 text-base leading-7 text-slate-300 md:text-lg">
              Tempel screenshot terminal trading, periksa data yang terbaca,
              lalu hitung Beli, Jual, atau Tunggu dengan parameter risiko yang
              dapat Anda ubah.
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <Panel
              icon={<FileCheck2 size={20} />}
              title="1. Tempel atau upload screenshot"
              description="Gunakan Ctrl + V, drag-and-drop, atau upload file."
            >
              <ScreenshotDropzone
                image={image}
                onImageChange={(nextImage) => {
                  setImage(nextImage);
                  setResult(null);
                  setConfirmed(false);
                }}
              />

              {image && (
                <div className="mt-5">
                  <OcrExtractor
                    image={image}
                    market={market}
                    onExtracted={handleExtracted}
                  />
                </div>
              )}

              {rawOcr && (
                <details className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-300">
                    Lihat teks OCR mentah
                  </summary>

                  <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-400">
                    {rawOcr}
                  </pre>
                </details>
              )}
            </Panel>

            <Panel
              icon={<BarChart3 size={20} />}
              title="2. Periksa dan koreksi data pasar"
              description="Hasil OCR dapat keliru. Koreksi sebelum analisa."
            >
              <ExtractedDataForm
                market={market}
                onChange={(nextMarket) => {
                  setMarket(nextMarket);
                  setConfirmed(false);
                  setResult(null);
                }}
              />
            </Panel>

            <Panel
              icon={<ShieldCheck size={20} />}
              title="3. Atur parameter broker dan risiko"
              description="Nilai point dan contract size wajib diverifikasi dari broker."
            >
              <BrokerSettingsForm
                broker={broker}
                onChange={(nextBroker) => {
                  setBroker(nextBroker);
                  setResult(null);
                  setConfirmed(false);
                }}
              />
            </Panel>

            <SwingLevelsForm
              currentPrice={market.close}
              onDetected={(support, resistance) => {
                setMarket((previous) => ({
                  ...previous,
                  support,
                  resistance
                }));
                setResult(null);
                setConfirmed(false);
              }}
            />

            <ValidationSummaryCard
              validation={validation}
              symbol={market.symbol}
            />

            <button
              type="button"
              onClick={runAnalysis}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-400 px-6 py-4 text-lg font-black text-slate-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-300"
            >
              <Calculator size={22} />
              ANALISA SEKARANG
            </button>

            <button
              type="button"
              onClick={clearAll}
              className="w-full rounded-xl border border-red-400/30 px-4 py-3 font-semibold text-red-200 transition hover:bg-red-400/10"
            >
              CLEAR SEMUA DATA
            </button>

            <button
              type="button"
              onClick={resetToDefault}
              className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/5"
            >
              Kembalikan data contoh GBPUSD
            </button>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Panel
              icon={<Activity size={20} />}
              title="4. Hasil analisa"
              description={
                confirmed
                  ? "Hasil dihitung dari data yang Anda konfirmasi."
                  : "Hasil akan tampil setelah tombol Analisa Sekarang ditekan."
              }
            >
              <AnalysisResult
                result={result}
                market={market}
                scaleIssues={scaleIssues}
              />
            </Panel>
          </aside>
        </section>

        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 text-sm leading-6 text-amber-100">
          <strong>Peringatan penting:</strong> MDBKA hanya alat bantu analisa
          edukasi. Aplikasi tidak menempatkan order dan tidak terhubung ke
          rekening trading. Nilai point, contract size, spread, komisi,
          slippage, minimum lot, dan aturan broker dapat berbeda. Hasil analisa
          bukan jaminan keuntungan.
        </section>
      </main>
    </div>
  );
}

function Panel({
  icon,
  title,
  description,
  children
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/10 lg:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-xl bg-emerald-400/10 p-2 text-emerald-400">
          {icon}
        </div>

        <div>
          <h2 className="font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {description}
          </p>
        </div>
      </div>

      {children}
    </section>
  );
}
'@

# ==========================================================
# 3. ocrParser.ts terintegrasi priceParser.ts
# ==========================================================

Write-ProjectFile "src\components\extraction\ocrParser.ts" @'
import type { MarketData } from "../../types/analysis";
import { parseInstrumentPrice } from "../../lib/priceParser";

const SUPPORTED_SYMBOLS = [
  "GBPUSD",
  "EURUSD",
  "AUDCAD",
  "CADJPY",
  "USDJPY",
  "USDCHF",
  "EURCAD",
  "EURCHF",
  "USDCAD",
  "US100",
  "NAS100",
  "NASDAQ"
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
  const chartMatch = text.match(
    /\b(GBPUSD|EURUSD|AUDCAD|CADJPY|USDJPY|USDCHF|EURCAD|EURCHF|USDCAD|US100|NAS100|NASDAQ)\s*[,/ ]\s*(M1|M5|M15|M30|H1|H4|D1|W1|MN1)\b/i
  );

  if (chartMatch) {
    const symbol = chartMatch[1].toUpperCase();

    if (symbol === "NASDAQ") return "NAS100";

    return symbol;
  }

  for (const symbol of SUPPORTED_SYMBOLS) {
    if (
      new RegExp(`\\b${symbol}\\b`, "i").test(text)
    ) {
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
'@

Write-Host ""
Write-Host "PATCH REACT INTEGRATION SELESAI." -ForegroundColor Green
Write-Host "Jalankan npm run build untuk memverifikasi." -ForegroundColor Cyan
