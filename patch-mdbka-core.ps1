# ==========================================================
# MDBKA CORE PATCH
# Merangkak Dari Bawah Ke Atas
# Fitur:
# - Paste screenshot
# - Upload screenshot
# - Preview dan hapus screenshot
# - OCR ekstraksi data
# - Koreksi data ekstraksi
# - Beli/Jual/Tunggu
# - S/L, T/P, RR, risiko, lot
# - Peringatan minimum lot broker
# ==========================================================

$ProjectRoot = "E:\MDBKA"

if (!(Test-Path $ProjectRoot)) {
    throw "Folder proyek tidak ditemukan: $ProjectRoot"
}

Set-Location $ProjectRoot

Write-Host "Menginstal dependensi OCR..." -ForegroundColor Cyan
npm install tesseract.js

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

# ----------------------------------------------------------
# TYPES
# ----------------------------------------------------------

Write-ProjectFile "src\types\analysis.ts" @'
export type Decision = "BELI" | "JUAL" | "TUNGGU";

export interface MarketData {
  symbol: string;
  timeframe: string;
  bid: number;
  ask: number;
  close: number;
  open: number;
  high: number;
  low: number;
  ma50: number;
  cci: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  atr: number;
  support: number;
  resistance: number;
}

export interface BrokerSettings {
  equity: number;
  riskPercent: number;
  minLot: number;
  lotStep: number;
  pointValue: number;
  commission: number;
  slippage: number;
  buffer: number;
  atrMultiplier: number;
  targetRR: number;
}

export interface AnalysisResult {
  decision: Decision;
  score: number;
  trendScore: number;
  cciScore: number;
  macdScore: number;
  rsiScore: number;
  entry: number;
  stopLoss: number | null;
  takeProfit: number | null;
  riskDistance: number | null;
  targetDistance: number | null;
  maxRiskUsd: number;
  riskAtMinLot: number | null;
  theoreticalLot: number | null;
  suggestedLot: number | null;
  riskPercentAtMinLot: number | null;
  riskStatus: string;
  explanation: string;
  factors: string[];
  warnings: string[];
}
'@

# ----------------------------------------------------------
# CALCULATION ENGINE
# ----------------------------------------------------------

Write-ProjectFile "src\calculations\decisionEngine.ts" @'
import type {
  AnalysisResult,
  BrokerSettings,
  Decision,
  MarketData
} from "../types/analysis";

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
    const atrBasedSL = entry - broker.atr * broker.atrMultiplier;

    stopLoss = Math.min(supportBasedSL, atrBasedSL);
    riskDistance = entry - stopLoss;
    takeProfit = entry + riskDistance * broker.targetRR;
    targetDistance = takeProfit - entry;
  }

  if (decision === "JUAL") {
    const resistanceBasedSL = market.resistance + broker.buffer;
    const atrBasedSL = entry + broker.atr * broker.atrMultiplier;

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
        "TIDAK MEMENUHI — lot teoritis di bawah minimum broker";
    } else if (riskAtMinLot > maxRiskUsd) {
      riskStatus =
        "TIDAK MEMENUHI — risiko lot minimum melebihi batas";
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

  let explanation = "Belum ada analisa.";

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
    entry: round(entry, 5),
    stopLoss: stopLoss === null ? null : round(stopLoss, 5),
    takeProfit: takeProfit === null ? null : round(takeProfit, 5),
    riskDistance:
      riskDistance === null ? null : round(riskDistance, 2),
    targetDistance:
      targetDistance === null ? null : round(targetDistance, 2),
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
'@

# ----------------------------------------------------------
# OCR EXTRACTION
# ----------------------------------------------------------

Write-ProjectFile "src\components\extraction\ocrParser.ts" @'
import type { MarketData } from "../../types/analysis";

function numberPattern(label: string, text: string): number | null {
  const regex = new RegExp(
    `${label}[^0-9-]*(-?[0-9]+(?:[.,][0-9]+)?)`,
    "i"
  );

  const match = text.match(regex);
  if (!match) return null;

  return Number(match[1].replace(",", "."));
}

function firstNumber(text: string): number | null {
  const match = text.match(/-?[0-9]+(?:[.,][0-9]+)?/);
  return match ? Number(match[0].replace(",", ".")) : null;
}

export function parseOcrText(
  text: string,
  previous: MarketData
): Partial<MarketData> {
  const normalized = text.replace(/\s+/g, " ");

  const knownSymbols = [
    "EURCAD",
    "EURCHF",
    "GBPUSD",
    "USDJPY",
    "USDCHF",
    "US100",
    "NAS100",
    "NASDAQ"
  ];

  const symbol =
    knownSymbols.find((item) =>
      normalized.toUpperCase().includes(item)
    ) ?? previous.symbol;

  const timeframeMatch = normalized.match(
    /\b(M1|M5|M15|M30|H1|H4|D1|W1|MN1)\b/i
  );

  const result: Partial<MarketData> = {
    symbol,
    timeframe: timeframeMatch?.[1]?.toUpperCase() ?? previous.timeframe
  };

  const aliases: Array<[keyof MarketData, string[]]> = [
    ["bid", ["bid", "jual"]],
    ["ask", ["ask", "beli"]],
    ["close", ["close", "c"]],
    ["open", ["open", "o"]],
    ["high", ["high", "h"]],
    ["low", ["low", "l"]],
    ["ma50", ["ma50", "ma 50", "moving average"]],
    ["cci", ["cci"]],
    ["rsi", ["rsi"]],
    ["macdSignal", ["signal"]],
    ["atr", ["atr"]],
    ["support", ["support"]],
    ["resistance", ["resistance"]]
  ];

  for (const [key, labels] of aliases) {
    for (const label of labels) {
      const value = numberPattern(label, normalized);
      if (value !== null) {
        result[key] = value as never;
        break;
      }
    }
  }

  const numbers = normalized
    .match(/-?[0-9]+(?:[.,][0-9]+)?/g)
    ?.map((item) => Number(item.replace(",", "."))) ?? [];

  if (result.bid === undefined && numbers[0] !== undefined) {
    result.bid = numbers[0];
  }

  if (result.ask === undefined && numbers[1] !== undefined) {
    result.ask = numbers[1];
  }

  if (
    result.close === undefined &&
    numbers[2] !== undefined
  ) {
    result.close = numbers[2];
  }

  return result;
}
'@

Write-ProjectFile "src\components\extraction\OcrExtractor.tsx" @'
import { useState } from "react";
import { ScanText, LoaderCircle } from "lucide-react";
import { createWorker } from "tesseract.js";
import type { MarketData } from "../../types/analysis";
import { parseOcrText } from "./ocrParser";

interface Props {
  image: string;
  market: MarketData;
  onExtracted: (data: Partial<MarketData>, rawText: string) => void;
}

export default function OcrExtractor({
  image,
  market,
  onExtracted
}: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function runOcr() {
    setLoading(true);
    setStatus("Menyiapkan OCR...");

    try {
      const worker = await createWorker("eng");

      setStatus("Membaca teks pada screenshot...");
      const result = await worker.recognize(image);

      await worker.terminate();

      const parsed = parseOcrText(result.data.text, market);
      onExtracted(parsed, result.data.text);
      setStatus("Ekstraksi selesai. Periksa dan koreksi data.");
    } catch (error) {
      console.error(error);
      setStatus(
        "OCR gagal. Isi data secara manual pada form koreksi."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">
            Ekstraksi data screenshot
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            OCR membantu membaca teks, tetapi semua hasil wajib diperiksa.
          </p>
        </div>

        <button
          type="button"
          onClick={runOcr}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <LoaderCircle className="animate-spin" size={18} />
          ) : (
            <ScanText size={18} />
          )}
          {loading ? "Membaca..." : "Ekstrak Data"}
        </button>
      </div>

      {status && (
        <p className="mt-4 rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-sky-200">
          {status}
        </p>
      )}
    </div>
  );
}
'@

# ----------------------------------------------------------
# SCREENSHOT INPUT
# ----------------------------------------------------------

Write-ProjectFile "src\components\screenshot\ScreenshotDropzone.tsx" @'
import { useEffect, useRef, useState } from "react";
import {
  ClipboardPaste,
  ImagePlus,
  Trash2,
  UploadCloud
} from "lucide-react";

interface Props {
  image: string | null;
  onImageChange: (image: string | null) => void;
}

export default function ScreenshotDropzone({
  image,
  onImageChange
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pasteMessage, setPasteMessage] = useState("");

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((item) =>
        item.type.startsWith("image/")
      );

      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      const reader = new FileReader();

      reader.onload = () => {
        onImageChange(String(reader.result));
        setPasteMessage(
          "Screenshot berhasil ditempel dari clipboard."
        );
      };

      reader.readAsDataURL(file);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onImageChange]);

  function readFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();

    reader.onload = () => {
      onImageChange(String(reader.result));
      setPasteMessage("Gambar berhasil dimuat.");
    };

    reader.readAsDataURL(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    readFile(event.dataTransfer.files[0]);
  }

  return (
    <div className="space-y-4">
      {!image ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={[
            "cursor-pointer rounded-3xl border-2 border-dashed p-10 text-center transition",
            isDragging
              ? "border-emerald-300 bg-emerald-300/10"
              : "border-white/15 bg-white/[0.03] hover:border-emerald-400/50 hover:bg-white/[0.06]"
          ].join(" ")}
        >
          <ImagePlus
            className="mx-auto mb-4 text-emerald-400"
            size={42}
          />

          <h3 className="text-xl font-bold text-white">
            Tempel screenshot di sini
          </h3>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
            Tekan Ctrl + V untuk menempelkan gambar dari clipboard,
            atau klik untuk memilih file gambar.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
              <ClipboardPaste size={15} />
              Ctrl + V
            </span>

            <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
              <UploadCloud size={15} />
              Upload gambar
            </span>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) =>
              readFile(event.target.files?.[0])
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-emerald-400/30 bg-slate-950">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="font-semibold text-white">
                Screenshot siap dianalisa
              </p>
              <p className="text-xs text-slate-400">
                Periksa gambar sebelum menjalankan OCR.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onImageChange(null)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-400/30 px-3 py-2 text-sm text-red-300 hover:bg-red-400/10"
            >
              <Trash2 size={16} />
              Hapus
            </button>
          </div>

          <div className="max-h-[520px] overflow-auto bg-black/30 p-3">
            <img
              src={image}
              alt="Screenshot trading"
              className="mx-auto max-h-[480px] max-w-full rounded-xl object-contain"
            />
          </div>
        </div>
      )}

      {pasteMessage && (
        <p className="text-sm text-emerald-300">{pasteMessage}</p>
      )}
    </div>
  );
}
'@

# ----------------------------------------------------------
# EXTRACTION FORM
# ----------------------------------------------------------

Write-ProjectFile "src\components\extraction\ExtractedDataForm.tsx" @'
import type { MarketData } from "../../types/analysis";

interface Props {
  market: MarketData;
  onChange: (data: MarketData) => void;
}

const fields: Array<{
  key: keyof MarketData;
  label: string;
  step?: string;
}> = [
  { key: "symbol", label: "Simbol" },
  { key: "timeframe", label: "Timeframe" },
  { key: "bid", label: "Bid" },
  { key: "ask", label: "Ask" },
  { key: "close", label: "Close" },
  { key: "open", label: "Open" },
  { key: "high", label: "High" },
  { key: "low", label: "Low" },
  { key: "ma50", label: "MA50" },
  { key: "cci", label: "CCI(14)" },
  { key: "rsi", label: "RSI(14)" },
  { key: "macd", label: "MACD" },
  { key: "macdSignal", label: "MACD Signal" },
  { key: "atr", label: "ATR(14)" },
  { key: "support", label: "Support" },
  { key: "resistance", label: "Resistance" }
];

export default function ExtractedDataForm({
  market,
  onChange
}: Props) {
  function update(key: keyof MarketData, value: string) {
    if (key === "symbol" || key === "timeframe") {
      onChange({ ...market, [key]: value });
      return;
    }

    onChange({
      ...market,
      [key]: Number(value)
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {fields.map((field) => {
        const value = market[field.key];

        return (
          <label key={field.key} className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {field.label}
            </span>

            <input
              value={String(value)}
              type={
                field.key === "symbol" ||
                field.key === "timeframe"
                  ? "text"
                  : "number"
              }
              step="any"
              onChange={(event) =>
                update(field.key, event.target.value)
              }
              className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
            />
          </label>
        );
      })}
    </div>
  );
}
'@

# ----------------------------------------------------------
# BROKER SETTINGS FORM
# ----------------------------------------------------------

Write-ProjectFile "src\components\analysis\BrokerSettingsForm.tsx" @'
import type { BrokerSettings } from "../../types/analysis";

interface Props {
  broker: BrokerSettings;
  onChange: (data: BrokerSettings) => void;
}

const fields: Array<{
  key: keyof BrokerSettings;
  label: string;
  help: string;
}> = [
  {
    key: "equity",
    label: "Equity USD",
    help: "Saldo/equity akun saat ini."
  },
  {
    key: "riskPercent",
    label: "Risiko maksimum %",
    help: "Contoh: 10 berarti 10%."
  },
  {
    key: "minLot",
    label: "Minimum lot",
    help: "Contoh broker: 0.01."
  },
  {
    key: "lotStep",
    label: "Lot step",
    help: "Contoh broker: 0.01."
  },
  {
    key: "pointValue",
    label: "Nilai 1 point / 1 lot USD",
    help: "Wajib dicek dari spesifikasi broker."
  },
  {
    key: "commission",
    label: "Komisi USD / lot",
    help: "Isi 0 bila tidak ada."
  },
  {
    key: "slippage",
    label: "Cadangan slippage point",
    help: "Tambahan konservatif."
  },
  {
    key: "buffer",
    label: "Buffer struktur point",
    help: "Jarak di luar swing."
  },
  {
    key: "atrMultiplier",
    label: "Pengali ATR",
    help: "Default 1.2."
  },
  {
    key: "targetRR",
    label: "Target RR",
    help: "Default 1.5."
  }
];

export default function BrokerSettingsForm({
  broker,
  onChange
}: Props) {
  function update(key: keyof BrokerSettings, value: string) {
    onChange({
      ...broker,
      [key]: Number(value)
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((field) => (
        <label key={field.key} className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {field.label}
          </span>

          <input
            type="number"
            step="any"
            value={broker[field.key]}
            onChange={(event) =>
              update(field.key, event.target.value)
            }
            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none focus:border-emerald-400"
          />

          <span className="block text-xs text-slate-500">
            {field.help}
          </span>
        </label>
      ))}
    </div>
  );
}
'@

# ----------------------------------------------------------
# RESULT COMPONENT
# ----------------------------------------------------------

Write-ProjectFile "src\components\result\AnalysisResult.tsx" @'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import type { AnalysisResult as ResultType } from "../../types/analysis";

interface Props {
  result: ResultType | null;
}

function money(value: number | null) {
  return value === null
    ? "-"
    : `$${value.toFixed(2)}`;
}

function number(value: number | null, digits = 2) {
  return value === null
    ? "-"
    : value.toFixed(digits);
}

export default function AnalysisResult({ result }: Props) {
  if (!result) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <Clock3 className="mx-auto mb-3 text-slate-500" size={34} />
        <h3 className="font-semibold text-white">
          Belum ada hasil analisa
        </h3>
        <p className="mt-2 text-sm text-slate-400">
          Lengkapi data lalu klik tombol Analisa Sekarang.
        </p>
      </div>
    );
  }

  const decisionStyle =
    result.decision === "BELI"
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
      : result.decision === "JUAL"
        ? "border-red-400/40 bg-red-400/10 text-red-300"
        : "border-amber-400/40 bg-amber-400/10 text-amber-300";

  const Icon =
    result.decision === "BELI"
      ? TrendingUp
      : result.decision === "JUAL"
        ? TrendingDown
        : Clock3;

  return (
    <div className="space-y-5">
      <div
        className={[
          "rounded-3xl border p-6",
          decisionStyle
        ].join(" ")}
      >
        <div className="flex items-center gap-4">
          <Icon size={42} />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em]">
              Hasil analisa
            </p>
            <h2 className="mt-1 text-4xl font-black">
              {result.decision}
            </h2>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs uppercase tracking-wide opacity-70">
              Skor
            </p>
            <p className="text-3xl font-black">
              {result.score}/5
            </p>
          </div>
        </div>

        <p className="mt-5 max-w-3xl text-sm leading-6">
          {result.explanation}
        </p>
      </div>

      {result.decision !== "TUNGGU" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Entry
            </p>
            <p className="mt-1 text-2xl font-bold text-white">
              {number(result.entry, 5)}
            </p>
          </div>

          <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-5">
            <p className="text-xs uppercase tracking-wide text-red-300">
              Stop Loss
            </p>
            <p className="mt-1 text-2xl font-bold text-red-200">
              {number(result.stopLoss, 5)}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
            <p className="text-xs uppercase tracking-wide text-emerald-300">
              Take Profit
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-200">
              {number(result.takeProfit, 5)}
            </p>
          </div>

          <div className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5">
            <p className="text-xs uppercase tracking-wide text-sky-300">
              RR
            </p>
            <p className="mt-1 text-2xl font-bold text-sky-200">
              {number(
                result.targetDistance !== null &&
                  result.riskDistance !== null
                  ? result.targetDistance /
                      result.riskDistance
                  : null,
                2
              )}
              :1
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Risiko maksimum" value={money(result.maxRiskUsd)} />
        <Metric label="Risiko lot minimum" value={money(result.riskAtMinLot)} />
        <Metric label="Lot teoritis" value={number(result.theoreticalLot, 4)} />
        <Metric label="Lot disarankan" value={number(result.suggestedLot, 4)} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-start gap-3">
          {result.riskStatus === "MEMENUHI batas risiko" ? (
            <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={20} />
          ) : (
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-400" size={20} />
          )}

          <div>
            <p className="font-semibold text-white">
              {result.riskStatus}
            </p>

            <div className="mt-3 space-y-2">
              {result.factors.map((factor) => (
                <p key={factor} className="text-sm text-slate-300">
                  • {factor}
                </p>
              ))}

              {result.warnings.map((warning) => (
                <p key={warning} className="text-sm text-amber-200">
                  ⚠ {warning}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold text-white">
        {value}
      </p>
    </div>
  );
}
'@

# ----------------------------------------------------------
# APP UTAMA
# ----------------------------------------------------------

Write-ProjectFile "src\App.tsx" @'
import { useCallback, useMemo, useState } from "react";
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
import AnalysisResult from "./components/result/AnalysisResult";
import { analyzeMarket } from "./calculations/decisionEngine";
import type {
  BrokerSettings,
  MarketData
} from "./types/analysis";

const initialMarket: MarketData = {
  symbol: "US100",
  timeframe: "H1",
  bid: 30606.82,
  ask: 30610.59,
  close: 30611.21,
  open: 30589.27,
  high: 30637,
  low: 30480.3,
  ma50: 30372.7,
  cci: 81.87,
  rsi: 50,
  macd: 0,
  macdSignal: 0,
  atr: 120,
  support: 30480.3,
  resistance: 30680
};

const initialBroker: BrokerSettings = {
  equity: 8.99,
  riskPercent: 10,
  minLot: 0.01,
  lotStep: 0.01,
  pointValue: 1,
  commission: 0,
  slippage: 0,
  buffer: 10,
  atrMultiplier: 1.2,
  targetRR: 1.5
};

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketData>(initialMarket);
  const [broker, setBroker] =
    useState<BrokerSettings>(initialBroker);
  const [rawOcr, setRawOcr] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<ReturnType<
    typeof analyzeMarket
  > | null>(null);

  const analyze = useMemo(
    () => analyzeMarket(market, broker),
    [market, broker]
  );

  const handleExtracted = useCallback(
    (data: Partial<MarketData>, rawText: string) => {
      setMarket((previous) => ({
        ...previous,
        ...data
      }));
      setRawOcr(rawText);
      setConfirmed(false);
    },
    []
  );

  function runAnalysis() {
    setConfirmed(true);
    setResult(analyze);
  }

  function resetAll() {
    setImage(null);
    setMarket(initialMarket);
    setBroker(initialBroker);
    setRawOcr("");
    setConfirmed(false);
    setResult(null);
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
              lalu hitung Beli, Jual, atau Tunggu dengan parameter risiko
              yang dapat Anda ubah.
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
              description="Nilai point US100 wajib diverifikasi dari broker."
            >
              <BrokerSettingsForm
                broker={broker}
                onChange={(nextBroker) => {
                  setBroker(nextBroker);
                  setResult(null);
                }}
              />
            </Panel>

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
              onClick={resetAll}
              className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/5"
            >
              Reset semua data
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
              <AnalysisResult result={result} />
            </Panel>
          </aside>
        </section>

        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 text-sm leading-6 text-amber-100">
          <strong>Peringatan penting:</strong> MDBKA hanya alat bantu
          analisa edukasi. Aplikasi tidak menempatkan order dan tidak
          terhubung ke rekening trading. Nilai point, contract size,
          spread, komisi, slippage, minimum lot, dan aturan broker dapat
          berbeda. Hasil analisa bukan jaminan keuntungan.
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
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
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

# ----------------------------------------------------------
# CSS
# ----------------------------------------------------------

Write-ProjectFile "src\index.css" @'
@import "tailwindcss";

:root {
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  color: #f8fafc;
  background: #020617;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

html {
  min-width: 320px;
  background: #020617;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background:
    radial-gradient(
      circle at 10% 0%,
      rgba(16, 185, 129, 0.08),
      transparent 30rem
    ),
    #020617;
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
}
'@

# ----------------------------------------------------------
# SUPPORTING VITE TYPES
# ----------------------------------------------------------

Write-ProjectFile "src\vite-env.d.ts" @'
/// <reference types="vite/client" />
'@

# ----------------------------------------------------------
# APPEND UPDATE TO README
# ----------------------------------------------------------

Write-ProjectFile "docs\core-features.md" @'
# Fitur Inti MDBKA

## Screenshot

- Ctrl + V dari clipboard
- Upload file gambar
- Drag-and-drop
- Preview gambar
- Hapus gambar

## OCR

OCR menggunakan Tesseract.js di browser.

OCR hanya membantu ekstraksi awal. Semua data harus dikoreksi dan diverifikasi pengguna.

## Keputusan

Mesin analisa menghasilkan:

- BELI
- JUAL
- TUNGGU

Aturan skor:

- Harga vs MA50: +2 atau -2
- CCI: +1 atau -1
- MACD vs Signal: +1 atau -1
- RSI: +1 atau -1

Skor BELI minimal: 3

Skor JUAL minimal: -3

Selain skor, arah harus sejalan dengan posisi harga terhadap MA50.

## Risiko

Aplikasi menghitung:

- Risiko maksimum USD
- Risiko pada lot minimum
- Lot teoritis
- Lot yang dibulatkan ke lot step
- Status minimum lot broker
- Peringatan risiko
'@

Write-Host ""
Write-Host "PATCH MDBKA SELESAI." -ForegroundColor Green