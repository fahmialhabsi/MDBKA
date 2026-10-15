# Handoff — Riset Scalping Khusus Finex, Golongan Forex (15 Okt 2026)

Dokumen riset untuk diskusi. **Belum ada kode aplikasi yang diubah.** Semua angka berasal dari sumber yang disebut, atau dari data MDBKA sendiri (History MT5 dan arsip tick Finex). Nilai yang tidak diketahui ditulis "tidak diketahui", tidak dikarang.

## 1. Jawaban singkat

1. **Bukti nyata scalping Forex yang berhasil di Finex: tidak ditemukan.**
   - Pencarian publik tidak menemukan rekam jejak terverifikasi (misalnya Myfxbook) dari scalper Forex di Finex.
   - History Finex Anda sendiri menunjukkan 7 trade Forex ≤ 30 menit dengan 1 untung, total **−$1,45 (≈ −Rp26 rb)**.
2. **Biaya Finex untuk Forex termasuk rendah.** Spread nyata GBPUSD 0,6 pip, EURUSD 0,7, USDJPY 0,6, ditambah komisi $1/lot. Masalahnya ada pada skala, bukan pada brokernya: scalping M5 dengan SL 1×ATR (3–6 pip) membuat biaya memakan **18–34% risiko**. Gerbang biaya MDBKA hanya 10%, jadi **0% sinyal lolos**.
3. **Uji 3 aturan scalping yang dikunci lebih dulu, pada tick Finex nyata (8 hari):**
   - Dua aturan rugi di data latih maupun ujian.
   - Satu aturan (London breakout M5) positif. Tetapi n = 20 dan sangat berkorelasi: misalnya 7 Okt 09:20 kelima pasangan masuk bersamaan, padahal itu satu peristiwa USD. Posisinya juga ditahan berjam-jam, jadi ini bukan scalping murni.
   - Status: **belum terbukti, hanya calon UJI_DEMO**.
4. **Jalan yang realistis:** "scalping" versi MDBKA untuk Finex Forex adalah setup M5 dengan SL cukup lebar (biaya ≤ 10% risiko). Setup itu berjalan bersama aturan time-stop 3 jam Forex yang sudah ada, lalu naik tangga bukti seperti strategi lain: backtest panjang → bayangan → demo MDBKA-UJI → n ≥ 20 → 3 lampu.

## 2. Fakta kondisi trading Finex

| Hal | Nilai | Sumber |
| --- | --- | --- |
| Jenis akun | Satu akun reguler (+ demo) | finex.co.id/trading/accounts |
| Spread Forex | "Mengambang dari 0,5 pip"; contoh AUDUSD tipikal 0,00007, AUDJPY 0,011 | finex.co.id, halaman instrumen |
| Komisi | $1 per lot | finex.co.id. **Terbukti di History Anda:** setiap trade 0,01 lot berkomisi −$0,01 (pulang-pergi) |
| Leverage | Forex & logam 1:500 | finex.co.id |
| Stop level | 0 (instrumen yang ditampilkan) | finex.co.id/trading/accounts |
| Margin call / stop out | 50 / 20 | finex.co.id/trading/accounts |
| Eksekusi | "99,57% order dieksekusi < 1 detik" (klaim broker, tidak diverifikasi) | finex.co.id |
| Scalping & EA | Disebut "diizinkan" oleh ulasan brokerxplorer. **Halaman resmi Finex tidak menyebut kebijakan scalping**, jadi sebaiknya dikonfirmasi ke CS Finex secara tertulis | brokerxplorer.com, finex.co.id |
| Regulasi | BAPPEBTI #47/BAPPEBTI/SI/04/2013 | forexpeacearmy.com |
| Jam server | GMT+2 / GMT+3 (musim panas). MDBKA memverifikasi UTC+3 | finex.co.id, Tahap 07 |

## 3. Data nyata: spread dan gerak harga Finex (arsip tick MDBKA)

**Sumber data:**
- `data/history/finex/ticks-2026-10-05 … 14.jsonl`, 2,8 GB.
- Isinya kuotasi bid/ask setiap ±2 detik dari `quotes.csv`. **Ini bukan setiap tick**, jadi range menit sedikit lebih kecil dari aslinya.
- Cakupan: 8 hari aktif (5–9 dan 12–14 Okt), 27 pasangan Forex, ±6.200 menit aktif per pasangan. Akhir pekan dan menit tanpa gerak dibuang.

**Biaya pulang-pergi** = spread median + komisi. Komisi $1/lot ≈ 0,1 pip untuk pasangan kuotasi USD, ≈ 0,16 pip untuk pasangan JPY.

| Pasangan | Spread median (pip) | Biaya (pip) | Rata-rata range M5 (pip) | Biaya ÷ range M5 |
| --- | --- | --- | --- | --- |
| USDJPY | 0,62 | 0,78 | 3,82 | 0,20 |
| EURJPY | 0,90 | 1,06 | 5,20 | 0,20 |
| GBPUSD | 0,60 | 0,70 | 3,16 | 0,22 |
| GBPJPY | 1,40 | 1,56 | 5,81 | 0,27 |
| EURUSD | 0,70 | 0,80 | 2,86 | 0,28 |
| USDCHF | 0,70 | 0,80 | 2,18 | 0,37 |
| USDCAD | 1,00 | 1,10 | 2,67 | 0,41 |
| AUDUSD | 0,70 (p90 2,97) | 0,80 | 1,91 | 0,42 |
| NZDUSD | 0,80 (p90 3,04) | 0,90 | 1,80 | 0,50 |
| EURGBP | 0,70 | 0,80 | 1,20 | 0,67 |

**Temuan:**
- Spread Finex hampir **tetap** sepanjang hari untuk mayor seperti EURUSD, GBPUSD dan USDJPY.
- **AUDUSD, NZDUSD dan AUDNZD melebar ke ±3 pip pada pukul 22:00–04:00 UTC**, yaitu 07:00–13:00 WIT. Jam itu harus dihindari.
- Gerak harga paling besar terjadi di sesi Eropa (07–12 UTC) dan Eropa+AS (12–16 UTC), dengan range M1 rata-rata 1,5–1,8 pip. Sesi sepi (21–24 UTC) hanya 0,6 pip.
- Lima pasangan termurah dibanding geraknya adalah USDJPY, EURJPY, GBPUSD, GBPJPY dan EURUSD. Ini satu-satunya dasar pemilihan pasangan, bukan hasil uji.

## 4. Bukti dari History Finex Anda sendiri

| Akun | Trade Forex ≤ 30 menit | Trade Forex > 30 menit |
| --- | --- | --- |
| Finex demo 61823011 | 1 trade, 0 untung, −$0,66 | 7 trade, 2 untung, −$0,37 |
| Finex live 91811209 | 6 trade, 1 untung, −$0,79 | 23 trade, 12 untung, −$8,19 |

**Contoh nyata scalping manual di Finex live, USDCHF 29 Sep 2026:**

| Arah | Durasi | Hasil |
| --- | --- | --- |
| Beli | 14 menit | +$0,15 |
| Beli | 1 menit | −$0,02 |
| Jual | 4 menit | −$0,39 |
| Beli | 1 menit | −$0,06 |
| Beli | 0 menit | −$0,08 |

Polanya: sering masuk-keluar cepat, untungnya kecil, rugi kecilnya menumpuk. Data ini sedikit (n = 7), jadi **bukan bukti berhasil maupun bukti gagal**. Yang terlihat hanya bahwa belum ada satu pun contoh scalping Forex yang untung secara konsisten di akun Anda.

## 5. Bukti publik (umum, bukan khusus Finex)

- **Studi City/Bayes Business School** atas hampir 100.000 trader FX ritel selama 2,5 tahun: kebanyakan trader rugi rata-rata, termasuk yang berpengalaman.
- **Peringatan wajib broker CFD di UE:** 74–89% akun CFD ritel kehilangan uang.
- **Uji terbuka di forum MQL5** (sistem scalper intraday, data 7–21 tahun, dikoreksi uji berganda): 48 kombinasi target/SL/lama tahan **semuanya negatif setelah biaya**. Arah harga tidak membawa informasi pada horizon 5 menit sampai 20 hari. Demo 60 trade rugi $212; komisi = 40% dari rugi itu.
- **Survei 133 trader ritel:** ada korelasi negatif kecil antara lama tahan dan hasil, "mungkin karena biaya broker". Sampelnya kecil dan dilaporkan sendiri oleh trader.

**Kesimpulan:** bukti publik yang ada justru menunjukkan scalping sulit untung setelah biaya. Tidak ada rekam jejak terverifikasi yang khusus Finex.

## 6. Uji tiga aturan scalping pada tick Finex nyata

**Cara uji:**
- Aturan dan angkanya dikunci sebelum melihat hasil.
- Masuk di harga ask (Beli) atau bid (Jual) pada menit berikutnya. Keluar memakai harga sisi yang benar dengan spread menit itu.
- Bila SL dan TP tersentuh di menit yang sama, dianggap SL (cara konservatif).
- Data latih 5–9 Okt, data ujian 12–14 Okt. Pasangan: USDJPY, EURJPY, GBPUSD, GBPJPY, EURUSD.
- Rupiah dihitung untuk lot 0,01 dengan kurs Rp17.880 (ECB 9 Okt).

**Ketiga aturan:**
- **S1:** EMA9 memotong EMA21 di M5, searah EMA50. Sesi 07–16 UTC, SL 1×ATR14 M5, TP 1,5×ATR, maksimal 30 menit.
- **S2:** close M5 di luar Bollinger(20,2) di sesi Asia 00–07 UTC, lalu masuk ke arah balik. TP garis tengah, SL 1×ATR, maksimal 60 menit.
- **S3 (London breakout):** range Asia 00–07 UTC. Close M5 pertama yang menembus range pada 07–10 UTC menjadi sinyal. SL di tengah range, TP 1R, maksimal 5 jam.

| Aturan | Fase | n | Menang | Bersih (pip) | ≈ Rupiah | Porsi biaya median | Lolos gerbang 10% |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | latih | 55 | 36% | −42,3 | −Rp66 rb | 18% | 0% |
| S1 | ujian | 33 | 36% | −19,8 | −Rp38 rb | 22% | 0% |
| S2 | latih | 163 | 23% | −211,9 | −Rp264 rb | 28% | 0% |
| S2 | ujian | 120 | 23% | −84,5 | −Rp124 rb | 34% | 0% |
| S3 | latih | 11 | 73% | +145,8 | +Rp191 rb | 4% | 100% |
| S3 | ujian | 9 | 67% | +5,4 | +Rp21 rb | 5% | 100% |

**Cara membaca hasil:**
- S1 dan S2 adalah scalping sesungguhnya (SL 3–6 pip, ditahan ≤ 1 jam). Keduanya **rugi di latih dan ujian**, dan biayanya 18–34% dari risiko.
- S3 lolos gerbang biaya karena SL-nya lebar (±16–57 pip, tergantung lebar range Asia). Tetapi:
  1. n = 20, di bawah syarat 20 per golongan untuk tiap fase;
  2. trade-nya terjadi serentak, misalnya 7 Okt 09:20 di kelima pasangan, jadi praktis hanya ±8 kejadian independen;
  3. hasil di data ujian tipis (+5,4 pip);
  4. lama tahannya berjam-jam, sehingga ini lebih mirip intraday breakout daripada scalping.
- **Batas data:** hanya 8 hari; kuotasi per ±2 detik, bukan setiap tick; slippage tidak dimodelkan.

## 7. Hambatan dari aturan MDBKA sendiri

- **Gerbang biaya 10%** (`MAX_COST_SHARE_OF_RISK`, decisionEngine, tidak boleh diubah). Dengan biaya ±0,7–1,6 pip, SL harus ≥ 7–16 pip agar lolos. Scalping 3–5 pip otomatis DITAHAN_BIAYA. Melonggarkan gerbang **tidak disarankan**, karena justru biaya itulah yang membuat S1/S2 rugi.
- **Uji 12 Okt sebelumnya:** scalping M15 (MA9×MA120 + Stochastic + engulfing) **TIDAK LAYAK**, 90 trade rugi di latih dan ujian.
- **T-AUDIT dan kartu pola:** sebab rugi terbanyak di Finex demo adalah "melawan sejak masuk" (8 dari 10 rangkaian rugi). Artinya pemicu masuk yang lemah adalah masalah utama, dan scalping memperbanyak pemicu.
- **Time-stop 3 jam untuk Forex sudah berlaku.** Ini cocok dengan scalping atau intraday. S3 yang ditahan sampai 5 jam harus dipotong di jam ke-3 bila dipakai.
- **Arsip tick Finex berhenti 14 Okt pukul 20:58 WIT (11:58 UTC); tidak ada berkas 15 Okt.** Kemungkinan server MDBKA mati; perlu dicek. Tanpa arsip, bayangan dan uji berikutnya kekurangan data.

## 8. Usulan bila metode ini dilanjutkan (menunggu keputusan Fahmi)

1. **Definisi** "scalping Finex Forex" di MDBKA = setup M5, hanya di sesi 07–16 UTC, dengan SL ≥ 10× biaya pulang-pergi pasangan itu, sehingga gerbang 10% tetap utuh.
2. **Pasangan** dipilih dari biaya ÷ range M5 ≤ 0,30: USDJPY, EURJPY, GBPUSD, GBPJPY, EURUSD. AUDUSD/NZDUSD dilarang pukul 22–04 UTC karena spread ±3 pip.
3. **Korelasi:** maksimal satu posisi per tema mata uang per hari. Contohnya, breakout USD serentak di 5 pasangan dihitung satu taruhan. Penjaga korelasi yang ada sudah menahan sebagian.
4. **Calon pertama:** S3 versi time-stop 3 jam, dengan status **UJI_DEMO** di Buku Aturan. Rujukannya T-AUDIT (melawan sejak masuk) dan data biaya bagian 3.
5. **Data:** butuh minimal 6–8 minggu candle M5/M1 Finex. Ada dua jalan:
   - (a) biarkan arsip tick terus berjalan, sekitar 4 minggu lagi untuk ±20 hari aktif;
   - (b) izinkan perubahan EA supaya AutoExport juga mengekspor M5 ±5.000 candle. Ini perlu izin EA.
6. **Tangga bukti:** backtest panjang (latih/ujian, satu kali uji) → trade bayangan → trade uji demo MDBKA-UJI di Finex demo 61823011 → n ≥ 20 → 3 lampu → baru Live.

## 9. Keputusan yang diminta dari Fahmi

| Kode | Pertanyaan | Usulan Claude |
| --- | --- | --- |
| SC-1 | Definisi scalping: SL ≥ 10× biaya (gerbang utuh) atau scalping mikro 3–5 pip (gerbang harus dilonggarkan) | SL ≥ 10× biaya |
| SC-2 | Sumber data M5: tunggu arsip tick (±4 minggu) atau ubah EA ekspor M5 panjang | Ubah EA (lebih cepat, data lebih panjang) |
| SC-3 | Calon aturan pertama | S3 London breakout + time-stop 3 jam, UJI_DEMO |
| SC-4 | Konfirmasi tertulis ke CS Finex bahwa scalping/EA diizinkan | Ya, sebelum ada uji demo |

## 10. Cara mengulang angka di dokumen ini

- **Agregasi tick → M1:** `scripts/research/scalp_finex_agg.py <ticks-YYYY-MM-DD.jsonl> <keluaran.csv>`. Hanya pasangan Forex; per menit: OHLC mid, spread rata-rata dan maksimum, bid/ask terakhir.
- **Analisa spread & uji S1–S3:** `scripts/research/scalp_finex_bt.py <gabungan-m1.csv>`. Butuh pandas.
- **History Finex:** `collectAccountEvaluations` (server/routes/evaluationRoutes.ts) dengan saringan golongan FOREX/FOREX_JPY dan durasi ≤ 30 menit.

## Sumber

- [Finex — situs resmi](https://www.finex.co.id)
- [Finex — instrumen](https://www.finex.co.id/trading/instruments)
- [Finex — jenis akun](https://www.finex.co.id/trading/accounts)
- [TradingFinder — ulasan Finex](https://tradingfinder.com/brokers/finex/)
- [Forex Peace Army — Finex](https://www.forexpeacearmy.com/forex-reviews/23067/finex-review)
- [BrokerXplorer — ulasan Finex](https://www.brokerxplorer.com/finex-review)
- [Bayes Business School — What do retail FX traders learn?](https://www.bayes.citystgeorges.ac.uk/faculties-and-research/research/bayes-knowledge/2017/november/what-do-retail-fx-traders-learn)
- [CXO Advisory — Experiences of retail currency traders](https://www.cxoadvisory.com/individual-investing/experiences-of-retail-currency-traders)
- [MQL5 Forum — Scalping system shows zero directional edge](https://www.mql5.com/en/forum/517101)
- [BrokerChooser — peringatan 74–89% akun CFD ritel rugi](https://brokerchooser.com/id/broker-reviews/fxtradingcom-review/fxtradingcom-eurusd-spread)
