# ==========================================================
# MDBKA INSTRUMENT VALIDATION PATCH
# Encoding aman, preset broker, validasi skala harga
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
# 1. Konfigurasi instrumen
# ==========================================================

Write-ProjectFile "src\lib\instrumentConfig.ts" @'
export type InstrumentCode =
  | "GBPUSD"
  | "EURUSD"
  | "USDJPY"
  | "US100"
  | "NAS100"
  | "UNKNOWN";

export interface InstrumentPreset {
  code: InstrumentCode;
  label: string;
  category: "forex" | "index" | "unknown";
  priceMin: number;
  priceMax: number;
  expectedPriceExample: string;
  contractSize: number;
  pointValue: number;
  defaultBuffer: number;
  priceUnitLabel: string;
  brokerNote: string;
}

const presets: Record<InstrumentCode, InstrumentPreset> = {
  GBPUSD: {
    code: "GBPUSD",
    label: "GBP/USD",
    category: "forex",
    priceMin: 0.5,
    priceMax: 3,
    expectedPriceExample: "1.32480",
    contractSize: 100000,
    pointValue: 100000,
    defaultBuffer: 0.00005,
    priceUnitLabel: "perubahan harga",
    brokerNote:
      "GBPUSD biasanya memakai contract size 100.000. Verifikasi spesifikasi broker."
  },

  EURUSD: {
    code: "EURUSD",
    label: "EUR/USD",
    category: "forex",
    priceMin: 0.5,
    priceMax: 3,
    expectedPriceExample: "1.10000",
    contractSize: 100000,
    pointValue: 100000,
    defaultBuffer: 0.00005,
    priceUnitLabel: "perubahan harga",
    brokerNote:
      "EURUSD biasanya memakai contract size 100.000. Verifikasi spesifikasi broker."
  },

  USDJPY: {
    code: "USDJPY",
    label: "USD/JPY",
    category: "forex",
    priceMin: 50,
    priceMax: 250,
    expectedPriceExample: "150.000",
    contractSize: 100000,
    pointValue: 100000,
    defaultBuffer: 0.005,
    priceUnitLabel: "perubahan harga",
    brokerNote:
      "USDJPY biasanya memakai contract size 100.000. Verifikasi spesifikasi broker."
  },

  US100: {
    code: "US100",
    label: "US100 / Nasdaq",
    category: "index",
    priceMin: 1000,
    priceMax: 100000,
    expectedPriceExample: "30683.37",
    contractSize: 1,
    pointValue: 1,
    defaultBuffer: 10,
    priceUnitLabel: "index point",
    brokerNote:
      "US100 berbeda antarbroker. Nilai point dan contract size wajib dikonfirmasi."
  },

  NAS100: {
    code: "NAS100",
    label: "NAS100",
    category: "index",
    priceMin: 1000,
    priceMax: 100000,
    expectedPriceExample: "30683.37",
    contractSize: 1,
    pointValue: 1,
    defaultBuffer: 10,
    priceUnitLabel: "index point",
    brokerNote:
      "NAS100 berbeda antarbroker. Nilai point dan contract size wajib dikonfirmasi."
  },

  UNKNOWN: {
    code: "UNKNOWN",
    label: "Instrumen tidak dikenal",
    category: "unknown",
    priceMin: 0,
    priceMax: Number.MAX_SAFE_INTEGER,
    expectedPriceExample: "isi manual",
    contractSize: 1,
    pointValue: 1,
    defaultBuffer: 0,
    priceUnitLabel: "unit harga",
    brokerNote:
      "Instrumen tidak dikenal. Isi parameter broker secara manual."
  }
};

export function normalizeInstrument(symbol: string): InstrumentCode {
  const code = symbol.trim().toUpperCase();

  if (code === "GBPUSD") return "GBPUSD";
  if (code === "EURUSD") return "EURUSD";
  if (code === "USDJPY") return "USDJPY";
  if (code === "US100" || code === "USTEC") return "US100";
  if (code === "NAS100" || code === "NASDAQ") return "NAS100";

  return "UNKNOWN";
}

export function getInstrumentPreset(symbol: string) {
  return presets[normalizeInstrument(symbol)];
}
'@

# ==========================================================
# 2. Deteksi mismatch skala harga
# ==========================================================

Write-ProjectFile "src\calculations\scaleValidator.ts" @'
import type { MarketData } from "../types/analysis";
import {
  getInstrumentPreset,
  normalizeInstrument
} from "../lib/instrumentConfig";

export interface ScaleIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export function detectScaleMismatch(
  market: MarketData
): ScaleIssue[] {
  const preset = getInstrumentPreset(market.symbol);
  const code = normalizeInstrument(market.symbol);
  const issues: ScaleIssue[] = [];

  const values: Array<[string, number]> = [
    ["Bid", market.bid],
    ["Ask", market.ask],
    ["Close", market.close],
    ["Open", market.open],
    ["High", market.high],
    ["Low", market.low],
    ["MA50", market.ma50],
    ["Support", market.support],
    ["Resistance", market.resistance]
  ];

  if (code === "UNKNOWN") {
    issues.push({
      field: "symbol",
      message:
        "Instrumen belum dikenali. Periksa skala harga dan parameter broker secara manual.",
      severity: "warning"
    });

    return issues;
  }

  for (const [field, value] of values) {
    if (!Number.isFinite(value) || value <= 0) {
      issues.push({
        field,
        message: `${field} belum diisi dengan angka valid.`,
        severity: "error"
      });
      continue;
    }

    if (value < preset.priceMin || value > preset.priceMax) {
      issues.push({
        field,
        message:
          `${field} = ${value} tidak sesuai skala ${preset.label}. ` +
          `Contoh nilai yang benar: ${preset.expectedPriceExample}. ` +
          `Kemungkinan data instrumen lain masih tercampur.`,
        severity: "error"
      });
    }
  }

  if (market.ask <= market.bid) {
    issues.push({
      field: "Bid/Ask",
      message: "Ask harus lebih besar daripada Bid.",
      severity: "error"
    });
  }

  if (market.support >= market.resistance) {
    issues.push({
      field: "Support/Resistance",
      message: "Support harus lebih rendah daripada resistance.",
      severity: "error"
    });
  }

  return issues;
}
'@

# ==========================================================
# 3. Tambahkan contract size ke tipe broker
# ==========================================================

$typeFile = Join-Path $ProjectRoot "src\types\analysis.ts"
$typeContent = Get-Content $typeFile -Raw

if ($typeContent -notmatch "contractSize: number") {
    $typeContent = $typeContent.Replace(
        "pointValue: number;",
        "pointValue: number;`r`n  contractSize: number;"
    )
}

Set-Content $typeFile -Value $typeContent -Encoding UTF8
Write-Host "contractSize ditambahkan ke BrokerSettings." -ForegroundColor Green

# ==========================================================
# 4. Tambahkan preset broker otomatis ke App.tsx
# ==========================================================

$appFile = Join-Path $ProjectRoot "src\App.tsx"
$appContent = Get-Content $appFile -Raw

if ($appContent -notmatch "getInstrumentPreset") {
    $appContent = $appContent.Replace(
        'import { useCallback, useMemo, useState } from "react";',
        'import { useCallback, useEffect, useMemo, useRef, useState } from "react";'
    )

    $appContent = $appContent.Replace(
        'import { analyzeMarket } from "./calculations/decisionEngine";',
        'import { analyzeMarket } from "./calculations/decisionEngine";' + [Environment]::NewLine +
        'import { getInstrumentPreset } from "./lib/instrumentConfig";' + [Environment]::NewLine +
        'import { detectScaleMismatch } from "./calculations/scaleValidator";'
    )

    $appContent = $appContent.Replace(
        '  pointValue: 100000,',
        '  pointValue: 100000,' + [Environment]::NewLine +
        '  contractSize: 100000,'
    )

    $appContent = $appContent.Replace(
        '  pointValue: 1,',
        '  pointValue: 1,' + [Environment]::NewLine +
        '  contractSize: 1,'
    )

    $anchor = @'
  const [result, setResult] = useState<ReturnType<
    typeof analyzeMarket
  > | null>(null);
'@

    $insert = @'
  const [result, setResult] = useState<ReturnType<
    typeof analyzeMarket
  > | null>(null);

  const lastSymbol = useRef(market.symbol);

  const scaleIssues = useMemo(
    () => detectScaleMismatch(market),
    [market]
  );

  useEffect(() => {
    const currentSymbol = market.symbol.trim().toUpperCase();

    if (currentSymbol === lastSymbol.current.toUpperCase()) {
      return;
    }

    const preset = getInstrumentPreset(currentSymbol);

    setBroker((previous) => ({
      ...previous,
      pointValue: preset.pointValue,
      contractSize: preset.contractSize,
      buffer: preset.defaultBuffer
    }));

    lastSymbol.current = currentSymbol;
  }, [market.symbol]);
'@

    if ($appContent.Contains($anchor)) {
        $appContent = $appContent.Replace($anchor, $insert)
    } else {
        Write-Host "Anchor state result tidak ditemukan pada App.tsx." -ForegroundColor Yellow
    }

    $appContent = $appContent.Replace(
        '<AnalysisResult result={result} />',
        '<AnalysisResult result={result} market={market} scaleIssues={scaleIssues} />'
    )
}

Set-Content $appFile -Value $appContent -Encoding UTF8
Write-Host "Preset broker otomatis ditambahkan ke App.tsx." -ForegroundColor Green

# ==========================================================
# 5. Tampilkan mismatch pada AnalysisResult
# ==========================================================

$resultFile = Join-Path $ProjectRoot "src\components\result\AnalysisResult.tsx"
$resultContent = Get-Content $resultFile -Raw

if ($resultContent -notmatch "ScaleIssue") {
    $resultContent = $resultContent.Replace(
        'import type { AnalysisResult as ResultType } from "../../types/analysis";',
        'import type { AnalysisResult as ResultType, MarketData } from "../../types/analysis";' + [Environment]::NewLine +
        'import type { ScaleIssue } from "../../calculations/scaleValidator";'
    )

    $resultContent = $resultContent.Replace(
        '  result: ResultType | null;',
        '  result: ResultType | null;' + [Environment]::NewLine +
        '  market: MarketData;' + [Environment]::NewLine +
        '  scaleIssues: ScaleIssue[];'
    )

    $resultContent = $resultContent.Replace(
        'export default function AnalysisResult({ result }: Props) {',
        'export default function AnalysisResult({ result, market, scaleIssues }: Props) {'
    )

    $resultContent = $resultContent.Replace(
        '  if (!result) {',
        @'
  if (scaleIssues.length > 0) {
    return (
      <div className="space-y-4 rounded-3xl border border-red-400/30 bg-red-400/10 p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">
            Data perlu diperiksa
          </p>
          <h2 className="mt-1 text-2xl font-black text-red-100">
            Mismatch skala harga terdeteksi
          </h2>
          <p className="mt-2 text-sm text-red-100/80">
            Simbol {market.symbol} memiliki skala harga yang tidak cocok dengan
            satu atau lebih nilai pada form.
          </p>
        </div>

        <div className="space-y-2">
          {scaleIssues.map((issue) => (
            <div
              key={`${issue.field}-${issue.message}`}
              className="rounded-xl border border-red-300/20 bg-slate-950/40 p-3 text-sm text-red-100"
            >
              <strong>{issue.field}:</strong> {issue.message}
            </div>
          ))}
        </div>

        <p className="text-sm text-amber-100">
          Perbaiki data pasar terlebih dahulu. Hasil BELI/JUAL/TUNGGU belum
          boleh dianggap valid.
        </p>
      </div>
    );
  }

  if (!result) {
'@
    )

    # Ganti simbol Unicode yang dapat rusak di Windows PowerShell/browser.
    $resultContent = $resultContent.Replace(
        "• {factor}",
        "- {factor}"
    )

    $resultContent = $resultContent.Replace(
        "⚠ {warning}",
        "PERINGATAN: {warning}"
    )

    Set-Content $resultFile -Value $resultContent -Encoding UTF8
    Write-Host "AnalysisResult.tsx diperbarui." -ForegroundColor Green
}

# ==========================================================
# 6. Tambahkan contract size pada form broker
# ==========================================================

$brokerFile = Join-Path $ProjectRoot "src\components\analysis\BrokerSettingsForm.tsx"
$brokerContent = Get-Content $brokerFile -Raw

if ($brokerContent -notmatch "contractSize") {
    $brokerContent = $brokerContent.Replace(
        '  pointValue: "Nilai 1 point / 1 lot USD",',
        '  pointValue: "Nilai perubahan harga / 1 lot USD",' + [Environment]::NewLine +
        '  contractSize: "Contract size",' 
    )

    $brokerContent = $brokerContent.Replace(
        '  pointValue: "Wajib dicek dari spesifikasi broker."',
        '  pointValue: "Wajib dicek dari spesifikasi broker.",' + [Environment]::NewLine +
        '  contractSize: "Otomatis mengikuti simbol; tetap verifikasi broker."'
    )

    Set-Content $brokerFile -Value $brokerContent -Encoding UTF8
    Write-Host "Field contract size ditambahkan ke form broker." -ForegroundColor Green
}

# ==========================================================
# 7. Perbaiki simbol bullet pada file hasil bila masih tersimpan
# ==========================================================

$filesToClean = @(
    "src\components\result\AnalysisResult.tsx",
    "src\components\analysis\ValidationSummaryCard.tsx",
    "src\App.tsx"
)

foreach ($relative in $filesToClean) {
    $path = Join-Path $ProjectRoot $relative

    if (Test-Path $path) {
        $content = Get-Content $path -Raw

        $content = $content.Replace("•", "-")
        $content = $content.Replace("⚠", "PERINGATAN:")

        Set-Content $path -Value $content -Encoding UTF8
        Write-Host "Encoding dibersihkan: $relative" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "PATCH INSTRUMENT VALIDATION SELESAI." -ForegroundColor Green
Write-Host "Jalankan npm run build untuk memeriksa hasil." -ForegroundColor Cyan
