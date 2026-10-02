import { Router, Request, Response } from "express";
import { QuotesLogReader } from "../services/quotesLogReader";
import { QuotesResponse } from "../types/quotes";

export function createQuotesRoutes(quotesReader: QuotesLogReader): Router {
  const router = Router();

  router.get("/:symbol", (req: Request, res: Response) => {
    try {
      const { symbol } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!symbol || symbol.length === 0) {
        return res.status(400).json({ error: "Symbol required" });
      }

      const quotes = quotesReader.getLatestBySymbol(symbol, limit);

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
      const { symbol } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!symbol || symbol.length === 0) {
        return res.status(400).json({ error: "Symbol required" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const initialQuotes = quotesReader.getLatestBySymbol(symbol, limit);
      res.write(
        `data: ${JSON.stringify({ type: "init", data: initialQuotes })}\n\n`,
      );

      const unsubscribe = quotesReader.onUpdate((allQuotes) => {
        const symbolQuotes = allQuotes.filter((q) => q.symbol === symbol);
        const latest = symbolQuotes.slice(-1)[0];

        if (latest) {
          res.write(
            `data: ${JSON.stringify({ type: "update", data: latest })}\n\n`,
          );
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
      const symbols = quotesReader.getSymbols();
      res.json({ symbols, count: symbols.length });
    } catch (error) {
      console.error("Error fetching symbols:", error);
      res.status(500).json({ error: "Failed to fetch symbols" });
    }
  });

  return router;
}
