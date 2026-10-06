import { Router, type Request, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCommonFilesDir } from "./marginRoutes";
import { parseSwapLogCsv, swapLogLogin } from "../types/swapLogCsv";

/**
 * #501 — GET /api/swaplog?broker=finex|orbitraderberjangka
 * Sumber: Common\Files\MDBKA_SwapLog_<login>.csv (EA MDBKASwapLogger).
 * Dibaca ulang tiap request (append-only, selalu segar).
 */
export function createSwapLogRoutes(
  commonDir: string = resolveCommonFilesDir(),
): Router {
  const router = Router();

  router.get("/", (req: Request, res: Response) => {
    try {
      const login = swapLogLogin(req.query.broker);
      if (login === null) {
        res
          .status(400)
          .json({ error: "Unknown broker (use finex|orbitraderberjangka)" });
        return;
      }
      const file = join(commonDir, `MDBKA_SwapLog_${login}.csv`);
      if (!existsSync(file)) {
        res.status(404).json({
          error: `Swap log not found: ${file}. Pasang EA MDBKASwapLogger di terminal login ${login}.`,
        });
        return;
      }
      const rows = parseSwapLogCsv(readFileSync(file, "utf8"));
      res.json({ login, file, count: rows.length, rows });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
