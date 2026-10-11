/**
 * E2 (12 Okt 2026) — PERAKIT CANDLE timeframe lebih besar dari CSV H1. MURNI.
 *
 * Blok jam server mengikuti MT5: H4 = 00/04/08/12/16/20 (jam = kelipatan
 * `hours` sejak tengah malam server). open = open pertama, high/low =
 * ekstrem, close = close terakhir, tick_volume = jumlah. Blok di tengah yang
 * kekurangan candle (libur/buka pasar) tetap dipakai, sama seperti MT5.
 * Blok TERAKHIR yang belum lengkap (candle H4 belum tutup) dibuang —
 * mesin hanya boleh melihat candle yang sudah tutup.
 */
const TIME = /^(\d{4})[.-](\d{2})[.-](\d{2})[ T](\d{2}):(\d{2})/;

export function aggregateCandleCsv(csv: string, hours: number): string {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2 || !(hours > 1) || 24 % hours !== 0) return csv;
  const out: string[] = [lines[0]];
  let key = "";
  let start = "";
  let lastHour = -1;
  let o = 0;
  let h = 0;
  let l = 0;
  let c = 0;
  let v = 0;
  const flush = (): void => {
    if (key !== "") out.push(`${start},${o},${h},${l},${c},${v}`);
  };
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const m = TIME.exec(cols[0] ?? "");
    const open = Number(cols[1]);
    const high = Number(cols[2]);
    const low = Number(cols[3]);
    const close = Number(cols[4]);
    if (m === null || ![open, high, low, close].every(Number.isFinite)) continue;
    const hour = Number(m[4]);
    const block = Math.floor(hour / hours) * hours;
    const k = `${m[1]}.${m[2]}.${m[3]} ${String(block).padStart(2, "0")}:00`;
    if (k !== key) {
      flush();
      key = k;
      start = k;
      o = open;
      h = high;
      l = low;
      v = 0;
    }
    h = Math.max(h, high);
    l = Math.min(l, low);
    c = close;
    v += Number(cols[5]) || 0;
    lastHour = hour;
  }
  const blockStart = Number(start.slice(11, 13));
  if (key !== "" && lastHour === blockStart + hours - 1) flush();
  return out.join("\n");
}
