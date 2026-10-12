# Rancangan — Alur Trader Profesional di MDBKA

13 Okt 2026 · Fahmi Alhabsi

> **Status:** DRAF DISKUSI. Belum ada kode yang diubah. Posisi repo saat ditulis: branch `main`, HEAD `7c02ef7`, test terakhir 686 (test berikutnya 687).
> **Terkait:** `docs/AUDIT-2026-10-13-analisa-dan-pembatasan-risiko.md` (mode demo/live, penjaga, bukti n ≥ 20).
> **Sifat:** sistem berbasis aturan, tanpa AI. Mode Aman tetap: TUNGGU adalah default; BELI/JUAL hanya bila terbukti. Uang sungguhan hanya setelah 3 lampu hijau.

## 0. Ringkasan

- **Urutan "SL dulu, lot kemudian" sudah dipakai mesin sekarang.** Di `applyRiskGates`, lot = batas risiko ÷ ((jarak SL + spread + slippage) × nilai poin + komisi). Strategi `candle` dan `abc` juga sudah menaruh SL di ujung wick/gelombang C. Jadi yang perlu ditambah bukan urutan, melainkan **cara memilih SL dari struktur**, **arah dari timeframe besar**, dan **pemicu masuk**.
- **Celah terbesar adalah data.** Pemindai live hanya membaca 200 candle H1 tertutup (±8 hari). Dari data itu H4 hanya bisa dirakit ±50 candle dan D1 ±8 candle, sehingga MA50 D1 dan W1 tidak bisa dihitung.
- **Semua tambahan masuk sebagai strategi atau penyaring baru**, dengan pola yang sama seperti `candle` dan `abc` di `strategyRegistry.ts`. Rumus `decisionEngine.ts` tidak diubah.
- **Tidak ada yang memengaruhi sinyal Live** sebelum lulus backtest (data latih dan ujian), lalu bukti n ≥ 20 di demo.

## 1. Alur profesional dibanding MDBKA sekarang

| Tahap | Trader profesional | MDBKA sekarang (dari kode) | Celah | Usulan |
| --- | --- | --- | --- | --- |
| 1. Top-down | W1/D1 untuk arah besar dan level kunci, H4/H1 untuk struktur, M30–M5 untuk waktu masuk | Live: H1 saja (`AutoExportMDBKAService`, 200 candle). Backtest: H1, H4, M15 (`ExportLongH1MDBKA`, `candleAggregate.ts` merakit H4 dari H1) | Tidak ada D1/W1 live; tidak ada timeframe masuk yang lebih kecil di live | Ekspor live D1/W1/M15 + penyaring arah D1 |
| 2. Konteks dan pola | Pin bar, engulfing, double top/bottom, breakout-retest, S/R, open hari/sesi, high/low kemarin | Swing S/R H1 (`swingDetector.ts`); candle penolakan dan engulfing (`candleStrategy.ts`); pola ABC (`abcStrategy.ts`) | Double top/bottom, breakout-retest, open harian, high/low kemarin belum ada | Modul level harian dan pola baru, murni |
| 3. Pemicu | Tunggu harga menyentuh MA atau level, lalu dikonfirmasi indikator atau candle | Skor indikator dinilai pada candle H1 terakhir saja; tidak ada konsep "menunggu sentuhan" | Tidak ada status antara setup dan pemicu | Status baru SIAGA (setup terbentuk, menunggu pemicu) |
| 4. Hitung | SL di balik struktur atau ATR, lot dari risiko ÷ jarak SL, cek biaya, TP di level berikutnya atau minimal 1:1,5–2, cek sesi dan berita | SL skor = yang lebih jauh antara S/R dan ATR × pengali; lot dari jarak SL; biaya ≤ 10% risiko; TP = jarak SL × RR broker; penjaga sesi dan berita sudah ada | TP belum mengarah ke level berikutnya; belum ada batas jarak SL minimum/maksimum terhadap ATR | TP ke level lawan bila RR ≥ minimum; batas SL dalam ATR |
| 5. Bukti | Banyak profesional diskresioner, tidak semua terukur | Backtest latih/ujian (`backtestReport.ts`) + bukti n ≥ 20 dari History | Sudah ada | Wajib dipakai untuk setiap tambahan |

## 2. Prinsip rancangan (tidak boleh dilanggar)

1. Rumus `decisionEngine.ts` dan rumus risiko tidak diubah. Strategi baru hanya mengusulkan arah, SL, dan TP; lot, batas Rupiah, dan gerbang biaya tetap lewat `applyRiskGates`.
2. Modul baru murni (tanpa React, tanpa I/O), tanpa `any`, tanpa angka fiktif.
3. Data timeframe besar yang tidak tersedia membuat penyaring arah **menahan** (TUNGGU), bukan diabaikan. Ini berbeda dari penjaga berita/sesi yang fail-open, karena arah besar adalah syarat masuk, bukan rem tambahan.
4. Angka parameter dikunci sebelum uji dan hanya boleh disetel memakai data latih.
5. Fungsi lama tidak dihapus atau diganti nama; test lama hanya ditambah.
6. Strategi `skor` tetap default sampai strategi baru lulus pembuktian.
7. MDBKA tetap tidak pernah menempatkan atau menutup order.

## 3. Rancangan per tahap

### 3.1 Data multi-timeframe

- **Fakta:** service live mengekspor `MDBKA_<simbol>_H1.csv` berisi 200 candle H1 tertutup. Script manual `ExportLongH1MDBKA` bisa mengekspor H1, H4, atau M15 panjang untuk backtest (H1 ±5.000 candle ≈ 10 bulan; M15 ±30.000 ≈ 1,2 tahun). `aggregateCandleCsv` bisa merakit H4 dan D1 (jam habis membagi 24), tetapi tidak W1.
- **Usulan:** service live menambah ekspor D1, W1, dan M15 per simbol, hanya candle tertutup. Nama file mengikuti pola lama, misalnya `MDBKA_<simbol>_D1.csv`. Jumlah candle (misalnya D1 ≥ 100, W1 ≥ 60, M15 ≥ 200) masih usulan untuk didiskusikan.
- **Catatan:** ini perubahan MQL yang dipasang manual di keempat terminal MT5.
- **M5 dan M1 tidak dipakai di tahap awal.** Biaya per trade relatif besar terhadap jarak SL kecil, sehingga gerbang biaya 10% sulit lolos. Uji 12 Okt juga menunjukkan scalping M15 TIDAK LAYAK.

### 3.2 Arah besar (W1/D1)

- **Draf aturan:** arah D1 = posisi close D1 terhadap MA50 D1, ditambah kemiringan MA50 D1. BELI hanya bila arah D1 naik; JUAL hanya bila turun.
- **W1** dipakai sebagai penanda level kunci (high/low swing W1), bukan penentu arah.
- **Status baru yang diusulkan:** `DITAHAN_ARAH` (sinyal melawan arah besar).
- **Perlu diputuskan:** apakah arah D1 "netral" (close di sekitar MA50) menahan semua sinyal atau dibiarkan.

### 3.3 Struktur (H4/H1)

- Swing high/low H4 dan H1 memakai `detectSwingLevels` yang sudah ada.
- Tren = puncak dan lembah swing makin tinggi (naik) atau makin rendah (turun), aturan yang sama dengan langkah 1 strategi `candle`.
- Level kunci = swing H4 terdekat di atas dan di bawah harga.

### 3.4 Level harian dan sesi

- Level baru: open harian (jam server 00:00), high/low kemarin, dan angka bulat.
- Open sesi London/New York perlu ditetapkan dalam jam server per broker. Jam server berbeda-beda (Exness UTC+0), dan file `MDBKA_Sessions_<login>.csv` berisi jam trading simbol, bukan jam sesi pasar. Ini butuh keputusan, bukan tebakan.
- Kegunaan level: (a) calon TP, (b) syarat "ruang gerak", yaitu sinyal ditahan bila level lawan lebih dekat dari batas minimum dalam R.

### 3.5 Pola

- **Sudah ada:** candle penolakan (wick panjang), engulfing, dan ABC.
- **Usulan tambahan:**
  - Double top/bottom: dua swing setara dalam toleransi × ATR, lalu tutup melewati lembah atau puncak di antaranya.
  - Breakout-retest: candle tutup di luar level, lalu harga kembali menyentuh level itu dan ditolak.
- Keduanya didefinisikan sebagai aturan pasti dengan parameter dikunci.

### 3.6 Pemicu dan status SIAGA

- **Masalah:** mesin sekarang menilai candle terakhir saja; tidak ada keadaan "setup sudah terbentuk, tunggu harga datang".
- **Usulan dua tahap:**
  1. **SETUP** (H4/H1): arah D1 cocok, struktur searah, dan ada level atau MA yang menjadi zona tunggu. Status pemindai: **SIAGA**, dengan zona harga yang ditampilkan.
  2. **PEMICU** (M15 tertutup): harga masuk zona (misalnya MA50 H1 atau level ± 0,25 × ATR), lalu muncul candle penolakan atau engulfing, dikonfirmasi RSI/MACD searah. Baru setelah itu status bisa LOLOS dan melewati semua penjaga yang ada.
- **Kedaluwarsa:** SIAGA batal setelah N candle H1 atau bila struktur rusak (lembah/puncak swing tertembus).
- Semua hanya tampilan; tidak ada order otomatis.

### 3.7 SL, lot, dan TP

- **SL:** di balik struktur (ujung wick, swing, atau ujung pola) dikurangi buffer broker.
  - Jarak SL < 0,5 × ATR → diperlebar ke 0,5 × ATR, supaya tidak kena gerak kecil biasa.
  - Jarak SL > 3 × ATR → TUNGGU.
  - Kedua angka ini masih usulan.
- **Lot:** tetap `applyRiskGates` tanpa perubahan (lot = batas risiko ÷ risiko per lot, termasuk spread, slippage, dan komisi), dengan batas 1% equity dan batas golongan Rupiah.
- **TP:** level lawan berikutnya, bila RR ke level itu ≥ minimum (usulan 1,5). Bila level terlalu dekat → TUNGGU. Bila tidak ada level → RR broker seperti sekarang.
  - SL dan TP ditentukan oleh strategi lewat `propose()`, sama seperti strategi `candle`, jadi `decisionEngine.ts` tidak disentuh.
- **Penjaga yang sudah ada tetap berlaku:** biaya, risiko, spesifikasi, bukti, jeda, berita, sesi, pembukaan bursa, korelasi, margin.

### 3.8 Catatan per golongan

| Golongan | Hal khusus yang perlu dipertimbangkan | Sudah ada di MDBKA |
| --- | --- | --- |
| Forex | Sesi London/New York paling aktif; swap menginap | Time-stop 3 jam, batas Rp35 rb |
| Forex JPY | Pergerakan besar saat berita BoJ; nilai poin dalam JPY | Time-stop 3 jam, batas Rp35 rb, konversi kurs |
| Emas (XAU) | Spread lebar saat berita AS; ABC H4 sudah diuji | Batas Rp500 rb; ABC: MIFX belum cukup bukti, Exness modal kurang |
| Minyak | Data stok mingguan (EIA) sebagai berita | Batas Rp150 rb |
| Indeks dan Saham AS | Jam bursa, gap pembukaan, jelang libur | Penjaga pembukaan bursa dan sesi, batas Rp500 rb / Rp50 rb |

## 4. Pembuktian

1. Strategi baru didaftarkan di `strategyRegistry.ts` (nama usulan: `topdown`), hanya untuk backtest dulu.
2. Backtest memakai data panjang: H1 panjang dirakit menjadi H4 dan D1. W1 belum bisa dirakit, jadi tahap awal cukup D1.
3. Rapor latih/ujian per golongan memakai kriteria `backtestReport.ts` yang sudah ada: untung jelas di data latih DAN ujian.
4. Bila layak: masuk pemindai sebagai mode uji di demo, dicatat dan dikelompokkan terpisah dari strategi `skor`, sampai bukti n ≥ 20.
5. Baru setelah itu boleh dibahas sebagai default dan untuk Live, mengikuti definisi "3 lampu hijau" yang masih perlu ditulis.

## 5. Urutan langkah usulan (satu langkah kecil per giliran)

| Langkah | Isi | Menyentuh Live? |
| --- | --- | --- |
| P0 | Keputusan dari bagian 6 | Tidak |
| P1 | Modul murni level harian: open hari, high/low kemarin, dari H1 | Tidak |
| P2 | Rakit D1 dari H1 panjang + fungsi murni arah D1 | Tidak |
| P3 | Pola double top/bottom dan breakout-retest, murni | Tidak |
| P4 | Strategi `topdown` di registry, backtest saja | Tidak |
| P5 | Rapor backtest latih/ujian per golongan | Tidak |
| P6 | Bila layak: ekspor live D1/W1/M15 (MQL) + status SIAGA di pemindai sebagai mode uji | Tampilan saja |
| P7 | Kumpulkan bukti n ≥ 20 di demo, kelompok terpisah | Tidak |

Setiap langkah dicek dengan `npm test`, `tsc -b`, dan lint, tanpa auto-commit.

## 6. Pertanyaan untuk diskusi

- [ ] Pasangan timeframe: H1 setup + M15 pemicu, atau H4 setup + H1 pemicu (lebih sedikit biaya dan gangguan)?
- [ ] Arah D1: wajib searah, atau "netral" boleh lewat?
- [ ] Pola mana yang dikerjakan dulu: double top/bottom atau breakout-retest?
- [ ] Angka awal: toleransi pola, jarak SL minimum/maksimum dalam ATR, RR minimum 1,5 atau 2.
- [ ] Instrumen pertama yang diuji: emas H4 (sudah ada ABC) atau Forex mayor?
- [ ] Jam sesi London/New York dalam jam server tiap broker: dari mana sumber resminya?
- [ ] Urutan kerja dengan pekerjaan mode demo/live dari audit: dikerjakan dulu, bergantian, atau ditunda?
