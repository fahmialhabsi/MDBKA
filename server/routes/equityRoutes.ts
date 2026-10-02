/**
 * Tahap 5E-STEP2 — route Express untuk equity MT5 (MODUL NODE).
 *
 * - GET /latest  → snapshot terakhir (200) / 404 bila belum ada data.
 * - GET /stream  → Server-Sent Events: snapshot awal + push tiap
 *   update + heartbeat comment tiap 30 dtk agar proxy tak memutus.
 * - Factory menerima MT5LogReader agar mudah diuji tanpa network.
 */

import { Router, type Request, type Response } from "express";
import type { MT5LogReader } from "../services/mt5LogReader";
import type { EquitySnapshot } from "../types/equity";

function sendSnapshot(res: Response, snapshot: EquitySnapshot): void {
  res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
}

export function createEquityRoutes(reader: MT5LogReader): Router {
  const router = Router();

  router.get("/latest", (_req: Request, res: Response) => {
    try {
      const snapshot = reader.getLatest() ?? reader.refresh();
      if (snapshot === null) {
        res.status(404).json({ error: "No equity data yet" });
        return;
      }
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Internal error",
      });
    }
  });

  router.get("/stream", (req: Request, res: Response) => {
    try {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const initial = reader.getLatest() ?? reader.refresh();
      if (initial !== null) {
        sendSnapshot(res, initial);
      } else {
        res.write(": connected, waiting for MT5 data\n\n");
      }

      const unsubscribe = reader.onUpdate((snapshot) => {
        try {
          sendSnapshot(res, snapshot);
        } catch {
          // Klien terputus di tengah tulis: cleanup via req close.
        }
      });

      const heartbeat = setInterval(() => {
        try {
          res.write(": heartbeat\n\n");
        } catch {
          // Diabaikan: interval dibersihkan saat koneksi tutup.
        }
      }, 30000);

      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Internal error",
      });
    }
  });

  return router;
}
