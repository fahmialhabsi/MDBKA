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
import { getCachedEcbRates } from "./fxRoutes";
import { usdIdrRate } from "../../src/services/fxRateService";

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
  /** R-1: kurs USD→Rp; absen = cadangan slippage tidak dinilai. */
  readonly getUsdIdr?: () => number | null;
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
  // R-1: opsional (App lama tidak mengirim).
  const riskAtMinLot = numOrNull(v.riskAtMinLot);
  return { decision: v.decision, entry, stopLoss, takeProfit, suggestedLot, costShareOfRisk, ...(riskAtMinLot === undefined ? {} : { riskAtMinLot }) };
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

  const shadow = computeResultShadow(shown, b.symbol, b.serverNow, deps.getSessions(broker), deps.getUsdIdr?.() ?? null);
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
        getUsdIdr: () => usdIdrRate(getCachedEcbRates()),
      });
      res.status(reply.status).json(reply.body);
    } catch (error) {
      // Gagal mencatat tidak boleh mengganggu apa pun; laporkan jujur.
      res.status(500).json({ recorded: false, reason: error instanceof Error ? error.message : String(error) });
    }
  });
  return router;
}
