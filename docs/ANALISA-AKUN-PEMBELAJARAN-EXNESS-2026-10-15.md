# Analisa Akun Pembelajaran Exness 413925678 — Titik Lemah dan Titik Baik (15 Okt 2026)

**Status akun:** akun pembelajaran (keputusan K-11). Datanya bahan analisa untuk T-AUDIT, T-BELAJAR-RUGI dan T-KARTU, **bukan** bukti lampu 2/3.
**Aturan baca:** fakta di bawah adalah data, bukan aturan baru. Perubahan aturan tetap lewat jalur lambat SOP-10: sebab berulang n ≥ 20, diuji di data latih dan ujian, Fahmi menyetujui, lalu T-BUKU mencatat.

## 1. Data

| Hal | Isi |
| --- | --- |
| Sumber | `MDBKA_History_413925678.csv`, posisi dirakit oleh evaluasi MDBKA (`evaluateTrades`) |
| Periode | 13 Sep 2026 10:40 – 14 Okt 2026 17:53 (jam server Exness = UTC) |
| Posisi tertutup | 17.987: XAUUSDm 17.067, BTCUSDm 920 |
| Mata uang | IDR (R-3) |
| Cara keluar | Manual 16.667 (93%), TP 679, SL 641 |
| SL tercatat di catatan entry MDBKA | 11 posisi saja, jadi R tidak bisa dihitung |
| Lot | 0,01 – 100 (median 0,1) |
| Dibuka pada detik yang sama dengan posisi lain | 37,7% (banyak posisi bertumpuk) |

**Ukuran yang dipakai:** karena lot sangat beragam, hasil diukur dengan **gerak harga per posisi**. Untuk XAUUSDm satuannya dolar per ons, dan ukuran ini tidak dipengaruhi lot. Rupiah ditampilkan terpisah.

**Pembagian data:** 70% pertama = latih (sampai 5 Okt 14:05), 30% terakhir = ujian. **Sebuah temuan hanya dianggap fakta bila arahnya sama di latih dan ujian, dengan n ≥ 20 di keduanya.**

## 2. Temuan utama — sebab rugi struktural (XAUUSDm)

| | Latih | Ujian |
| --- | --- | --- |
| Win rate | 53,6% | 47,1% |
| Rata-rata gerak posisi untung | +2,26 | +2,46 |
| Rata-rata gerak posisi rugi | −3,50 | −3,05 |
| Rasio untung : rugi | 0,65 | 0,81 |
| **Win rate yang dibutuhkan untuk impas** | **60,8%** | **55,4%** |
| Hasil | rugi | rugi |

**Fakta:**
- Posisi untung rata-rata **lebih kecil** daripada posisi rugi. Polanya: untung cepat diambil, rugi dibiarkan.
- Akibatnya win rate sekitar 50% tetap rugi. Butuh 55–61% hanya untuk impas.
- Sebanyak 93% keluar manual.

**Kesesuaian dengan aturan MDBKA:** temuan ini sejalan dengan syarat RR ≥ 2, SL wajib, dan saran titik impas di +0,5R. Aturan-aturan itu justru menutup titik lemah ini.

## 3. Titik lemah (konsisten di latih dan ujian)

| Faktor | Latih: n, menang, gerak rata | Ujian: n, menang, gerak rata | Catatan |
| --- | --- | --- | --- |
| Sesi Asia 00–07 UTC (07–14 WIT) | 3.316 · 45,0% · −0,87 | 1.231 · 38,4% · −1,05 | Sesi terburuk dengan n besar |
| Sesi sepi 21–24 UTC (06–09 WIT) | 223 · 28,3% · −0,20 | 423 · 26,5% · −1,17 | Win rate di bawah 30% |
| Lama posisi 5–14 menit | 2.206 · 49,2% · −0,81 | 1.719 · 39,2% · −0,85 | Rentang scalping paling rugi |
| BTCUSDm | 812 · 53,6% · −4,00 | 108 · 39,8% · −4,59 | Rugi per posisi paling besar |
| Kena SL | 399 · gerak −3,71 | 183 · gerak −2,54 | SL lebih lebar daripada TP (TP +2,65 / +3,56) |

**Lot ≥ 10:** 172 posisi di data latih (menang 44%, gerak −0,94) dan hanya 12 di data ujian, jadi n ujian < 20. **72% dari seluruh rugi Rupiah XAUUSDm (−Rp3,86 miliar) berasal dari posisi lot ≥ 10.** Ini fakta besaran uang, bukan bukti arah. Pelajarannya untuk manajemen risiko: ukuran lot, bukan arah, yang menentukan besar rugi.

## 4. Titik baik (konsisten di latih dan ujian)

| Faktor | Latih: n, menang, gerak rata | Ujian: n, menang, gerak rata | Catatan |
| --- | --- | --- | --- |
| Sesi Eropa 07–12 UTC (16–21 WIT) | 1.404 · 62,5% · +0,42 | 907 · 52,0% · +0,15 | Positif, tetapi menipis di ujian |
| Sesi AS 16–21 UTC (01–06 WIT) | 1.970 · 60,7% · +0,16 | 1.042 · 63,8% · +0,35 | Win rate tertinggi dan stabil |
| Lama posisi 1–3 jam | 210 · 62,4% · +4,44 | 90 · 53,3% · +2,81 | Gerak rata terbesar. Sejalan dengan riset scalping: posisi lebih lama dengan SL lebar lebih baik daripada scalping 5–14 menit |
| Kena TP | 380 · gerak +2,65 | 260 · gerak +3,56 | Posisi yang dibiarkan sampai TP selalu untung (98,9–100%) |

**Tidak konsisten, jadi bukan fakta:** arah melawan/searah D1 (data latih hampir semua "D1 netral"), hari dalam minggu, dan Beli vs Jual. Hasil kelompok ini berbalik antara latih dan ujian.

## 5. Bahan untuk tim (rekomendasi, belum aturan)

| Kode | Untuk | Isi | Sifat |
| --- | --- | --- | --- |
| AP-1 | T-BELAJAR-RUGI | Catat sebab "untung kecil, rugi besar" (rasio 0,65–0,81) sebagai pola rugi struktural. Bandingkan dengan akun MDBKA, misalnya Finex demo yang "melawan sejak masuk" 8 dari 10 | Catatan |
| AP-2 | T-ANALISA, T-PENJAGA | Calon penyaring sesi: Asia 00–07 UTC dan sepi 21–24 UTC terburuk; Eropa 07–12 UTC dan AS 16–21 UTC terbaik. **Wajib diuji** dengan backtest strategi MDBKA sebelum menjadi aturan (n ≥ 20 per golongan) | Usulan uji |
| AP-3 | T-RISIKO | Lot besar penyebab 72% rugi Rupiah. Sudah sejalan dengan risiko 1% + batas golongan + R-1 | Penguat aturan yang ada |
| AP-4 | Riset scalping | Lama posisi 5–14 menit adalah rentang terburuk, 1–3 jam terbaik. Ini mendukung keputusan SC-1 di handoff scalping (SL lebar, bukan scalping mikro) | Bukti tambahan |

## 6. Batas data

- Satu bulan, satu akun, dan hampir semua posisi di emas pada periode emas bergerak kuat. Hasil bisa berbeda di periode lain.
- 37,7% posisi dibuka bersamaan, jadi kejadian yang benar-benar terpisah lebih sedikit dari 17.987.
- Tanpa SL tercatat, R tidak bisa dihitung. Ukurannya gerak harga, bukan R.
- Arah D1 dihitung dari candle D1 Exness dengan aturan `d1Direction` MDBKA. Di data latih hampir semua bernilai "netral", jadi faktor D1 belum bisa dinilai.

## 7. Cara mengulang

1. `npx tsx scripts/research/dump_account_trades.ts <folder Common\Files> data/trades 413925678 keluaran.json`
2. `python3 scripts/research/learning_account_factors.py keluaran.json <folder Common\Files>` (butuh pandas)
