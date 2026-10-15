# Lolosyiob — Metode Analisa "Kerja Cepat" (15 Okt 2026)

**Status:** uji putaran 1 **TIDAK BERHASIL** (kekurangan kejadian, bukan rugi). Tim, SOP dan workflow **belum ditetapkan**, sesuai perintah Fahmi: ditetapkan setelah uji berhasil.
**Bagian dari:** `docs/RANCANGAN-2026-10-15-scalping-finex-forex.md` (metode scalping Finex Forex).
**Skrip uji:** `scripts/research/kerja_cepat_bt.py`.

## 1. Nama

| Nama | Arti |
| --- | --- |
| **Lolosyiob** | Metode scalping MDBKA di Finex Forex |
| **Kerja Cepat** | Metode analisa di dalam Lolosyiob: aturan masuk, keluar dan penyaring |

## 2. Cerita pencari fakta (dasar logika)

Sebuah tim pencari fakta menyelidiki kematian rekan kerja mereka, si A. A meninggal di depan mereka saat suasana sangat bahagia, jadi tidak ada petunjuk yang jelas. Yang mereka punya hanya tiga petunjuk:

| Petunjuk | Dalam cerita | Dalam harga (Kerja Cepat) |
| --- | --- | --- |
| P1 | 1 jam sebelumnya A **naik atau turun** ke parkiran | Arah harga **60 menit** (12 candle M5). Gerak harus jelas: ≥ 2× rata-rata panjang candle M5 jam itu. Naik → calon BELI, turun → calon JUAL. Bila A tidak ke mana-mana (gerak kecil), kasus ditutup: tidak ada sinyal |
| P2 | Lalu **ngobrol 30 menit** dalam suasana bahagia, tanpa tanda bahaya | **30 menit tenang** (6 candle M5): rentangnya ≤ 2× rata-rata candle jam itu, dan harga tidak kembali lebih dari setengah gerak P1 |
| P3 | A **menyentuh gelas merah/hijau**, lalu meninggal | **Candle pemicu**: warnanya searah P1 (hijau untuk naik, merah untuk turun) **dan** close-nya menembus batas 30 menit itu |

Sebelum menyimpulkan, tim memeriksa saksi lain:
- **P4 spread:** saat masuk, spread tidak boleh lebih dari 2× biasanya.
- **P5 biaya:** biaya pulang-pergi tidak boleh lebih dari 10% jarak SL. Ini gerbang biaya MDBKA, tidak dilonggarkan.
- **P6 korelasi:** satu kejadian tidak boleh dituduhkan ke dua tersangka. Sinyal ditolak bila pasangannya berbagi mata uang dengan posisi yang masih terbuka.

**Kesimpulan diuji dengan:**
- **SL** di sisi lain obrolan 30 menit + 1 spread. Bila harga kembali ke sana, teorinya salah.
- **TP** di 1,5R.
- **Batas waktu 60 menit.** Bila belum terbukti dalam satu jam, kasus ditutup apa adanya.

## 3. Bahan mentah

| No | Bahan | Sumber | Yang diturunkan darinya |
| --- | --- | --- | --- |
| 1 | **Kuotasi bid/ask Finex berstempel waktu** (±2 detik) | Arsip MDBKA `data/history/finex/ticks-*.jsonl` (T-DATA) | Candle M1/M5, spread, jam sesi |
| 2 (usulan, setelah uji 1 gagal) | **Riwayat candle M5 server Finex** (±1 tahun, dengan kolom spread) | Skrip MT5 `ExportLongH1MDBKA.mq5` diberi pilihan M5 (**perlu izin**) | Kejadian cukup banyak untuk dinilai |

Hanya satu bahan yang dipakai di uji 1. Komisi $1/lot adalah fakta tetap Finex, bukan bahan.

## 4. Flowchart Kerja Cepat

```mermaid
flowchart TD
  A[Candle M5 tertutup, 07:00-16:00 UTC] --> B{19 candle berurutan tanpa celah?}
  B -- tidak --> Z[TUNGGU]
  B -- ya --> P1{P1: gerak 60 menit >= 2x rata-rata candle?}
  P1 -- tidak --> Z
  P1 -- naik --> P2{P2: 30 menit tenang dan tidak membalik > 50%?}
  P1 -- turun --> P2
  P2 -- tidak --> Z
  P2 -- ya --> P3{P3: candle searah P1 dan menembus batas 30 menit?}
  P3 -- tidak --> Z
  P3 -- ya --> P4{P4: spread <= 2x median?}
  P4 -- tidak --> Z
  P4 -- ya --> P6{P6: tidak berbagi mata uang dengan posisi terbuka?}
  P6 -- tidak --> Z
  P6 -- ya --> P5{P5: biaya <= 10% jarak SL?}
  P5 -- tidak --> Z
  P5 -- ya --> S[Sinyal BELI/JUAL: SL sisi lain + 1 spread, TP 1,5R, batas 60 menit]
  S --> T{Mana yang tercapai lebih dulu?}
  T -- SL --> L[Rugi ±1R]
  T -- TP --> W[Untung 1,5R]
  T -- 60 menit --> X[Tutup di harga saat itu]
```

**Parameter dibekukan sebelum uji** (tidak disetel ulang setelah melihat hasil):
- **Pasangan:** USDJPY, EURJPY, GBPUSD, GBPJPY, EURUSD. Dipilih dari biaya ÷ range M5 ≤ 0,30, bukan dari hasil uji.
- **Sesi:** 07:00–16:00 UTC (16:00–01:00 WIT).
- **Masuk dan keluar** memakai bid/ask nyata. Bila SL dan TP tersentuh di menit yang sama, dianggap kena SL (anggapan konservatif).

## 5. Kriteria berhasil (ditulis sebelum uji)

| Kode | Syarat |
| --- | --- |
| K1 | Jumlah trade ≥ 20 (aturan MDBKA n ≥ 20) |
| K2 | Rata-rata R bersih (setelah spread + komisi) > 0 |
| K3 | Profit factor ≥ 1,2 |
| K4 | ≥ 5 dari 7 hari uji ber-R positif (hari tanpa trade = tidak berhasil) |
| K5 | Rugi terburuk ≥ −1,1R (sejalan K-10) |
| K6 | Total R tanpa hari terbaik tetap > 0 (tidak bergantung satu hari) |

## 6. Hasil uji putaran 1 (bahan 1 saja)

### 6.1 Uji logika flowchart: 7 skenario buatan — 7/7 benar

| No | Skenario | Harapan | Hasil |
| --- | --- | --- | --- |
| 1 | Naik jelas, 30 menit tenang, gelas hijau menembus | BELI | BELI ✔ |
| 2 | Cermin skenario 1 (turun) | JUAL | JUAL ✔ |
| 3 | Jam tanpa arah | TUNGGU (P1) | TUNGGU ✔ |
| 4 | Obrolan tidak tenang | TUNGGU (P2) | TUNGGU ✔ |
| 5 | Gelas merah padahal jam naik | TUNGGU (P3) | TUNGGU ✔ |
| 6 | Gelas hijau tapi tidak menembus | TUNGGU (P3) | TUNGGU ✔ |
| 7 | Obrolan tenang tetapi membalik > 50% | TUNGGU (P2) | TUNGGU ✔ |

Artinya cabang-cabang flowchart bekerja sesuai rancangan.

### 6.2 Uji data nyata Finex: 7 hari

Tabel di bawah memakai 7 hari data tick Finex, 6–14 Okt 2026. Rupiah dihitung untuk lot 0,01 dengan kurs Rp17.880.

| Uji | Hari | Trade | Menang | R bersih | Rupiah | Hasil |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Sel 6 Okt | 3 | 2 | +1,64 | +Rp30.183 | Berhasil |
| 2 | Rab 7 Okt | 1 | 0 | −1,01 | −Rp23.933 | Tidak |
| 3 | Kam 8 Okt | 0 | — | 0 | Rp0 | Tidak (data bolong 12–20 UTC) |
| 4 | Jum 9 Okt | 1 | 0 | −0,04 | −Rp969 | Tidak |
| 5 | Sen 12 Okt | 1 | 1 | +0,09 | +Rp1.430 | Berhasil |
| 6 | Sel 13 Okt | 1 | 1 | +0,15 | +Rp1.853 | Berhasil |
| 7 | Rab 14 Okt | 0 | — | 0 | Rp0 | Tidak (arsip berhenti 11:58 UTC) |
| **Jumlah** | | **7** | **4 (57%)** | **+0,83** | **+Rp8.565** | |

| Kriteria | Nilai | Lolos? |
| --- | --- | --- |
| K1 n ≥ 20 | 7 | **Tidak** |
| K2 rata-rata > 0 | +0,118R | Ya |
| K3 PF ≥ 1,2 | 1,69 | Ya |
| K4 ≥ 5/7 hari | 3/7 | **Tidak** |
| K5 terburuk ≥ −1,1R | −1,01R | Ya |
| K6 tanpa hari terbaik > 0 | −0,81R | **Tidak** |

**Vonis: TIDAK BERHASIL.** Hasilnya positif, tetapi 7 trade tidak cukup untuk menjadi bukti.

**Rincian:**
- SL median 15,7 pip; biaya median 1,06 pip (7% dari SL, lolos gerbang 10%); risiko median Rp23.754 per trade (lot 0,01).
- Cara keluar: 5× batas waktu, 1× TP, 1× SL. Lama rata-rata 52 menit.
- Penyaringan dari ±1.500 candle yang dinilai:
  - P1 menolak 918 (tidak ada arah jam);
  - P2 menolak 449 (tidak tenang atau membalik);
  - P3 menolak 132;
  - P4, P5 dan P6 menolak 11;
  - 3 tidak bisa dinilai karena data habis.

### 6.3 Sebab gagal (analisa akar masalah)

1. **Sebab utama: kejadian terlalu sedikit.** Rata-rata hanya ±1 trade per hari di 5 pasangan. Untuk n ≥ 20 dibutuhkan ±20 hari data tanpa celah.
2. **Bahan 1 bolong.** Arsip tick punya celah: 8 Okt 12–20 UTC, 14 Okt setelah 11:58 UTC, dan sebagian jam di hari lain. Dari 132 candle M5 per hari pada 05–16 UTC (sesi + pemanasan), hanya 84–120 yang ada. Dua hari uji (3 dan 7) gagal karena data, bukan karena metode.
3. **Bukan sebab utama, tetapi dicatat:** 5 dari 7 trade ditutup batas waktu 60 menit dengan R kecil. Batas 60 menit mungkin terlalu pendek untuk TP 1,5R dengan SL ±15 pip. **Parameter ini tidak diubah sekarang**, karena mengubahnya setelah melihat hasil sama dengan menyetel jawaban agar cocok dengan soal. Bila ingin dicoba, variasi itu harus diuji di data baru, bukan di 7 hari ini.

**Kesimpulan:** kegagalan ini **membutuhkan tambahan bahan**, yaitu data yang lebih panjang dan tanpa celah. Penyaring baru (misalnya berita) justru akan mengurangi n, jadi tidak menjawab sebab gagal.

## 7. Bahan tambahan (hanya 1) dan rencana uji ulang

**Bahan 2: riwayat candle M5 server Finex**, ±1 tahun, berisi OHLC, tick volume dan kolom spread dari MT5.

Cara mendapatkannya:
1. Perubahan kecil pada skrip `ea/ExportLongH1MDBKA.mq5`: pilihan `InpPeriod` ditambah M5 dan file keluaran `MDBKA_<simbol>_M5_LONG.csv`.
2. Fahmi menjalankannya **sekali** di terminal Finex, dengan isian ±75.000 candle (±1 tahun).
3. Skrip ini **tidak** mengubah service atau EA live.

**Perlu izin Fahmi**, karena menyentuh file MT5 (aturan "tidak mengubah EA tanpa izin"). Ini sama dengan keputusan SC-2.

**Uji ulang (putaran 2):**
- Parameter sama persis dengan bagian 4.
- Data dibagi menjadi **7 blok waktu berurutan**. Uji 1–7 = blok 1–7.
- Kriteria K1–K6 sama; "hari" pada K4 menjadi "blok".
- Masuk dan keluar memakai harga candle M5 plus spread dari kolom spread. Batasnya: urutan SL dan TP di dalam satu candle tidak diketahui, sehingga dianggap kena SL (konservatif).
- Bila berhasil, hasilnya dicocokkan dengan arsip tick bahan 1 di hari yang sama. Setelah itu baru tim, SOP dan workflow Lolosyiob ditetapkan.

## 8. Batas data

- Data tick bahan 1 hanya 7 hari uji, dengan celah, dan sampelnya ±2 detik (bukan setiap tick).
- 7 trade tidak bisa membuktikan apa pun, baik untung maupun rugi.
- Kurs Rp17.880 adalah kurs ECB yang dipakai tinjauan risiko 15 Okt 2026.

## 9. Sumber gagasan metode

- **Bob Volman, *Forex Price Action Scalping*:** penyempitan gerak (*build-up*) sebelum tembusan, dan masuk searah arah dominan. Ringkasan diskusi: [Elite Trader — Volman Price Action Method](https://elitetrader.com/et/threads/volman-price-action-method.385723/post-6160745).
- **Gao, Han, Li & Zhou, "Market Intraday Momentum":** gerak awal cenderung berlanjut di dalam hari yang sama. Penelitiannya di saham AS, bukan Forex, jadi hanya ilham. Ringkasan: [Alpha Architect](https://alphaarchitect.com/2014/08/attention-prop-traders-the-first-half-hour-of-trading-predicts-the-last-half-hour/).
- **Fakta biaya dan jam Finex:** `docs/HANDOFF-SCALPING-FINEX-FOREX.md` bagian 3.
- **Pelajaran AP-1 akun pembelajaran** (untung kecil, rugi besar): karena itu TP ditetapkan 1,5R, bukan < 1R.

## 10. Cara mengulang

```
python3 scripts/research/scalp_finex_agg.py data/history/finex/ticks-2026-10-XX.jsonl m1-XX.csv   (per hari, lalu gabung)
python3 scripts/research/kerja_cepat_bt.py gabungan-m1.csv
```
