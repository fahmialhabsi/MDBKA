export interface QuoteSnapshot {
  timestamp: string;
  symbol: string;
  bid: number;
  ask: number;
}

export interface QuotesResponse {
  data: QuoteSnapshot[];
  symbol: string;
  count: number;
  timestamp: string;
}

export interface QuotesStreamEvent {
  type: 'quote' | 'error';
  payload: QuoteSnapshot | { message: string };
}

/**
 * Kontrak SSE tunggal server <-> frontend (satu sumber kebenaran).
 *
 * - Event `init` membawa array (bisa kosong bila belum ada quote).
 * - Event `update` membawa satu quote terbaru.
 * - Modul ini MURNI (tanpa import node/express) sehingga aman diimpor
 *   sebagai runtime oleh frontend (Vite) maupun backend (tsx/node).
 * - Pencocokan simbol EXACT (case-sensitive) agar feed Finex dan
 *   OrbiTraderBerjangka (`_ORB`) tidak tercampur.
 */
export type QuoteSseEnvelope =
  | {
      type: "init";
      data: QuoteSnapshot[];
    }
  | {
      type: "update";
      data: QuoteSnapshot;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * True bila value adalah quote valid: simbol string non-kosong,
 * timestamp string, bid/ask finite > 0, dan ask > bid.
 * Quote kosong/invalid ditolak (tidak pernah masuk state).
 */
export function isQuoteSnapshot(value: unknown): value is QuoteSnapshot {
  if (!isRecord(value)) return false;
  if (typeof value.symbol !== "string" || value.symbol.length === 0)
    return false;
  if (typeof value.timestamp !== "string") return false;
  if (
    typeof value.bid !== "number" ||
    !Number.isFinite(value.bid) ||
    value.bid <= 0
  )
    return false;
  if (
    typeof value.ask !== "number" ||
    !Number.isFinite(value.ask) ||
    value.ask <= 0
  )
    return false;
  return value.ask > value.bid;
}

/**
 * Parse payload SSE mentah menjadi envelope.
 * Mengembalikan null bila bentuk tidak dikenal (malformed):
 * type selain init/update, init tanpa array, update tanpa quote valid.
 * Tidak pernah throw untuk input apa pun.
 */
export function parseQuoteSseEnvelope(
  raw: unknown,
): QuoteSseEnvelope | null {
  if (!isRecord(raw)) return null;
  if (raw.type === "init") {
    if (!Array.isArray(raw.data)) return null;
    // Array boleh kosong (belum ada quote): envelope tetap valid,
    // ekstraksi nanti menghasilkan null (state tetap empty).
    // Item invalid dibuang agar tidak masuk state.
    const cleaned: QuoteSnapshot[] = [];
    for (const item of raw.data) {
      if (isQuoteSnapshot(item)) cleaned.push(item);
    }
    return { type: "init", data: cleaned };
  }
  if (raw.type === "update") {
    if (!isQuoteSnapshot(raw.data)) return null;
    return { type: "update", data: raw.data };
  }
  return null;
}

/**
 * Ambil quote untuk simbol eksak dari envelope.
 * - init: quote valid TERAKHIR yang simbolnya cocok (atau null).
 * - update: quote bila simbol cocok (atau null bila beda simbol).
 * Simbol dibandingkan persis (tanpa normalisasi) agar `_ORB` tidak
 * tertukar dengan nama Finex polos.
 */
export function extractQuoteFromEnvelope(
  envelope: QuoteSseEnvelope,
  expectedSymbol: string,
): QuoteSnapshot | null {
  if (expectedSymbol.length === 0) return null;
  if (envelope.type === "update") {
    return envelope.data.symbol === expectedSymbol
      ? envelope.data
      : null;
  }
  let latest: QuoteSnapshot | null = null;
  for (const quote of envelope.data) {
    if (quote.symbol === expectedSymbol) latest = quote;
  }
  return latest;
}

/**
 * Ambil quote untuk simbol eksak dari payload REST
 * `{ data: QuoteSnapshot[] }` (bentuk GET /api/quotes/:symbol).
 * Mengambil TERAKHIR yang cocok (data terbaru), bukan pertama.
 * Mengembalikan null bila payload malformed atau tidak ada yang cocok.
 */
export function extractQuoteFromRestPayload(
  payload: unknown,
  expectedSymbol: string,
): QuoteSnapshot | null {
  if (!isRecord(payload)) return null;
  if (!Array.isArray(payload.data)) return null;
  if (expectedSymbol.length === 0) return null;
  let latest: QuoteSnapshot | null = null;
  for (const item of payload.data) {
    if (isQuoteSnapshot(item) && item.symbol === expectedSymbol) {
      latest = item;
    }
  }
  return latest;
}
