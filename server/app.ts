/**
 * Tahap 5E-STEP2 — factory aplikasi Express (MODUL NODE).
 *
 * Dipisah dari server/index.ts agar route dapat diuji tanpa membuka
 * port (createApp murni merakit middleware + route).
 */

import express, { type Express } from "express";
import cors from "cors";
import type { MT5LogReader } from "./services/mt5LogReader";
import { createEquityRoutes } from "./routes/equityRoutes";
import { createQuotesRoutes } from "./routes/quotesRoutes";

/**
 * Origin frontend yang diizinkan CORS (B2: browser → backend).
 * Dari env FRONTEND_ORIGIN (wajib untuk deploy LAN/prod, mis.
 * http://192.168.1.63:5173); fallback localhost untuk dev lokal.
 */
export const FRONTEND_ORIGIN: string =
  typeof process !== "undefined" &&
  typeof process.env?.["FRONTEND_ORIGIN"] === "string" &&
  (process.env["FRONTEND_ORIGIN"] as string).trim() !== ""
    ? (process.env["FRONTEND_ORIGIN"] as string).trim().replace(/\/+$/, "")
    : "http://localhost:5173";

import type { QuotesLogReader } from "./services/quotesLogReader";

export function createApp(
  reader: MT5LogReader,
  quotesReader: QuotesLogReader,
  readerFinex: MT5LogReader | null = null,
  quotesReaderFinex: QuotesLogReader | null = null,
): Express {
  const app = express();
  app.use(cors({ origin: FRONTEND_ORIGIN }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/equity", createEquityRoutes(reader, readerFinex));
  app.use("/api/quotes", createQuotesRoutes(quotesReader, quotesReaderFinex));

  return app;
}
