import { Router, type Request, type Response } from "express";
import { readSpecsForBroker } from "../services/specReader";
import { resolveLiveBroker } from "../types/liveSource";
import { resolveCommonFilesDir } from "./marginRoutes";

/**
 * V2b — GET /api/specs?broker=finex|orbitraderberjangka
 * → { broker, available, file, generated, symbols, diffs }. diffs = beda
 * spesifikasi MT5 vs spec32 (TAHAN dulu, lalu CATATAN). File tidak ada → 200
 * available=false (satpam diabaikan), bukan error.
 */
export function createSpecRoutes(commonDir: string = resolveCommonFilesDir()): Router {
  const router = Router();
  router.get("/", (req: Request, res: Response) => {
    const broker = resolveLiveBroker(req.query.broker);
    if (broker === null) {
      res.status(400).json({ error: "Unknown broker (use finex|orbitraderberjangka)" });
      return;
    }
    const snap = readSpecsForBroker(commonDir, broker);
    res.json(
      snap === null
        ? { broker, available: false, file: null, generated: null, symbols: 0, diffs: [] }
        : { broker, available: true, file: snap.file, generated: snap.generated, symbols: snap.symbols, diffs: snap.diffs },
    );
  });
  return router;
}
