# Lolosyiob v5 — Pullback XAUUSD M15/M5/M1 (15 Okt 2026)

**Status:** angka beku **disetujui Fahmi 15 Okt 2026 pukul 15:37 WIT** (atas rekomendasi Claude). Diuji 15 Okt: **TIDAK BERHASIL** (bagian 6).
**Dasar:** logika versi Fahmi (15 Okt 2026, 14:51 WIT), 4 hal disetujui 14:54 WIT:
1. cakupan diperluas ke XAUUSD;
2. M1 ditambahkan ke skrip ekspor;
3. berita AS diuji memakai jadwal rilis tetap;
4. semua kata kabur diberi angka sebelum diuji.

## 1. Bahan

| Bahan | Sumber | Catatan |
| --- | --- | --- |
| XAUUSD M1 (±370.000 candle, ±1 tahun) + spread | `ExportLongH1MDBKA.mq5`, InpPeriod = M1 | Untuk pemicu dan jalur keluar |
| XAUUSD M5 (75.000 candle) + spread | Skrip yang sama, M5 | M15 dirakit dari M5 (harga sama, bid) |
| EMA 50/200 M15, EMA 20 M5, RSI 14 M5, ATR 14 M5/M15 | Dihitung dari candle di atas | Rumus standar (EMA, RSI Wilder, ATR Wilder) |
| Biaya | Spread per candle + komisi Finex $1/lot (0,01 lot = $0,01) | Slippage: rugi SL × 1,075 (R-2) |
| Berita AS | Pengganti historis: jadwal tetap 08:30 dan 10:00 jam New York, setiap hari kerja | Uji ke depan memakai kalender MDBKA asli |
| Spesifikasi | XAUUSD Finex: ContractSize 100 → 0,01 lot = 1 oz → gerak $1 = $1 per 0,01 lot | Lihat bagian 4 no. 5 |

## 2. Angka beku (usulan)

| No | Langkah | Kata asli | Angka beku |
| --- | --- | --- | --- |
| 1 | Sesi | — | Candle ditutup 07:00–17:00 UTC (16:00–02:00 WIT) |
| 2 | Berita | Rilis USD dalam 45 menit | Tidak membuka posisi dari 45 menit sebelum sampai 15 menit sesudah 08:30 dan 10:00 jam New York. Posisi terbuka ditutup 1 menit sebelum rilis |
| 3 | Spread | Spread terlalu besar | Spread masuk ≤ 2× median 1 hari **dan** biaya ≤ 10% jarak SL (gerbang MDBKA) |
| 4 | Arah M15 | EMA 50 di atas 200 | BELI: EMA50 > EMA200 |
| 5 | Tidak datar/berdekatan | EMA berdekatan/datar | Jarak EMA50–EMA200 ≥ 0,5× ATR14 M15, **dan** EMA50 naik dibanding 4 candle M15 sebelumnya (1 jam) |
| 6 | Tidak bolak-balik | Harga bolak-balik | Close M15 terakhir di atas EMA50 M15 (BELI) |
| 7 | Pullback M5 | Mendekati EMA 20 | Dalam 3 candle M5 terakhir, low ≤ EMA20 + 0,25× ATR14 M5 |
| 8 | Struktur naik | Tetap struktur naik | Close M5 terakhir > EMA20, **dan** low pullback (3 candle) > low terendah 12 candle M5 sebelumnya (higher low) |
| 9 | RSI | RSI > 50 | RSI14 M5 > 50 di candle M5 setup (konfirmasi, bukan pemicu) |
| 10 | Pemicu M1 | Tembus high lokal | Close M1 > high tertinggi 5 candle M1 sebelumnya, paling lambat 15 menit setelah setup M5 |
| 11 | Jangan mengejar | Terlalu jauh | Lewati bila close pemicu − EMA20 M5 > 1,0× ATR14 M5 |
| 12 | SL | Di luar swing + buffer ATR | Low pullback − 0,2× ATR14 M5. Lewati bila jarak SL < 0,5× atau > 2× ATR14 M5 |
| 13 | TP | Minimal 1,5R | 1,5R |
| 14 | Batas waktu | 30 menit | Tutup di menit ke-30, atau 1 menit sebelum rilis (mana yang lebih dulu) |
| 15 | Posisi | — | Maksimal 1 posisi XAUUSD sekaligus |
| — | JUAL | — | Cermin langkah 4–12 |

**Jalur keluar dinilai per candle M1.** Bila SL dan TP tersentuh di menit yang sama, dihitung SL (konservatif). Harga masuk = ask untuk BELI, bid untuk JUAL.

## 3. Data dan kriteria

- **Latih** = 60% pertama periode (hanya dilihat). **Ujian** = 40% terakhir, dibagi 7 blok (uji 1–7), dan dinilai **sekali**.
- **Ukuran utama:** persen trade yang mencapai TP dalam **≤ 30 menit** sebelum SL, setelah biaya; dicatat juga menit tempuh.
- **Kriteria lolos (ujian):**
  - K1 n ≥ 20;
  - K2 rata-rata R bersih > 0;
  - K3 PF ≥ 1,2;
  - K4 ≥ 5/7 blok positif;
  - K5 rugi terburuk ≥ −1,1R;
  - K6 tanpa blok terbaik > 0;
  - K7 latih juga rata-rata R > 0.
- **Yang dicatat per trade:** waktu masuk, arah, spread, jarak SL/TP, hasil bersih, lama posisi, dan mana yang tersentuh lebih dulu.

## 4. Batas yang sudah diketahui

1. Jadwal 08:30/10:00 New York adalah **pengganti** kalender historis. Hari tanpa rilis ikut disaring (lebih ketat), sedangkan FOMC (14:00 New York, ±8 kali setahun) tidak tersaring.
2. Candle MT5 = harga bid; ask = bid + kolom spread. Arti persis kolom spread MT5 dicocokkan dulu dengan arsip tick bahan 1.
3. Ada 15 angka beku. Peluang "cocok karena kebetulan" lebih besar daripada versi 1–2 bahan, jadi ujian sekali di data yang belum dilihat wajib.
4. XAUUSD termasuk golongan Logam. Batas golongan dan R-1 tetap berlaku bila nanti dipakai.
5. **Nilai uang:** 0,01 lot XAUUSD = 1 oz, jadi gerak $1 = $1 per 0,01 lot.
   - **Bukti nyata:** posisi BELI 0,01 lot di 4142,76 menunjukkan profit $0,92 saat harga 4143,68 (layar Fahmi 15 Okt). Gerak 0,92 = $0,92.
   - **Catatan T-GERBANG:** `MDBKA_Specs_61823011.csv` mencatat ContractSize 100 tetapi TickValue 10. Itu tidak cocok dengan bukti di atas (seharusnya 1). MDBKA tidak memakai TickValue (`specCompare.ts`: TickValue tidak dibandingkan), jadi hitungan lot MDBKA tidak terpengaruh. Uji ini memakai ContractSize.

## 5. Ekspor data yang dibutuhkan (dijalankan Fahmi)

Skrip `ExportLongH1MDBKA` di terminal Finex, dua kali:

| Jalan | timeframe | jumlah candle | simbol |
| --- | --- | --- | --- |
| 1 | 5 Minutes | 75000 | `XAUUSD` |
| 2 | 1 Minute | 370000 | `XAUUSD` |

## 6. Hasil uji (15 Okt 2026)

**Data dan skrip:**
- XAUUSD Finex: M5 23 Sep 2025 – 15 Okt 2026 dan M1 26 Sep 2025 – 15 Okt 2026, spread median $0,17.
- Skrip: `scripts/research/xauusd_pullback_bt.py`.
- Latih sampai 16 Mei 2026; ujian 16 Mei – 15 Okt 2026.

**Penyaringan.** Ada 13.248 setup M5 (BELI 7.272, JUAL 5.976). Yang gugur:

| Sebab | Jumlah |
| --- | --- |
| Di luar sesi | 5.677 |
| Pemicu M1 tidak muncul dalam 15 menit | 2.464 |
| Masih ada posisi terbuka | 2.227 |
| Harga sudah terlalu jauh (mengejar) | 1.067 |
| Dekat berita | 902 |
| Jarak SL di luar 0,5–2 ATR | 237 |
| Biaya | 5 |
| Spread lebar | 5 |

**Hasil** (Rupiah untuk lot 0,01 = 1 oz, kurs Rp17.880):

| | Latih | Ujian |
| --- | --- | --- |
| Trade | 407 | 257 |
| TP ≤ 30 menit (ukuran utama) | 17,4% | 21,8% |
| Menit tempuh median yang TP | 15 | 17 |
| Kena SL | 40,0% | 37,7% |
| Ditutup batas 30 menit | 42,5% | 40,5% |
| Rata-rata R | −0,119 | −0,050 |
| PF | 0,76 | 0,89 |
| Rupiah | −Rp3.483.772 | −Rp1.046.934 |
| Risiko median per trade | Rp124.465 (SL $6,96) | Rp111.673 (SL $6,25) |

**Per blok ujian:**

| Uji | Periode 2026 | Trade | TP | R | Rupiah | Hasil |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 16 Mei – 6 Jun | 38 | 9 | −4,27 | −Rp515.813 | Tidak |
| 2 | 6–28 Jun | 49 | 12 | +3,77 | +Rp725.370 | Berhasil |
| 3 | 28 Jun – 20 Jul | 33 | 6 | −0,25 | −Rp344.873 | Tidak |
| 4 | 20 Jul – 11 Agu | 41 | 9 | −6,20 | −Rp401.153 | Tidak |
| 5 | 11 Agu – 1 Sep | 34 | 5 | −8,53 | −Rp971.733 | Tidak |
| 6 | 1–23 Sep | 34 | 10 | +5,34 | +Rp430.204 | Berhasil |
| 7 | 23 Sep – 15 Okt | 28 | 5 | −2,83 | +Rp31.064 | Tidak |

Pada blok 7, R negatif tetapi Rupiah positif, karena besar risiko per trade berbeda-beda.

**Kriteria:** K1 ✔ dan K5 ✔ (terburuk −1,08R). K2, K3, K4, K6 dan K7 ✘. **Vonis: TIDAK BERHASIL.**

### 6.1 Sebab

1. **Bukan biaya.** Spread $0,17 dibanding SL ±$6,5 hanya ±2,6%, dan gerbang 10% hampir tidak menolak apa pun.
2. **Target 1,5R dalam 30 menit jarang tercapai.** Hanya 17–22% yang TP; 40% habis waktu dengan hasil kecil, dan ±38% kena SL. Agar impas dengan TP 1,5R dibutuhkan ±40% TP lebih dulu.
3. **Hasil per blok berganti-ganti** (2 dari 7 blok positif). Kedua blok positif tidak membentuk pola yang bisa dipegang.
4. **Catatan, bukan aturan baru:** jam 16 UTC (01:00 WIT) di data ujian menyumbang −15,97R dari 33 trade. Ini hanya boleh dijadikan hipotesis untuk data baru, bukan disetel di data ini.

### 6.2 Posisi dibanding versi sebelumnya

Ini versi paling dekat ke impas sejauh ini: di data ujian −0,05R dan PF 0,89, dibanding −0,06 sampai −0,16R pada versi Forex. Tetapi "dekat impas" belum berarti punya keunggulan, dan data latihnya juga negatif.

## 7. Lolosyiob v6 — Scalping murni XAUUSD M1 (prinsip scalping dari Fahmi, 15 Okt 2026 15:56 WIT)

**Yang baru dibanding v5:**
- VWAP harian dan EMA 9/20 di M1;
- target kecil TP 0,5R, ditutup paling lambat 10 menit;
- sesi 13–17 UTC (22:00–02:00 WIT);
- risiko 0,5% per trade, dengan rumus unit = risiko ÷ (jarak SL + biaya);
- batas rugi harian −2R, ditambah jeda MDBKA 3 rugi berturut-turut.

Angka beku dan skrip: `scripts/research/xauusd_scalp_m1_bt.py`.

**Rumus risiko Fahmi sudah ada di MDBKA.** `decisionEngine.ts` memasukkan spread, komisi dan slippage ke dalam risiko per lot (tinjauan risiko 15 Okt, bagian 4.1). Risiko per trade di MDBKA 1%; uji ini memakai 0,5%. Batas rugi harian 2R adalah aturan baru dalam uji ini. Yang sudah ada di MDBKA: jeda 24 jam setelah 3 rugi berturut-turut.

**Hasil:**

| | Latih | Ujian |
| --- | --- | --- |
| Trade | 760 | 495 |
| Menang | 62,9% | 61,6% |
| TP / SL / waktu habis | 61% / 32% / 7% | 60% / 34% / 6% |
| Lama rata-rata | 3,7 menit | 3,7 menit |
| Rata-rata R | −0,053 | −0,083 |
| PF | 0,85 | 0,79 |
| Rupiah (0,01 lot) | −Rp2.005.060 | −Rp2.168.198 |
| Biaya ÷ jarak SL (median) | 3,5% | 4,9% |

- Satu dari tujuh blok ujian positif, yaitu Agustus (menang 74%).
- K0 (menang ≥ 70%), K2–K7 ✘. **Vonis: TIDAK BERHASIL.**

### 7.1 Sebab — win rate tinggi tidak sama dengan untung

- Dengan TP 0,5R dan SL 1R, gerak harga yang **acak murni** pun menang ±67% (1 ÷ 1,5), sebelum biaya.
- Hasil nyata 61–63% **lebih rendah** dari angka acak itu, karena spread, komisi dan slippage SL ikut menggerus.
- Artinya: EMA 9/20, VWAP dan RSI tidak menggeser peluang ke arah kita. Scalping ini terlihat "sering menang", tetapi kalah sedikit demi sedikit.
- Ini sejalan dengan semua versi sebelumnya. Dari candle MT5 saja (tanpa order book atau volume asli), arah 1–30 menit ke depan tidak terbukti bisa ditebak lebih baik dari kebetulan.
- **Batas data:** VWAP memakai tick volume, bukan volume asli. Inilah salah satu "alat" scalper profesional yang tidak dimiliki MT5 Finex untuk CFD emas.
