import type { Candle } from "../calculations/swingDetector";

export interface CandleParseResult {
  candles: Candle[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  headerDetected: boolean;
  separator: "," | ";" | "unknown";
  errors: string[];
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function isTimeOnly(value: string): boolean {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(value.trim());
}

/**
 * Aturan desimal eksplisit per sumber data:
 * - CSV MT5 dengan separator koma memakai titik sebagai desimal.
 *   Koma di dalam nilai tidak diubah (koma adalah pemisah kolom).
 * - CSV MT5 dengan separator titik koma dapat memakai koma sebagai
 *   desimal (lokus Eropa), sehingga koma diubah menjadi titik.
 * - Parser OCR memiliki aturan sendiri (lihat ocrParser/priceParser)
 *   dan tidak boleh dicampur dengan aturan CSV ini.
 */
export function parseCsvNumber(
  raw: string,
  separator: "," | ";"
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withoutSpaces = trimmed.replace(/\s/g, "");

  const normalized =
    separator === ";"
      ? withoutSpaces.replace(",", ".")
      : withoutSpaces;

  // Tolak format ambigu ribuan/desimal campuran seperti "30.590,29"
  // pada separator koma (sudah terpecah menjadi kolom terpisah dan
  // akan gagal validasi) atau "1,324.74.5" dalam bentuk apa pun.
  if (separator === ";" && (normalized.match(/\./g) ?? []).length > 1) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

/** Kompatibilitas: parser angka CSV generik memakai titik desimal. */
export function parseNumber(value: string): number | null {
  return parseCsvNumber(value, ",");
}

export function parseCsvCandles(text: string): CandleParseResult {
  const empty: CandleParseResult = {
    candles: [],
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    headerDetected: false,
    separator: "unknown",
    errors: [],
  };

  const withoutBom = text.replace(/^\uFEFF/, "");
  const lines = withoutBom
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return empty;

  const firstLine = lines[0].toLowerCase();
  const headerDetected =
    firstLine.includes("time") || firstLine.includes("open");
  const startIndex = headerDetected ? 1 : 0;

  if (lines.length <= startIndex) {
    return { ...empty, headerDetected, totalRows: 0 };
  }

  const dataLines = lines.slice(startIndex);
  const firstDataLine = dataLines[0] ?? "";
  const separator: "," | ";" = firstDataLine.includes(";") ? ";" : ",";

  const candles: Candle[] = [];
  const errors: string[] = [];
  let invalidRows = 0;

  dataLines.forEach((line, lineOffset) => {
    const lineNumber = startIndex + lineOffset + 1;
    const lineSeparator: "," | ";" = line.includes(";") ? ";" : ",";
    const rawParts = line.split(lineSeparator).map(stripQuotes);

    if (rawParts.length < 5) {
      invalidRows += 1;
      errors.push(`Baris ${lineNumber}: kolom kurang dari 5, dilewati.`);
      return;
    }

    let time: string;
    let openRaw: string;
    let highRaw: string;
    let lowRaw: string;
    let closeRaw: string;

    if (rawParts.length >= 6) {
      // Bedakan "tanggal,jam,OHLC..." (Format C) dengan
      // "timestamp,OHLC...,kolom tambahan" (Format E / volume MT5).
      const first = rawParts[0];
      const second = rawParts[1];
      if (!first.includes(":") && isTimeOnly(second)) {
        // Format C: 2026.09.30,12:00,30347.16,... (koma atau titik koma)
        time = `${first} ${second}`;
        [openRaw, highRaw, lowRaw, closeRaw] = rawParts.slice(2, 6);
      } else {
        // Timestamp penuh + kolom tambahan: abaikan kolom setelah close.
        [time, openRaw, highRaw, lowRaw, closeRaw] = rawParts.slice(0, 5);
      }
    } else {
      [time, openRaw, highRaw, lowRaw, closeRaw] = rawParts.slice(0, 5);
    }

    const open = parseCsvNumber(openRaw, lineSeparator);
    const high = parseCsvNumber(highRaw, lineSeparator);
    const low = parseCsvNumber(lowRaw, lineSeparator);
    const close = parseCsvNumber(closeRaw, lineSeparator);

    if (
      !time ||
      open === null ||
      high === null ||
      low === null ||
      close === null
    ) {
      invalidRows += 1;
      errors.push(`Baris ${lineNumber}: angka OHLC tidak valid, dilewati.`);
      return;
    }

    if (low > high || high < open || high < close || low > open || low > close) {
      invalidRows += 1;
      errors.push(`Baris ${lineNumber}: relasi OHLC tidak valid, dilewati.`);
      return;
    }

    candles.push({ time, open, high, low, close });
  });

  return {
    candles,
    totalRows: dataLines.length,
    validRows: candles.length,
    invalidRows,
    headerDetected,
    separator,
    errors: errors.slice(0, 20),
  };
}

/** Wrapper ringkas untuk kompatibilitas kode lama. */
export function parseCandles(text: string): Candle[] {
  return parseCsvCandles(text).candles;
}
