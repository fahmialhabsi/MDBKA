import {
  dealNettoUsd,
  isTradeDeal,
  type JurnalEntry,
  type JurnalYearSummary,
} from "./jurnalPajak";
import type { TaxLiability } from "./pajakOP";
import type { PembayaranPajak } from "./pembayaranPajak";

/**
 * #511 - Laporan Pajak tahunan (HTML siap cetak/simpan PDF dari browser).
 * Logika murni: ringkasan penghasilan, perhitungan PPh, pembayaran + rujukan
 * bukti bayar, dan rincian transaksi. Alat bantu, bukan nasihat pajak.
 */
export interface LaporanInput {
  readonly year: number;
  readonly generatedAt: string;
  readonly login: string;
  readonly summary: JurnalYearSummary | undefined;
  readonly liability: TaxLiability;
  readonly dibayarPasal29Idr: number;
  readonly sisaKurangBayarIdr: number;
  readonly pembayaran: readonly PembayaranPajak[];
  readonly entries: readonly JurnalEntry[];
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const rp = (n: number): string =>
  `${n < 0 ? "-" : ""}Rp${Math.abs(Math.round(n)).toLocaleString("id-ID")}`;
const usd = (n: number): string =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

export function buildLaporanHtml(i: LaporanInput): string {
  const l = i.liability;
  const s = i.summary;
  const row = (k: string, v: string): string =>
    `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`;
  const payRows =
    i.pembayaran.length === 0
      ? `<tr><td colspan="6">Belum ada pembayaran tercatat.</td></tr>`
      : i.pembayaran
          .map(
            (p) =>
              `<tr><td>${escapeHtml(p.tanggalBayar)}</td><td>${escapeHtml(p.jenis)}</td><td>${escapeHtml(p.kodeAkun)}</td><td class="n">${rp(p.jumlahIdr)}</td><td>${escapeHtml(p.ntpn || "-")}</td><td>${p.bukti === null ? "belum diunggah" : escapeHtml(p.bukti.fileName)}</td></tr>`,
          )
          .join("");
  const txRows = i.entries
    .filter((e) => e.serverTime.startsWith(String(i.year)))
    .map((e) => {
      if (e.type === "BALANCE") {
        return `<tr class="b"><td>${escapeHtml(e.serverTime)}</td><td>Setoran/Penarikan</td><td>BALANCE</td><td class="n">${usd(e.profit)}</td><td>-</td><td>${e.idrAmount === null ? "-" : rp(e.idrAmount)}</td></tr>`;
      }
      if (!isTradeDeal(e)) return "";
      const net = dealNettoUsd(e);
      return `<tr><td>${escapeHtml(e.serverTime)}</td><td>${escapeHtml(e.symbol)}</td><td>${escapeHtml(e.type)} ${escapeHtml(e.entry)}</td><td class="n">${usd(net)}</td><td>${e.kursIdr === null ? "-" : e.kursIdr.toLocaleString("id-ID")}</td><td class="n">${e.kursIdr === null ? "-" : rp(net * e.kursIdr)}</td></tr>`;
    })
    .join("");
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Laporan Pajak ${i.year}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px;color:#111}h1{font-size:18px}h2{font-size:14px;margin-top:20px}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1f1f1;width:30%}.grid th{width:auto}.n{text-align:right}.b{background:#eaf3ff}.note{color:#555;font-size:11px;margin-top:16px}</style></head><body>
<h1>Laporan Pajak Penghasilan Trading - Tahun ${i.year}</h1>
<p>Akun Finex ${escapeHtml(i.login)} - dibuat ${escapeHtml(i.generatedAt)}</p>
${i.summary !== undefined && i.summary.tanpaKurs > 0 ? `<p><b>Perhatian:</b> ${i.summary.tanpaKurs} transaksi belum punya kurs pajak; netto Rupiah belum final.</p>` : ""}
<h2>1. Ringkasan penghasilan</h2>
<table>${row("Profit trading (USD)", usd(s?.profitUsd ?? 0))}${row("Swap (USD)", usd(s?.swapUsd ?? 0))}${row("Komisi (USD)", usd(s?.commissionUsd ?? 0))}${row("Netto trading (USD)", usd(s?.nettoUsd ?? 0))}${row("Netto trading (Rp, kurs pajak)", rp(l.nettoTradingIdr))}${row("Setoran (USD)", usd(s?.depositUsd ?? 0))}${row("Penarikan (USD)", usd(s?.withdrawalUsd ?? 0))}</table>
<h2>2. Perhitungan PPh Orang Pribadi</h2>
<table>${row("Jenis penghasilan", l.jenisPenghasilan)}${row("Status PTKP", `${l.ptkpStatus} (${rp(l.ptkpIdr)})`)}${row("Penghasilan neto lain", rp(l.otherNetIncomeIdr))}${row("Penghasilan trading kena pajak", rp(l.tradingTaxableIdr) + (l.tradingLoss ? " (rugi, tidak ditambahkan - asumsi konservatif)" : ""))}${row("PKP", rp(l.pkpTotalIdr))}${row("PPh terutang", rp(l.taxTotalIdr))}${row("Tambahan pajak akibat trading", rp(l.taxFromTradingIdr))}${row("Kredit pajak", rp(l.creditIdr))}${row("Kurang bayar (Pasal 29)", rp(l.kurangBayarIdr))}${row("Lebih bayar", rp(l.lebihBayarIdr))}${row("Pajak yang dibayar", l.namaPajak)}${row("Kode akun / jenis setoran", `${l.kodeAkunPajak}-${l.kodeJenisSetoran}`)}${row("Dasar hukum", l.dasarHukum)}${row("Batas bayar", l.jatuhTempo)}</table>
<h2>3. Pembayaran pajak</h2>
<table class="grid"><tr><th>Tanggal</th><th>Jenis</th><th>Kode akun</th><th>Jumlah</th><th>NTPN</th><th>Bukti bayar</th></tr>${payRows}</table>
<table>${row("Total dibayar (Pasal 29)", rp(i.dibayarPasal29Idr))}${row("Sisa yang harus dibayar", rp(i.sisaKurangBayarIdr))}</table>
<h2>4. Rincian transaksi</h2>
<table class="grid"><tr><th>Waktu (server)</th><th>Simbol</th><th>Tipe</th><th>Netto USD</th><th>Kurs</th><th>Netto Rp</th></tr>${txRows}</table>
<p class="note">Dibuat otomatis oleh MDBKA sebagai alat bantu pencatatan dan perkiraan; bukan nasihat pajak. Dasar: UU PPh Pasal 4(1), 6(1), 17(1)a (UU HPP), PTKP PMK 101/PMK.010/2016. Konfirmasi ke KPP/konsultan pajak sebelum SPT Tahunan.</p>
</body></html>`;
}
