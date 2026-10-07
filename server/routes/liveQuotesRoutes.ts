import { Router, type Request, type Response } from "express";
import type { LiveQuotesStore } from "../services/liveQuotesStore";

/**
 * #509 - live quotes routes: sync dari MDBKA_Margin_Finex.csv,
 * atau serve dari cache in-memory.
 *
 * POST /api/quotes/sync → trigger sync(), return {added, total}
 * GET /api/quotes/latest/:symbol → return QuoteSnapshot atau 404
 */
export function createLiveQuotesRoutes(store: LiveQuotesStore): Router {
  const router = Router();

  router.post("/sync", (req: Request, res: Response) => {
    try {
      const result = store.sync();
      if (result === null) {
        res.status(404).json({
          error: `Margin file not found: ${store.file}. Jalankan ExportMarginMDBKA di MT5.`,
        });
        return;
      }
      res.json({ added: result.added, total: result.total });
    } catch (error) {
      console.error("Error syncing live quotes:", error);
      res.status(500).json({ error: "Failed to sync live quotes" });
    }
  });

  router.get("/latest/:symbol", (req: Request, res: Response) => {
    try {
      const symbol = (Array.isArray(req.params.symbol) ? req.params.symbol[0] : req.params.symbol ?? "").trim().toUpperCase();
      if (symbol === "") {
        res.status(400).json({ error: "Symbol required (use GET /latest/:symbol)" });
        return;
      }
      const quote = store.getLatest(symbol);
      if (quote === null) {
        res.status(404).json({ error: `Quote not found: ${symbol}` });
        return;
      }
      res.json(quote);
    } catch (error) {
      console.error("Error fetching quote:", error);
      res.status(500).json({ error: "Failed to fetch quote" });
    }
  });

  return router;
}
