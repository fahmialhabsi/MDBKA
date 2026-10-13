# Rancangan — Tim per Akun, Tim Tab MT5, dan Tim Indikator

13 Okt 2026 · Fahmi Alhabsi

> **Status:** DRAF DISKUSI. Belum ada kode yang diubah.
> **Terkait:** `docs/RANCANGAN-2026-10-13-alur-trader-profesional.md`, `docs/RANCANGAN-2026-10-13-fondasi-data-dan-jalur-live.md`, `docs/AUDIT-RANCANGAN-2026-10-13.md`.
> **Sifat:** "tim" di dokumen ini adalah modul aturan murni (tanpa AI, tanpa orang). TUNGGU tetap default. MDBKA tidak pernah mengirim order.

## 0. Ringkasan dan hasil bedah ulang

Permintaan Fahmi: (1) tim terpisah untuk setiap akun demo dan Live di Finex, OTB, MIFX, Exness; (2) di setiap akun demo, tim kecil per tab MT5 yang bekerja setiap 1 jam; (3) tim indikator per kategori referensi MT5 (Trend, Oscillators, Volume, Bill Williams) untuk semua akun. Setiap tim mengambil data, menganalisa, membagi, melaporkan, dan menyerahkan hasilnya ke tim penindak lanjut.

Setelah dibedah, permintaan ini **sejalan** dengan prinsip rancangan, dengan **enam koreksi** agar alurnya tidak terbalik:

1. **Laporan tim tidak langsung menjadi keputusan atau order.** Laporan masuk sebagai konteks, shadow, atau kartu pola. Yang boleh mengubah keputusan hanya aturan berversi di Buku Aturan yang sudah lolos 3 lampu hijau. Bila tidak, laporan "ditindaklanjuti" sebelum terbukti, dan itu membalik urutan bukti → aturan.
2. **Data diambil terus-menerus; "setiap 1 jam" adalah jadwal laporan.** Kejadian penting (EA berhenti, koneksi putus, order ditolak, margin menipis) dilaporkan **segera**, tidak menunggu jam berikutnya. Kalau menunggu, risiko ketahuan terlambat.
3. **Tab yang tidak bisa dibaca program tidak dibuatkan tim pura-pura.** News, Mailbox, Articles, dan alert manual tidak punya API MQL5. Ketiganya dicatat sebagai pekerjaan tertunda (fondasi D5–D8), bukan diisi angka karangan.
4. **Satu kode, banyak akun.** Tim per akun adalah konfigurasi per login, bukan salinan kode per akun. Dengan begitu hasil antar akun bisa dibandingkan dan perbaikan tidak berbeda-beda.
5. **Indikator baru tidak menambah skor.** Semua indikator baru mulai sebagai konteks/shadow, dikelompokkan menurut apa yang diukur (bukan menurut menu MT5), dan indikator yang saling berkaitan tidak dihitung sebagai bukti terpisah (prinsip 10).
6. **Akun Live tidak menerima eksperimen.** Tim akun demo menjalankan fitur uji. Tim akun Live hanya menjalankan versi berstatus PERCOBAAN_LIVE/LIVE dan semua penjaga Live.

## 1. Prinsip yang tetap berlaku

Semua prinsip di rancangan alur (bagian 2, butir 1–10) dan fondasi tetap berlaku. Yang paling relevan di sini:

- Rumus `decisionEngine.ts`, parser OCR, dan parser CSV (`csvCandleParser.ts`) **tidak diubah** (aturan mutlak 2 dan 3). Data tambahan seperti tick volume dibaca lewat fungsi baru, bukan dengan mengubah parser lama.
- Gerbang kualitas data (A3) dijalankan sebelum tim mana pun menganalisa.
- Bukti dan rapor dipisah per golongan, per versi aturan, dan per jenis akun.
- Satu langkah kecil per giliran; test lama hanya ditambah.

## 2. Daftar akun (hasil audit K-3, 13 Okt 2026)

Sumber: daftar file `MDBKA_History_/Calendar_/Sessions_/Specs_<login>.csv` di `Common\Files`, dicocokkan dengan `ACCOUNT_LABELS` di `.env`.

| Login | Broker (Company) | Label di `.env` | Jenis | Bukti | Deal tercatat | Deal terakhir |
| --- | --- | --- | --- | --- | --- | --- |
| 91811209 | PT. Finex Bisnis Solusi Futures | Finex live | Live | Label | 41 | 2026.10.01 20:36:38 |
| 61823011 | PT. Finex Bisnis Solusi Futures | Finex demo | Demo | Label | 45 | 2026.10.12 19:42:24 |
| 70930952 | PT. Orbi Trade Berjangka | OTB demo | Demo | Label | 37 | 2026.10.09 15:37:16 |
| **72159716** | PT. Orbi Trade Berjangka | **TIDAK ADA** | Demo (dugaan kuat) | Satu-satunya deal: setoran 5.000 USD, komentar "Demo Deposit Awal", 2026.10.09 16:59:00 | 1 | 2026.10.09 16:59:00 |
| 1003997005 | PT Monex Investindo Futures | MIFX demo | Demo | Label | 7 | 2026.10.12 13:42:51 |
| 413925678 | Exness Technologies Ltd | Exness demo | Demo | Label | 36.722 | 2026.10.12 08:01:03 |

**Temuan:**

- Hanya satu akun tidak berlabel (72159716, OTB) dan buktinya menunjukkan demo. **Tidak ada akun Live yang tidak berlabel.**
- Dua trade 12 Okt di screenshot (AUDJPY dan XAUUSD) berasal dari **Finex demo 61823011**, bukan akun Live. Dokumen lain sudah dikoreksi.
- Akun Live Finex 91811209 tidak punya deal lagi sejak 1 Okt 2026.
- Kepastian jenis akun tetap baru diperoleh dari `ACCOUNT_TRADE_MODE` setelah langkah F3.

## 3. Tim per akun

| Tim | Untuk login | Menjalankan | Tidak boleh |
| --- | --- | --- | --- |
| Tim Akun Demo | 61823011 (setelah F3), 70930952, 72159716 (setelah diberi label), 1003997005, 413925678 | Semua versi aturan termasuk UJI_DEMO; fitur uji (jeda tidak mengunci, masuk lagi simbol sama, siklus Tim 2); mencatat entri setara Live dan tidak setara | Memengaruhi bukti atau jeda akun Live (K-4) |
| Tim Akun Live | 91811209 | Hanya versi PERCOBAAN_LIVE/LIVE; semua penjaga Live; risiko gabungan; lampu 3 | Menjalankan fitur uji atau versi UJI_DEMO |

- Setiap tim akun punya catatan sendiri per login: `keputusan`, `rangkaian`, `kartu_pola`, dan `laporan_tim` (bagian 7).
- Sebelum F3 selesai, login diambil dari label dan nama file; statusnya ditampilkan "login belum terverifikasi".
- Akun baru yang muncul tanpa label diperlakukan sesuai keputusan K-3.

## 4. Tim kecil per tab MT5 (laporan setiap 1 jam)

Berlaku di setiap akun demo sesuai permintaan. **Usulan tambahan:** akun Live juga mendapat tim Trade, Exposure, Experts, dan Journal untuk pengawasan saja, karena akun uang sungguhan butuh pengawasan minimal sama ketatnya.

| Tab | Bisa dibaca program? | Sumber teknis | Data yang diambil | Analisa | Diserahkan ke |
| --- | --- | --- | --- | --- | --- |
| Trade | Ya | `positions.csv`, `equity.csv` (sudah ada) | Posisi, SL/TP, untung/rugi berjalan, margin, free margin | Posisi tanpa SL, margin menipis, posisi melewati time-stop | Tim 2 (monitor posisi), risiko gabungan (fondasi E) |
| Exposure | Ya, dihitung | Dihitung dari posisi (tab Exposure MT5 adalah ringkasan per aset) | Eksposur per mata uang dan golongan | Total USD naik/turun, eksposur kotor/bersih | Risiko gabungan (E1), penjaga korelasi |
| Calendar | Ya | `MDBKA_Calendar_<login>.csv` (sudah ada) | Berita, Actual/Forecast/Previous | Berita dekat, selisih Actual vs Forecast | Penjaga berita, Tim 6b |
| Experts | Ya, berkas log | Log EA di folder `MQL5\Logs` terminal | Pesan dan error EA/service | EA berhenti, error berulang | Gerbang kualitas data (A3) |
| Journal | Ya, berkas log | Log terminal di folder `Logs` | Koneksi, login, order manual dan penolakan (requote, market closed) | Koneksi putus, order ditolak, login yang aktif | A3, A1 (bantu identitas akun sebelum F3), D1 (catatan order sebagian) |
| Alerts | Sebagian | Alert manual di terminal tidak bisa dibaca; yang dicatat adalah peringatan buatan MDBKA sendiri | Peringatan `exitMonitor` dan penjaga | Peringatan yang tidak ditindaklanjuti | Laporan harian |
| News | Tidak | Tidak ada API MQL5 | — | — | Tertunda (fondasi D5); pengganti sementara: Calendar + lonjakan ATR/gap |
| Mailbox | Tidak | Tidak ada API | — | — | Tertunda (fondasi D6) |
| Articles | Tidak | Bukan data terminal | — | — | Tertunda (fondasi D7) |

**Catatan teknis:**

- Pembaca log yang ada sekarang (`mt5LogReader.ts`) hanya mengurai angka equity. Membaca isi Journal dan Experts adalah pekerjaan baru, dan format log di keempat terminal harus dicek dulu sebelum aturan dibuat.
- Laporan per jam memakai jendela jam server yang sama untuk semua tim, sehingga laporan antar tab bisa digabung.

## 5. Tim indikator (semua akun, semua MT5)

### 5.1 Aturan baca indikator (kontrak data)

- Setiap nilai indikator dicatat bersama **simbol, broker, timeframe, periode, metode penghalusan, harga yang dipakai (Close/Typical/…), jenis volume (tick/real), dan shift**. Instrumen dan timeframe diperiksa sebelum nilai dibaca.
- **Hanya candle tertutup.** Nilai pada candle yang belum selesai bisa berubah, jadi tidak dipakai sebagai sinyal. **Fractal baru sah setelah dua bar di kanannya terbentuk.**
- Nilai parameter bawaan MT5 hanya titik awal, bukan setelan terbaik. Parameter dikunci per versi aturan dan hanya disetel di data latih.
- Dihitung di MDBKA (modul murni TypeScript dari candle, seperti `indicators.ts` yang sudah ada). Setiap indikator wajib lolos **test pembanding** dengan nilai yang diekspor dari MT5 untuk simbol dan timeframe yang sama, supaya rumusnya terbukti identik dengan MT5.
- Untuk Forex dan CFD, "volume" adalah jumlah perubahan harga (tick volume), bukan volume transaksi. Indikator volume pada simbol itu diberi label "tick volume".

### 5.2 Pengelompokan menurut yang diukur

Menu MT5 tidak selalu sama dengan fungsi indikator (misalnya ATR ada di menu Oscillators tetapi mengukur volatilitas). Tim indikator dibagi menurut referensi MT5 seperti permintaan, tetapi penilaiannya memakai **enam dimensi**: arah tren, kekuatan tren, momentum, volatilitas, aktivitas/volume, dan struktur swing.

| # | Indikator | Menu MT5 (tim) | Yang diukur | Keluarga yang berkaitan | Di MDBKA | Gelombang |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Adaptive Moving Average (AMA) | Trend | Arah tren (adaptif) | Keluarga MA | — | 2 |
| 2 | ADX | Trend | Kekuatan tren (bukan arah) | ADX | — | **1** |
| 3 | ADX Wilder | Trend | Kekuatan tren | ADX | — | 2 (pembanding ADX) |
| 4 | Bollinger Bands | Trend | Volatilitas (lebar band) | StdDev | — | **1** (lebar band) |
| 5 | DEMA | Trend | Arah tren | Keluarga MA | — | 2 |
| 6 | Envelopes | Trend | Jarak dari rata-rata (deviasi tetap) | Keluarga MA | — | 3 |
| 7 | FrAMA | Trend | Arah tren (adaptif) | Keluarga MA | — | 2 |
| 8 | Ichimoku Kinko Hyo | Trend | Arah tren + area level | Gabungan | — | 2 (konteks) |
| 9 | Moving Average | Trend | Arah tren | Keluarga MA | **Ya (MA50)** | Sudah |
| 10 | Parabolic SAR | Trend | Arah/trailing | — | — | 2 (pembanding saran geser SL Tim 2) |
| 11 | Standard Deviation | Trend | Volatilitas | StdDev | — | 1 (bersama Bollinger) |
| 12 | TEMA | Trend | Arah tren | Keluarga MA | — | 2 |
| 13 | VIDYA | Trend | Arah tren (adaptif) | Keluarga MA | — | 2 |
| 14 | ATR | Oscillators | Volatilitas (bukan arah) | — | **Ya** | Sudah |
| 15 | Bears Power | Oscillators | Tekanan jual vs EMA | Bulls/Bears | — | 3 |
| 16 | Bulls Power | Oscillators | Tekanan beli vs EMA | Bulls/Bears | — | 3 |
| 17 | Chaikin Oscillator | Oscillators | Aktivitas volume (dari A/D) | A/D | — | 3 |
| 18 | CCI | Oscillators | Penyimpangan dari rata-rata (momentum) | Momentum | **Ya** | Sudah |
| 19 | DeMarker | Oscillators | Momentum (skala 0–1, cek tampilan) | Momentum | — | 3 |
| 20 | Force Index | Oscillators | Harga × volume | Volume | — | 3 |
| 21 | MACD | Oscillators | Momentum/tren | MACD | **Ya** | Sudah |
| 22 | Momentum | Oscillators | Momentum (acuan 100) | Momentum | — | 3 |
| 23 | OsMA | Oscillators | Selisih MACD dan signal | MACD | — | **Tidak ditambah** (turunan langsung MACD) |
| 24 | RSI | Oscillators | Momentum 0–100 | Momentum | **Ya** | Sudah |
| 25 | RVI | Oscillators | Momentum (close vs open) | Momentum | — | 3 |
| 26 | Stochastic | Oscillators | Momentum (posisi close dalam rentang) | Momentum | — | 2 (pembanding RSI) |
| 27 | TRIX | Oscillators | Laju perubahan EMA tiga kali | MACD/momentum | — | 3 |
| 28 | Williams %R | Oscillators | Posisi close dalam rentang (skala terbalik) | Stochastic | — | 3 |
| 29 | Accumulation/Distribution | Volume | Aktivitas volume kumulatif | A/D | — | 3 (bermakna penuh hanya dengan volume nyata) |
| 30 | Money Flow Index | Volume | Momentum + volume 0–100 | Momentum/volume | — | 3 |
| 31 | On Balance Volume | Volume | Volume kumulatif | Volume | — | 3 |
| 32 | Volumes | Volume | Aktivitas per bar | Volume | — (kolom `tick_volume` diekspor tetapi belum dibaca) | **1** (tampil saja, label tick volume) |
| 33 | Accelerator Oscillator (AC) | Bill Williams | Percepatan momentum | AO | — | 3 |
| 34 | Alligator | Bill Williams | Arah (3 MA bergeser) | Keluarga MA | — | 3 |
| 35 | Awesome Oscillator (AO) | Bill Williams | Momentum (SMA 5 vs 34 median) | MACD/momentum | — | 3 |
| 36 | Fractals | Bill Williams | Struktur swing lokal | Swing (`swingDetector.ts`) | — | **1** (pembanding detektor swing yang ada) |
| 37 | Gator Oscillator | Bill Williams | Jarak garis Alligator | Alligator | — | 3 |
| 38 | Market Facilitation Index (BW MFI) | Bill Williams | Rentang per tick volume | Volume | — | 3 |

**Gelombang 1 — satu wakil untuk setiap dimensi yang belum ada:** ADX (kekuatan tren), lebar Bollinger/Standard Deviation (rezim volatilitas), Fractals (struktur swing terkonfirmasi), Volumes (aktivitas tick).

**Gelombang 2** — alternatif dalam keluarga yang sama, hanya bila gelombang 1 terbukti menambah nilai.

**Gelombang 3** — sisanya, dengan syarat yang sama. Indikator volume hanya dinilai penuh pada simbol dengan volume nyata.

### 5.3 Tugas tim indikator

1. **Ambil:** candle tertutup per simbol per timeframe, setelah lolos gerbang kualitas data (A3).
2. **Hitung:** sesuai kontrak data 5.1.
3. **Bagi:** nilai dikirim ke kartu pola (menggantikan Tim 3 di rancangan alur 7.8; Tim 3 menjadi koordinator tim indikator), ke catatan `keputusan` sebagai konteks, dan ke laporan per jam.
4. **Lapor:** setiap candle H1 tertutup (sejalan dengan "setiap 1 jam"); H4 dan D1 saat candle-nya tertutup.
5. **Diserahkan ke:** tim analisa (sebagai konteks/shadow), Tim 2, dan evaluasi. Tidak ada indikator baru yang mengubah keputusan sebelum menjadi aturan berversi yang lolos 3 lampu hijau.

### 5.4 Pengaman terhadap "terlalu banyak yang diuji"

38 indikator dengan beberapa parameter berarti ratusan kombinasi, dan sebagian pasti tampak bagus karena kebetulan. Karena itu:

- semua kombinasi yang diuji dicatat, termasuk yang gagal;
- ukuran peluang backtest kebetulan (PBO) dipakai sebagai pelengkap;
- pemenang wajib lolos data ujian yang belum pernah dipakai untuk memilih;
- satu gelombang selesai dinilai sebelum gelombang berikutnya dimulai.

## 6. Alur kerja lengkap (urutan tidak terbalik)

| Lapis | Isi | Siapa | Kapan |
| --- | --- | --- | --- |
| 0 | Data mentah: candle, kuotasi, posisi, equity, kalender, log | EA/service MT5 + server | Terus-menerus |
| 1 | Gerbang kualitas data (A3) dan identitas akun (A1) | Fondasi | Setiap data masuk |
| 2 | Tim pengamat: tim tab dan tim indikator | Bagian 4 dan 5 | Laporan tiap jam/candle; kejadian penting segera |
| 3 | Tim analisa (pemindai, Tim 1) | `scanSymbol` | Tiap candle; hasil lapis 2 hanya sebagai konteks/shadow |
| 4 | Penjaga dengan urutan tetap | Penjaga Mode Aman | Setiap sinyal |
| 5 | Tim akun: demo (fitur uji) atau Live (hanya versi lolos) | Bagian 3 | Setiap sinyal |
| 6 | Saran ke Fahmi (order manual di MT5) | Tampilan | Saat sinyal lolos |
| 7 | Tim 2: monitor posisi, siklus 30 menit | Rancangan alur 7 | Selama posisi terbuka |
| 8 | Pencatat dan kartu pola (setelah rangkaian selesai) | Tim 8, catatan G | Saat rangkaian selesai |
| 9 | Evaluasi, Buku Aturan, 3 lampu hijau | Fondasi C | Berkala |

Hasil lapis 9 kembali ke lapis 3 **hanya** sebagai versi aturan baru. Tidak ada jalan pintas dari laporan tim langsung ke keputusan.

## 7. Penyimpanan laporan tim

Tabel baru `laporan_tim`, mengikuti spesifikasi JSONL di fondasi G5:

- Lokasi: `data/laporan/laporan-<login>-<YYYY-MM>.jsonl`, ikut tombol Backup.
- Kolom: `skema` (`laporan_tim/1`), `laporanId`, `login`, `broker`, `jenisAkun`, `tim` (misalnya `TAB_JOURNAL`, `INDIKATOR_ADX`), `jendelaMulaiUtc`, `jendelaSelesaiUtc`, `sumberData` (berkas + umur), `kualitasData`, `temuan` (daftar), `kejadianPenting` (ya/tidak), `diserahkanKe`, `mengoreksi`.

## 8. Tujuan jangka panjang: merangkak dari bawah ke atas

Tujuan Fahmi adalah MDBKA yang siap Live dan suatu saat mampu mengelola dana sangat besar (sampai Rp18 triliun). Rancangan ini tidak terpaku pada angka itu, tetapi memastikan setiap tangga bisa dinaiki dengan aman:

- **Tangga naik hanya dengan bukti:** demo → percobaan Live lot minimum (lampu 3) → modal naik bertahap, dan setiap tangga mensyaratkan lampu tetap hijau di tangga sebelumnya.
- **Yang berubah saat modal membesar:**
  - batas lot maksimum broker;
  - slippage dan likuiditas;
  - batas golongan Rupiah (`RISK_GROUPS`, misalnya Rp35 rb untuk Forex) yang dibuat untuk tahap belajar sekarang. Batas ini harus ditinjau di setiap tangga lewat Buku Aturan, tidak diubah diam-diam.
  - Data institusional (fondasi D2, D3) baru relevan di tangga atas.
- **Yang sudah dirancang agar bisa membesar:** catatan per akun, Buku Aturan berversi, risiko gabungan per akun, dan pemisahan demo/Live.

## 9. Langkah usulan

| Langkah | Isi | Fase (peta urutan induk) | Mengubah perilaku? |
| --- | --- | --- | --- |
| TA-1 | Label untuk 72159716 di `.env` (diisi Fahmi) + aturan akun tanpa label sesuai K-3 | 0 | Hanya status akun |
| TA-2 | Konfigurasi tim per login (satu kode) + papan per akun | 0–1 | Tampilan |
| TA-3 | Tim akun demo/Live membaca status Buku Aturan | 6 (setelah J1) | Ya, langkah dan test tersendiri |
| TT-1 | Laporan per jam: tim Trade dan Exposure (dari data yang sudah ada) | 0 | Tidak |
| TT-2 | Laporan per jam: tim Calendar | 0 | Tidak |
| TT-3 | Pembaca log Experts dan Journal (cek format dulu); kejadian penting segera | 1 (bersama F2/F3) | Bisa menahan sinyal lewat A3 |
| TT-4 | Tim Alerts: catatan peringatan MDBKA | 4 | Tidak |
| TI-1 | Kontrak data indikator + test pembanding dengan nilai ekspor MT5 | 0 | Tidak |
| TI-2 | Gelombang 1: ADX, lebar Bollinger/StdDev, Fractals, tick volume (pembaca baru, tanpa mengubah `csvCandleParser.ts`) | 4–5 | Tidak (konteks/shadow) |
| TI-3 | Nilai indikator masuk kartu pola dan catatan keputusan | 5 | Tidak |
| TI-4 | Gelombang 2 dan 3, hanya bila gelombang sebelumnya terbukti menambah nilai | 6 | Tidak, sampai lolos 3 lampu |
| G-7 | Tabel `laporan_tim` (bagian 7) | 0 | Tidak |
