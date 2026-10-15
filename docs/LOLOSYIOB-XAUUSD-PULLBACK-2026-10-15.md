# Lolosyiob v5 — Pullback XAUUSD M15/M5/M1 (15 Okt 2026)

**Status:** USULAN ANGKA BEKU, menunggu persetujuan Fahmi. Belum diuji. Angka di bawah tidak boleh diubah setelah data diuji.
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
