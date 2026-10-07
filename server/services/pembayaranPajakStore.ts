import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import {
  BUKTI_MIME_EXT,
  DEFAULT_PROFIL,
  decodeBukti,
  kodeAkunFor,
  validatePembayaran,
  validateProfil,
  type PembayaranPajak,
  type ProfilPajak,
} from "../types/pembayaranPajak";

/**
 * #510 - penyimpanan profil pajak, catatan pembayaran, dan file bukti bayar
 * (data/pajak-op.json + data/bukti-pajak/). Tulis atomik; nama file bukti
 * dibuat dari id (bukan dari input) sehingga aman dari path traversal.
 */
interface PajakDb {
  profil: Record<string, ProfilPajak>;
  pembayaran: PembayaranPajak[];
}

export type StoreResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string; readonly notFound?: boolean };

export interface PembayaranPajakStore {
  getProfil(year: number): ProfilPajak;
  setProfil(year: number, raw: unknown): StoreResult<ProfilPajak>;
  list(year?: number): PembayaranPajak[];
  add(raw: unknown, bukti?: unknown): StoreResult<PembayaranPajak>;
  attachBukti(id: string, bukti: unknown): StoreResult<PembayaranPajak>;
  buktiFile(
    id: string,
  ): { path: string; mime: string; fileName: string } | null;
}

export function resolvePajakDir(): string {
  const fromEnv = (process.env?.["PAJAK_DATA_DIR"] ?? "").trim();
  if (fromEnv !== "") return fromEnv;
  return join(process.cwd(), "data");
}

export function createPembayaranPajakStore(dir: string): PembayaranPajakStore {
  const dbFile = join(dir, "pajak-op.json");
  const buktiDir = join(dir, "bukti-pajak");

  const load = (): PajakDb => {
    try {
      if (!existsSync(dbFile)) return { profil: {}, pembayaran: [] };
      const parsed = JSON.parse(
        readFileSync(dbFile, "utf8"),
      ) as Partial<PajakDb>;
      return {
        profil: parsed.profil ?? {},
        pembayaran: Array.isArray(parsed.pembayaran) ? parsed.pembayaran : [],
      };
    } catch {
      return { profil: {}, pembayaran: [] };
    }
  };

  const save = (db: PajakDb): void => {
    mkdirSync(dirname(dbFile), { recursive: true });
    const tmp = `${dbFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
    renameSync(tmp, dbFile);
  };

  const writeBukti = (
    id: string,
    raw: unknown,
  ): StoreResult<PembayaranPajak["bukti"]> => {
    const decoded = decodeBukti(raw);
    if (!decoded.ok) return decoded;
    const { upload, bytes } = decoded.value;
    const storedName = `${id}${BUKTI_MIME_EXT[upload.mime]}`;
    mkdirSync(buktiDir, { recursive: true });
    writeFileSync(join(buktiDir, storedName), bytes);
    return {
      ok: true,
      value: {
        fileName: upload.name,
        mime: upload.mime,
        size: bytes.length,
        storedName,
      },
    };
  };

  return {
    getProfil(year) {
      return load().profil[String(year)] ?? DEFAULT_PROFIL;
    },
    setProfil(year, raw) {
      const v = validateProfil(raw);
      if (!v.ok) return v;
      const db = load();
      db.profil[String(year)] = v.value;
      save(db);
      return { ok: true, value: v.value };
    },
    list(year) {
      const all = load().pembayaran;
      const rows =
        year === undefined ? all : all.filter((p) => p.year === year);
      return [...rows].sort((a, b) =>
        a.tanggalBayar.localeCompare(b.tanggalBayar),
      );
    },
    add(raw, bukti) {
      const v = validatePembayaran(raw);
      if (!v.ok) return v;
      const id = randomUUID();
      let meta: PembayaranPajak["bukti"] = null;
      if (bukti !== undefined && bukti !== null) {
        const b = writeBukti(id, bukti);
        if (!b.ok) return b;
        meta = b.value;
      }
      const entry: PembayaranPajak = {
        id,
        ...v.value,
        kodeAkun: kodeAkunFor(v.value.jenis),
        bukti: meta,
        createdAt: new Date().toISOString(),
      };
      const db = load();
      db.pembayaran.push(entry);
      save(db);
      return { ok: true, value: entry };
    },
    attachBukti(id, bukti) {
      const db = load();
      const idx = db.pembayaran.findIndex((p) => p.id === id);
      if (idx < 0)
        return {
          ok: false,
          error: "Pembayaran tidak ditemukan",
          notFound: true,
        };
      const b = writeBukti(id, bukti);
      if (!b.ok) return b;
      const updated: PembayaranPajak = {
        ...db.pembayaran[idx],
        bukti: b.value,
      };
      db.pembayaran[idx] = updated;
      save(db);
      return { ok: true, value: updated };
    },
    buktiFile(id) {
      const entry = load().pembayaran.find((p) => p.id === id);
      if (entry === undefined || entry.bukti === null) return null;
      const path = join(buktiDir, entry.bukti.storedName);
      if (!existsSync(path)) return null;
      return { path, mime: entry.bukti.mime, fileName: entry.bukti.fileName };
    },
  };
}
