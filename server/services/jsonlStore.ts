/** G-1 (13 Okt 2026) — penulis/pembaca JSONL append-only (fondasi G5). Satu penulis: proses server. */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import {
  canonicalJson,
  parseJsonlText,
  toJsonlLine,
  type JsonlParseResult,
  type JsonlRecord,
  type JsonlSchema,
} from "../../src/lib/jsonlRecord";

/** relPath wajib relatif, pemisah "/", tanpa segmen kosong/"."/"..", berakhiran .jsonl. */
function resolveInside(dataDir: string, relPath: string): string {
  const parts = relPath.split("/");
  const bad =
    relPath.includes("\\") ||
    relPath.includes(":") ||
    !relPath.endsWith(".jsonl") ||
    parts.some((p) => p === "" || p === "." || p === "..");
  if (bad) throw new Error(`path JSONL tidak sah: ${relPath}`);
  return join(dataDir, ...parts);
}

export function appendJsonlRecord(dataDir: string, relPath: string, record: JsonlRecord): string {
  const file = resolveInside(dataDir, relPath);
  const line = toJsonlLine(record) + "\n";
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, line, "utf8");
  return file;
}

export function readJsonlRecords(dataDir: string, relPath: string, schema: JsonlSchema): JsonlParseResult {
  const file = resolveInside(dataDir, relPath);
  if (!existsSync(file)) return { records: [], brokenLines: 0, otherSchemaLines: 0 };
  return parseJsonlText(readFileSync(file, "utf8"), schema);
}

/** SHA-256 heksadesimal dari JSON kanonik snapshot. */
export function snapshotFingerprint(snapshot: unknown): string {
  return createHash("sha256").update(canonicalJson(snapshot), "utf8").digest("hex");
}
