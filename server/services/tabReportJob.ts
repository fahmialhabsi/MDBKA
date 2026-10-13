import { randomUUID } from "node:crypto";
import { jsonlRelativePath } from "../../src/lib/jsonlRecord";
import {
  buildTabReport,
  calendarTabFindings,
  exposureTabFindings,
  lastHourWindow,
  tradeTabFindings,
  type TabCalendarEvent,
  type TabEquity,
  type TabPosition,
} from "../../src/lib/tabReports";
import type { BrokerId } from "../../src/types/broker";
import { appendJsonlRecord } from "./jsonlStore";

/**
 * TT-1/TT-2/G-7 (13 Okt 2026) — laporan per jam tim Trade, Exposure, Calendar
 * per broker ke data/laporan/laporan-<login|broker>-<YYYY-MM>.jsonl.
 * Login belum terverifikasi sebelum F3 → login null, berkas memakai nama broker.
 * Satu laporan per tim per jendela jam (diingat di memori proses).
 */
export interface TabReportSource {
  readonly broker: BrokerId;
  readonly getPositions: () => readonly TabPosition[] | null;
  readonly getEquity: () => TabEquity | null;
  /** Jam server MT5 terbaru (dari kuotasi); null = tidak diketahui → laporan dilewati. */
  readonly getServerNow: () => string | null;
  /** Kalender broker; null = tidak tersedia. login dari nama berkas MDBKA_Calendar_<login>.csv. */
  readonly getCalendar: () => { readonly events: readonly TabCalendarEvent[]; readonly file: string } | null;
  /** F3: identitas akun terbukti (EA); absen/gagal = login null, tidak-terbukti. */
  readonly getIdentity?: () => { readonly login: string | null; readonly jenisAkun: "demo" | "live" | "tidak-terbukti" };
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function runTabReportsOnce(
  sources: readonly TabReportSource[],
  dataDir: string,
  now: Date,
  done: Set<string>,
  newId: () => string = () => randomUUID(),
): number {
  const window = lastHourWindow(now.getTime());
  let written = 0;
  for (const src of sources) {
    const serverNow = safe(src.getServerNow, null);
    if (serverNow === null) continue;
    const positions = safe(src.getPositions, null);
    const equity = safe(src.getEquity, null);
    const calendar = safe(src.getCalendar, null);
    const identity = src.getIdentity === undefined ? null : safe(src.getIdentity, null);
    const login = identity?.login ?? null;
    const reports = [
      positions === null
        ? null
        : { tim: "TAB_TRADE" as const, findings: tradeTabFindings(positions, equity, serverNow), berkas: ["positions.csv", "equity.csv"] },
      positions === null ? null : { tim: "TAB_EXPOSURE" as const, findings: exposureTabFindings(positions), berkas: ["positions.csv"] },
      { tim: "TAB_CALENDAR" as const, findings: calendarTabFindings(calendar?.events ?? null, serverNow), berkas: [calendar?.file ?? "MDBKA_Calendar_<login>.csv (tidak ada)"] },
    ];
    for (const r of reports) {
      if (r === null) continue;
      const key = `${src.broker}|${r.tim}|${window.start}`;
      if (done.has(key)) continue;
      const rec = buildTabReport(
        {
          laporanId: newId(),
          broker: src.broker,
          login,
          jenisAkun: identity?.jenisAkun ?? "tidak-terbukti",
          tim: r.tim,
          jendelaMulaiUtc: window.start,
          jendelaSelesaiUtc: window.end,
          sumberData: r.berkas.map((berkas) => ({ berkas, umurDetik: null })),
        },
        r.findings,
      );
      appendJsonlRecord(dataDir, jsonlRelativePath("laporan", login ?? src.broker, window.end), rec);
      done.add(key);
      written++;
    }
  }
  return written;
}

export const TAB_REPORT_FIRST_DELAY_MS = 120_000;
export const TAB_REPORT_INTERVAL_MS = 15 * 60 * 1000;

/** Dicek tiap 15 mnt; laporan hanya ditulis sekali per jendela jam (kunci di `done`). */
export function startTabReportSchedule(
  run: () => number,
  log: (msg: string) => void = console.log,
): { stop: () => void } {
  const tick = (): void => {
    try {
      const n = run();
      if (n > 0) log(`✓ Laporan tim tab: ${n} laporan ditulis`);
    } catch (e) {
      log(`⚠ Laporan tim tab gagal: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const first = setTimeout(tick, TAB_REPORT_FIRST_DELAY_MS);
  const every = setInterval(tick, TAB_REPORT_INTERVAL_MS);
  return {
    stop: () => {
      clearTimeout(first);
      clearInterval(every);
    },
  };
}
