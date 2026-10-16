import { join } from "node:path";
import { Router } from "express";
import {
  BRANCHES,
  branchByCode,
  parseDecisionInput,
  parseRecommendationInput,
  recommendationStatus,
} from "../../src/lib/branchOffice";
import { readBranch, saveDecision, saveRecommendation } from "../services/branchStore";

/**
 * C0 (16 Okt 2026) — Kantor Cabang.
 * GET  /api/cabang                         ringkasan semua cabang (jumlah menunggu)
 * GET  /api/cabang/:kode                   rekomendasi satu cabang + riwayat keputusan
 * POST /api/cabang/:kode/rekomendasi       cabang mengirim Formulir R
 * POST /api/cabang/:kode/:id/keputusan     Pusat memutuskan (SETUJU/TOLAK final, TUNDA boleh diikuti)
 */
export function createCabangRoutes(dataDir: string = join(process.cwd(), "data"), now: () => Date = () => new Date()): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      cabang: BRANCHES.map((b) => {
        const list = readBranch(dataDir, b.code);
        const statuses = list.map((x) => recommendationStatus(x.decisions));
        return {
          code: b.code,
          name: b.name,
          total: list.length,
          menunggu: statuses.filter((s) => s === "MENUNGGU" || s === "DITUNDA").length,
        };
      }),
    });
  });

  router.get("/:kode", (req, res) => {
    const branch = branchByCode(req.params.kode);
    if (branch === null) {
      res.status(404).json({ error: "cabang tidak dikenal" });
      return;
    }
    res.json({
      code: branch.code,
      rekomendasi: readBranch(dataDir, branch.code).map((x) => ({ ...x, status: recommendationStatus(x.decisions) })),
    });
  });

  router.post("/:kode/rekomendasi", (req, res) => {
    const branch = branchByCode(req.params.kode);
    if (branch === null) {
      res.status(404).json({ error: "cabang tidak dikenal" });
      return;
    }
    const parsed = parseRecommendationInput(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.status(201).json({ rec: saveRecommendation(dataDir, branch.code, parsed.value, now()) });
  });

  router.post("/:kode/:id/keputusan", (req, res) => {
    const branch = branchByCode(req.params.kode);
    if (branch === null) {
      res.status(404).json({ error: "cabang tidak dikenal" });
      return;
    }
    const parsed = parseDecisionInput(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const r = saveDecision(dataDir, branch.code, req.params.id, parsed.value, now());
    if (!r.ok) {
      res.status(r.status).json({ error: r.error });
      return;
    }
    res.json({ decisions: r.decisions, status: recommendationStatus(r.decisions) });
  });

  return router;
}
