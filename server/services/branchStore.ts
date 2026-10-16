import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  canDecide,
  isRecommendationId,
  recommendationId,
  type BranchCode,
  type Decision,
  type DecisionKind,
  type Recommendation,
  type RecommendationInput,
} from "../../src/lib/branchOffice";

/**
 * C0 (16 Okt 2026) — arsip Kantor Cabang di data/cabang/<KC-n>/.
 * <id>.json            = Formulir R (ditulis sekali, flag "wx": tidak pernah ditimpa)
 * <id>.keputusan.jsonl = riwayat keputusan Pusat (hanya ditambah; final tidak bisa diganti)
 */
export interface StoredRecommendation {
  readonly rec: Recommendation;
  readonly decisions: readonly Decision[];
}

function branchDir(dataDir: string, code: BranchCode): string {
  return join(dataDir, "cabang", code);
}

export function saveRecommendation(dataDir: string, code: BranchCode, input: RecommendationInput, now: Date): Recommendation {
  const dir = branchDir(dataDir, code);
  mkdirSync(dir, { recursive: true });
  for (let seq = 1; seq <= 999; seq += 1) {
    const id = recommendationId(code, now, seq);
    const file = join(dir, `${id}.json`);
    if (existsSync(file)) continue;
    const rec: Recommendation = { id, cabang: code, tanggalUtc: now.toISOString(), ...input };
    writeFileSync(file, JSON.stringify({ skema: "formulir-r/1", rec }, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    return rec;
  }
  throw new Error("terlalu banyak rekomendasi dalam satu detik");
}

function readDecisions(file: string): Decision[] {
  if (!existsSync(file)) return [];
  const out: Decision[] = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim() === "") continue;
    try {
      const d = JSON.parse(line) as Partial<Decision>;
      if ((d.keputusan === "SETUJU" || d.keputusan === "TOLAK" || d.keputusan === "TUNDA") && typeof d.tanggalUtc === "string") {
        out.push({ keputusan: d.keputusan, catatan: typeof d.catatan === "string" ? d.catatan : "", tanggalUtc: d.tanggalUtc });
      }
    } catch {
      // baris rusak dilewati
    }
  }
  return out;
}

export type DecideResult =
  | { readonly ok: true; readonly decisions: readonly Decision[] }
  | { readonly ok: false; readonly status: number; readonly error: string };

export function saveDecision(
  dataDir: string,
  code: BranchCode,
  id: string,
  decision: { keputusan: DecisionKind; catatan: string },
  now: Date,
): DecideResult {
  if (!isRecommendationId(id) || !id.startsWith(`R-${code}-`)) return { ok: false, status: 400, error: "nomor rekomendasi tidak sah" };
  const dir = branchDir(dataDir, code);
  if (!existsSync(join(dir, `${id}.json`))) return { ok: false, status: 404, error: "rekomendasi tidak ditemukan" };
  const file = join(dir, `${id}.keputusan.jsonl`);
  const before = readDecisions(file);
  if (!canDecide(before)) return { ok: false, status: 409, error: "sudah diputuskan; keputusan tidak boleh ditimpa" };
  const d: Decision = { keputusan: decision.keputusan, catatan: decision.catatan, tanggalUtc: now.toISOString() };
  appendFileSync(file, JSON.stringify(d) + "\n", "utf8");
  return { ok: true, decisions: [...before, d] };
}

/** Semua rekomendasi satu cabang, terbaru di atas; berkas rusak dilewati. */
export function readBranch(dataDir: string, code: BranchCode): StoredRecommendation[] {
  const dir = branchDir(dataDir, code);
  if (!existsSync(dir)) return [];
  const out: StoredRecommendation[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    if (!isRecommendationId(id)) continue;
    try {
      const j = JSON.parse(readFileSync(join(dir, name), "utf8")) as { rec?: Recommendation };
      if (j.rec === undefined || j.rec.id !== id) continue;
      out.push({ rec: j.rec, decisions: readDecisions(join(dir, `${id}.keputusan.jsonl`)) });
    } catch {
      // berkas rusak dilewati
    }
  }
  return out.sort((a, b) => b.rec.id.localeCompare(a.rec.id));
}

/**
 * Map hasil cabang (A-1): data/cabang/<KC-n>/hasil/<JENIS>-<stamp>.json, ditulis sekali (tidak ditimpa).
 */
export function saveHasil(dataDir: string, code: BranchCode, kind: string, payload: unknown, now: Date): string {
  if (!/^[A-Z_]{3,40}$/.test(kind)) throw new Error("jenis map tidak sah");
  const dir = join(branchDir(dataDir, code), "hasil");
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  for (let seq = 1; seq <= 999; seq += 1) {
    const file = join(dir, `${kind}-${stamp}-${String(seq).padStart(3, "0")}.json`);
    if (existsSync(file)) continue;
    writeFileSync(file, JSON.stringify({ skema: "map-hasil/1", cabang: code, jenis: kind, tanggalUtc: now.toISOString(), data: payload }, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    return file;
  }
  throw new Error("terlalu banyak map dalam satu detik");
}

export interface StoredHasil {
  readonly jenis: string;
  readonly tanggalUtc: string;
  readonly data: unknown;
}

/** Map hasil terbaru satu jenis; null = belum ada. */
export function readLatestHasil(dataDir: string, code: BranchCode, kind: string): StoredHasil | null {
  const dir = join(branchDir(dataDir, code), "hasil");
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir).filter((n) => n.startsWith(`${kind}-`) && n.endsWith(".json")).sort();
  for (const name of names.reverse()) {
    try {
      const j = JSON.parse(readFileSync(join(dir, name), "utf8")) as Partial<StoredHasil>;
      if (typeof j.tanggalUtc === "string") return { jenis: kind, tanggalUtc: j.tanggalUtc, data: j.data ?? null };
    } catch {
      // berkas rusak dilewati
    }
  }
  return null;
}

/** Rekomendasi satu nomor (untuk lampiran saat Pusat SETUJU). */
export function readRecommendation(dataDir: string, code: BranchCode, id: string): Recommendation | null {
  if (!isRecommendationId(id)) return null;
  const file = join(branchDir(dataDir, code), `${id}.json`);
  if (!existsSync(file)) return null;
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { rec?: Recommendation }).rec ?? null;
  } catch {
    return null;
  }
}

/** Setelah Pusat SETUJU: map lampiran rekomendasi ditulis sebagai map hasil cabang. Kembalikan path atau null. */
export function deliverLampiran(dataDir: string, code: BranchCode, id: string, now: Date): string | null {
  const rec = readRecommendation(dataDir, code, id);
  if (rec?.lampiran === undefined) return null;
  return saveHasil(dataDir, code, rec.lampiran.kind, { ...rec.lampiran.data, rekomendasi: rec.id }, now);
}
