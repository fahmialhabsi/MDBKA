import { join } from "node:path";
import { Router } from "express";
import {
  BRANCHES,
  branchByCode,
  parseDecisionInput,
  parseRecommendationInput,
  recommendationStatus,
} from "../../src/lib/branchOffice";
import { deliverLampiran, readBranch, readLatestHasil, saveDecision, saveRecommendation } from "../services/branchStore";
import { runKc1 } from "../services/kc1Runner";
import { Kc2Error, runKc2 } from "../services/kc2Runner";
import { Kc3Error, runKc3 } from "../services/kc3Runner";
import { Kc4Error, runKc4 } from "../services/kc4Runner";
import { resolveCommonFilesDir } from "./marginRoutes";
import { getCachedEcbRates } from "./fxRoutes";
import { readUsdIdrBook, usdIdrOn } from "../services/ecbHistory";
import { FALLBACK_RATES, usdIdrRate } from "../../src/services/fxRateService";

/**
 * C0 (16 Okt 2026) — Kantor Cabang.
 * GET  /api/cabang                         ringkasan semua cabang (jumlah menunggu)
 * GET  /api/cabang/:kode                   rekomendasi satu cabang + riwayat keputusan
 * POST /api/cabang/:kode/rekomendasi       cabang mengirim Formulir R
 * POST /api/cabang/:kode/:id/keputusan     Pusat memutuskan (SETUJU/TOLAK final, TUNDA boleh diikuti)
 * POST /api/cabang/KC-1/jalankan           KC-1: 4 petugas prinsip + Kepala menilai broker → Formulir R
 * POST /api/cabang/KC-2/jalankan           KC-2: daftar + kesehatan data broker terpilih → map + Formulir R
 * POST /api/cabang/KC-3/jalankan           KC-3: Kepala Sekolah membekukan Pembagian Data → map + Formulir R
 * POST /api/cabang/KC-4/jalankan           KC-4: uji Pola Calon disetujui di UJIAN bersegel (K1-K7) → vonis + Formulir R
 * GET  /api/cabang/:kode/hasil/:jenis      map hasil terbaru (mis. KC-1/hasil/KARTU_BROKER)
 */
export function createCabangRoutes(
  dataDir: string = join(process.cwd(), "data"),
  now: () => Date = () => new Date(),
  commonDir: () => string = resolveCommonFilesDir,
  faktaFile: string = join(process.cwd(), "config", "kc1-fakta-broker.json"),
): Router {
  const router = Router();

  router.post("/KC-1/jalankan", (_req, res) => {
    const rates = getCachedEcbRates() ?? FALLBACK_RATES;
    const t = now();
    const book = usdIdrOn(readUsdIdrBook(join(dataDir, "fx", "ecb-usdidr.json")), t.toISOString().slice(0, 10));
    const usdIdr = book?.rate ?? usdIdrRate(rates);
    if (usdIdr === null) {
      res.status(409).json({ error: "kurs USD→Rp (ECB) belum ada; penilaian biaya tidak bisa dihitung" });
      return;
    }
    try {
      const r = runKc1({ dataDir, commonDir: commonDir(), faktaFile, rates: { ...rates, IDR: usdIdr * rates.USD }, usdIdr, now: t });
      res.status(201).json({ rec: r.rec, kartu: r.hasil.kartu, terpilih: r.hasil.terpilih });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post("/KC-2/jalankan", (_req, res) => {
    try {
      const r = runKc2({ dataDir, commonDir: commonDir(), faktaFile, now: now() });
      res.status(201).json(r);
    } catch (e) {
      res.status(e instanceof Kc2Error ? 409 : 500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post("/KC-3/jalankan", (_req, res) => {
    try {
      const r = runKc3({ dataDir, commonDir: commonDir(), now: now() });
      res.status(201).json(r);
    } catch (e) {
      res.status(e instanceof Kc3Error ? 409 : 500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post("/KC-4/jalankan", (_req, res) => {
    try {
      const r = runKc4({ dataDir, commonDir: commonDir(), now: now() });
      res.status(201).json(r);
    } catch (e) {
      res.status(e instanceof Kc4Error ? 409 : 500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.get("/:kode/hasil/:jenis", (req, res) => {
    const branch = branchByCode(req.params.kode);
    if (branch === null || !/^[A-Z_]{3,40}$/.test(req.params.jenis)) {
      res.status(404).json({ error: "cabang atau jenis map tidak dikenal" });
      return;
    }
    res.json({ hasil: readLatestHasil(dataDir, branch.code, req.params.jenis) });
  });

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
    const t = now();
    const r = saveDecision(dataDir, branch.code, req.params.id, parsed.value, t);
    if (!r.ok) {
      res.status(r.status).json({ error: r.error });
      return;
    }
    // Map lampiran dikirim ke cabang lain HANYA setelah Pusat SETUJU.
    if (recommendationStatus(r.decisions) === "DISETUJUI") deliverLampiran(dataDir, branch.code, req.params.id, t);
    res.json({ decisions: r.decisions, status: recommendationStatus(r.decisions) });
  });

  return router;
}
