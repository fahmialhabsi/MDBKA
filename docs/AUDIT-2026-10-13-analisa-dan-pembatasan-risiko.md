# Audit Analisa MDBKA — Data, Alur, dan Pembatasan Risiko

13 Okt 2026 · Fahmi Alhabsi

> **Status:** audit read-only, belum ada perubahan kode. Posisi repo saat audit: branch `main`, HEAD `551b696`, test terakhir 686 (test berikutnya 687).
> **Konteks:** permintaan mengganti jeda "3 kali rugi berturut-turut = dikunci" menjadi tidak dikunci di akun demo, sementara akun Live tetap seperti sekarang.
> **Dokumen hidup (bisa dikomentari):** https://claude.ai/code/artifact/6ab0b1fc-bb2b-44d5-b777-e09ed3b2d4ff

## Ringkasan

Melonggarkan penjaga di akun demo aman dilakukan hanya bila aplikasi bisa membuktikan akun mana yang sedang aktif, dan itu belum bisa dibuktikan dari data yang ada sekarang.

- **Cara kerja:** MDBKA adalah mesin aturan murni (tanpa AI). BELI/JUAL keluar hanya bila skor 4 indikator H1 kompak, lalu lolos 9 penjaga status pemindai. Selain itu hasilnya TUNGGU.
- **Bahan analisa:** 200 candle H1 per simbol, kuotasi, posisi, equity, History MT5, kalender, jam sesi, spesifikasi simbol, margin, dan kurs ECB.
- **Temuan 1:** semua penjaga dinilai per broker, bukan per akun. File posisi, equity, dan kuotasi dari MT5 tidak memuat nomor login atau jenis akun.
- **Temuan 2:** trade yang dicatat saat penjaga dilonggarkan akan tercatat "LOLOS" dan mencemari bukti n ≥ 20. Bukti itu dipakai untuk menahan sinyal di Live dan untuk keputusan uang sungguhan.
- **Temuan 3:** gerbang biaya 10% dan batas risiko dihitung di dalam `decisionEngine.ts`. Saat menahan, mesin mengosongkan SL, TP, dan lot, jadi keduanya tidak bisa dilonggarkan tanpa menyentuh rumus yang dilarang diubah.
- **Usulan:** langkah kecil, default Live, pelonggaran demo dicatat sebagai "seharusnya ditahan", dan bukti Live dipisah dari trade yang dilonggarkan. Rinciannya ada di bagian 5 dan 6.

## 2. Data bahan analisa

Analisa memakai 12 sumber data ditambah tabel tetap di kode. Hanya file per-login (History, Kalender, Sesi, Spesifikasi) yang mengenal akun; file langsung dari terminal (posisi, equity, kuotasi) hanya mengenal broker.

| Sumber | Dibuat oleh | Isi | Dipakai untuk |
| --- | --- | --- | --- |
| `MDBKA_<simbol>_H1.csv` | Service `AutoExportMDBKAService` | 200 candle H1 (time, OHLC, tick_volume) | MA50, RSI, CCI, ATR, MACD, swing support/resistance |
| `quotes.csv` | EA `MDBKAMultiLive` | Timestamp, Symbol, Bid, Ask (jam server) | Bid/ask entry, jam server "sekarang" untuk semua penjaga |
| `positions.csv` | EA `ExportPositions` | Ticket, Symbol, Type, Volume, PriceOpen, SL, TP, TimeOpen, Swap | Penjaga korelasi, monitor posisi, pencatat entry |
| `equity.csv` | EA `MDBKAMultiLive` | Saldo, equity, profit, leverage, margin, free margin, margin level | Ukuran lot (risiko 1%), penjaga margin, saldo header |
| `MDBKA_History_<login>.csv` | Service `MDBKAHistoryService` | Semua deal tertutup per akun, termasuk login dan Company | Evaluasi trade, bukti n ≥ 20, jeda 3 rugi, halaman History |
| `MDBKA_Calendar_<login>.csv` | Service `MDBKACalendarService` | Event ekonomi dengan tingkat kepentingan | Penjaga berita (hanya HIGH, ±30 menit) |
| `MDBKA_Sessions_<login>.csv` | Service `MDBKACalendarService` | Jam trading resmi per simbol | Penjaga sesi |
| `MDBKA_Specs_<login>.csv` | Service `MDBKACalendarService` | Contract size, tick size/value, digits, lot min/step | Penjaga spesifikasi (dibanding tabel tetap) |
| `MDBKA_Margin_<broker>.csv` | EA `ExportMarginMDBKA` | Margin 1 lot beli/jual per simbol | Penjaga margin (maks 50% free margin) |
| `data/fx/ecb-usdidr.json` | Server, dari ECB | Kurs USD/IDR dan kurs silang harian | Batas risiko Rupiah, konversi akun IDR (Exness) |
| `data/trades/entries-<broker>.jsonl` | Server (`tradeEntryLog`) | Satu baris per tiket baru: SL/TP awal, equity, hasil pemindai saat entry | Memasangkan setup dengan hasil di History |
| `excursion-<broker>.jsonl` | Server (`excursionJob`) | MFE/MAE per posisi | Evaluasi, usulan aturan keluar |
| Tabel tetap di kode | `instrumentSpecs32.ts`, `otbInstrumentConfig.ts`, `mifxSpecs.ts`, `exnessSpecs.ts` | Kontrak, tick, komisi, lot per simbol | Point value, biaya, golongan risiko |

Tiga catatan tentang kualitas data:

- `positions.csv`, `equity.csv`, dan `quotes.csv` tidak memuat login atau jenis akun (demo/live). Kolom `account` di tipe equity hanya opsional dan EA saat ini tidak menulisnya.
- Satu terminal MT5 per broker bisa login ke akun demo atau live kapan saja. Contoh: terminal Finex dipakai untuk akun live 91811209 dan demo 61823011.
- Kalender, sesi, dan spesifikasi yang tidak ada akan membuat penjaganya diabaikan (fail-open), sedangkan jeda 3 rugi tanpa jam server tetap menahan (fail-safe).

## 3. Alur kerja

Satu simbol melewati 11 tahap berurutan, dan penjaga pertama yang kena menentukan statusnya. Pemindai (semua simbol), Hasil analisa (satu simbol di layar), dan pencatat entry di server memakai aturan yang sama.

1. **Baca candle.** CSV H1 butuh minimal 50 candle; kurang dari itu statusnya DATA.
2. **Cek pasar tutup.** Candle terakhir yang tertinggal ≥ 2 jam dari candle terbaru broker yang sama berstatus `PASAR_TUTUP`.
3. **Hitung indikator.** MA50, RSI, CCI, ATR, MACD, dan swing support/resistance. Bid/ask diambil dari `quotes.csv`.
4. **Pasang konteks broker.** Preset simbol, nilai poin dalam USD, dan batas risiko golongan (Rupiah dikonversi dengan kurs ECB). Data yang tidak masuk akal berstatus DATA.
5. **Hitung skor (strategi bawaan).** Tren ±2 (close terhadap MA50), CCI ±1 (di luar ±100), MACD ±1 (terhadap signal), RSI ±1 (di rentang 50–70 atau 30–50). BELI bila skor ≥ 3 dan close di atas MA50; JUAL bila skor ≤ −3 dan close di bawah MA50.
6. **Tentukan SL dan TP.** SL memakai yang lebih jauh antara SL berbasis support/resistance dan SL berbasis ATR × pengali. TP = jarak risiko × target RR.
7. **Gerbang risiko.** Lot dihitung dari 1% equity. Biaya (spread, slippage, komisi) maksimal 10% dari risiko. Risiko pada lot minimum tidak boleh melewati batas 1% atau batas golongan. Yang gagal menjadi TUNGGU dengan SL, TP, dan lot dikosongkan.
8. **Penjaga berurutan (pemindai).** Hanya sinyal LOLOS yang diperiksa, berurutan: spesifikasi → bukti → jeda → berita → sesi → pembukaan bursa → korelasi.
9. **Keluarkan rencana.** Sinyal LOLOS membawa entry, SL, TP, dan lot untuk disalin. MDBKA tidak pernah menempatkan atau menutup order.
10. **Catat dan buktikan.** Server menulis tiap tiket baru ke `entries-<broker>.jsonl` bersama status pemindai saat itu. Setelah posisi tertutup, History dipasangkan lewat PositionId = tiket, lalu dihitung per kelompok status.
11. **Umpan balik.** Kelompok LOLOS dengan n ≥ 20 dan rata-rata per trade ≤ 0 dinyatakan terbukti rugi, sehingga sinyal LOLOS berikutnya ditahan (`DITAHAN_BUKTI`). Setelah posisi terbuka, monitor memberi breakeven di +0,5R dan time-stop 3 jam untuk Forex.

Catatan: urutan di Hasil analisa sedikit berbeda dari pemindai (spesifikasi → jeda → berita → korelasi → bukti). Penjaga sesi tidak terlihat di jalur itu pada pengecekan saya, jadi perlu dipastikan sebelum ada perubahan.

## 4. Penjaga Mode Aman dan cakupannya

Penjaga menilai per broker atau per setup, dan tidak ada yang membedakan demo dan live. Hanya jeda dan bukti yang sengaja menggabungkan trade demo dan live.

| Penjaga | Aturan dan ambang | Cakupan sekarang | Kode |
| --- | --- | --- | --- |
| Gerbang biaya | (spread + slippage) × nilai poin + komisi ≤ 10% dari risiko | Per setup | `decisionEngine.ts` (dilarang diubah) |
| Batas risiko | 1% equity dan batas golongan: Forex Rp35 rb, Minyak Rp150 rb, Logam dan Indeks Rp500 rb, Saham AS Rp50 rb; tanpa kurs = ditahan | Per setup | `decisionEngine.ts`, `riskGroup.ts` |
| Spesifikasi | Spesifikasi MT5 beda dari tabel tetap di kode = ditahan | Per broker | `spec32Wiring.ts` |
| Bukti | Kelompok LOLOS dengan n ≥ 20 dan rata-rata per trade ≤ 0 = ditahan | **Demo + live digabung** | `evaluationView.ts` |
| Jeda | 3 trade terakhir rugi berturut-turut = ditahan 24 jam jam server | **Demo + live digabung** | `lossStreakGuard.ts` |
| Berita | Berita tingkat HIGH dalam ±30 menit untuk mata uang simbol | Per broker | `newsGuard.ts` |
| Sesi | Pasar tutup dalam 60 menit; saham jelang libur 240 menit | Per broker | `sessionGuard.ts` |
| Pembukaan bursa | 30 menit sebelum sampai 60 menit sesudah buka bursa indeks dan saham AS | Per simbol | `openingGuard.ts` |
| Korelasi | Sinyal searah dengan eksposur posisi terbuka = ditahan; aturan USD ketat | Per broker | `correlationGuard.ts` |
| Margin | Lot dibatasi agar margin terpakai ≤ 50% free margin | Akun yang sedang login di terminal | `marginGuard.ts` |
| Breakeven dan time-stop | Geser SL ke entry + komisi di +0,5R; time-stop 3 jam hanya Forex | Posisi terbuka | `exitMonitor.ts` |

Tiga hal tentang perilaku saat data tidak ada:

- **Fail-safe (menahan):** jeda tanpa jam server tetap menahan, dan batas risiko tanpa kurs Rupiah menahan.
- **Fail-open (diabaikan):** berita, sesi, pembukaan, spesifikasi, dan bukti tidak berlaku bila datanya tidak tersedia. Ini keputusan sadar agar aplikasi tidak macet, tetapi artinya penjaga itu mudah "hilang" tanpa suara.
- **Contoh nyata jeda:** menurut catatan handoff, jeda Finex 8 Okt berakhir pukul 09:50 jam server ketika GBPUSD +$1,63 dan GBPCHF +$1,51 memutus rantai rugi. OTB tidak terkena jeda karena trade terakhirnya US100 +$186,70.

## 5. Risiko pelonggaran di demo dan pembatasnya

Delapan risiko ditemukan; dua yang paling berat adalah penjaga ikut mati di akun uang sungguhan dan bukti n ≥ 20 yang tercemar.

| # | Risiko | Penyebab (dari kode) | Tingkat | Pembatas yang diusulkan |
| --- | --- | --- | --- | --- |
| 1 | Penjaga mati di akun uang sungguhan | Terminal Finex bisa login ke live atau demo kapan saja. `positions.csv`, `equity.csv`, dan `quotes.csv` tidak memuat login, jadi tombol bisa salah dan aplikasi tidak bisa memeriksa. | Tinggi | Default Live. Pelonggaran hanya bila login aktif terbukti demo: EA menulis `ACCOUNT_LOGIN` dan `ACCOUNT_TRADE_MODE`, server mencocokkannya dengan `ACCOUNT_LABELS`. Sebelum itu, hanya broker yang tidak punya akun live di `ACCOUNT_LABELS` saat ini (OTB, MIFX, Exness). |
| 2 | Bukti n ≥ 20 tercemar | Pencatat entry menyimpan status pemindai saat entry. Di demo yang longgar, trade yang akan ditahan di Live tercatat LOLOS. Bukti digabung demo + live dan dipakai menahan sinyal Live. | Tinggi | Simpan `mode` dan `seharusnyaDitahan` di `entries-<broker>.jsonl` (field baru opsional, rekaman lama tetap terbaca). Bukti LOLOS hanya menghitung entri yang tidak dilonggarkan; entri longgar jadi kelompok sendiri. |
| 3 | Gerbang biaya dan risiko tak bisa dilonggarkan tanpa menyentuh rumus | `applyRiskGates` mengosongkan SL, TP, dan lot saat menahan. Menampilkannya berarti menghitung ulang tanpa gerbang, yaitu mengubah atau menyalin rumus (aturan mutlak 2). | Sedang | Keluarkan gerbang biaya dari daftar pelonggaran, atau di demo hanya tampilkan arah tanpa SL dan lot. |
| 4 | Pilihan "akun tanpa label = demo" | Label dibaca dari kata "demo" atau "live" di `ACCOUNT_LABELS`. Akun live yang labelnya lupa diberi kata "live" akan kehilangan penjaganya. | Sedang | Pilihan ini keputusan Anda. Saran saya: akun yang tidak jelas diperlakukan Live, dan lencana "MODE DEMO" tampil jelas di layar. |
| 5 | Kebiasaan mengejar kerugian terbawa ke Live | Jeda dibuat untuk mencegah keputusan terburu-buru setelah 3 rugi. Di demo tanpa jeda, kebiasaan itu tidak tertahan. | Sedang | Demo tetap menampilkan "Di Live sinyal ini ditahan: jeda" dan menghitung berapa kali itu dilanggar. |
| 6 | Hasil demo yang longgar dibaca sebagai bukti untuk Live | Trade dengan penjaga mati tidak mewakili aturan yang berlaku di Live. | Sedang | Hasil demo longgar tidak boleh dipakai sebagai alasan melonggarkan Live atau membuka uang sungguhan. Ditampilkan terpisah. |
| 7 | Perilaku Live berubah tanpa sengaja | Jeda dipanggil di 4 tempat: `App.tsx`, pemindai, halaman detail sinyal, dan pencatat entry server. 686 test hanya menguji perilaku lama. | Sedang | Satu saklar pusat, default mati. Test 687 membuktikan keluaran mode Live identik dengan perilaku lama. Satu penjaga per langkah, tanpa auto-commit. |
| 8 | Syarat "3 lampu hijau" belum terdefinisi di repo | Pencarian di kode dan dokumen tidak menemukan definisinya. | Tinggi untuk uang sungguhan | Anda menulis definisinya, lalu saya jadikan gerbang tampilan di kode sebelum ada uang sungguhan. |

**Tidak boleh dilonggarkan di demo:** batas risiko 1% per trade dan batas golongan, kunci salin SL/TP, aturan bahwa MDBKA tidak pernah mengirim order, dan seluruh perilaku mode Live saat ini.

## 6. Urutan langkah dan keputusan terbuka

Mulai dari saklar mode yang default-nya Live, lalu jeda saja; Finex baru boleh dilonggarkan setelah login akun terbukti dari data. Tiap langkah satu perubahan kecil, dicek `npm test`, `tsc -b`, dan lint, tanpa auto-commit. Test baru mulai dari nomor 687.

1. **Modul mode (murni).** Tipe mode akun, default Live, dan fungsi yang menyatakan penjaga mana yang boleh dilonggarkan. Belum menyentuh layar. Test membuktikan Live identik dengan perilaku lama.
2. **Jeda di demo.** Di mode demo, jeda tetap dihitung tetapi hanya menjadi informasi "seharusnya ditahan". Mode Live tidak berubah.
3. **Pencatat entry.** Tambah field `mode` dan `seharusnyaDitahan`. Bukti LOLOS mengabaikan entri yang dilonggarkan.
4. **Layar.** Tombol mode, lencana "MODE DEMO", dan teks "Di Live sinyal ini ditahan".
5. **Verifikasi login.** EA menulis login dan jenis akun, server mencocokkan dengan `ACCOUNT_LABELS`. Ini perubahan MQL yang Anda pasang manual di MT5. Setelah ini baru Finex demo boleh dilonggarkan.
6. **Sesi, lalu korelasi.** Masing-masing satu langkah dengan pola yang sama seperti jeda.
7. **Gerbang biaya.** Ditunda sampai ada keputusan soal risiko nomor 3.

Keputusan yang masih Anda pegang:

- [ ] Pilihan mode: A (tombol Demo/Live, default Live), B (otomatis dari label), atau A dengan penguncian login seperti di atas (saran saya).
- [ ] Definisi tertulis "3 lampu hijau" untuk uang sungguhan.
- [ ] Jeda di Live tetap menghitung trade demo + live seperti sekarang, atau hanya trade live. Saran saya: tetap seperti sekarang karena paling konservatif.
- [ ] Gerbang biaya: dikeluarkan dari pelonggaran, atau di demo hanya menampilkan arah tanpa SL dan lot.
- [ ] Akun tanpa label: demo (pilihan Anda) atau Live (saran saya).
