import { Router, type Request, type Response } from "express";
import type { BrokerId } from "../../src/types/broker";
import { readCalendarForBroker, type CalendarEvent } from "../services/calendarReader";
import { resolveLiveBroker } from "../types/liveSource";
import { resolveCommonFilesDir } from "./marginRoutes";

/**
 * Satpam Kalender K2b — GET /api/calendar?broker=finex|orbitraderberjangka
 * → { broker, available, file, generated, events }
 *
 * File kalender tidak ada → 200 dengan available=false & events [] (satpam
 * diabaikan, penetapan Fahmi 9 Okt), bukan error.
 */
export interface CalendarResponse {
  readonly broker: BrokerId;
  readonly available: boolean;
  readonly file: string | null;
  readonly generated: string | null;
  readonly events: readonly CalendarEvent[];
}

export function calendarResponse(commonDir: string, broker: BrokerId): CalendarResponse {
  const snap = readCalendarForBroker(commonDir, broker);
  if (snap === null) {
    return { broker, available: false, file: null, generated: null, events: [] };
  }
  return { broker, available: true, file: snap.file, generated: snap.generated, events: snap.events };
}

export function createCalendarRoutes(commonDir: string = resolveCommonFilesDir()): Router {
  const router = Router();
  router.get("/", (req: Request, res: Response) => {
    const broker = resolveLiveBroker(req.query.broker);
    if (broker === null) {
      res.status(400).json({ error: "Unknown broker (use finex|orbitraderberjangka)" });
      return;
    }
    res.json(calendarResponse(commonDir, broker));
  });
  return router;
}
