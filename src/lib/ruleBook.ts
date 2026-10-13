/** G-2 (13 Okt 2026) — Buku Aturan berversi: tipe + pembaca. Murni. */
export type RuleStatus = "UJI_DEMO" | "PERCOBAAN_LIVE" | "LIVE" | "DICABUT";
export type RuleKind = "strategi" | "fitur" | "penjaga";
export type RuleRole = "setup" | "konteks" | "penahan";

export interface RuleEntry {
  readonly id: string;
  readonly versi: string;
  readonly nama: string;
  readonly jenis: RuleKind;
  readonly peran: RuleRole;
  readonly golongan: readonly string[] | null;
  readonly timeframe: Readonly<Record<string, string>> | null;
  readonly sumberData: readonly string[];
  readonly parameter: Readonly<Record<string, number | string | boolean | null>>;
  readonly status: RuleStatus;
  readonly aktifSejak: string;
  readonly dibuatOleh: string;
  readonly alasanPerubahan: string;
  readonly ujiSebelum: Readonly<Record<string, number | null>> | null;
  readonly ujiSesudah: Readonly<Record<string, number | null>> | null;
  readonly versiSebelumnya: string | null;
  /**
   * T-AUDIT (13 Okt 2026): versi turunan WAJIB merujuk ID peringatan/sebab
   * rugi dari Tim Audit Trade (mis. "W-rsi:≥70", "MELAWAN_SEJAK_MASUK").
   * Versi pertama (versiSebelumnya null) boleh tanpa rujukan.
   */
  readonly auditRujukan?: readonly string[];
}

export interface RuleBookParse {
  readonly entries: readonly RuleEntry[];
  readonly errors: readonly string[];
}

const RULE_STATUSES: readonly RuleStatus[] = ["UJI_DEMO", "PERCOBAAN_LIVE", "LIVE", "DICABUT"];
const RULE_KINDS: readonly RuleKind[] = ["strategi", "fitur", "penjaga"];
const RULE_ROLES: readonly RuleRole[] = ["setup", "konteks", "penahan"];

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isPlainObject(value) && Object.values(value).every((v) => typeof v === "string");
}

function isParamRecord(value: unknown): value is Record<string, number | string | boolean | null> {
  return (
    isPlainObject(value) &&
    Object.values(value).every(
      (v) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)),
    )
  );
}

function isTestSummary(value: unknown): value is Record<string, number | null> | null {
  return (
    value === null ||
    (isPlainObject(value) && Object.values(value).every((v) => v === null || (typeof v === "number" && Number.isFinite(v))))
  );
}

/** Alasan bila elemen tidak sah; null bila sah. */
function invalidReason(it: Record<string, unknown>): string | null {
  if (typeof it.id !== "string" || it.id === "") return "id wajib teks";
  if (typeof it.versi !== "string" || it.versi === "") return "versi wajib teks";
  if (typeof it.nama !== "string" || it.nama === "") return "nama wajib teks";
  if (!oneOf(it.jenis, RULE_KINDS)) return "jenis tidak dikenal";
  if (!oneOf(it.peran, RULE_ROLES)) return "peran tidak dikenal";
  if (!(it.golongan === null || isStringArray(it.golongan))) return "golongan wajib daftar teks atau null";
  if (!(it.timeframe === null || isStringRecord(it.timeframe))) return "timeframe wajib objek teks atau null";
  if (!isStringArray(it.sumberData)) return "sumberData wajib daftar teks";
  if (!isParamRecord(it.parameter)) return "parameter wajib objek nilai sederhana";
  if (!oneOf(it.status, RULE_STATUSES)) return "status tidak dikenal";
  if (typeof it.aktifSejak !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(it.aktifSejak)) return "aktifSejak wajib YYYY-MM-DD";
  if (typeof it.dibuatOleh !== "string" || it.dibuatOleh === "") return "dibuatOleh wajib teks";
  if (typeof it.alasanPerubahan !== "string" || it.alasanPerubahan === "") return "alasanPerubahan wajib teks";
  if (!isTestSummary(it.ujiSebelum)) return "ujiSebelum wajib objek angka atau null";
  if (!isTestSummary(it.ujiSesudah)) return "ujiSesudah wajib objek angka atau null";
  if (!(it.versiSebelumnya === null || typeof it.versiSebelumnya === "string")) return "versiSebelumnya wajib teks atau null";
  if (it.auditRujukan !== undefined && !isStringArray(it.auditRujukan)) return "auditRujukan wajib daftar teks";
  if (typeof it.versiSebelumnya === "string" && !(isStringArray(it.auditRujukan) && it.auditRujukan.length > 0)) {
    return "versi turunan wajib merujuk hasil Tim Audit Trade (auditRujukan)";
  }
  return null;
}

export function parseRuleBook(raw: unknown): RuleBookParse {
  if (!Array.isArray(raw)) return { entries: [], errors: ["Buku Aturan harus berupa array"] };
  const entries: RuleEntry[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  (raw as readonly unknown[]).forEach((item, index) => {
    const no = index + 1;
    if (!isPlainObject(item)) {
      errors.push(`baris ${no}: bukan objek`);
      return;
    }
    const reason = invalidReason(item);
    if (reason !== null) {
      errors.push(`baris ${no}: ${reason}`);
      return;
    }
    const entry = item as unknown as RuleEntry;
    const key = `${entry.id}@${entry.versi}`;
    if (seen.has(key)) {
      errors.push(`baris ${no}: ganda ${key}`);
      return;
    }
    seen.add(key);
    entries.push(entry);
  });
  return { entries, errors };
}

/** Versi baru = baris baru: ambil baris terakhir dengan id itu. */
export function latestVersion(entries: readonly RuleEntry[], id: string): RuleEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].id === id) return entries[i];
  }
  return null;
}

/** Akun Live hanya menjalankan PERCOBAAN_LIVE atau LIVE. */
export function allowedOnLive(entry: RuleEntry): boolean {
  return entry.status === "PERCOBAAN_LIVE" || entry.status === "LIVE";
}
