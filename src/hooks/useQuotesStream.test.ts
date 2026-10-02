// Tahap SSE-fix: test runtime kontrak envelope + wiring useQuotesStream.
// - Nomor 318-329 menggantikan test lama yang hanya `pass = true`.
// - Semua test mengeksekusi guard/parser/wiring asli (bukan import-check).
// - Lingkungan node tanpa DOM: EventSource di-mock minimal (onopen,
//   onmessage, onerror, close) dan dijalankan lewat attachQuotesStream.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  attachQuotesStream,
  handleQuoteSseMessage,
  type MinimalQuotesEventSource,
  type QuotesStreamCallbacks,
} from "./useQuotesStream";
import {
  extractQuoteFromEnvelope,
  extractQuoteFromRestPayload,
  isQuoteSnapshot,
  parseQuoteSseEnvelope,
  type QuoteSnapshot,
  type QuoteSseEnvelope,
} from "../../server/types/quotes";

/** Jumlah test suite ini (satu sumber kebenaran untuk harness). */
export const QUOTES_STREAM_TEST_COUNT = 12;

function makeQuote(
  symbol: string,
  bid: number,
  ask: number,
  timestamp = "2026.10.02 14:45:05",
): QuoteSnapshot {
  return { timestamp, symbol, bid, ask };
}

function readRepoFile(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

/** Mock EventSource minimal: catat handler + status close. */
class MockQuotesEventSource implements MinimalQuotesEventSource {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  close(): void {
    this.closed = true;
  }
  emitOpen(): void {
    this.onopen?.();
  }
  emitMessage(data: string): void {
    this.onmessage?.({ data });
  }
  emitError(): void {
    this.onerror?.();
  }
}

interface RecordedStream {
  quotes: QuoteSnapshot[];
  malformed: string[];
  opened: number;
  transportErrors: number;
}

function attachRecording(
  source: MockQuotesEventSource,
  expectedSymbol: string,
): { detach: () => void; rec: RecordedStream } {
  const rec: RecordedStream = {
    quotes: [],
    malformed: [],
    opened: 0,
    transportErrors: 0,
  };
  const callbacks: QuotesStreamCallbacks = {
    expectedSymbol,
    onQuote: (quote) => {
      rec.quotes.push(quote);
    },
    onMalformed: (message) => {
      rec.malformed.push(message);
    },
    onOpen: () => {
      rec.opened += 1;
    },
    onTransportError: () => {
      rec.transportErrors += 1;
    },
  };
  const detach = attachQuotesStream(source, callbacks);
  return { detach, rec };
}

export async function runQuotesStreamTests(): Promise<boolean> {
  let passCount = 0;
  let testNum = 318;

  function check(name: string, fn: () => void): void {
    try {
      fn();
      passCount += 1;
      console.log(`ok - ${testNum++}. ${name}`);
    } catch (error) {
      console.log(
        `not ok - ${testNum++}. ${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
  }

  // 318: envelope init berisi array dapat di-unpack (ambil TERAKHIR yang cocok).
  check("SSE init array di-unpack ke quote terbaru", () => {
    const source = new MockQuotesEventSource();
    const { rec } = attachRecording(source, "AUDCAD_ORB");
    source.emitOpen();
    const envelope: QuoteSseEnvelope = {
      type: "init",
      data: [
        makeQuote("AUDCAD_ORB", 0.98964, 0.98986, "2026.10.02 14:45:05"),
        makeQuote("GBPUSD_ORB", 1.2715, 1.2716, "2026.10.02 14:45:06"),
        makeQuote("AUDCAD_ORB", 0.9896, 0.98982, "2026.10.02 14:45:07"),
      ],
    };
    source.emitMessage(JSON.stringify(envelope));
    assert(rec.opened === 1, `open=${rec.opened}`);
    assert(rec.quotes.length === 1, `quotes=${rec.quotes.length}`);
    assert(rec.quotes[0].bid === 0.9896, `bid=${rec.quotes[0].bid}`);
    assert(rec.malformed.length === 0, "init valid dianggap malformed");
  });

  // 319: envelope update berisi satu quote dapat di-unpack.
  check("SSE update satu quote di-unpack", () => {
    const source = new MockQuotesEventSource();
    const { rec } = attachRecording(source, "GBPUSD_ORB");
    const envelope: QuoteSseEnvelope = {
      type: "update",
      data: makeQuote("GBPUSD_ORB", 1.2715, 1.2716),
    };
    source.emitMessage(JSON.stringify(envelope));
    assert(rec.quotes.length === 1, `quotes=${rec.quotes.length}`);
    assert(rec.quotes[0].ask === 1.2716, `ask=${rec.quotes[0].ask}`);
    assert(rec.malformed.length === 0, "update valid dianggap malformed");
  });

  // 320: event malformed ditolak tanpa crash (JSON rusak, type asing,
  // init bukan array, update tanpa quote valid).
  check("event malformed ditolak tanpa crash", () => {
    const source = new MockQuotesEventSource();
    const { rec } = attachRecording(source, "AUDCAD_ORB");
    const badPayloads = [
      "bukan-json{{{",
      JSON.stringify({ type: "ping", data: [] }),
      JSON.stringify({ type: "init", data: "bukan-array" }),
      JSON.stringify({ type: "init" }),
      JSON.stringify({
        type: "update",
        data: { symbol: "AUDCAD_ORB", bid: 1, ask: 2 },
      }),
      JSON.stringify({ hello: "world" }),
      "null",
      "42",
    ];
    for (const payload of badPayloads) {
      source.emitMessage(payload);
    }
    assert(rec.quotes.length === 0, `quotes bocor=${rec.quotes.length}`);
    assert(
      rec.malformed.length === badPayloads.length,
      `malformed=${rec.malformed.length}, harus ${badPayloads.length}`,
    );
  });

  // 321: quote simbol berbeda diabaikan (termasuk GBPUSD vs GBPUSD_ORB
  // dua arah: OTB tidak tercampur Finex).
  check("simbol berbeda diabaikan, OTB/Finex tidak tercampur", () => {
    const source = new MockQuotesEventSource();
    const { rec } = attachRecording(source, "GBPUSD_ORB");
    source.emitMessage(
      JSON.stringify({
        type: "update",
        data: makeQuote("GBPUSD", 1.2715, 1.2716),
      }),
    );
    source.emitMessage(
      JSON.stringify({
        type: "init",
        data: [makeQuote("AUDCAD_ORB", 0.9896, 0.98982)],
      }),
    );
    assert(rec.quotes.length === 0, `quotes bocor=${rec.quotes.length}`);
    assert(rec.malformed.length === 0, "abaikan simbol bukan malformed");
    // Arah sebaliknya: feed OTB tidak masuk state Finex.
    const finex = new MockQuotesEventSource();
    const finexRec = attachRecording(finex, "GBPUSD");
    finex.emitMessage(
      JSON.stringify({
        type: "update",
        data: makeQuote("GBPUSD_ORB", 1.2715, 1.2716),
      }),
    );
    assert(
      finexRec.rec.quotes.length === 0,
      "quote _ORB bocor ke simbol Finex",
    );
  });

  // 322: bid/ask invalid ditolak (0, negatif, ask<=bid, non-number);
  // bid/ask kosong tidak menyebabkan crash.
  check("bid/ask invalid ditolak, kosong tidak crash", () => {
    assert(!isQuoteSnapshot(makeQuote("X", 0, 1)), "bid 0 lolos");
    assert(!isQuoteSnapshot(makeQuote("X", -1, 1)), "bid negatif lolos");
    assert(!isQuoteSnapshot(makeQuote("X", 1.5, 1.5)), "ask==bid lolos");
    assert(!isQuoteSnapshot(makeQuote("X", 2, 1)), "ask<bid lolos");
    assert(
      !isQuoteSnapshot({ symbol: "X", bid: "1.5", ask: 2, timestamp: "t" }),
      "bid string lolos",
    );
    assert(
      !isQuoteSnapshot({ symbol: "X", bid: NaN, ask: 2, timestamp: "t" }),
      "bid NaN lolos",
    );
    assert(isQuoteSnapshot(makeQuote("X", 1.5, 1.6)), "quote valid ditolak");
    const outcome = handleQuoteSseMessage(
      JSON.stringify({
        type: "update",
        data: { symbol: "X", bid: 0, ask: 0, timestamp: "t" },
      }),
      "X",
    );
    assert(outcome.kind === "malformed", `kind=${outcome.kind}`);
  });

  // 323: polling REST mengambil TERAKHIR yang cocok (bukan pertama).
  check("REST payload di-unpack ke quote terakhir", () => {
    const payload = {
      data: [
        makeQuote("AUDCAD_ORB", 0.98964, 0.98986, "2026.10.02 14:45:05"),
        makeQuote("AUDCAD_ORB", 0.9896, 0.98982, "2026.10.02 14:45:07"),
      ],
      symbol: "AUDCAD_ORB",
      count: 2,
      timestamp: "2026-10-02T00:00:00.000Z",
    };
    const latest = extractQuoteFromRestPayload(payload, "AUDCAD_ORB");
    assert(latest !== null, "payload valid null");
    assert(latest?.bid === 0.9896, `bid=${latest?.bid}, harus terakhir`);
    assert(
      extractQuoteFromRestPayload({ data: [] }, "AUDCAD_ORB") === null,
      "array kosong harus null",
    );
    assert(
      extractQuoteFromRestPayload({ nope: 1 }, "AUDCAD_ORB") === null,
      "payload malformed harus null",
    );
    assert(
      extractQuoteFromRestPayload(payload, "GBPUSD_ORB") === null,
      "simbol beda harus null",
    );
  });

  // 324: parse envelope init kosong + update beda simbol (empty state).
  check("init kosong dan update beda simbol = ignored", () => {
    assert(
      parseQuoteSseEnvelope({ type: "init", data: [] }) !== null,
      "init kosong harus envelope valid",
    );
    const empty: QuoteSseEnvelope = { type: "init", data: [] };
    assert(
      extractQuoteFromEnvelope(empty, "AUDCAD_ORB") === null,
      "init kosong harus null",
    );
    const outcome = handleQuoteSseMessage(
      JSON.stringify(empty),
      "AUDCAD_ORB",
    );
    assert(outcome.kind === "ignored", `kind=${outcome.kind}`);
  });

  // 325: cleanup menutup EventSource dan melepas handler.
  check("cleanup menutup source dan melepas handler", () => {
    const source = new MockQuotesEventSource();
    const { detach, rec } = attachRecording(source, "AUDCAD_ORB");
    source.emitMessage(
      JSON.stringify({
        type: "update",
        data: makeQuote("AUDCAD_ORB", 1, 2),
      }),
    );
    assert(rec.quotes.length === 1, "setup quote gagal");
    detach();
    assert(source.closed, "close tidak dipanggil saat cleanup");
    assert(
      source.onopen === null &&
        source.onmessage === null &&
        source.onerror === null,
      "handler tidak dilepas saat cleanup",
    );
    source.emitMessage(
      JSON.stringify({
        type: "update",
        data: makeQuote("AUDCAD_ORB", 3, 4),
      }),
    );
    assert(rec.quotes.length === 1, "event masuk setelah cleanup");
  });

  // 326: transport error diteruskan (hook: fallback polling + tanpa
  // reconnect storm EventSource karena source ditutup saat error).
  check("transport error diteruskan ke fallback", () => {
    const source = new MockQuotesEventSource();
    const { rec } = attachRecording(source, "AUDCAD_ORB");
    source.emitError();
    assert(rec.transportErrors === 1, "transport error hilang");
    assert(rec.quotes.length === 0, "error memicu quote fiktif");
    const hook = readRepoFile("src/hooks/useQuotesStream.ts");
    assert(
      hook.includes("startPolling()"),
      "fallback polling hilang di onerror",
    );
    assert(
      hook.includes("if (pollRef.current !== null) return;"),
      "guard polling ganda hilang (risiko polling berlipat)",
    );
  });

  // 327: hook unwrap envelope (tanpa cast langsung), cek simbol,
  // cleanup close, dan encode simbol di URL.
  check("hook unwrap envelope + guard wiring", () => {
    const hook = readRepoFile("src/hooks/useQuotesStream.ts");
    assert(
      !hook.includes("as QuoteSnapshot"),
      "cast langsung JSON->QuoteSnapshot masih ada",
    );
    assert(
      hook.includes("handleQuoteSseMessage") &&
        hook.includes("extractQuoteFromRestPayload"),
      "hook tidak memakai helper envelope",
    );
    assert(
      hook.includes("expectedSymbol: symbol"),
      "cek simbol tidak diteruskan ke wiring",
    );
    assert(hook.includes("detach()"), "cleanup detach hilang");
    assert(
      hook.includes("encodeURIComponent(symbol)"),
      "simbol URL tidak di-encode",
    );
  });

  // 328: kontrak server = kontrak frontend; LiveQuotes display-only.
  check("kontrak server selaras + LiveQuotes display-only", () => {
    const route = readRepoFile("server/routes/quotesRoutes.ts");
    assert(
      route.includes("QuoteSseEnvelope"),
      "route tidak memakai tipe envelope tunggal",
    );
    assert(
      route.includes('"init"') && route.includes('"update"'),
      "event init/update hilang di server",
    );
    const panel = readRepoFile("src/components/analysis/LiveQuotes.tsx");
    assert(panel.includes("useQuotesStream"), "hook tak dipakai panel");
    assert(
      !panel.includes("setMarket") &&
        !panel.includes("marketReset") &&
        !panel.includes("onChange"),
      "LiveQuotes menulis market (bukan display-only)",
    );
  });

  // 329: regresi meta — tidak ada assignment `pass = true` di suite
  // ini (pola assertion palsu). Baris yang memuat kata "includes"
  // dikecualikan agar pemeriksa tidak memeriksa dirinya sendiri.
  check("suite ini bebas assertion palsu", () => {
    const self = readRepoFile("src/hooks/useQuotesStream.test.ts");
    const bad = self
      .split("\n")
      .filter(
        (line) =>
          /pass\s*=\s*true/.test(line) &&
          !line.includes("includes") &&
          !line.trim().startsWith("//"),
      );
    assert(
      bad.length === 0,
      `pola palsu masih ada (${bad.length} baris): ${bad[0]?.trim() ?? ""}`,
    );
    assert(
      self.includes("QUOTES_STREAM_TEST_COUNT"),
      "konstanta jumlah test hilang",
    );
  });

  console.log(
    `\nStream suite: ${passCount} lolos dari ${QUOTES_STREAM_TEST_COUNT}.`,
  );
  return passCount === QUOTES_STREAM_TEST_COUNT;
}
