/**
 * TT-3 (13 Okt 2026) — pembaca log MT5 tab Journal (Logs/) dan Experts
 * (MQL5/Logs/). MURNI. Format diperiksa dari log keempat terminal (13 Okt):
 *   <kode>\t<level 0|1|2>\t<HH:MM:SS.mmm>\t<sumber>\t<pesan>
 * Level: 0 info, 1 peringatan, 2 galat. Jam = jam LOKAL komputer (bukan jam
 * server); tanggal = nama berkas (YYYYMMDD.log). Alamat IP di pesan dihapus
 * (privasi) sebelum disimpan atau dilaporkan.
 */
export type JournalKind =
  | "KONEKSI_PUTUS"
  | "KONEKSI_PULIH"
  | "LOGIN_GAGAL"
  | "ORDER_DITOLAK"
  | "ORDER_TERISI"
  | "AKUN_AKTIF"
  | "EA_DIMUAT"
  | "EA_DILEPAS"
  | "EA_GALAT"
  | "LAIN";

export interface JournalEvent {
  /** "YYYY.MM.DD HH:MM:SS" jam lokal komputer. */
  readonly localTime: string;
  readonly level: number;
  readonly source: string;
  readonly kind: JournalKind;
  readonly login: string | null;
  /** Pesan tanpa alamat IP. */
  readonly message: string;
  /** ORDER_DITOLAK: alasan di kurung siku, mis. "No money". */
  readonly reason: string | null;
  readonly symbol: string | null;
}

const IP = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;

function classify(source: string, message: string, level: number): JournalKind {
  if (source === "Network") {
    if (/connection to .+ lost|disconnected from /i.test(message)) return "KONEKSI_PUTUS";
    if (/authorization on .+ failed/i.test(message)) return "LOGIN_GAGAL";
    if (/authorized on /i.test(message)) return "KONEKSI_PULIH";
    if (/trading has been enabled/i.test(message)) return "AKUN_AKTIF";
    return "LAIN";
  }
  if (source === "Trades" || source === "Trade") {
    if (/^'\d+': failed /i.test(message)) return "ORDER_DITOLAK";
    if (/^'\d+': deal #\d+ .* done/i.test(message)) return "ORDER_TERISI";
    return "LAIN";
  }
  if (source === "Experts") {
    if (/loaded successfully/i.test(message)) return "EA_DIMUAT";
    if (/ removed$/i.test(message)) return "EA_DILEPAS";
    return level >= 2 ? "EA_GALAT" : "LAIN";
  }
  // Berkas MQL5/Logs: sumber = nama EA/service; galat = level 2 atau kata gagal/error/failed.
  if (level >= 2 || /\b(gagal|error|failed)\b/i.test(message)) return "EA_GALAT";
  return "LAIN";
}

/** Urai isi satu berkas log (sudah didekode). `fileDate` = "YYYYMMDD" dari nama berkas. */
export function parseJournalText(text: string, fileDate: string): JournalEvent[] {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(fileDate);
  if (m === null) return [];
  const date = `${m[1]}.${m[2]}.${m[3]}`;
  const out: JournalEvent[] = [];
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const cols = raw.split("\t");
    if (cols.length < 5) continue;
    const level = Number(cols[1]);
    const time = /^(\d{2}:\d{2}:\d{2})/.exec(cols[2] ?? "");
    if (!Number.isInteger(level) || time === null) continue;
    const source = (cols[3] ?? "").trim();
    const message = cols.slice(4).join("\t").replace(IP, "[IP]").trim();
    const login = /^'(\d+)':/.exec(message)?.[1] ?? null;
    const kind = classify(source, message, level);
    const reason = kind === "ORDER_DITOLAK" ? /\[([^\]]+)\]\s*$/.exec(message)?.[1] ?? null : null;
    const symbol = kind === "ORDER_DITOLAK" || kind === "ORDER_TERISI" ? /(?:buy|sell)(?: limit| stop)? [\d.]+ (?:\/ [\d.]+ )?([A-Za-z0-9#._]+)/.exec(message)?.[1] ?? null : null;
    out.push({ localTime: `${date} ${time[1]}`, level, source, kind, login, message, reason, symbol });
  }
  return out;
}

export interface TerminalHealth {
  readonly koneksi: "TERSAMBUNG" | "PUTUS" | "TIDAK_DIKETAHUI";
  readonly loginGagal: boolean;
  /** Waktu lokal kejadian Network terakhir yang menentukan status. */
  readonly sejak: string | null;
}

/**
 * Status koneksi akun dari urutan kejadian Network (jam tidak dibandingkan
 * dengan jam lain — hanya urutan di berkas). `login` null = semua akun.
 */
export function terminalHealth(events: readonly JournalEvent[], login: string | null): TerminalHealth {
  let koneksi: TerminalHealth["koneksi"] = "TIDAK_DIKETAHUI";
  let loginGagal = false;
  let sejak: string | null = null;
  for (const e of events) {
    if (e.source !== "Network" || (login !== null && e.login !== null && e.login !== login)) continue;
    if (e.kind === "KONEKSI_PUTUS") {
      koneksi = "PUTUS";
      sejak = e.localTime;
    } else if (e.kind === "KONEKSI_PULIH" || e.kind === "AKUN_AKTIF") {
      koneksi = "TERSAMBUNG";
      loginGagal = false;
      sejak = e.localTime;
    } else if (e.kind === "LOGIN_GAGAL") {
      // Gagal login akun LAIN (mis. coba server Real) tidak memutus akun aktif.
      if (login === null || e.login === login) {
        loginGagal = true;
        koneksi = "PUTUS";
        sejak = e.localTime;
      }
    }
  }
  return { koneksi, loginGagal, sejak };
}

export interface JournalFindings {
  readonly temuan: readonly string[];
  readonly kejadianPenting: boolean;
}

/** Laporan tim Journal/Experts untuk kejadian dalam jendela waktu lokal [dari, sampai). */
export function journalFindings(
  events: readonly JournalEvent[],
  login: string | null,
  fromLocal: string,
  toLocal: string,
  part: "JOURNAL" | "EXPERTS",
): JournalFindings {
  const inWin = events.filter((e) => e.localTime >= fromLocal && e.localTime < toLocal);
  const count = (k: JournalKind): number => inWin.filter((e) => e.kind === k).length;
  const temuan: string[] = [];
  let penting = false;
  if (part === "JOURNAL") {
    const health = terminalHealth(events.filter((e) => e.localTime < toLocal), login);
    temuan.push(`Koneksi ${health.koneksi}${health.sejak === null ? "" : ` sejak ${health.sejak} (jam lokal)`}`);
    if (health.koneksi !== "TERSAMBUNG") penting = true;
    const putus = count("KONEKSI_PUTUS");
    if (putus > 0) temuan.push(`Koneksi putus ${putus} kali`);
    for (const e of inWin.filter((x) => x.kind === "LOGIN_GAGAL")) temuan.push(`Login gagal ${e.localTime}: ${e.message}`);
    const rejected = inWin.filter((e) => e.kind === "ORDER_DITOLAK");
    for (const e of rejected) temuan.push(`Order ditolak ${e.localTime} ${e.symbol ?? "?"}: ${e.reason ?? e.message}`);
    if (rejected.length > 0) penting = true;
    temuan.push(`Order terisi ${count("ORDER_TERISI")}`);
  } else {
    const errs = inWin.filter((e) => e.kind === "EA_GALAT");
    const bySrc = new Map<string, number>();
    for (const e of errs) bySrc.set(e.source, (bySrc.get(e.source) ?? 0) + 1);
    for (const [src, n] of [...bySrc.entries()].sort()) temuan.push(`Galat ${src}: ${n} kali`);
    if (errs.length > 0) penting = true;
    temuan.push(`EA dimuat ${count("EA_DIMUAT")} · dilepas ${count("EA_DILEPAS")}`);
  }
  return { temuan, kejadianPenting: penting };
}
