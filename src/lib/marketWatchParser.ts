import {
  getInstrumentProfile,
  normalizeSymbol,
} from "./instrumentConfig";
import { traceOcrStage } from "./debugTrace";

export type MarketWatchSource = "market-watch" | "one-click" | "unknown";

export interface MarketWatchDebug {
  candidateTokens: string[];
  normalizedCandidates: number[];
  rejectedCandidates: string[];
  chosenBid: number | null;
  chosenAsk: number | null;
  rejectionReason: string | null;
}

export interface MarketWatchQuote {
  bid: number | null;
  ask: number | null;
  warnings: string[];
  /** Baris Market Watch yang cocok (untuk debug). */
  matchedLine?: string;
  source: MarketWatchSource;
  /** Baris yang memuat simbol aktif (maksimal 10, untuk debug). */
  candidateLines: string[];
  debug: MarketWatchDebug;
}

function emptyDebug(): MarketWatchDebug {
  return {
    candidateTokens: [],
    normalizedCandidates: [],
    rejectedCandidates: [],
    chosenBid: null,
    chosenAsk: null,
    rejectionReason: null,
  };
}

/** Nama indeks yang merujuk instrumen sama walau kode berbeda. */
const INDEX_ALIAS_GROUP = ["US100", "NAS100"];

function stripIndexSuffix(code: string): string {
  // Suffix broker menempel tanpa titik: "US100M" -> "US100".
  const match = code.match(/^(US100|NAS100|USTEC)[A-Z]*$/);
  return match ? match[1] : code;
}

function normalizeWatchToken(token: string): string {
  return stripIndexSuffix(normalizeSymbol(token));
}

function isSameWatchSymbol(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return INDEX_ALIAS_GROUP.includes(a) && INDEX_ALIAS_GROUP.includes(b);
}

/**
 * Aturan desimal eksplisit untuk OCR (satu-satunya aturan angka OCR;
 * JANGAN mencampurnya dengan aturan parser CSV):
 * - token yang memuat "." sekaligus "," dianggap ambigu -> null,
 * - koma tunggal dianggap desimal ("30582,83" -> 30582.83),
 * - selain itu Number() biasa.
 */
export function normalizeOcrPriceToken(token: string): number | null {
  const cleaned = token.trim().replace(/\s/g, "");
  if (!cleaned) return null;

  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");

  if (hasDot && hasComma) return null;

  const normalized = hasComma ? cleaned.replace(",", ".") : cleaned;

  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function maxWarnSpread(symbol: string): number {
  const profile = getInstrumentProfile(symbol);
  return profile.category === "forex" ? 50 * profile.pipSize : 200 * profile.pipSize;
}

/**
 * Normalisasi angka besar OCR tanpa separator desimal ("304327", "3062583").
 * Aturan tunggal, sama dengan parseInstrumentPrice: coba dari bagian
 * integer terpanjang (k=1, 2, ...) dan ambil pertama yang masuk rentang
 * profil. "304327" -> 30432.7; "3062583" -> 30625.83. Di luar itu null
 * (tidak menebak posisi desimal lain).
 */
export function normalizeBigOcrNumber(
  token: string,
  symbol: string
): number | null {
  const digits = token.trim().replace(/\s/g, "");
  if (!/^\d+$/.test(digits)) return null;

  const profile = getInstrumentProfile(symbol);

  for (let decimals = 1; decimals < digits.length; decimals++) {
    const value =
      Number(digits.slice(0, digits.length - decimals)) +
      Number(digits.slice(digits.length - decimals)) /
        Math.pow(10, decimals);

    if (value >= profile.minPrice && value <= profile.maxPrice) {
      return value;
    }
  }

  return null;
}

function splitWatchLines(rawText: string): string[] {
  return rawText
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[|]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Validasi pasangan Bid/Ask terhadap skala dan akal sehat spread. */
function validateWatchPair(
  bid: number,
  ask: number,
  active: string,
  matchedLine: string
): Omit<MarketWatchQuote, "candidateLines" | "debug"> | null {
  const profile = getInstrumentProfile(active);

  if (!(bid > 0) || !(ask > 0)) return null;

  if (!(ask > bid)) {
    return {
      bid: null,
      ask: null,
      matchedLine,
      source: "market-watch",
      warnings: [
        `Baris Market Watch ${active} terbalik (Bid >= Ask); Bid/Ask tidak diisi.`,
      ],
    };
  }

  if (
    bid < profile.minPrice ||
    bid > profile.maxPrice ||
    ask < profile.minPrice ||
    ask > profile.maxPrice
  ) {
    return {
      bid: null,
      ask: null,
      matchedLine,
      source: "market-watch",
      warnings: [
        `Harga Market Watch ${active} di luar skala instrumen; Bid/Ask tidak diisi.`,
      ],
    };
  }

  const warnings: string[] = [];
  if (ask - bid > maxWarnSpread(active)) {
    warnings.push(
      `Spread Market Watch ${active} sangat besar; periksa kembali Bid/Ask.`
    );
  }

  return { bid, ask, warnings, matchedLine, source: "market-watch" };
}

/**
 * Fallback tombol One-Click Trading (SELL/BUY) bila baris Market Watch
 * tidak ditemukan. Label harus jelas; jika ambigu -> null + warning.
 */
function parseOneClickBidAsk(
  lines: string[],
  active: string
): Omit<MarketWatchQuote, "candidateLines" | "debug"> | null {
  const priced = (line: string): number[] =>
    line
      .split(" ")
      .filter(Boolean)
      .map((token) => normalizeOcrPriceToken(token.replace(/%$/, "")))
      .filter((value): value is number => value !== null && value > 0);

  const bothLines = lines.filter(
    (line) => /SELL/i.test(line) && /BUY/i.test(line)
  );

  if (bothLines.length === 1) {
    const numbers = priced(bothLines[0]);
    if (numbers.length >= 2) {
      const checked = validateWatchPair(numbers[0], numbers[1], active, bothLines[0]);
      return checked ? { ...checked, source: "one-click" as const } : null;
    }
    return null;
  }

  const sellLines = lines.filter((line) => /SELL/i.test(line));
  const buyLines = lines.filter((line) => /BUY/i.test(line));

  if (sellLines.length === 1 && buyLines.length === 1) {
    const sellNumbers = priced(sellLines[0]);
    const buyNumbers = priced(buyLines[0]);
    if (sellNumbers.length >= 1 && buyNumbers.length >= 1) {
      const checked = validateWatchPair(
        sellNumbers[0],
        buyNumbers[0],
        active,
        `${sellLines[0]} / ${buyLines[0]}`
      );
      return checked ? { ...checked, source: "one-click" as const } : null;
    }
  }

  return null;
}

/**
 * Parser murni baris Market Watch MetaTrader. Bekerja pada teks mentah
 * (struktur baris dipertahankan) dan HANYA memakai baris yang memuat
 * simbol aktif. Dua angka pertama setelah simbol = Bid/Ask.
 *
 * Strategi kandidat per baris:
 * 1. token angka titik desimal,
 * 2. token angka koma desimal,
 * 3. angka besar tanpa separator -> normalisasi via profil,
 * 4. Bid < Ask, skala profil, spread masuk akal.
 */
export function parseMarketWatchBidAsk(
  rawText: string,
  activeSymbol: string
): MarketWatchQuote {
  const active = normalizeWatchToken(activeSymbol);

  if (!active) {
    const out: MarketWatchQuote = {
      bid: null,
      ask: null,
      source: "unknown",
      candidateLines: [],
      debug: { ...emptyDebug(), rejectionReason: "no-active-symbol" },
      warnings: ["Simbol aktif belum dipilih; baris Market Watch diabaikan."],
    };
    traceOcrStage("market-watch", {
      activeSymbol: active,
      rejectionReason: out.debug.rejectionReason,
      warnings: out.warnings,
    });
    return out;
  }

  const profile = getInstrumentProfile(active);
  const lines = splitWatchLines(rawText);
  const seenLines: string[] = [];
  let symbolSeen = false;

  const withMeta = (
    result: Omit<MarketWatchQuote, "candidateLines" | "debug">,
    debug: MarketWatchDebug
  ): MarketWatchQuote => ({
    ...result,
    candidateLines: seenLines.slice(0, 10),
    debug,
  });

  const emit = (result: MarketWatchQuote): MarketWatchQuote => {
    traceOcrStage("market-watch", {
      activeSymbol: active,
      candidateTokens: result.debug.candidateTokens,
      normalizedCandidates: result.debug.normalizedCandidates,
      rejectedCandidates: result.debug.rejectedCandidates,
      chosenBid: result.debug.chosenBid,
      chosenAsk: result.debug.chosenAsk,
      rejectionReason: result.debug.rejectionReason,
      marketWatchCandidateLines: result.candidateLines,
      chosenMarketWatchLine: result.matchedLine,
    });
    return result;
  };

  // Pecahan hasil split desimal OCR ("83" sampai "32200"). Batas 5 digit
  // + syarat hasil gabungan se-skala melindungi pasangan integer utuh:
  // "30582"+"30585" menghasilkan "30582.30585" (di luar skala) sehingga
  // ditolak dan kedua angka dipakai apa adanya.
  const isFracToken = (token: string): boolean => /^\d{1,5}$/.test(token);

  for (const line of lines) {
    const tokens = line.split(" ").filter(Boolean);
    const symbolIndex = tokens.findIndex((token) =>
      isSameWatchSymbol(normalizeWatchToken(token), active)
    );

    if (symbolIndex < 0) continue;
    symbolSeen = true;
    seenLines.push(line);

    const after = tokens.slice(symbolIndex + 1);
    const debug: MarketWatchDebug = {
      ...emptyDebug(),
      candidateTokens: after.slice(0, 8),
    };

    const candidates: number[] = [];
    for (let i = 0; i < after.length; i++) {
      const clean = after[i].replace(/%$/, "");

      if (/^\d+$/.test(clean)) {
        // Integer murni: PRIORITAS gabung dengan pecahan berikut
        // ("30573"+"83" -> 30573.83) bila hasilnya se-skala, karena feed
        // desimal tidak menampilkan harga integer utuh. Gabungan yang
        // tidak se-skala ditolak (tidak ditebak).
        const nextClean = after[i + 1]?.replace(/%$/, "");
        if (nextClean !== undefined && isFracToken(nextClean)) {
          const joined = normalizeOcrPriceToken(`${clean}.${nextClean}`);
          if (
            joined !== null &&
            joined >= profile.minPrice &&
            joined <= profile.maxPrice
          ) {
            candidates.push(joined);
            i++;
            continue;
          }
          debug.rejectedCandidates.push(`${clean}+${nextClean}`);
        }
        const plain = normalizeOcrPriceToken(clean);
        if (
          plain !== null &&
          plain >= profile.minPrice &&
          plain <= profile.maxPrice
        ) {
          candidates.push(plain);
          continue;
        }
        // Di luar skala: normalisasi digit profil, terakhir bukti mismatch.
        const big = normalizeBigOcrNumber(clean, active);
        if (big !== null) {
          candidates.push(big);
          continue;
        }
        if (plain !== null) candidates.push(plain);
        continue;
      }

      const plain = normalizeOcrPriceToken(clean);

      if (plain !== null) {
        // Token desimal/koma utuh: dipakai apa adanya (atau sebagai
        // bukti mismatch). TIDAK digabung ulang agar "30582.83" tidak
        // pernah menjadi "30582.8383".
        candidates.push(plain);
        continue;
      }

      // Token sampah (label/kolom/header) diabaikan tetapi dicatat.
      debug.rejectedCandidates.push(after[i]);
    }

    debug.normalizedCandidates = [...candidates];

    if (candidates.length < 2) {
      debug.rejectionReason = "insufficient-numbers";
      continue;
    }

    const [bid, ask] = candidates;

    // Token non-positif berarti baris kotor; baris simbol lain mungkin benar.
    if (!(bid > 0) || !(ask > 0)) {
      debug.rejectionReason = "non-positive";
      continue;
    }

    const checked = validateWatchPair(bid, ask, active, line);

    if (checked) {
      return emit(
        withMeta(checked, {
          ...debug,
          chosenBid: checked.bid,
          chosenAsk: checked.ask,
          rejectionReason:
            checked.bid === null ? checked.warnings[0] ?? "rejected" : null,
        })
      );
    }

    return emit(
      withMeta(
        {
          bid: null,
          ask: null,
          matchedLine: line,
          source: "market-watch",
          warnings: [
            `Baris Market Watch ${active} tidak menghasilkan Bid/Ask valid; Bid/Ask tidak diisi.`,
          ],
        },
        { ...debug, rejectionReason: "invalid-pair" }
      )
    );
  }

  // Fallback One-Click Trading (SELL/BUY) HANYA bila tidak ada satu pun
  // baris simbol aktif terlihat. Jika baris US100 ada tetapi tak terbaca,
  // tombol SELL/BUY tidak boleh dipakai (bisa milik konteks lain).
  if (!symbolSeen) {
    const oneClick = parseOneClickBidAsk(lines, active);
    if (oneClick) {
      return emit({
        ...withMeta(oneClick, {
          ...emptyDebug(),
          candidateTokens: oneClick.matchedLine?.split(" ") ?? [],
          chosenBid: oneClick.bid,
          chosenAsk: oneClick.ask,
        }),
        candidateLines: oneClick.matchedLine ? [oneClick.matchedLine] : [],
      });
    }
  }

  return emit(
    withMeta(
      {
        bid: null,
        ask: null,
        source: "unknown",
        warnings: [
          symbolSeen
            ? `Baris Market Watch ${active} tidak memuat dua harga valid; Bid/Ask tidak diisi.`
            : `Baris ${active} tidak terlihat pada teks OCR. Bid/Ask tidak dapat dipastikan.`,
        ],
      },
      { ...emptyDebug(), rejectionReason: symbolSeen ? "no-valid-pair" : "no-symbol-line" }
    )
  );
}
