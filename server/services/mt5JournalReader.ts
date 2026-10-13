import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseJournalText, type JournalEvent } from "../../src/lib/mt5Journal";

/**
 * TT-3 (13 Okt 2026) — baca log Journal (Logs/) dan Experts (MQL5/Logs/)
 * satu terminal: dua berkas harian terbaru (kemarin + hari ini), UTF-16LE.
 * Folder terminal diturunkan dari path quotes.csv di .env
 * (…\Terminal\<id>\MQL5\Files\quotes.csv → …\Terminal\<id>). Tidak pernah throw.
 */
export function terminalDirFromFilesPath(filePath: string | undefined): string | null {
  if (filePath === undefined || filePath.trim() === "") return null;
  const p = filePath.trim().replace(/\\/g, "/");
  const files = dirname(p);
  if (!/\/MQL5\/Files$/i.test(files)) return null;
  return dirname(dirname(files));
}

function decode(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  // Tanpa BOM: anggap UTF-16LE bila byte kedua kosong (pola ASCII UTF-16).
  if (buf.length >= 2 && buf[1] === 0x00) return buf.toString("utf16le");
  return buf.toString("utf8");
}

export function readLogDir(dir: string, maxFiles = 2): JournalEvent[] {
  try {
    if (!existsSync(dir)) return [];
    const names = readdirSync(dir)
      .filter((n) => /^\d{8}\.log$/.test(n))
      .sort()
      .slice(-maxFiles);
    return names.flatMap((name) => {
      try {
        const file = join(dir, name);
        if (!statSync(file).isFile()) return [];
        return parseJournalText(decode(readFileSync(file)), name.slice(0, 8));
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export interface TerminalLogs {
  readonly journal: readonly JournalEvent[];
  readonly experts: readonly JournalEvent[];
}

export function readTerminalLogs(terminalDir: string | null): TerminalLogs | null {
  if (terminalDir === null) return null;
  return { journal: readLogDir(join(terminalDir, "Logs")), experts: readLogDir(join(terminalDir, "MQL5", "Logs")) };
}

/** "YYYY.MM.DD HH:MM:SS" jam LOKAL komputer (sama dengan jam di log MT5). */
export function localStamp(d: Date): string {
  const p = (v: number): string => String(v).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
