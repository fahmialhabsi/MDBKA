# ==========================================================
# MDBKA GBPUSD PATCH
# Memperbaiki default data, parser OCR, dan nilai point Forex
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
# 1. Parser OCR yang lebih aman
# ==========================================================

Write-ProjectFile "src\components\extraction\ocrParser.ts" @'
import type { MarketData } from "../../types/analysis";

const SUPPORTED_SYMBOLS = [
  "GBPUSD",
  "EURUSD",
  "USDJPY",
  "USDCHF",
  "EURGBP",
  "EURCAD",
  "EURCHF",
  "AUDUSD",
  "AUDJPY",
  "USDCAD",
  "US100",
  "NAS100",
  "NASDAQ"
];

function normalizeText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null;

  const cleaned = value
    .replace(/\s/g, "")
    .replace(/,/g, ".");

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function findAfterLabel(
  text: string,
  label: string
): number | null {
  const regex = new RegExp(
    `${label}\\s*(?:\\([^)]*\\))?\\s*[:=]?\\s*(-?(?:\\d+[.,]\\d+|\\d+))`,
    "i"
  );

  const match = text.match(regex);
  return toNumber(match?.[1]);
}

function findMarketWatchQuote(
  text: string,
  symbol: string
): { bid: number; ask: number } | null {
  const regex = new RegExp(
    `${symbol}\\s+((?:\\d+[.,]\\d+))\\s+((?:\\d+[.,]\\d+))`,
    "i"
  );

  const match = text.match(regex);

  if (!match) return null;

  const bid = toNumber(match[1]);
  const ask = toNumber(match[2]);

  if (bid === null || ask === null || ask <= bid) {
    return null;
  }

  return { bid, ask };
}

function findChartSymbol(text: string): string | null {
  // Prioritaskan judul chart seperti GBPUSD,H1 atau GBPUSD H1.
  const chartMatch = text.match(
    /\b(GBPUSD|EURUSD|USDJPY|USDCHF|EURGBP|EURCAD|EURCHF|AUDUSD|AUDJPY|USDCAD|US100|NAS100|NASDAQ)\s*[,/ ]\s*(M1|M5|M15|M30|H1|H4|D1|W1|MN1)\b/i
  );

  if (chartMatch) {
    return chartMatch[1].toUpperCase();
  }

  // Jika judul chart tidak terbaca, gunakan simbol pertama yang ditemukan.
  for (const symbol of SUPPORTED_SYMBOLS) {
    if (new RegExp(`\\b${symbol}\\b`, "i").test(text)) {
      return symbol;
    }
  }

  return null;
}

function findTimeframe(text: string, fallback: string) {
  const match = text.match(
    /\b(M1|M5|M15|M30|H1|H4|D1|W1|MN1)\b/i
  );

  return match?.[1]?.toUpperCase() ?? fallback;
}

export function parseOcrText(
  rawText: string,
  previous: MarketData
): Partial<MarketData> {
  const text = normalizeText(rawText);

  const symbol = findChartSymbol(text) ?? previous.symbol;
  const timeframe = findTimeframe(text, previous.timeframe);

  const result: Partial<MarketData> = {
    symbol,
    timeframe
  };

  // Prioritaskan quote GBPUSD yang berada pada Market Watch.
  const quote = findMarketWatchQuote(text, symbol);

  if (quote) {
    result.bid = quote.bid;
    result.ask = quote.ask;
  }

  // Parser berlabel. Tidak memakai angka pertama OCR sebagai Bid/Ask.
  const labeledValues: Array<
    [keyof MarketData, string[]]
  > = [
    ["open", ["Open", "\\bO\\b"]],
    ["high", ["High", "\\bH\\b"]],
    ["low", ["Low", "\\bL\\b"]],
    ["close", ["Close", "\\bC\\b"]],
    ["ma50", ["MA\\s*\\(?(?:50)\\)?", "MA50"]],
    ["cci", ["CCI"]],
    ["rsi", ["RSI"]],
    ["macd", ["MACD"]],
    ["macdSignal", ["Signal"]],
    ["atr", ["ATR"]]
  ];

  for (const [key, labels] of labeledValues) {
    for (const label of labels) {
      const value = findAfterLabel(text, label);

      if (value !== null) {
        result[key] = value as never;
        break;
      }
    }
  }

  // Perbaikan khusus nilai indikator MT5:
  // ATR(14) harus mengambil nilai setelah tanda/label,
  // bukan angka 14 sebagai periode indikator.
  const atrMatch = text.match(
    /ATR\s*\(\s*14\s*\)\s*[:=]?\s*(0[.,]\d+|\d+[.,]\d+)/i
  );

  if (atrMatch) {
    const atr = toNumber(atrMatch[1]);
    if (atr !== null) result.atr = atr;
  }

  const cciMatch = text.match(
    /CCI\s*\(\s*14\s*\)\s*[:=]?\s*(-?\d+[.,]\d+)/i
  );

  if (cciMatch) {
    const cci = toNumber(cciMatch[1]);
    if (cci !== null) result.cci = cci;
  }

  const macdMatch = text.match(
    /MACD\s*\(\s*12\s*,\s*26\s*,\s*9\s*\)\s*[:=]?\s*(-?\d+[.,]\d+)\s+(-?\d+[.,]\d+)/i
  );

  if (macdMatch) {
    const macd = toNumber(macdMatch[1]);
    const signal = toNumber(macdMatch[2]);

    if (macd !== null) result.macd = macd;
    if (signal !== null) result.macdSignal = signal;
  }

  return result;
}
'@

# ==========================================================
# 2. Default data GBPUSD H1
# ==========================================================

$appFile = Join-Path $ProjectRoot "src\App.tsx"
$app = Get-Content $appFile -Raw

$oldMarket = @'
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
'@

$newMarket = @'
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
'@

if ($app.Contains($oldMarket)) {
    $app = $app.Replace($oldMarket, $newMarket)
} else {
    Write-Host "Blok initialMarket tidak ditemukan. Periksa App.tsx secara manual." -ForegroundColor Yellow
}

$oldBroker = @'
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
'@

$newBroker = @'
const initialBroker: BrokerSettings = {
  equity: 8.99,
  riskPercent: 10,
  minLot: 0.01,
  lotStep: 0.01,

  // GBPUSD menggunakan perubahan harga mentah.
  // Contoh: 0.00010 x 100000 x 0.01 lot = USD 0.10.
  // Verifikasi tetap diperlukan dari spesifikasi broker.
  pointValue: 100000,

  commission: 0,
  slippage: 0,
  buffer: 0.00005,
  atrMultiplier: 1.2,
  targetRR: 1.5
};
'@

if ($app.Contains($oldBroker)) {
    $app = $app.Replace($oldBroker, $newBroker)
} else {
    Write-Host "Blok initialBroker tidak ditemukan. Periksa App.tsx secara manual." -ForegroundColor Yellow
}

Set-Content $appFile -Value $app -Encoding UTF8
Write-Host "Default App.tsx diperbarui ke GBPUSD H1." -ForegroundColor Green

# ==========================================================
# 3. Perbaiki label nilai point
# ==========================================================

$brokerFile = Join-Path $ProjectRoot "src\components\analysis\BrokerSettingsForm.tsx"
$brokerContent = Get-Content $brokerFile -Raw

$brokerContent = $brokerContent.Replace(
    "Nilai 1 point / 1 lot USD",
    "Nilai perubahan harga / 1 lot USD"
)

$brokerContent = $brokerContent.Replace(
    "Wajib dicek dari spesifikasi broker.",
    "GBPUSD biasanya 100000; tetap wajib dicek dari broker."
)

Set-Content $brokerFile -Value $brokerContent -Encoding UTF8
Write-Host "Label point broker diperbarui." -ForegroundColor Green

# ==========================================================
# 4. Tambahkan validasi khusus instrumen
# ==========================================================

$validatorFile = Join-Path $ProjectRoot "src\calculations\inputValidator.ts"
$validatorContent = Get-Content $validatorFile -Raw

$insertAfter = @'
  if (!market.symbol.trim()) {
    errors.push(item("symbol", "Simbol wajib diisi.", "error"));
  }
'@

$insertBlock = @'
  if (!market.symbol.trim()) {
    errors.push(item("symbol", "Simbol wajib diisi.", "error"));
  }

  if (market.symbol.toUpperCase() === "GBPUSD") {
    if (market.bid < 1 || market.bid > 3) {
      errors.push(
        item(
          "bid",
          "Bid GBPUSD tampak tidak valid. Gunakan format seperti 1.32474.",
          "error"
        )
      );
    }

    if (market.ask < 1 || market.ask > 3) {
      errors.push(
        item(
          "ask",
          "Ask GBPUSD tampak tidak valid. Gunakan format seperti 1.32480.",
          "error"
        )
      );
    }

    if (market.atr > 0.1) {
      errors.push(
        item(
          "atr",
          "ATR GBPUSD tampak salah. Gunakan nilai seperti 0.00094, bukan angka periode 14.",
          "error"
        )
      );
    }

    if (market.ma50 > 3) {
      errors.push(
        item(
          "ma50",
          "MA50 masih tampak seperti nilai US100. Gunakan nilai GBPUSD seperti 1.324651.",
          "error"
        )
      );
    }
  }
'@

if ($validatorContent.Contains($insertAfter)) {
    $validatorContent = $validatorContent.Replace($insertAfter, $insertBlock)
}

Set-Content $validatorFile -Value $validatorContent -Encoding UTF8
Write-Host "Validasi GBPUSD ditambahkan." -ForegroundColor Green

Write-Host ""
Write-Host "PATCH MDBKA GBPUSD SELESAI." -ForegroundColor Green
Write-Host "Jalankan npm run build untuk memeriksa hasil." -ForegroundColor Cyan