/**
 * Tahap P2 — kesegaran data live (MODUL MURNI, CJS-safe: tanpa import.meta,
 * tanpa DOM — lihat catatan di src/lib/debugTrace.ts).
 *
 * Desain anti-timezone: umur data dihitung dari kapan KLIEN terakhir
 * melihat payload BERUBAH (jam klien sendiri), BUKAN dari timestamp
 * server MT5 (zona waktu server vs lokal bisa selisih berjam-jam dan
 * akan selalu tampak basi bila dibandingkan langsung).
 * Akhir pekan (market tutup, tick berhenti) otomatis terdeteksi basi
 * setelah ambang lewat.
 */

/** Tanpa payload baru selama ini → basi (default 15 menit). */
export const STALE_AFTER_MS = 15 * 60 * 1000;

/**
 * Seed basi awal: timestamp snapshot (waktu server MT5/ISO backend)
 * dibanding jam klien. Margin 12 jam menutup selisih zona waktu
 * (server MT5 biasanya GMT+0..+3) sehingga tick weekday segar TIDAK
 * pernah false-positive; gap akhir pekan (48 jam+) langsung terdeteksi.
 * Dipakai HANYA sebagai seed awal; setelah itu umur dihitung dari
 * perubahan payload yang diamati klien (isStale).
 */
export const CLEARLY_STALE_AFTER_MS = 12 * 3600 * 1000;

/**
 * Parse timestamp snapshot ke ms epoch. Format didukung:
 * - MT5 "2026.10.02 22:54:59" (dibaca sebagai UTC; error maks. offset
 *   zona server, tercover margin 12 jam di isClearlyStale)
 * - ISO 8601 ("2026-10-04T06:54:37.014Z")
 * Tak dikenal → null (jangan menuduh basi tanpa data).
 */
export function parseSnapshotTime(timestamp: string): number | null {
  const trimmed = timestamp.trim();
  if (trimmed === "") return null;
  const mt5 = /^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(trimmed);
  if (mt5 !== null) {
    const ms = Date.UTC(
      Number(mt5[1]),
      Number(mt5[2]) - 1,
      Number(mt5[3]),
      Number(mt5[4]),
      Number(mt5[5]),
      Number(mt5[6]),
    );
    return Number.isFinite(ms) ? ms : null;
  }
  const iso = Date.parse(trimmed);
  return Number.isFinite(iso) ? iso : null;
}

/** True bila timestamp snapshot lebih tua dari ambang jelas-basi. */
export function isClearlyStale(
  timestamp: string | undefined,
  nowMs: number = Date.now(),
  thresholdMs: number = CLEARLY_STALE_AFTER_MS,
): boolean {
  if (timestamp === undefined) return false;
  const parsed = parseSnapshotTime(timestamp);
  if (parsed === null) return false;
  if (!Number.isFinite(nowMs)) return false;
  return nowMs - parsed > thresholdMs;
}

/** True bila selisih nowMs-lastChangeMs melewati ambang. */
export function isStale(
  lastChangeMs: number | null,
  nowMs: number = Date.now(),
  thresholdMs: number = STALE_AFTER_MS,
): boolean {
  if (lastChangeMs === null) return false;
  if (!Number.isFinite(lastChangeMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - lastChangeMs > thresholdMs;
}

/** Label umur Indonesia: "baru saja" / "X mnt lalu" / "X jam lalu" / "X hari lalu". */
export function formatAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "baru saja";
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return "baru saja";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}
