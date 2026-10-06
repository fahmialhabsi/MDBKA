import { Router, type Request, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { marginFileTag, parseMarginCsv } from "../types/marginCsv";

/**
 * Item (e) — GET /api/margin?broker=finex|orbitraderberjangka[&symbol=]
 * Sumber: Common\Files\MDBKA_Margin_<Finex|OTB>.csv (OrderCalcMargin MT5).
 * Dibaca ulang tiap request (file kecil, selalu segar).
 */
export function resolveCommonFilesDir(): string {
  const fromEnv = (process.env?.["MT5_COMMON_FILES_DIR"] ?? "").trim();
  if (fromEnv !== "") return fromEnv;
  return join(
    process.env?.["APPDATA"] ?? "",
    "MetaQuotes",
    "Terminal",
    "Common",
    "Files",
  );
}

export function createMarginRoutes(
  commonDir: string = resolveCommonFilesDir(),
): Router {
  const router = Router();

  router.get("/", (req: Request, res: Response) => {
    try {
      const tag = marginFileTag(req.query.broker);
      if (tag === null) {
        res
          .status(400)
          .json({ error: "Unknown broker (use finex|orbitraderberjangka)" });
        return;
      }
      const file = join(commonDir, `MDBKA_Margin_${tag}.csv`);
      if (!existsSync(file)) {
        res.status(404).json({
          error: `Margin file not found: ${file}. Jalankan script ExportMarginMDBKA di terminal ${tag}.`,
        });
        return;
      }
      const table = parseMarginCsv(readFileSync(file, "utf8"));
      const symbol =
        typeof req.query.symbol === "string" ? req.query.symbol.trim() : "";
      if (symbol !== "") {
        const entry = table.get(symbol);
        if (entry === undefined) {
          res
            .status(404)
            .json({ error: `Symbol ${symbol} not in ${tag} margin file` });
          return;
        }
        res.json(entry);
        return;
      }
      res.json({
        broker: tag,
        count: table.size,
        margins: Array.from(table.values()),
      });
    } catch (error) {
      console.error("Error reading margin file:", error);
      res.status(500).json({ error: "Failed to read margin file" });
    }
  });

  return router;
}
