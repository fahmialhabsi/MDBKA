# Tahap 03 — Shadow Hasil analisa (S1, S2, S3)

**Fase:** 0. **Tampilan dan keputusan Hasil analisa tidak berubah sedikit pun** (aturan mutlak 1). **Nomor test:** 700–703. **Target akhir:** 699 lolos, 0 gagal.
**Izin khusus (Fahmi, 13 Okt 2026):** boleh menambah **tepat 2 baris + 1 komentar** di `src/App.tsx` sesuai S3 di bawah. Selain itu `src/App.tsx` tetap terlarang.
**Cara kerja tahap ini: SALIN-TEMPEL.** Semua kode di bawah sudah diuji Claude (699 lolos, `tsc -b`, `tsconfig.server.json`, eslint, vite build bersih). **Jangan mengubah, merapikan, atau "memperbaiki" kode ini.** Bila ada yang tidak cocok dengan berkas di repo, berhenti dan tulis di laporan.

Rancangan: `docs/RANCANGAN-2026-10-13-fondasi-data-dan-jalur-live.md` bagian A8 (S1–S3).

**Apa yang dibuat:** App mengirim ringkasan Hasil analisa (BELI/JUAL saja) ke server. Server menilai penjaga sesi dengan data sesinya sendiri. Bila hasilnya "seharusnya TUNGGU", server menulis satu baris `keputusan` jalur `hasil-shadow` ke `data/keputusan/keputusan-<broker>-<YYYY-MM>.jsonl`, maksimal sekali per simbol per candle H1.

Urutan: Langkah 1 → 7.

---

## Langkah 1 — Ubah `src/lib/jsonlRecord.ts` (2 penggantian teks)

Cari:
```ts
  readonly jalur: "pemindai" | "hasil" | "entry" | "backtest";
```
Ganti dengan:
```ts
  readonly jalur: "pemindai" | "hasil" | "hasil-shadow" | "entry" | "backtest";
```

Cari:
```ts
  readonly sumber: "live" | "csv" | "ocr" | "manual";
```
Ganti dengan:
```ts
  readonly sumber: "live" | "csv" | "ocr" | "manual" | null;
```

## Langkah 2 — Berkas baru `src/lib/resultShadow.ts` (isi persis)

````ts
/** S1 (13 Okt 2026) — shadow Hasil analisa (A7-2, fondasi A8). Murni; hanya membaca, tidak pernah mengubah hasil yang tampil. */
import type { AnalysisResult, Decision } from "../types/analysis";
import type { BrokerId } from "../types/broker";
import type { KeputusanRecord } from "./jsonlRecord";
import { riskGroupOf } from "./riskGroup";
import { findSessionHold, type TradeSession } from "./sessionGuard";

/** Bagian hasil terlihat yang dibaca shadow (dikirim App ke server). */
export interface ShownSummary {
  readonly decision: Decision;
  readonly entry: number | null;
  readonly stopLoss: number | null;
  readonly takeProfit: number | null;
  readonly suggestedLot: number | null;
  readonly costShareOfRisk: number | null;
}

export interface ResultShadow {
  readonly shownDecision: Decision;
  readonly shadowDecision: Decision;
  readonly differs: boolean;
  readonly shadowCode: "DITAHAN_SESI" | null;
  readonly shadowReason: string | null;
  readonly closesInMin: number | null;
}

const SERVER_TIME = /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/;

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Salinan ringkas hasil terlihat; tidak menyimpan referensi ke objek aslinya. */
export function summarizeShown(shown: Readonly<AnalysisResult>): ShownSummary {
  return {
    decision: shown.decision,
    entry: finiteOrNull(shown.entry),
    stopLoss: finiteOrNull(shown.stopLoss),
    takeProfit: finiteOrNull(shown.takeProfit),
    suggestedLot: finiteOrNull(shown.suggestedLot),
    costShareOfRisk: finiteOrNull(shown.costShareOfRisk),
  };
}

/**
 * Penjaga sesi yang sama dengan pemindai, dinilai di atas hasil terlihat.
 * null = tidak bisa dinilai (jam server tidak sah / data sesi kosong) → tidak dicatat.
 */
export function computeResultShadow(
  shown: ShownSummary,
  symbol: string,
  serverNow: string | null,
  sessions: readonly TradeSession[] | null,
): ResultShadow | null {
  if (serverNow === null || !SERVER_TIME.test(serverNow)) return null;
  if (sessions === null || sessions.length === 0) return null;
  if (shown.decision !== "BELI" && shown.decision !== "JUAL") {
    return { shownDecision: shown.decision, shadowDecision: shown.decision, differs: false, shadowCode: null, shadowReason: null, closesInMin: null };
  }
  const hold = findSessionHold(symbol, serverNow, sessions);
  if (hold === null) {
    return { shownDecision: shown.decision, shadowDecision: shown.decision, differs: false, shadowCode: null, shadowReason: null, closesInMin: null };
  }
  return {
    shownDecision: shown.decision,
    shadowDecision: "TUNGGU",
    differs: true,
    shadowCode: "DITAHAN_SESI",
    shadowReason: hold.reason,
    closesInMin: hold.closesInMin,
  };
}

/** Maksimal sekali per broker + simbol + candle H1 (jam server "YYYY.MM.DD HH"). */
export function shadowDedupKey(broker: BrokerId, symbol: string, serverNow: string): string {
  return `${broker}|${symbol}|${serverNow.slice(0, 13)}`;
}

export interface ShadowRecordMeta {
  readonly keputusanId: string;
  readonly waktuUtc: string;
  readonly broker: BrokerId;
  readonly symbol: string;
  readonly serverNow: string;
}

/** Baris `keputusan` jalur "hasil-shadow"; nilai yang tidak diketahui = null. */
export function buildShadowRecord(meta: ShadowRecordMeta, shown: ShownSummary, shadow: ResultShadow): KeputusanRecord {
  return {
    skema: "keputusan/1",
    keputusanId: meta.keputusanId,
    jalur: "hasil-shadow",
    waktuUtc: meta.waktuUtc,
    waktuServer: meta.serverNow,
    waktuDiterima: meta.waktuUtc,
    broker: meta.broker,
    login: null,
    jenisAkun: "tidak-terbukti",
    setaraLive: null,
    simbol: meta.symbol,
    golongan: riskGroupOf(meta.symbol).id,
    versiSpesifikasi: null,
    aturanId: "skor",
    versi: "1",
    sidikJariSnapshot: null,
    masukan: {
      bid: null, ask: null, umurKuotasiDetik: null, candleTerakhir: null, jumlahCandle: null,
      ma50: null, rsi: null, cci: null, macd: null, atr: null, kursUsdIdr: null, tanggalKurs: null, equity: null,
    },
    kualitasData: [],
    penjaga: [
      {
        nama: "sesi",
        hasil: shadow.shadowCode === null ? "LULUS" : "GAGAL",
        kodeAlasan: shadow.shadowCode,
        sumberData: "MDBKA_Sessions",
        umurDataDetik: null,
      },
    ],
    hasil: {
      status: shadow.shadowCode,
      keputusan: shadow.shadowDecision,
      arahAsli: shown.decision,
      entry: shown.entry,
      sl: shown.stopLoss,
      tp: shown.takeProfit,
      lot: shown.suggestedLot,
      risikoUsd: null,
      risikoRp: null,
      porsiBiaya: shown.costShareOfRisk,
      kodeAlasanUtama: shadow.shadowCode,
    },
    sumber: null,
    diubahManual: [],
    mengoreksi: null,
  };
}
````

## Langkah 3 — Berkas baru `server/routes/keputusanRoutes.ts` (isi persis)

````ts
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Router, type Request, type Response } from "express";
import { jsonlRelativePath } from "../../src/lib/jsonlRecord";
import {
  buildShadowRecord,
  computeResultShadow,
  shadowDedupKey,
  type ShownSummary,
} from "../../src/lib/resultShadow";
import type { TradeSession } from "../../src/lib/sessionGuard";
import type { BrokerId } from "../../src/types/broker";
import { appendJsonlRecord } from "../services/jsonlStore";
import { readSessionsForBroker } from "../services/sessionReader";
import { resolveCommonFilesDir } from "./marginRoutes";

/**
 * S2 (13 Okt 2026) — POST /api/keputusan/shadow (fondasi A8).
 * App mengirim ringkasan Hasil analisa yang tampil; server menilai penjaga
 * sesi dengan data sesinya sendiri dan mencatat ke data/keputusan/ HANYA
 * bila keputusan shadow berbeda, maksimal sekali per simbol per candle H1.
 * Tidak pernah mengubah apa pun yang tampil.
 */
export interface ShadowDeps {
  readonly dataDir: string;
  readonly getSessions: (broker: BrokerId) => readonly TradeSession[] | null;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly seen: Set<string>;
}

export interface ShadowReply {
  readonly status: number;
  readonly body: { readonly recorded: boolean; readonly reason: string };
}

const BROKERS: readonly BrokerId[] = ["finex", "orbitraderberjangka", "mifx", "exness"];
const SERVER_TIME = /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/;

function numOrNull(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseShown(value: unknown): ShownSummary | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.decision !== "BELI" && v.decision !== "JUAL" && v.decision !== "TUNGGU") return null;
  const entry = numOrNull(v.entry);
  const stopLoss = numOrNull(v.stopLoss);
  const takeProfit = numOrNull(v.takeProfit);
  const suggestedLot = numOrNull(v.suggestedLot);
  const costShareOfRisk = numOrNull(v.costShareOfRisk);
  if (entry === undefined || stopLoss === undefined || takeProfit === undefined || suggestedLot === undefined || costShareOfRisk === undefined) {
    return null;
  }
  return { decision: v.decision, entry, stopLoss, takeProfit, suggestedLot, costShareOfRisk };
}

export function handleShadowRequest(body: unknown, deps: ShadowDeps): ShadowReply {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { status: 400, body: { recorded: false, reason: "body harus objek" } };
  }
  const b = body as Record<string, unknown>;
  const broker = BROKERS.find((x) => x === b.broker);
  if (broker === undefined) return { status: 400, body: { recorded: false, reason: "broker wajib diisi" } };
  if (typeof b.symbol !== "string" || !/^[A-Za-z0-9._#-]{1,32}$/.test(b.symbol)) {
    return { status: 400, body: { recorded: false, reason: "simbol tidak sah" } };
  }
  if (typeof b.serverNow !== "string" || !SERVER_TIME.test(b.serverNow)) {
    return { status: 400, body: { recorded: false, reason: "jam server tidak sah" } };
  }
  const shown = parseShown(b.shown);
  if (shown === null) return { status: 400, body: { recorded: false, reason: "ringkasan hasil tidak sah" } };

  const shadow = computeResultShadow(shown, b.symbol, b.serverNow, deps.getSessions(broker));
  if (shadow === null) return { status: 200, body: { recorded: false, reason: "data sesi tidak ada" } };
  if (!shadow.differs) return { status: 200, body: { recorded: false, reason: "sama dengan hasil terlihat" } };
  const key = shadowDedupKey(broker, b.symbol, b.serverNow);
  if (deps.seen.has(key)) return { status: 200, body: { recorded: false, reason: "sudah dicatat untuk candle ini" } };

  const waktuUtc = deps.now().toISOString().slice(0, 19) + "Z";
  const record = buildShadowRecord(
    { keputusanId: deps.newId(), waktuUtc, broker, symbol: b.symbol, serverNow: b.serverNow },
    shown,
    shadow,
  );
  appendJsonlRecord(deps.dataDir, jsonlRelativePath("keputusan", broker, waktuUtc), record);
  deps.seen.add(key);
  return { status: 200, body: { recorded: true, reason: shadow.shadowCode ?? "berbeda" } };
}

export function createKeputusanRoutes(
  dataDir: string = join(process.cwd(), "data"),
  commonDir: string = resolveCommonFilesDir(),
): Router {
  const router = Router();
  const seen = new Set<string>();
  router.post("/shadow", (req: Request, res: Response) => {
    try {
      const reply = handleShadowRequest(req.body, {
        dataDir,
        getSessions: (broker) => readSessionsForBroker(commonDir, broker)?.sessions ?? null,
        now: () => new Date(),
        newId: () => randomUUID(),
        seen,
      });
      res.status(reply.status).json(reply.body);
    } catch (error) {
      // Gagal mencatat tidak boleh mengganggu apa pun; laporkan jujur.
      res.status(500).json({ recorded: false, reason: error instanceof Error ? error.message : String(error) });
    }
  });
  return router;
}
````

## Langkah 4 — Ubah `server/app.ts` (2 sisipan)

Tepat **di bawah** baris:
```ts
import { createSessionRoutes } from "./routes/sessionRoutes";
```
tambahkan:
```ts
import { createKeputusanRoutes } from "./routes/keputusanRoutes";
```

Tepat **di bawah** baris:
```ts
  app.use("/api/sessions", createSessionRoutes());
```
tambahkan:
```ts
  // S2 (13 Okt 2026): catatan shadow Hasil analisa (fondasi A8); tidak mengubah tampilan.
  app.use("/api/keputusan", createKeputusanRoutes());
```

## Langkah 5 — Berkas baru `src/hooks/useResultShadow.ts` (isi persis)

````ts
import { useEffect, useRef } from "react";
import { API_BASE_URL } from "../lib/apiBaseUrl";
import { shadowDedupKey, summarizeShown } from "../lib/resultShadow";
import type { AnalysisResult } from "../types/analysis";
import type { BrokerId } from "../types/broker";

/**
 * S3 (13 Okt 2026) — kirim ringkasan Hasil analisa yang tampil ke server
 * untuk dinilai shadow (fondasi A8). Tidak mengembalikan apa pun dan tidak
 * merender apa pun. Hanya BELI/JUAL, sekali per simbol per candle H1.
 * Gagal kirim diabaikan diam-diam: tampilan tidak boleh terganggu.
 */
export function useResultShadow(
  brokerId: BrokerId,
  symbol: string,
  serverNow: string | null,
  shown: AnalysisResult | null,
): void {
  const sent = useRef<Set<string>>(new Set());
  useEffect(() => {
    try {
      if (shown === null || symbol === "" || serverNow === null) return;
      if (shown.decision !== "BELI" && shown.decision !== "JUAL") return;
      const key = shadowDedupKey(brokerId, symbol, serverNow);
      if (sent.current.has(key)) return;
      sent.current.add(key);
      const body = JSON.stringify({ broker: brokerId, symbol, serverNow, shown: summarizeShown(shown) });
      fetch(`${API_BASE_URL}/api/keputusan/shadow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => undefined);
    } catch {
      // Shadow gagal → abaikan; Hasil analisa tetap utuh.
    }
  }, [brokerId, symbol, serverNow, shown]);
}
````

## Langkah 6 — Ubah `src/App.tsx` (IZIN KHUSUS: hanya 2 sisipan ini)

Tepat **di bawah** baris:
```ts
import { useLolosProof } from "./hooks/useLolosProof";
```
tambahkan:
```ts
import { useResultShadow } from "./hooks/useResultShadow";
```

Tepat **di atas** baris:
```ts
  // Langkah E: klik status LOLOS di pemindai → pilih simbol (data dimuat
```
tambahkan (3 baris: komentar, panggilan, baris kosong):
```ts
  // S3 (13 Okt 2026): shadow penjaga sesi — hanya mengirim ke server, tidak merender (fondasi A8).
  useResultShadow(activeBrokerId, market.symbol, liveQuote?.timestamp ?? null, shownResult);

```
Jangan mengubah baris lain di `App.tsx`. Pertahankan BOM/akhir baris yang sudah ada di berkas itu.

## Langkah 7 — `scripts/run-tests.ts` (hanya sisipan, CRLF)

**Impor:** tepat **di bawah** baris:
```ts
import { allowedOnLive, latestVersion, parseRuleBook, type RuleEntry } from "../src/lib/ruleBook";
```
tambahkan 2 baris:
```ts
import { buildShadowRecord, computeResultShadow, shadowDedupKey, summarizeShown, type ShownSummary } from "../src/lib/resultShadow";
import { handleShadowRequest } from "../server/routes/keputusanRoutes";
```

**Test:** sisipkan blok di bawah ini tepat **di atas** baris yang diawali `test("288. parseECBXml()`:

````ts
test("700. S1 shadow Hasil analisa: penjaga sesi dinilai di atas hasil terlihat tanpa mengubahnya", () => {
  // S1 (13 Okt 2026, fondasi A8): data sesi META.US sama dengan test 687.
  const ses = [1, 2, 3, 4, 5].map((day) => ({ symbol: "META.US", day, fromMin: 930, toMin: 1315 }));
  const base = analyzeMarket(modeAmanMarket, modeAmanBroker);
  const beli: ReturnType<typeof analyzeMarket> = Object.freeze({ ...base, decision: "BELI", stopLoss: 1, takeProfit: 2, suggestedLot: 0.01, warnings: ["w"] });
  const before = JSON.stringify(beli);
  const shown = summarizeShown(beli);
  const near = computeResultShadow(shown, "META.US", "2026.10.09 21:00:00", ses);
  assert(near !== null && near.differs && near.shownDecision === "BELI" && near.shadowDecision === "TUNGGU", `55 mnt jelang tutup: ${JSON.stringify(near)}`);
  assert(near !== null && near.shadowCode === "DITAHAN_SESI" && near.closesInMin === 55, "kode dan menit sampai tutup");
  const far = computeResultShadow(shown, "META.US", "2026.10.08 18:00:00", ses);
  assert(far !== null && !far.differs && far.shadowDecision === "BELI", "jauh dari tutup = sama");
  const wait = computeResultShadow({ ...shown, decision: "TUNGGU" }, "META.US", "2026.10.09 21:00:00", ses);
  assert(wait !== null && !wait.differs && wait.shadowCode === null, "TUNGGU tidak pernah dicatat");
  assert(computeResultShadow(shown, "META.US", "2026.10.09 21:00:00", []) === null, "data sesi kosong = tidak dinilai");
  assert(computeResultShadow(shown, "META.US", null, ses) === null, "jam server tidak ada = tidak dinilai");
  assert(computeResultShadow(shown, "META.US", "2026-10-09T21:00:00Z", ses) === null, "format jam salah = tidak dinilai");
  assert(JSON.stringify(beli) === before && beli.decision === "BELI" && beli.suggestedLot === 0.01, "hasil terlihat tidak boleh berubah");
  assert(shadowDedupKey("finex", "META.US", "2026.10.09 21:00:00") === shadowDedupKey("finex", "META.US", "2026.10.09 21:59:59"), "satu candle H1 = satu kunci");
  assert(shadowDedupKey("finex", "META.US", "2026.10.09 21:00:00") !== shadowDedupKey("finex", "META.US", "2026.10.09 22:00:00"), "candle berbeda = kunci berbeda");
});
test("701. S1 baris keputusan hasil-shadow: format keputusan/1, nilai tidak diketahui null", () => {
  const ses = [1, 2, 3, 4, 5].map((day) => ({ symbol: "META.US", day, fromMin: 930, toMin: 1315 }));
  const shown: ShownSummary = { decision: "BELI", entry: 700.5, stopLoss: 690, takeProfit: 721.5, suggestedLot: 0.01, costShareOfRisk: 0.04 };
  const shadow = computeResultShadow(shown, "META.US", "2026.10.09 21:00:00", ses);
  assert(shadow !== null, "shadow harus ada");
  if (shadow === null) return;
  const rec = buildShadowRecord(
    { keputusanId: "id-1", waktuUtc: "2026-10-09T18:00:00Z", broker: "finex", symbol: "META.US", serverNow: "2026.10.09 21:00:00" },
    shown,
    shadow,
  );
  assert(rec.skema === "keputusan/1" && rec.jalur === "hasil-shadow" && rec.waktuServer === "2026.10.09 21:00:00", "identitas");
  assert(rec.golongan === "SAHAM_AS" && rec.aturanId === "skor" && rec.versi === "1", `golongan=${rec.golongan}`);
  assert(rec.hasil.keputusan === "TUNGGU" && rec.hasil.arahAsli === "BELI" && rec.hasil.status === "DITAHAN_SESI", "hasil shadow");
  assert(rec.hasil.entry === 700.5 && rec.hasil.sl === 690 && rec.hasil.tp === 721.5 && rec.hasil.lot === 0.01, "angka hasil terlihat disalin apa adanya");
  assert(rec.login === null && rec.sumber === null && rec.masukan.bid === null && rec.hasil.risikoRp === null, "tidak diketahui = null");
  assert(rec.penjaga.length === 1 && rec.penjaga[0].hasil === "GAGAL" && rec.penjaga[0].kodeAlasan === "DITAHAN_SESI", "penjaga sesi");
  assert(!toJsonlLine(rec).includes("\n"), "satu baris JSONL");
});
test("702. S2 POST /api/keputusan/shadow: catat hanya bila berbeda, sekali per simbol per candle H1, tolak masukan tidak sah", () => {
  const os = require("node:os") as unknown as { tmpdir(): string };
  const fs = require("node:fs") as unknown as typeof import("node:fs");
  const path = require("node:path") as unknown as typeof import("node:path");
  const dataDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "shadow-")), "data");
  const ses = [1, 2, 3, 4, 5].map((day) => ({ symbol: "META.US", day, fromMin: 930, toMin: 1315 }));
  let n = 0;
  const deps = {
    dataDir,
    getSessions: (broker: string) => (broker === "finex" ? ses : null),
    now: () => new Date("2026-10-09T18:00:00Z"),
    newId: () => `id-${++n}`,
    seen: new Set<string>(),
  };
  const shown = { decision: "BELI", entry: 700.5, stopLoss: 690, takeProfit: 721.5, suggestedLot: 0.01, costShareOfRisk: null };
  const req = { broker: "finex", symbol: "META.US", serverNow: "2026.10.09 21:00:00", shown };
  const first = handleShadowRequest(req, deps);
  assert(first.status === 200 && first.body.recorded, `pertama: ${JSON.stringify(first)}`);
  assert(!handleShadowRequest(req, deps).body.recorded, "permintaan sama tidak dicatat ulang");
  assert(!handleShadowRequest({ ...req, serverNow: "2026.10.09 21:30:00" }, deps).body.recorded, "candle H1 sama tidak dicatat ulang");
  assert(!handleShadowRequest({ ...req, serverNow: "2026.10.08 18:00:00" }, deps).body.recorded, "jauh dari tutup = tidak berbeda");
  assert(!handleShadowRequest({ ...req, shown: { ...shown, decision: "TUNGGU" } }, deps).body.recorded, "TUNGGU tidak dicatat");
  const noSessions = handleShadowRequest({ ...req, broker: "orbitraderberjangka" }, deps);
  assert(noSessions.status === 200 && !noSessions.body.recorded, "data sesi tidak ada = tidak dicatat");
  assert(handleShadowRequest({ ...req, broker: undefined }, deps).status === 400, "broker wajib");
  assert(handleShadowRequest({ ...req, serverNow: "kemarin" }, deps).status === 400, "jam server tidak sah");
  assert(handleShadowRequest({ ...req, shown: { ...shown, entry: "700" } }, deps).status === 400, "angka harus angka");
  assert(handleShadowRequest([], deps).status === 400, "body bukan objek");
  const book = readJsonlRecords(dataDir, "keputusan/keputusan-finex-2026-10.jsonl", "keputusan/1");
  assert(book.records.length === 1 && book.brokenLines === 0, `tercatat ${book.records.length}`);
  assert(book.records[0].keputusanId === "id-1" && book.records[0].jalur === "hasil-shadow", "isi catatan");
});
test("703. S3 pengaman: App hanya memanggil useResultShadow sesudah shownResult; rantai penahan dan tampilan tidak berubah", () => {
  const app = readSrc("src/App.tsx");
  const call = "useResultShadow(activeBrokerId, market.symbol, liveQuote?.timestamp ?? null, shownResult);";
  assert(app.split(call).length === 2, "panggilan useResultShadow harus tepat satu");
  assert(app.indexOf("const shownResult = useMemo(") < app.indexOf(call), "dipanggil sesudah shownResult");
  assert(app.includes("applyProofHold(applyDoubleBetHold(") && app.includes("applyLossPauseHold(applySpecHold(result, market.symbol, specHolds), lossPause)"), "rantai penahan App tidak boleh berubah");
  assert(!app.includes("findSessionHold") && !app.includes("computeResultShadow"), "App tidak boleh menilai sesi sendiri");
  const hook = readSrc("src/hooks/useResultShadow.ts");
  assert(hook.includes("): void {") && !hook.includes("useState") && hook.includes("/api/keputusan/shadow"), "hook tanpa state dan tanpa nilai balik");
  assert(readSrc("server/app.ts").includes('app.use("/api/keputusan", createKeputusanRoutes());'), "rute terdaftar");
});
````

---

## Selesai tahap

- `npm test`: **699 lolos, 0 gagal.** Bila tidak, jangan mengubah kode di atas untuk "memperbaiki"; periksa apakah salinan Anda persis sama, lalu tulis di laporan.
- `npm run lint`: tanpa error. `npx tsc -b` dan `npx tsc -p tsconfig.server.json --noEmit`: tanpa error.
- `git diff --stat`: `scripts/run-tests.ts`, `server/app.ts`, `src/App.tsx`, `src/lib/jsonlRecord.ts` hanya bertambah (jsonlRecord: 2 baris berubah). Tulis keluarannya di laporan.
- Tulis `docs/OPENCODE/LAPORAN-TAHAP-03.md`. Jangan commit.
