import { useEffect, useRef, useState } from "react";
import {
  extractQuoteFromEnvelope,
  extractQuoteFromRestPayload,
  parseQuoteSseEnvelope,
  type QuoteSnapshot,
} from "../../server/types/quotes";

const QUOTES_BASE_URL = "http://localhost:3000";

export interface QuotesStreamState {
  readonly quote: QuoteSnapshot | null;
  readonly isConnected: boolean;
  readonly error: string | null;
}

export type QuotesSseOutcome =
  | { readonly kind: "quote"; readonly quote: QuoteSnapshot }
  | { readonly kind: "ignored" }
  | { readonly kind: "malformed" };

/**
 * Terjemahkan satu payload SSE mentah (`event.data`) menjadi hasil.
 * - "quote": envelope valid + simbol cocok -> simpan ke state.
 * - "ignored": envelope valid tapi tidak ada quote untuk simbol ini
 *   (simbol beda / init kosong) -> diam, tanpa error, tanpa crash.
 * - "malformed": JSON rusak atau bentuk envelope tak dikenal ->
 *   tampilkan error, tanpa crash.
 * Murni (tanpa DOM/React) sehingga dapat diuji runtime di node.
 */
export function handleQuoteSseMessage(
  rawData: string,
  expectedSymbol: string,
): QuotesSseOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData) as unknown;
  } catch {
    return { kind: "malformed" };
  }
  const envelope = parseQuoteSseEnvelope(parsed);
  if (envelope === null) return { kind: "malformed" };
  const quote = extractQuoteFromEnvelope(envelope, expectedSymbol);
  if (quote === null) return { kind: "ignored" };
  return { kind: "quote", quote };
}

/** Bentuk minimal EventSource yang dipakai hook (dapat di-mock di test). */
export interface MinimalQuotesEventSource {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export interface QuotesStreamCallbacks {
  readonly expectedSymbol: string;
  readonly onQuote: (quote: QuoteSnapshot) => void;
  readonly onMalformed: (message: string) => void;
  readonly onOpen: () => void;
  readonly onTransportError: () => void;
}

/**
 * Pasang handler SSE pada source dan kembalikan fungsi cleanup.
 * Logika pesan 100% lewat handleQuoteSseMessage (teruji runtime);
 * fungsi ini hanya wiring + cleanup (close + lepas handler).
 */
export function attachQuotesStream(
  source: MinimalQuotesEventSource,
  callbacks: QuotesStreamCallbacks,
): () => void {
  source.onopen = () => {
    callbacks.onOpen();
  };
  source.onmessage = (event: { data: string }) => {
    const outcome = handleQuoteSseMessage(
      event.data,
      callbacks.expectedSymbol,
    );
    if (outcome.kind === "quote") {
      callbacks.onQuote(outcome.quote);
    } else if (outcome.kind === "malformed") {
      callbacks.onMalformed("Format SSE quotes tidak dikenal.");
    }
    // "ignored" -> diam (simbol lain / init kosong bukan error).
  };
  source.onerror = () => {
    callbacks.onTransportError();
  };
  return () => {
    source.onopen = null;
    source.onmessage = null;
    source.onerror = null;
    source.close();
  };
}

export function useQuotesStream(symbol: string, pollIntervalMs = 5000): QuotesStreamState {
  const [quote, setQuote] = useState<QuoteSnapshot | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchLatest = async (): Promise<void> => {
      try {
        const res = await fetch(
          `${QUOTES_BASE_URL}/api/quotes/${encodeURIComponent(symbol)}`,
        );
        if (!res.ok) throw new Error(`Backend HTTP ${res.status}`);
        const payload: unknown = (await res.json()) as unknown;
        const latest = extractQuoteFromRestPayload(payload, symbol);
        if (!cancelled && latest !== null) {
          setQuote(latest);
          setIsConnected(true);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setIsConnected(false);
          setError(err instanceof Error ? err.message : "Gagal fetch quotes");
        }
      }
    };

    const startPolling = (): void => {
      if (pollRef.current !== null) return;
      pollRef.current = window.setInterval(() => {
        void fetchLatest();
      }, pollIntervalMs);
    };

    let detach: (() => void) | null = null;
    try {
      // Satu-satunya cast di modul: batas konstruksi DOM EventSource ke
      // interface minimal yang dapat di-mock. Jalur DATA tidak memakai
      // cast apa pun (validasi via guard murni).
      const source = new EventSource(
        `${QUOTES_BASE_URL}/api/quotes/${encodeURIComponent(symbol)}/stream`,
      ) as unknown as MinimalQuotesEventSource;
      detach = attachQuotesStream(source, {
        expectedSymbol: symbol,
        onQuote: (next) => {
          if (!cancelled) {
            setQuote(next);
            setIsConnected(true);
            setError(null);
          }
        },
        onMalformed: (message) => {
          if (!cancelled) setError(message);
        },
        onOpen: () => {
          if (!cancelled) {
            setIsConnected(true);
            setError(null);
          }
        },
        onTransportError: () => {
          // Tutup SSE yang rusak (tanpa reconnect storm EventSource),
          // lalu fallback ke polling tunggal via guard startPolling.
          if (detach !== null) {
            detach();
            detach = null;
          }
          if (!cancelled) {
            setIsConnected(false);
            void fetchLatest();
            startPolling();
          }
        },
      });
    } catch {
      void fetchLatest();
      startPolling();
    }

    return () => {
      cancelled = true;
      if (detach !== null) {
        detach();
        detach = null;
      }
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [symbol, pollIntervalMs]);

  return { quote, isConnected, error };
}
