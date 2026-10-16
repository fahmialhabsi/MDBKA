import { Router, type Request, type Response } from "express";
import { join } from "node:path";
import {
  backupSedangJalan,
  getBackupStatus,
  resolveBackupDir,
  runBackup,
} from "../services/dataBackup";

/**
 * Backup data MDBKA (8 Okt 2026).
 * GET  /api/backup/status → { status } (pengingat "sudah waktunya backup")
 * POST /api/backup/run    → jalankan backup sekarang, { marker, status }
 * Satu backup sekali jalan: permintaan kedua saat berjalan → 409.
 */
export function createBackupRoutes(
  dataDir: string = join(process.cwd(), "data"),
  backupDir: string = resolveBackupDir(),
): Router {
  const router = Router();

  router.get("/status", (_req: Request, res: Response) => {
    try {
      res.json({ running: backupSedangJalan(), status: getBackupStatus(dataDir, backupDir) });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post("/run", async (_req: Request, res: Response) => {
    if (backupSedangJalan()) {
      res.status(409).json({ error: "Backup sedang berjalan." });
      return;
    }
    try {
      const marker = await runBackup(dataDir, backupDir);
      console.log(
        `✓ Backup MDBKA: ${marker.files} file penting → ${backupDir}\\${marker.snapshot}` +
          (marker.historyCopied > 0 ? `, ${marker.historyCopied} file arsip tick` : ""),
      );
      res.json({ marker, status: getBackupStatus(dataDir, backupDir) });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  return router;
}
