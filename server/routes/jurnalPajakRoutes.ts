import { Router, type Request, type Response } from "express";
import { resolveCommonFilesDir } from "./marginRoutes";
import {
  createJurnalPajakStore,
  resolveJurnalPajakFile,
  type JurnalPajakStore,
} from "../services/jurnalPajakStore";
import { entriesToCsv, summarizeByYear } from "../types/jurnalPajak";

/**
 * #507 - /api/jurnal-pajak (khusus akun Finex live).
 *   GET  /            sinkron otomatis dari CSV History lalu kembalikan jurnal + rekap
 *   POST /kurs        {text} tempel kurs pajak (tanggal / rentang) -> menimpa kurs
 *   PATCH /:dealTicket {kursIdr?, catatan?}
 *   GET  /export.csv  unduh jurnal (Excel)
 * Alat bantu pencatatan, bukan nasihat pajak/konsultan.
 */
export function createJurnalPajakRoutes(
  store: JurnalPajakStore = createJurnalPajakStore({
    commonDir: resolveCommonFilesDir(),
    file: resolveJurnalPajakFile(),
    login: (process.env?.["SWAPLOG_LOGIN_FINEX"] ?? "").trim() || "91811209",
  }),
): Router {
  const router = Router();

  router.get("/", (_req: Request, res: Response) => {
    try {
      const synced = store.sync();
      const entries = store.load();
      res.json({
        login: store.login,
        file: store.file,
        sourceFound: synced !== null,
        added: synced?.added ?? 0,
        count: entries.length,
        summary: summarizeByYear(entries),
        entries,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/kurs", (req: Request, res: Response) => {
    try {
      const text: unknown = (req.body as { text?: unknown } | undefined)?.text;
      if (typeof text !== "string" || text.trim() === "") {
        res.status(400).json({ error: "Field text (kurs per tanggal) wajib diisi" });
        return;
      }
      res.json(store.applyKursText(text));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.patch("/:dealTicket", (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { kursIdr?: unknown; catatan?: unknown };
      const patch: { kursIdr?: number | null; catatan?: string } = {};
      if (body.kursIdr === null || typeof body.kursIdr === "number") {
        patch.kursIdr = body.kursIdr;
      }
      if (typeof body.catatan === "string") patch.catatan = body.catatan;
      const ok = store.patch(String(req.params["dealTicket"]), patch);
      if (!ok) {
        res.status(404).json({ error: "Deal tidak ditemukan" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get("/export.csv", (_req: Request, res: Response) => {
    try {
      store.sync();
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="jurnal-pajak-finex.csv"',
      );
      res.send(entriesToCsv(store.load()));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
