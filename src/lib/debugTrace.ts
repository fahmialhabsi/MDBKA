declare global {
  var __MDBKA_DEBUG_ENABLED__: boolean | undefined;
}

/**
 * Penanda mode trace diagnostik. Diaktifkan dari main.tsx hanya saat
 * `import.meta.env.DEV`, sehingga file-file yang diuji unit (CJS) tidak
 * pernah menyentuh sintaks `import.meta` dan production tetap senyap.
 */
export function isDebugTraceEnabled(): boolean {
  try {
    return globalThis.__MDBKA_DEBUG_ENABLED__ === true;
  } catch {
    return false;
  }
}

export function truncateText(text: string, max = 500): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…[+${text.length - max} chars, lihat teks OCR mentah di UI]`;
}

/** Log diagnostik terstruktur, DEV-only. Diam total saat flag mati. */
export function traceOcrStage(
  stage: string,
  payload: Record<string, unknown>
): void {
  if (!isDebugTraceEnabled()) return;
  console.debug("[MDBKA TRACE]", { stage, ...payload });
}

/** Varian dengan tag kustom (mis. "[MDBKA MA50]"). Sama-sama DEV-only. */
export function traceTag(
  tag: string,
  payload: Record<string, unknown>
): void {
  if (!isDebugTraceEnabled()) return;
  console.debug(tag, payload);
}
