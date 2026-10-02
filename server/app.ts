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

/** Origin frontend Vite yang diizinkan (B2: browser → backend). */
export const FRONTEND_ORIGIN = "http://localhost:5173";

export function createApp(reader: MT5LogReader): Express {
  const app = express();
  app.use(cors({ origin: FRONTEND_ORIGIN }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/equity", createEquityRoutes(reader));

  return app;
}
