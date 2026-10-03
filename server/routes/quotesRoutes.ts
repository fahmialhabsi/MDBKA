import { Router, Request, Response } from "express";
import { QuotesLogReader } from "../services/quotesLogReader";
import { QuotesResponse, type QuoteSseEnvelope } from "../types/quotes";
import {
  pickLiveSource,
  resolveLiveBroker,
} from "../types/liveSource";

/** Pilih reader quotes per request via `?broker=`. null = 400/404. */
function selectReader(
  req: Request,
  res: Response,
  reader: QuotesLogReader,
  readerFinex: QuotesLogReader | null,
): QuotesLogReader | null {
  const broker = resolveLiveBroker(req.query.broker);
  if (broker === null) {
    res.status(400).json({ error: "Unknown broker (use finex|orbitraderberjangka)" });
    return null;
  }
  const active = pickLiveSource(broker, reader, readerFinex);
  if (active === null) {
    res.status(404).json({
      error: `Live source not configured for broker ${broker}`,
    });
    return null;
  }
  return active;
}

export function createQuotesRoutes(
  quotesReader: QuotesLogReader,
  quotesReaderFinex: QuotesLogReader | null = null,
): Router {
  const router = Router();

  router.get("/:symbol", (req: Request, res: Response) => {
    try {
      const active = selectReader(req, res, quotesReader, quotesReaderFinex);
      if (active === null) return;

      const rawSymbol = req.params.symbol;
      const symbol = Array.isArray(rawSymbol) ? (rawSymbol[0] ?? "") : rawSymbol;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!symbol || symbol.length === 0) {
        return res.status(400).json({ error: "Symbol required" });
      }

      const quotes = active.getLatestBySymbol(symbol, limit);

      const response: QuotesResponse = {
        data: quotes,
        symbol,
        count: quotes.length,
        timestamp: new Date().toISOString(),
      };

      res.json(response);
    } catch (error) {
      console.error("Error fetching quotes:", error);
      res.status(500).json({ error: "Failed to fetch quotes" });
    }
  });

  router.get("/:symbol/stream", (req: Request, res: Response) => {
    try {
      const active = selectReader(req, res, quotesReader, quotesReaderFinex);
      if (active === null) return;

      const rawSymbol = req.params.symbol;
      const symbol = Array.isArray(rawSymbol) ? (rawSymbol[0] ?? "") : rawSymbol;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!symbol || symbol.length === 0) {
        return res.status(400).json({ error: "Symbol required" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const initialQuotes = active.getLatestBySymbol(symbol, limit);
      const initEnvelope: QuoteSseEnvelope = {
        type: "init",
        data: initialQuotes,
      };
      res.write(`data: ${JSON.stringify(initEnvelope)}\n\n`);

      const unsubscribe = active.onUpdate((allQuotes) => {
        const symbolQuotes = allQuotes.filter((q) => q.symbol === symbol);
        const latest = symbolQuotes.slice(-1)[0];

        if (latest) {
          const updateEnvelope: QuoteSseEnvelope = {
            type: "update",
            data: latest,
          };
          res.write(`data: ${JSON.stringify(updateEnvelope)}\n\n`);
        }
      });

      const heartbeatInterval = setInterval(() => {
        res.write(`: heartbeat\n\n`);
      }, 30000);

      res.on("close", () => {
        clearInterval(heartbeatInterval);
        unsubscribe();
      });
    } catch (error) {
      console.error("Error streaming quotes:", error);
      res.status(500).json({ error: "Failed to stream quotes" });
    }
  });

  router.get("/", (req: Request, res: Response) => {
    try {
      const active = selectReader(req, res, quotesReader, quotesReaderFinex);
      if (active === null) return;
      const symbols = active.getSymbols();
      res.json({ symbols, count: symbols.length });
    } catch (error) {
      console.error("Error fetching symbols:", error);
      res.status(500).json({ error: "Failed to fetch symbols" });
    }
  });

  return router;
}
