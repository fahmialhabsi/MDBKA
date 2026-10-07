import { Router, type Request, type Response } from "express";
import { resolveCommonFilesDir } from "./marginRoutes";
import {
  createJurnalPajakStore,
  resolveJurnalPajakFile,
  type JurnalPajakStore,
} from "../services/jurnalPajakStore";
import {
  createPembayaranPajakStore,
  resolvePajakDir,
  type PembayaranPajakStore,
} from "../services/pembayaranPajakStore";
import { summarizeByYear } from "../types/jurnalPajak";
import { calculateTaxLiability } from "../types/pajakOP";

/**
 * #510 - /api/pajak (PPh OP atas trading Finex)
 *   GET  /hitung?year=2026           hitung kewajiban + pembayaran + sisa
 *   PUT  /profil/:year               {ptkpStatus, otherNetIncomeIdr, creditIdr}
 *   GET  /pembayaran?year=           daftar pembayaran
 *   POST /pembayaran                 catat pembayaran (+ file bukti base64 opsional)
 *   POST /pembayaran/:id/bukti       unggah/ganti bukti bayar
 *   GET  /pembayaran/:id/bukti       unduh bukti bayar
 * Alat bantu perkiraan, bukan nasihat pajak.
 */
export function createPajakRoutes(
  jurnal: JurnalPajakStore = createJurnalPajakStore({
    commonDir: resolveCommonFilesDir(),
    file: resolveJurnalPajakFile(),
    login: (process.env?.["SWAPLOG_LOGIN_FINEX"] ?? "").trim() || "91811209",
  }),
  store: PembayaranPajakStore = createPembayaranPajakStore(resolvePajakDir()),
): Router {
  const router = Router();

  const parseYear = (raw: unknown): number | null => {
    const y = Number(raw);
    return Number.isInteger(y) && y >= 2020 && y <= 2100 ? y : null;
  };

  router.get("/hitung", (req: Request, res: Response) => {
    try {
      const year = parseYear(req.query["year"] ?? new Date().getFullYear());
      if (year === null) {
        res.status(400).json({ error: "Tahun pajak tidak valid" });
        return;
      }
      jurnal.sync();
      const summary = summarizeByYear(jurnal.load()).find(
        (s) => s.year === String(year),
      );
      const profil = store.getProfil(year);
      const liability = calculateTaxLiability({
        year,
        nettoTradingIdr: summary?.nettoIdr ?? 0,
        otherNetIncomeIdr: profil.otherNetIncomeIdr,
        ptkpStatus: profil.ptkpStatus,
        creditIdr: profil.creditIdr,
      });
      const pembayaran = store.list(year);
      const dibayar29 = pembayaran
        .filter((p) => p.jenis === "PPh Pasal 29 OP")
        .reduce((sum, p) => sum + p.jumlahIdr, 0);
      res.json({
        year,
        profil,
        tradingNettoUsd: summary?.nettoUsd ?? 0,
        tanpaKurs: summary?.tanpaKurs ?? 0,
        liability,
        dibayarPasal29Idr: dibayar29,
        sisaKurangBayarIdr: Math.max(0, liability.kurangBayarIdr - dibayar29),
        pembayaran,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.put("/profil/:year", (req: Request, res: Response) => {
    try {
      const year = parseYear(req.params["year"]);
      if (year === null) {
        res.status(400).json({ error: "Tahun pajak tidak valid" });
        return;
      }
      const r = store.setProfil(year, req.body);
      if (!r.ok) {
        res.status(400).json({ error: r.error });
        return;
      }
      res.json(r.value);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get("/pembayaran", (req: Request, res: Response) => {
    try {
      const year =
        req.query["year"] === undefined
          ? undefined
          : parseYear(req.query["year"]);
      if (year === null) {
        res.status(400).json({ error: "Tahun pajak tidak valid" });
        return;
      }
      res.json(store.list(year));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/pembayaran", (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { bukti?: unknown };
      const r = store.add(body, body.bukti);
      if (!r.ok) {
        res.status(400).json({ error: r.error });
        return;
      }
      res.status(201).json(r.value);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/pembayaran/:id/bukti", (req: Request, res: Response) => {
    try {
      const r = store.attachBukti(String(req.params["id"]), req.body);
      if (!r.ok) {
        res.status(r.notFound === true ? 404 : 400).json({ error: r.error });
        return;
      }
      res.json(r.value);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get("/pembayaran/:id/bukti", (req: Request, res: Response) => {
    try {
      const f = store.buktiFile(String(req.params["id"]));
      if (f === null) {
        res.status(404).json({ error: "Bukti bayar tidak ditemukan" });
        return;
      }
      res.setHeader("Content-Type", f.mime);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${f.fileName.replace(/"/g, "")}"`,
      );
      res.sendFile(f.path);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
