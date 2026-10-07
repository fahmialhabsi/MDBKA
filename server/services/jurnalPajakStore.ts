import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parseHistoryCsv } from "../types/historyCsv";
import {
  applyKursRules,
  DEFAULT_SERVER_UTC_OFFSET_HOURS,
  mergeDeals,
  parseKursText,
  updateEntry,
  type JurnalEntry,
} from "../types/jurnalPajak";

/** Selisih jam server MT5 terhadap UTC; env MT5_SERVER_UTC_OFFSET_HOURS menimpa default. */
function serverUtcOffsetHours(): number {
  const raw = (process.env?.["MT5_SERVER_UTC_OFFSET_HOURS"] ?? "").trim();
  const n = raw === "" ? Number.NaN : Number(raw);
  return Number.isFinite(n) && n >= -12 && n <= 14
    ? n
    : DEFAULT_SERVER_UTC_OFFSET_HOURS;
}

/**
 * #507 - penyimpanan jurnal pajak Finex (file JSON di data/ proyek).
 * Sumber transaksi: Common\Files\MDBKA_History_<login>.csv (service MT5
 * MDBKAHistoryService). sync() idempotent: hanya menambah deal baru,
 * kurs & catatan yang sudah diisi tidak pernah ditimpa. Tulis atomik
 * (file sementara lalu rename) agar JSON tidak rusak bila terputus.
 */
export interface JurnalPajakStore {
  readonly login: string;
  readonly file: string;
  load(): JurnalEntry[];
  sync(): { added: number; total: number } | null;
  applyKursText(text: string): { updated: number; rejected: string[] };
  patch(
    dealTicket: string,
    patch: { kursIdr?: number | null; catatan?: string },
  ): boolean;
}

export function resolveJurnalPajakFile(): string {
  const fromEnv = (process.env?.["JURNAL_PAJAK_FILE"] ?? "").trim();
  if (fromEnv !== "") return fromEnv;
  return join(process.cwd(), "data", "jurnal-pajak-finex.json");
}

export function createJurnalPajakStore(args: {
  readonly commonDir: string;
  readonly file: string;
  readonly login: string;
}): JurnalPajakStore {
  const { commonDir, file, login } = args;

  const load = (): JurnalEntry[] => {
    try {
      if (!existsSync(file)) return [];
      const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
      return Array.isArray(parsed) ? (parsed as JurnalEntry[]) : [];
    } catch {
      return [];
    }
  };

  const save = (entries: readonly JurnalEntry[]): void => {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(entries, null, 2), "utf8");
    renameSync(tmp, file);
  };

  return {
    login,
    file,
    load,
    sync() {
      const csv = join(commonDir, `MDBKA_History_${login}.csv`);
      if (!existsSync(csv)) return null;
      const incoming = parseHistoryCsv(readFileSync(csv, "utf8")).filter(
        (d) => d.login === login || d.login === "",
      );
      const merged = mergeDeals(load(), incoming);
      if (merged.added > 0 || !existsSync(file)) save(merged.entries);
      return { added: merged.added, total: merged.entries.length };
    },
    applyKursText(text) {
      const { rules, rejected } = parseKursText(text);
      const applied = applyKursRules(load(), rules, serverUtcOffsetHours());
      if (applied.updated > 0) save(applied.entries);
      return { updated: applied.updated, rejected };
    },
    patch(dealTicket, patch) {
      const next = updateEntry(load(), dealTicket, patch);
      if (next === null) return false;
      save(next);
      return true;
    },
  };
}
