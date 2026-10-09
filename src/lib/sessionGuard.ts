/**
 * Satpam Sesi S2 (9 Okt 2026) — status pasar per simbol dari jam trading
 * resmi broker (MDBKA_Sessions_<login>.csv). MURNI, tanpa import runtime.
 * Semua jam = JAM SERVER broker; hari 0 = Minggu … 6 = Sabtu.
 * Latar: META.US OTB tidak bisa ditutup ("Market closed") di luar jam bursa AS.
 */
export interface TradeSession {
  readonly symbol: string;
  readonly day: number;
  readonly fromMin: number;
  readonly toMin: number;
}

export interface SessionState {
  /** false = simbol tak ada di file sesi (jujur: tidak diketahui). */
  readonly known: boolean;
  readonly open: boolean;
  /** Menit sampai pasar tutup (bila buka). */
  readonly closesInMin: number | null;
  /** Menit sampai pasar buka lagi (bila tutup). */
  readonly opensInMin: number | null;
  /** Jam server buka berikutnya "YYYY.MM.DD HH:MM" (bila tutup). */
  readonly nextOpenServer: string | null;
}

const WEEK = 7 * 1440;
const MT5_TIME = /^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2})/;

function parseServer(ts: string): { ms: number; weekMin: number } | null {
  const m = MT5_TIME.exec(ts.trim());
  if (m === null) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return { ms, weekMin: d.getUTCDay() * 1440 + d.getUTCHours() * 60 + d.getUTCMinutes() };
}

function fmt(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Interval mingguan [start,end) digabung bila bersambung (mis. Minggu 23:05–24:00 + Senin 00:00–23:00). */
export function weeklyIntervals(sessions: readonly TradeSession[], symbol: string): [number, number][] {
  const sym = symbol.trim().toUpperCase();
  const raw = sessions
    .filter((s) => s.symbol === sym)
    .map((s): [number, number] => [s.day * 1440 + s.fromMin, s.day * 1440 + s.toMin])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const iv of raw) {
    const last = out[out.length - 1];
    if (last !== undefined && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  // Sabtu 24:00 bersambung ke Minggu 00:00.
  if (out.length > 1 && out[0][0] === 0 && out[out.length - 1][1] === WEEK) {
    const first = out.shift() as [number, number];
    out[out.length - 1][1] = WEEK + first[1];
  }
  return out;
}

export function sessionState(
  symbol: string,
  serverNow: string,
  sessions: readonly TradeSession[],
): SessionState {
  const unknown: SessionState = { known: false, open: false, closesInMin: null, opensInMin: null, nextOpenServer: null };
  const now = parseServer(serverNow);
  const ivs = weeklyIntervals(sessions, symbol);
  if (now === null || ivs.length === 0) return unknown;
  const t = now.weekMin;
  for (const [a, b] of ivs) {
    for (const shift of [0, -WEEK]) {
      if (t >= a + shift && t < b + shift) {
        return { known: true, open: true, closesInMin: b + shift - t, opensInMin: null, nextOpenServer: null };
      }
    }
  }
  let best = Infinity;
  for (const [a] of ivs) {
    const wait = (a - t + WEEK) % WEEK;
    if (wait > 0 && wait < best) best = wait;
  }
  if (!Number.isFinite(best)) return unknown;
  return { known: true, open: false, closesInMin: null, opensInMin: best, nextOpenServer: fmt(now.ms + best * 60_000) };
}

/** Jam server sekarang "YYYY.MM.DD HH:MM:SS" dari jam UTC + selisih server. */
export function serverNowText(nowUtcMs: number, serverOffsetHours: number): string {
  const d = new Date(nowUtcMs + serverOffsetHours * 3_600_000);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** "2026.10.09 15:30" (jam server) → "Jumat 22:30 WIT". */
export function serverToWitLabel(serverText: string, serverOffsetHours: number): string | null {
  const m = MT5_TIME.exec(serverText.trim());
  if (m === null) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) + (9 - serverOffsetHours) * 3_600_000;
  const d = new Date(ms);
  return `${HARI[d.getUTCDay()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} WIT`;
}

function durasi(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m} menit` : m === 0 ? `${h} jam` : `${h} jam ${m} menit`;
}

/** Ambang peringatan "pasar segera tutup" (menit). */
export const SESSION_WARN_MIN = 60;

/**
 * S4: pesan kartu posisi. null = pasar buka normal / sesi tak diketahui.
 * closed = tidak bisa ditutup/diubah sekarang; soon = tutup ≤ 60 menit lagi.
 */
export function sessionNotice(
  symbol: string,
  state: SessionState,
  serverOffsetHours: number,
): { level: "closed" | "soon"; text: string } | null {
  if (!state.known) return null;
  if (!state.open && state.nextOpenServer !== null && state.opensInMin !== null) {
    const wit = serverToWitLabel(state.nextOpenServer, serverOffsetHours) ?? state.nextOpenServer;
    return {
      level: "closed",
      text: `Pasar ${symbol} sedang TUTUP — posisi belum bisa ditutup/diubah di MT5 ("Market closed"). Bisa lagi mulai ${wit} (${durasi(state.opensInMin)} lagi).`,
    };
  }
  if (state.open && state.closesInMin !== null && state.closesInMin <= SESSION_WARN_MIN) {
    return {
      level: "soon",
      text: `Pasar ${symbol} tutup ${durasi(state.closesInMin)} lagi. Setelah itu posisi tidak bisa ditutup/diubah sampai pasar buka lagi — putuskan sebelum tutup.`,
    };
  }
  return null;
}

