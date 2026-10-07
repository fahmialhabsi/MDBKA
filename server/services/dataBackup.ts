import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";

/**
 * Backup data MDBKA (8 Okt 2026).
 *
 * - Data penting (semua isi data/ KECUALI history/) → disalin utuh ke
 *   <backupDir>/<YYYY-MM-DD_HHMM>/ (kecil, beberapa KB).
 * - Arsip tick data/history (GB) → di-mirror bertahap ke
 *   <backupDir>/history/: hanya file baru/berubah (ukuran atau waktu).
 * - Penanda <backupDir>/last-backup.json → dasar pengingat "sudah waktunya
 *   backup" (belum pernah, atau ada data penting berubah sejak backup).
 */
export const HISTORY_DIR_NAME = "history";

export function resolveBackupDir(): string {
  const fromEnv = (process.env?.["BACKUP_DIR"] ?? "").trim();
  return fromEnv !== "" ? fromEnv : join(homedir(), "Documents", "MDBKA-Backup");
}

interface FileInfo {
  readonly rel: string;
  readonly size: number;
  readonly mtimeMs: number;
}

function listFiles(root: string, skipTopDir: string | null): FileInfo[] {
  if (!existsSync(root)) return [];
  const out: FileInfo[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      const rel = relative(root, full);
      if (st.isDirectory()) {
        if (skipTopDir !== null && dir === root && name === skipTopDir) continue;
        walk(full);
      } else if (st.isFile()) {
        out.push({ rel, size: st.size, mtimeMs: st.mtimeMs });
      }
    }
  };
  walk(root);
  return out;
}

export interface BackupMarker {
  readonly at: string;
  readonly snapshot: string;
  readonly files: number;
  readonly historyCopied: number;
}

export interface BackupStatus {
  readonly backupDir: string;
  readonly last: BackupMarker | null;
  /** File penting yang berubah/baru sejak backup terakhir. */
  readonly changedFiles: number;
  /** File arsip tick yang belum ter-mirror. */
  readonly historyPending: number;
  readonly due: boolean;
  readonly reason: string;
}

function readMarker(backupDir: string): BackupMarker | null {
  const file = join(backupDir, "last-backup.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as BackupMarker;
  } catch {
    return null;
  }
}

function historyNeedsCopy(src: FileInfo, mirrorRoot: string): boolean {
  const dest = join(mirrorRoot, src.rel);
  if (!existsSync(dest)) return true;
  const st = statSync(dest);
  return st.size !== src.size || st.mtimeMs < src.mtimeMs;
}

export function getBackupStatus(
  dataDir: string,
  backupDir: string = resolveBackupDir(),
): BackupStatus {
  const last = readMarker(backupDir);
  const lastMs = last === null ? 0 : Date.parse(last.at);
  const important = listFiles(dataDir, HISTORY_DIR_NAME);
  const changedFiles = important.filter((f) => f.mtimeMs > lastMs).length;
  const historyPending = listFiles(join(dataDir, HISTORY_DIR_NAME), null).filter((f) =>
    historyNeedsCopy(f, join(backupDir, HISTORY_DIR_NAME)),
  ).length;
  const due = last === null || changedFiles > 0;
  const reason =
    last === null
      ? "Data MDBKA belum pernah dibackup."
      : changedFiles > 0
        ? `${changedFiles} file data penting berubah sejak backup terakhir.`
        : "Backup sudah terbaru.";
  return { backupDir, last, changedFiles, historyPending, due, reason };
}

function stamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Asinkron: arsip tick bisa GB — jangan blok event loop backend. */
export async function runBackup(
  dataDir: string,
  backupDir: string = resolveBackupDir(),
  now: Date = new Date(),
): Promise<BackupMarker> {
  const snapshot = stamp(now);
  const snapRoot = join(backupDir, snapshot);
  const important = listFiles(dataDir, HISTORY_DIR_NAME);
  for (const f of important) {
    const dest = join(snapRoot, f.rel);
    await mkdir(join(dest, ".."), { recursive: true });
    await copyFile(join(dataDir, f.rel), dest);
  }
  const mirrorRoot = join(backupDir, HISTORY_DIR_NAME);
  let historyCopied = 0;
  for (const f of listFiles(join(dataDir, HISTORY_DIR_NAME), null)) {
    if (!historyNeedsCopy(f, mirrorRoot)) continue;
    const dest = join(mirrorRoot, f.rel);
    await mkdir(join(dest, ".."), { recursive: true });
    await copyFile(join(dataDir, HISTORY_DIR_NAME, f.rel), dest);
    historyCopied++;
  }
  const marker: BackupMarker = {
    at: now.toISOString(),
    snapshot,
    files: important.length,
    historyCopied,
  };
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(join(backupDir, "last-backup.json"), JSON.stringify(marker, null, 2));
  return marker;
}
