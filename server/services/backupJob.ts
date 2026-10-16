import {
  backupSedangJalan,
  estimateBackupBytes,
  freeBytesAt,
  getBackupStatus,
  runBackup,
} from "./dataBackup";

/**
 * Backup OTOMATIS data MDBKA (17 Okt 2026) — menggantikan pengingat + tombol di dashboard.
 * Memakai runBackup() yang sudah ada (snapshot data penting + mirror arsip tick bertahap), tanpa
 * mengubah isinya. Aturan satu putaran:
 *  1. Lewati bila backup lain (manual/otomatis) sedang berjalan.
 *  2. Lewati bila tidak ada data penting yang berubah sejak backup terakhir.
 *  3. Lewati bila backup terakhir lebih baru dari BACKUP_INTERVAL_MS (mencegah snapshot menumpuk
 *     tiap backend restart; tiap snapshot ±6 MB dan TIDAK dihapus otomatis).
 *  4. Tunda bila ruang drive tujuan kurang: dibutuhkan = perkiraan byte yang disalin + BACKUP_RESERVE_BYTES.
 *     (drive C: sempat tersisa 4,9 GB saat fitur ini dibuat.) Ruang tak terbaca = lanjut, bukan memblokir.
 * Kegagalan hanya muncul di log backend (tidak ada tampilan di dashboard sesuai permintaan Fahmi).
 */
export const BACKUP_FIRST_DELAY_MS = 10 * 60_000;
export const BACKUP_INTERVAL_MS = 6 * 60 * 60_000;
/** Sisa ruang minimum SETELAH backup, supaya MT5/OS tidak kehabisan disk. Bisa disesuaikan. */
export const BACKUP_RESERVE_BYTES = 2 * 1024 ** 3;

export interface BackupOnceOpts {
  readonly minGapMs?: number;
  readonly reserveBytes?: number;
  readonly freeBytes?: (dir: string) => number | null;
}

const gib = (b: number): string => (b / 1024 ** 3).toFixed(2).replace(".", ",");

/** Satu putaran backup otomatis. Mengembalikan teks log ("" = tidak ada yang perlu dilaporkan). */
export async function runBackupOnce(
  dataDir: string,
  backupDir: string,
  now: Date = new Date(),
  opts: BackupOnceOpts = {},
): Promise<string> {
  if (backupSedangJalan()) return "";
  const status = getBackupStatus(dataDir, backupDir);
  if (!status.due) return "";
  const minGapMs = opts.minGapMs ?? BACKUP_INTERVAL_MS;
  if (status.last !== null && now.getTime() - Date.parse(status.last.at) < minGapMs) return "";

  const butuh = estimateBackupBytes(dataDir, backupDir);
  const reserve = opts.reserveBytes ?? BACKUP_RESERVE_BYTES;
  const bebas = (opts.freeBytes ?? freeBytesAt)(backupDir);
  if (bebas !== null && bebas < butuh + reserve) {
    return `⚠ Backup otomatis ditunda: ruang kosong ${gib(bebas)} GiB di tujuan, butuh ${gib(butuh)} GiB + cadangan ${gib(reserve)} GiB. Kosongkan disk atau pindahkan BACKUP_DIR ke drive lain.`;
  }

  const m = await runBackup(dataDir, backupDir, now);
  return (
    `✓ Backup otomatis MDBKA: ${m.files} file penting → ${backupDir}\\${m.snapshot}` +
    (m.historyCopied > 0 ? `, ${m.historyCopied} file arsip tick` : "")
  );
}

/** Jadwal: pertama BACKUP_FIRST_DELAY_MS setelah start, lalu tiap BACKUP_INTERVAL_MS; tidak pernah bertumpuk. */
export function startBackupSchedule(
  run: () => Promise<string>,
  log: (msg: string) => void = console.log,
  firstDelayMs: number = BACKUP_FIRST_DELAY_MS,
  intervalMs: number = BACKUP_INTERVAL_MS,
): { stop: () => void } {
  let busy = false;
  const tick = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      const msg = await run();
      if (msg !== "") log(msg);
    } catch (e) {
      log(`⚠ Backup otomatis gagal: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy = false;
    }
  };
  const first = setTimeout(() => void tick(), firstDelayMs);
  const every = setInterval(() => void tick(), intervalMs);
  return {
    stop: () => {
      clearTimeout(first);
      clearInterval(every);
    },
  };
}
