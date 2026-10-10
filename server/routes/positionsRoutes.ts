import { Router, type Request, type Response } from "express";
import type { PositionsLogReader } from "../services/positionsLogReader";
import {
  pickLiveSource,
  resolveLiveBroker,
} from "../types/liveSource";

/**
 * Tahap AP — daftar posisi broker terbuka (read-only).
 * GET /api/positions[?broker=] → {positions, count, timestamp}.
 * Kebijakan sumber sama seperti quotes (?broker=, 400 unknown,
 * 404 belum dikonfigurasi). Tanpa SSE (polling REST cukup).
 */
export function createPositionsRoutes(
  positionsReader: PositionsLogReader | null,
  positionsReaderFinex: PositionsLogReader | null = null,
  positionsReaderMifx: PositionsLogReader | null = null,
): Router {
  const router = Router();

  router.get("/", (req: Request, res: Response) => {
    try {
      const broker = resolveLiveBroker(req.query.broker);
      if (broker === null) {
        res
          .status(400)
          .json({ error: "Unknown broker (use finex|orbitraderberjangka)" });
        return;
      }
      const active = pickLiveSource(broker, positionsReader, positionsReaderFinex, positionsReaderMifx);
      if (active === null) {
        res.status(404).json({
          error: `Positions source not configured for broker ${broker}`,
        });
        return;
      }
      const positions = active.getAll();
      res.json({
        positions,
        count: positions.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching positions:", error);
      res.status(500).json({ error: "Failed to fetch positions" });
    }
  });

  return router;
}
