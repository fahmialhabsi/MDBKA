import { Router, type Request, type Response } from "express";
import { readSessionsForBroker } from "../services/sessionReader";
import { resolveLiveBroker } from "../types/liveSource";
import { resolveCommonFilesDir } from "./marginRoutes";

/**
 * Satpam Sesi S2 — GET /api/sessions?broker=finex|orbitraderberjangka
 * → { broker, available, file, generated, sessions }. File tidak ada → 200
 * available=false (satpam diabaikan), bukan error.
 */
export function createSessionRoutes(commonDir: string = resolveCommonFilesDir()): Router {
  const router = Router();
  router.get("/", (req: Request, res: Response) => {
    const broker = resolveLiveBroker(req.query.broker);
    if (broker === null) {
      res.status(400).json({ error: "Unknown broker (use finex|orbitraderberjangka)" });
      return;
    }
    const snap = readSessionsForBroker(commonDir, broker);
    res.json(
      snap === null
        ? { broker, available: false, file: null, generated: null, sessions: [] }
        : { broker, available: true, file: snap.file, generated: snap.generated, sessions: snap.sessions },
    );
  });
  return router;
}
