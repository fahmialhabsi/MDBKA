# Rancangan — Alur Trader Profesional di MDBKA

13 Okt 2026 · Fahmi Alhabsi

> **Status:** DRAF DISKUSI, keputusan awal diisi di bagian 6. Belum ada kode yang diubah. Posisi repo saat ditulis: branch `main`, HEAD `7c02ef7`, test terakhir 686 (test berikutnya 687).
> **Terkait:** `docs/AUDIT-2026-10-13-analisa-dan-pembatasan-risiko.md` (mode demo/live, penjaga, bukti n ≥ 20).
> **Sifat:** sistem berbasis aturan, tanpa AI. Mode Aman tetap: TUNGGU adalah default; BELI/JUAL hanya bila terbukti. Uang sungguhan hanya setelah 3 lampu hijau.

## 0. Ringkasan

- **Urutan "SL dulu, lot kemudian" sudah dipakai mesin sekarang.** Di `applyRiskGates`, lot = batas risiko ÷ ((jarak SL + spread + slippage) × nilai poin + komisi). Strategi `candle` dan `abc` juga sudah menaruh SL di ujung wick/gelombang C. Jadi yang perlu ditambah bukan urutan, melainkan **cara memilih SL dari struktur**, **arah dari timeframe besar**, dan **pemicu masuk**.
- **Celah terbesar adalah data.** Pemindai live hanya membaca 200 candle H1 tertutup (±8 hari). Dari data itu H4 hanya bisa dirakit ±50 candle dan D1 ±8 candle, sehingga MA50 D1 dan W1 tidak bisa dihitung.
- **Semua tambahan masuk sebagai strategi atau penyaring baru**, dengan pola yang sama seperti `candle` dan `abc` di `strategyRegistry.ts`. Rumus `decisionEngine.ts` tidak diubah.
- **Tidak ada yang memengaruhi sinyal Live** sebelum lulus 3 lampu hijau (backtest, demo, percobaan Live) di `docs/RANCANGAN-2026-10-13-fondasi-data-dan-jalur-live.md` bagian C5.
- **Audit rancangan 13 Okt 2026:** `docs/AUDIT-RANCANGAN-2026-10-13.md` (temuan, keputusan yang dibutuhkan, peta urutan induk).

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
8. **Bukti dan rapor dipisah per golongan** (disetujui Fahmi 13 Okt 2026). Rumus indikator, deteksi swing, pola candle, dan hitung lot boleh dipakai bersama. Parameter, bukti n ≥ 20, dan rapor backtest dinilai terpisah untuk Forex, Forex JPY, Logam, Minyak, Indeks, dan Saham AS, supaya untung di satu golongan tidak menutupi rugi di golongan lain.
9. **Gerbang kualitas data yang terlihat** (13 Okt 2026). Candle hilang atau dobel, kuotasi basi, jam tidak urut, atau spesifikasi kedaluwarsa menghasilkan status DATA/TUNGGU beserta alasannya. Ketiadaan data tidak boleh dianggap "tidak ada risiko". Rinciannya di `docs/RANCANGAN-2026-10-13-fondasi-data-dan-jalur-live.md`.
10. **Skor indikator bukan empat bukti terpisah** (13 Okt 2026). MA50, RSI, CCI, dan MACD dihitung dari harga yang sama, jadi skor yang kompak adalah aturan pemilah, bukan peluang menang. Untuk sidik jari kartu pola dan pengujian, dipakai jenis data yang berbeda: tren, momentum, volatilitas (ATR), waktu/sesi, dan biaya.

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
- **Diputuskan (bagian 6):** arah D1 ketat; D1 "netral" (close di sekitar MA50) menahan semua sinyal.

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
  2. **PEMICU** (H1 tertutup, sesuai keputusan 1 di bagian 6; M15 baru dipertimbangkan setelah candle M15 live tersedia dan terbukti): harga masuk zona (MA50 H1 atau level ± 0,25 × ATR H1), lalu muncul candle penolakan atau engulfing, dikonfirmasi RSI/MACD searah. Baru setelah itu status bisa LOLOS dan melewati semua penjaga yang ada.
- **Kedaluwarsa:** SIAGA batal setelah N candle H1 atau bila struktur rusak (lembah/puncak swing tertembus).
- Semua hanya tampilan; tidak ada order otomatis.

### 3.7 SL, lot, dan TP

- **SL:** di balik struktur (ujung wick, swing, atau ujung pola) dikurangi buffer broker.
  - Jarak SL < 0,5 × ATR H4 → diperlebar ke 0,5 × ATR H4, supaya tidak kena gerak kecil biasa.
  - Jarak SL > 3 × ATR H4 → TUNGGU.
  - Angka ini keputusan awal (bagian 6, keputusan 4), dikunci sebelum uji.
- **Lot:** tetap `applyRiskGates` tanpa perubahan (lot = batas risiko ÷ risiko per lot, termasuk spread, slippage, dan komisi), dengan batas 1% equity dan batas golongan Rupiah.
- **TP:** level lawan berikutnya, bila RR ke level itu ≥ 2 (keputusan 4 di bagian 6; sama dengan `MIN_REWARD_RISK` di `exitMonitor.ts`). Bila level terlalu dekat → TUNGGU. Bila tidak ada level → RR broker seperti sekarang.
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
5. Baru setelah itu boleh dibahas sebagai default dan untuk Live, mengikuti jalur demo → Live di `docs/RANCANGAN-2026-10-13-fondasi-data-dan-jalur-live.md`.

**Bukti diperketat (13 Okt 2026):**

- n ≥ 20 hanya syarat **minimum**, bukan bukti keunggulan.
- Uji bergulir (walk-forward): data dibagi beberapa periode berurutan; aturan harus tetap untung di sebagian besar periode, bukan hanya rata-rata keseluruhan.
- Rapor wajib memuat: hasil bersih setelah biaya, rugi terbesar per trade/rangkaian, penurunan modal terdalam (drawdown), rata-rata per trade (R dan Rupiah), jumlah sampel, rasio menang/rugi, sebaran hasil (bukan hanya rata-rata), dan rentang ketidakpastian.
- Hasil dipisah per golongan, per versi aturan, per jenis akun (demo/Live), dan per sesi; kelompok yang berbeda tidak digabung.
- Ukuran "peluang backtest hanya kebetulan" (Probability of Backtest Overfitting, Bailey dkk.) dipakai sebagai pelengkap, bukan sertifikat bahwa aturan pasti bekerja.
- Peringatan "terlalu banyak yang diuji": semakin banyak pola atau sidik jari yang diuji, semakin banyak yang tampak bagus karena kebetulan. Semua kandidat yang diuji dicatat, termasuk yang gagal, dan pemenang wajib lolos data ujian yang belum pernah dipakai untuk memilih.

## 5. Urutan langkah usulan (satu langkah kecil per giliran)

| Langkah | Isi | Menyentuh Live? |
| --- | --- | --- |
| P0 | Keputusan dari bagian 6 | Tidak |
| P1 | Modul murni level harian: open hari, high/low kemarin, dari H1 | Tidak |
| P2 | Rakit D1 dari H1 panjang + fungsi murni arah D1 | Tidak |
| P3 | Pola double top/bottom dan breakout-retest, murni | Tidak |
| P4 | Strategi `topdown` di registry, backtest saja | Tidak |
| P5 | Rapor backtest latih/ujian per golongan | Tidak |
| P5a | Bukti n ≥ 20 di panel Evaluasi dipecah per golongan (tampilan dulu). Penahan bukti F5 (`DITAHAN_BUKTI`) yang kini dinilai per broker baru diubah ke per golongan lewat langkah dan test tersendiri, karena itu mengubah perilaku sinyal Live | Tampilan dulu; penahan F5 butuh keputusan terpisah. **Bagian tampilan disetujui Fahmi 13 Okt 2026.** |
| P6 | Bila layak: ekspor live D1/W1/M15 (MQL) + status SIAGA di pemindai sebagai mode uji | Tampilan saja |
| P7 | Kumpulkan bukti n ≥ 20 di demo, kelompok terpisah | Tidak |

Setiap langkah dicek dengan `npm test`, `tsc -b`, dan lint, tanpa auto-commit.

## 6. Keputusan awal (diisi 13 Okt 2026)

Fahmi meminta Claude memutuskan ketujuh pertanyaan berdasarkan data MDBKA. Ini **hipotesis awal untuk diuji**, bukan bukti. Backtest latih/ujian dan bukti n ≥ 20 yang menentukan apakah dipakai; bila hasilnya buruk, keputusan diganti.

**Data yang dipakai sebagai dasar:**

- Evaluasi sebelum Mode Aman: OTB demo 15 trade, win rate 27%, bersih −$183,18; Finex live 19 trade, win rate 21%, bersih −$13,71. Backtest: keunggulan ≈ 0, negatif setelah biaya; TP kecil butuh win rate ±67% untuk impas.
- Uji 12 Okt: scalping M15 TIDAK LAYAK (90 trade, rugi di data latih dan ujian); scalping H1 belum cukup bukti (20 trade); ABC emas H4 di MIFX belum cukup bukti (20 trade, selisih tipis +2,7 poin); ABC emas H4 di Exness dengan modal $560 = MODAL KURANG.
- Kriteria rapor: untung ≥ 3% di atas titik impas di data latih DAN ujian (`MIN_EDGE_OVER_BREAKEVEN`).
- Aturan berlaku: time-stop 3 jam hanya untuk Forex dan Forex JPY; emas, minyak, indeks tanpa batas waktu.

| # | Pertanyaan | Keputusan | Alasan dari data MDBKA |
| --- | --- | --- | --- |
| 1 | Pasangan timeframe | **H4 untuk setup, H1 untuk pemicu.** D1 hanya untuk arah. | M15 terbukti rugi; biaya terlalu besar terhadap SL kecil. Jarak SL H4 lebih lebar, jadi porsi biaya lebih kecil dan gerbang biaya 10% lebih mudah lolos. H4 dan D1 bisa dirakit dari H1 panjang yang sudah ada, jadi backtest bisa mulai tanpa mengubah EA. Kekurangan: sinyal lebih jarang. |
| 2 | Arah D1 | **Ketat: harus searah. D1 netral = TUNGGU.** | Riwayat menunjukkan keunggulan ≈ 0, jadi lebih baik sedikit sinyal yang lebih bersih. Sejalan dengan Mode Aman (TUNGGU default) dan prinsip fail-safe di bagian 2. |
| 3 | Pola pertama | **Breakout-retest.** Double top/bottom ditunda. | Breakout-retest searah tren, cocok dengan arah D1 ketat. Double top/bottom adalah pola pembalikan, sehingga bertentangan dengan arah D1 ketat. Breakout-retest juga memakai alat yang sudah ada: level swing (`swingDetector.ts`) dan candle penolakan (`candleStrategy.ts`). |
| 4 | Angka awal | **Zona pemicu ±0,25 × ATR H1. SL minimum 0,5 × ATR H4, maksimum 3 × ATR H4. RR minimum 2.** Dikunci sebelum uji. | Win rate historis 21–27%. Dengan RR 2, titik impas sekitar 33% ditambah biaya; dengan RR 1,5 sekitar 40%, terlalu jauh dari riwayat. RR 2 juga sama dengan strategi ABC (TP = 2 × jarak SL), jadi hasilnya bisa dibandingkan. |
| 5 | Instrumen pertama | **Emas (XAUUSD) H4, data MIFX.** Forex menyusul. | Emas tidak terkena time-stop 3 jam, sedangkan setup H4 butuh waktu lebih dari 3 jam; untuk Forex aturan itu akan memotong trade lebih awal dan harus dibahas dulu. Sudah ada pembanding: ABC emas H4 MIFX (20 trade, +2,7 poin). Batas risiko emas Rp500 rb memberi ruang untuk SL H4 yang lebar. Exness tidak dipakai dulu karena modal $560 terbukti kurang untuk emas H4. |
| 6 | Jam sesi London/New York | **Ditunda.** Tidak dipakai di versi pertama. | Setup H4 + emas tidak memerlukannya. Bila nanti dibutuhkan, jam sesi dihitung dari jam UTC tetap ditambah selisih jam server tiap broker yang sudah tercatat (misalnya OTB UTC+2, Exness UTC+0). Perubahan jam musim akhir Okt/awal Nov harus dicek, seperti catatan handoff. |
| 7 | Urutan dengan pekerjaan mode demo/live | **Mode demo/live dulu (2–3 langkah kecil), lalu P1–P5 rancangan ini.** | Permintaan awal hari ini adalah demo tidak terkunci. Langkah awalnya kecil dan dibatasi untuk broker tanpa akun live terdaftar (OTB, MIFX, Exness), sesuai audit. P1–P5 rancangan ini hanya menyentuh backtest, tidak menyentuh Live, jadi aman dikerjakan sesudahnya. |

**Yang tetap butuh keputusan Fahmi** (dari audit, bukan soal trading): pilihan mode A/B dan nasib gerbang biaya di demo. Definisi "3 lampu hijau" sudah disetujui 13 Okt 2026 (rancangan fondasi, C5).

## 7. Tim 2 — monitor posisi berjalan (draf, 13 Okt 2026)

Selama posisi terbuka, MDBKA terus membaca gerak harga dan memberi saran: geser SL, ubah TP, keluar lebih awal, atau masuk lagi di simbol yang sama. Jendela pemantauan maksimal 3 jam per simbol (permintaan Fahmi). Semua hanya saran; Fahmi yang mengubah posisi di MT5.

**Contoh nyata (Finex, 12 Okt 2026; kurs ECB terakhir 9 Okt, Rp17.880 per USD):**

| Simbol | Arah, lot | Entry | SL | TP | RR | Dibuka → ditutup | Hasil |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUDJPY | Beli 0,01 | 110,528 | 110,379 | 110,759 | 1,55 | 02:27:27 → 19:42:24 (17 jam 15 menit, kena SL) | −$0,94 ≈ −Rp16,8 rb |
| XAUUSD | Beli 0,01 | 4.196,84 | 4.184,03 | 4.242,03 | 3,53 | 07:51:21 → 08:28:42 (37 menit, kena SL) | −$12,81 ≈ −Rp229 rb |

Catatan: RR AUDJPY di bawah batas MDBKA (minimal 2), dan time-stop 3 jam Forex seharusnya memberi aba-aba pukul 05:27.

### 7.1 Yang sudah ada (`exitMonitor.ts`)

- Peringatan dekat TP/SL, harga bergerak melawan posisi, dan harga bergeser dari harga analisa.
- Saran breakeven di +0,5R (SL = entry + biaya komisi).
- Time-stop 3 jam untuk Forex dan Forex JPY.
- Syarat RR minimal 2 (`MIN_REWARD_RISK`).
- Data MFE/MAE per posisi (`excursion-<broker>.jsonl`) sudah dicatat untuk menguji aturan baru.

### 7.2 Yang ditambah

1. Candle M15 live per simbol (tergantung ekspor EA baru, sama dengan 3.1).
2. Saran geser SL mengikuti harga (swing M15/H1 atau ATR).
3. Aba-aba keluar lebih awal saat struktur rusak (contoh untuk Beli: candle H1 tutup di bawah lembah swing terakhir).
4. Saran ubah TP.
5. Sinyal masuk lagi di simbol yang sama (7.4).

### 7.3 Batas pengaman

1. SL hanya boleh digeser ke arah untung, tidak pernah dijauhkan (menjauhkan = risiko melewati 1%).
2. TP baru boleh diperpanjang setelah SL minimal di titik impas.
3. Semua saran hanya tampilan; tidak ada order otomatis.
4. Setiap aturan diuji dulu dengan data MFE/MAE dan backtest, dinilai per golongan (prinsip 8).
5. Setelah jendela 3 jam: Forex dan Forex JPY tetap memakai time-stop yang sudah ada. Untuk emas, minyak, dan indeks, apa yang terjadi setelah 3 jam masih perlu diputuskan.

### 7.4 Masuk lagi di simbol yang sama (keputusan Fahmi, 13 Okt 2026)

- **Keputusan:** masuk lagi di simbol yang sama harus bisa, tidak lagi dianggap taruhan ganda dan tidak diblok. Tujuannya mencari tambahan profit.
- **Catatan risiko (Claude):** dua posisi searah di simbol yang sama berarti rugi dobel bila keduanya kena SL. Contoh: bila AUDJPY 12 Okt ditambah satu posisi lagi dengan SL yang sama, rugi menjadi ±Rp33,6 rb, bukan Rp16,8 rb.
- **Syarat yang diusulkan agar risiko total tetap dalam batas** (pola "menambah posisi" yang lazim dipakai):
    1. Posisi pertama sudah aman: SL-nya minimal di titik impas. Dengan begitu risiko total tetap ≤ 1% equity dan batas golongan.
    2. Posisi tambahan punya SL dan lot sendiri dari aturan biasa, dan tetap lolos penjaga lain (biaya, risiko, jeda, berita, sesi).
    3. Maksimal posisi per simbol dibatasi (usulan: 2).
    4. Hanya untuk simbol yang SAMA. Simbol lain yang berkaitan (misalnya AUDJPY dan AUDUSD) tetap dinilai penjaga korelasi seperti sekarang.
    5. Dicatat sebagai kelompok bukti tersendiri ("TAMBAH") per golongan. Berlaku di demo dulu; Live tetap seperti sekarang sampai ada bukti n ≥ 20, sesuai arah audit.
- **Dipastikan Fahmi (13 Okt 2026):** syarat 1 (posisi pertama sudah aman) DITERIMA. Berlaku di SEMUA akun demo dulu; Live tetap seperti sekarang.

### 7.5 Langkah usulan

| Langkah | Isi | Menyentuh Live? |
| --- | --- | --- |
| T1 | Modul murni saran geser SL dan aba-aba struktur rusak; tampilan saja; diuji dengan data MFE/MAE | Tidak |
| T2 | Pengecualian taruhan ganda untuk simbol yang sama, dengan syarat 7.4; di demo lewat saklar mode dari audit | Tidak (demo dulu) |
| T3 | Ekspor candle M15 live (MQL, dipasang manual) | Tidak |
| T4 | Bukti kelompok "TAMBAH" per golongan di panel Evaluasi | Tidak |

### 7.6 Siklus 30 menit (permintaan Fahmi, 13 Okt 2026)

Permintaan: analisa open pertama memperhitungkan jangka maksimal 30 menit. Tim 2 mulai bekerja di menit ke-20, menilai selama 10 menit, lalu menyampaikan hasil untuk open berikutnya. Siklus diulang sampai total 3 jam per simbol.

| Waktu sejak open pertama | Kegiatan |
| --- | --- |
| 00:00 | Open 1 (dari analisa biasa, lewat semua penjaga) |
| 00:20–00:30 | Tim 2 menilai: struktur masih utuh? harga sudah ≥ +0,5R? |
| 00:30 | Hasil: tahan / geser SL ke titik impas / keluar lebih awal / **open 2** (hanya bila semua posisi sebelumnya sudah aman) |
| 00:50–01:00 | Tim 2 menilai lagi; hasil di 01:00 |
| … | Siklus berulang setiap 30 menit |
| 03:00 | Jendela selesai: aba-aba tutup semua posisi dalam rangkaian ini, untuk semua golongan |

Akibat syarat "semua posisi sebelumnya sudah aman": hanya posisi TERBARU yang masih berisiko, sehingga risiko total rangkaian tetap ≤ 1% equity dan batas golongan. Jumlah posisi tetap dibatasi oleh margin (maks 50% free margin, `marginGuard.ts`) dan batas jumlah per simbol (7.4 mengusulkan 2; angka final menunggu keputusan, lihat audit rancangan).

**Dua cara membaca "maksimal 30 menit" — diputuskan: cara 1, siklus tinjau (7.7):**

1. **30 menit = siklus tinjau (usulan Claude).** Posisi boleh berjalan lebih lama; setiap 30 menit Tim 2 menilai ulang. TP tetap dari struktur (level berikutnya, RR ≥ 2). Ini cocok dengan keputusan 1 dan 5 di bagian 6 (setup H4/H1, emas).
2. **30 menit = jangka trade.** TP harus tercapai dalam 30 menit, jadi TP kecil dan pemicu dari M5/M15. Data MDBKA menunjukkan risikonya: scalping M15 TIDAK LAYAK (90 trade, rugi di latih dan ujian), TP kecil butuh win rate ±67% untuk impas, dan gerbang biaya 10% akan sering menahan. Bila dipilih, ini strategi tersendiri yang diuji terpisah.

**Data yang dibutuhkan:** penilaian tiap 30 menit butuh candle M15 live (dan M5 bila cara 2 dipilih). Sekarang hanya H1 dan kuotasi `quotes.csv` yang live (langkah T3).

### 7.7 Rekomendasi alur rangkaian (diterima Fahmi, 13 Okt 2026)

"30 menit" dibaca sebagai **siklus tinjau**: posisi boleh berjalan lebih lama, dan setiap 30 menit Tim 2 menilai ulang.

**A. Alur satu rangkaian**

1. **Open 1:** dari analisa biasa; lot dari risiko 1%; TP dari struktur dengan RR ≥ 2. Rugi maksimal = 1R (batas risiko).
2. **Tim 2 menilai di menit 20–30 setiap siklus:**
    - Harga ≥ +0,5R dan struktur utuh → saran geser SL ke titik impas + komisi.
    - Struktur rusak atau arah berbalik → saran tutup lebih awal (rugi < 1R).
    - Semua posisi sudah aman dan ada sinyal baru yang lolos penjaga → open berikutnya.
    - Selain itu → tahan.
3. **Arah berlawanan** hanya setelah posisi lama ditutup (tidak membuka Beli dan Jual bersamaan di simbol yang sama).
4. **Jam ke-3:** aba-aba tutup semua posisi dalam rangkaian.

Rugi terbesar satu rangkaian = 1R. Rugi mendekati nol tidak bisa dijamin; yang dirancang adalah sebanyak mungkin rangkaian berakhir di titik impas.

**B. Papan nilai (per golongan, setelah ≥ 20 rangkaian)**

- Kategori tiap rangkaian: rugi penuh (−1R), rugi kecil (keluar lebih awal), impas (±0,1R), untung kecil, untung penuh.
- Angka kunci: rata-rata hasil per rangkaian (R dan Rupiah), rugi terbesar, persentase rangkaian berakhir impas.

**C. Belajar dari rugi**

- Setiap rangkaian rugi diberi label sebab dari data MFE/MAE: langsung melawan sejak awal (pemicu lemah); sempat +0,5R lalu berbalik (titik impas terlambat); SL < 0,5 × ATR (SL terlalu dekat); dekat berita, sesi tutup, atau melawan arah D1 (penjaga/penyaring kurang ketat).
- Aturan TIDAK diubah setelah satu kali rugi. Perbaikan hanya bila satu sebab berulang (n ≥ 20 per golongan), disetel di data latih, lalu dicek di data ujian.

### 7.8 Tim-tim pencatat dan label pola (permintaan Fahmi, 13 Okt 2026)

Sejak open 1, beberapa "tim" bekerja bersamaan. Setiap tim adalah modul aturan murni (tanpa AI) yang memantau, mencatat, dan memberi label. Hasil semua tim digabung menjadi **satu kartu pola** per rangkaian.

| Tim | Tugas | Data yang dicatat |
| --- | --- | --- |
| Tim 1 — Analisa | Membuat sinyal open 1 (pemindai yang sudah ada) | Status, skor, arah, entry/SL/TP, alasan |
| Tim 2 — Monitor posisi | Saran tiap siklus 30 menit (7.6, 7.7) | Keputusan tiap siklus dan alasannya |
| Tim 3 — Pemantau indikator | Memotret semua indikator saat entry dan tiap siklus | MA50, RSI, CCI, MACD, ATR, posisi harga terhadap MA50 (H1; M15 bila sudah ada) |
| Tim 4 — Penguji titik lemah | Setelah rangkaian selesai, mencari kenapa TP tidak tercapai atau SL kena | Jarak SL dibanding ATR, MFE dibanding jarak TP (misalnya sempat 70% ke TP lalu berbalik), MAE sejak menit awal |
| Tim 5 — Pembaca pola | Mencatat pola yang muncul selama posisi berjalan dan arah gerak sesudahnya | Pola (penolakan, engulfing, breakout-retest), arah sesudahnya; catatan untuk open berikutnya |
| Tim 6 — Pencatat konteks (tambahan Claude) | Keadaan pasar saat entry | Golongan, arah D1, sesi dan jam, hari, jarak ke berita, kondisi ATR |
| Tim 6b — Pencatat respons berita (13 Okt 2026) | Untuk berita yang terjadi selama rangkaian: selisih Actual dibanding Forecast (sudah ada di `MDBKA_Calendar_<login>.csv`) dan gerak harga/spread sesudahnya | Nama berita, Actual, Forecast, Previous, gerak harga 5/15/30 menit sesudahnya, spread |
| Tim 7 — Pencatat biaya (tambahan Claude) | Biaya nyata | Spread saat entry, komisi, swap, selisih harga analisa vs harga entry |
| Tim 8 — Penggabung dan pemberi label | Menggabungkan semua catatan menjadi satu kartu pola dan memberi label | Label + hasil akhir (R dan Rupiah) |

**Label pola (nama dari Fahmi) — pembagian disetujui Fahmi 13 Okt 2026:**

| Label | Hasil rangkaian |
| --- | --- |
| Kasbi Bakar | Untung penuh (≥ +1R) |
| Popeda Sagu | Untung kecil (> +0,1R sampai < +1R) |
| Sagu Tumang | Impas (−0,1R sampai +0,1R) |
| Pupare Rebus | Rugi (< −0,1R), dengan catatan rugi kecil atau rugi penuh |

**Aturan penyimpanan:**

- Setiap kartu menyimpan jam UTC, jam server, jam diterima MDBKA, versi aturan/strategi, dan versi spesifikasi simbol yang berlaku saat itu (13 Okt 2026).
- Setiap kartu juga menyimpan semua nilai masukan dan semua penjaga yang lulus atau gagal (bukan hanya yang pertama gagal), sehingga keputusan bisa diputar ulang persis.
- Kartu hanya dipakai sebagai bahan bakar analisa SETELAH rangkaiannya selesai; rangkaian yang masih berjalan tidak boleh memengaruhi analisa lain.
- Setiap rangkaian menghasilkan kartu baru dengan nomor sendiri (misalnya "Kasbi Bakar #0001"). Kartu tidak pernah digabung, ditimpa, atau dihapus; disimpan bertambah terus (append-only, seperti `entries-<broker>.jsonl`).
- Kartu lama dari trade sebelum alur ini hanya boleh dibuat dari data yang memang ada, dan diberi tanda "data tidak lengkap". Tidak ada angka yang dikarang.

**Kartu pola sebagai bahan bakar analisa baru:**

- Setiap kartu punya "sidik jari": golongan, arah, arah D1, posisi terhadap MA50, rentang skor indikator, pola, sesi. Analisa baru mencari kartu dengan sidik jari yang sama.
- Sebelum ada ≥ 20 kartu dengan sidik jari yang sama di golongan yang sama, hasilnya hanya ditampilkan sebagai catatan ("pola ini pernah 3× Kasbi Bakar, 5× Pupare Rebus"), belum mengubah keputusan.
- Setelah ≥ 20: sidik jari yang kebanyakan Pupare Rebus dipakai lebih dulu sebagai **penahan** (TUNGGU). Sidik jari yang kebanyakan Kasbi Bakar/Popeda Sagu baru boleh menjadi alasan membuka posisi setelah lolos uji data latih dan ujian.
- Alasannya: sedikit kartu mudah menipu (kebetulan). Mode Aman tetap: TUNGGU default.

**Langkah usulan:**

| Langkah | Isi | Menyentuh Live? |
| --- | --- | --- |
| K1 | Bentuk kartu pola + penyimpanan append-only (modul murni) | Tidak |
| K2 | Fungsi pemberi label (4 label di atas) | Tidak |
| K3 | Tim 3, 6, 7: pencatat indikator, konteks, biaya saat entry | Tidak |
| K4 | Tim 4 dan 5: penguji titik lemah dan pembaca pola, dari data MFE/MAE dan candle | Tidak |
| K5 | Tampilan kartu pola dan catatan sidik jari di layar | Tampilan saja |
| K6 | Penahan berdasarkan kartu (setelah ≥ 20 per sidik jari), demo dulu | Demo dulu |

## 8. Pekerjaan tertunda dan dokumen terkait

Pekerjaan yang belum diimplementasikan (termasuk daftar "Tidak perlu sekarang") dicatat di `docs/RANCANGAN-2026-10-13-fondasi-data-dan-jalur-live.md`, bagian D. **Selama bagian D belum diimplementasikan, MDBKA dianggap belum selesai** (penetapan Fahmi, 13 Okt 2026).
