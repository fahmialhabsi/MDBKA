# Rancangan — Fondasi Data dan Jalur Demo → Live

13 Okt 2026 · Fahmi Alhabsi

> **Status:** DRAF DISKUSI. Belum ada kode yang diubah.
> **Terkait:** `docs/AUDIT-2026-10-13-analisa-dan-pembatasan-risiko.md` dan `docs/RANCANGAN-2026-10-13-alur-trader-profesional.md`.
> **Sifat:** sistem berbasis aturan, tanpa AI. TUNGGU adalah default. MDBKA tidak pernah mengirim order; semua order tetap manual di MT5.

## 0. Ringkasan

- **A. Fondasi Data** dikerjakan lebih dulu, sebelum Tim 2 dan kartu pola. Keduanya bergantung pada data yang benar: akun mana, jam berapa, dan apakah datanya lengkap.
- **B. Konteks per golongan** menyusul sesudah A: yield AS–Jepang, stok minyak EIA, laporan COT. Hanya sebagai konteks, bukan pemicu.
- **C. Jalur Demo → Live**: aturan yang terbukti di demo naik ke Live lewat 3 lampu hijau. Hasil demo hanya sah untuk Live bila dicatat "setara Live" dan dihitung ulang dengan biaya akun Live.
- **A7–A9:** satu kontrak keputusan untuk semua jalur; A7-2/A7-3 hanya shadow; draf pengecualian aturan mutlak 1 (belum berlaku).
- **E. Risiko gabungan**, **F. Pemantauan perubahan kondisi**, **G. Struktur penyimpanan dan format JSONL**.
- **D. Pekerjaan tertunda**: daftar yang belum diimplementasikan. **Selama bagian D belum selesai, MDBKA dianggap belum selesai** (penetapan Fahmi, 13 Okt 2026).
- **Audit rancangan 13 Okt 2026** dan peta urutan induk: `docs/AUDIT-RANCANGAN-2026-10-13.md`.

## A. Fondasi Data (prioritas P0)

### A1. Identitas akun di semua data terminal

- **Fakta:** `positions.csv`, `equity.csv`, dan `quotes.csv` tidak memuat login atau jenis akun (audit, temuan 1).
- **Usulan:** EA menulis `ACCOUNT_LOGIN` dan `ACCOUNT_TRADE_MODE` (demo/kontes/riil) di setiap baris atau di header file. Server mencocokkannya dengan `ACCOUNT_LABELS`. Bila login di file berbeda dengan label, tampil peringatan dan semua sinyal broker itu TUNGGU.
- **Akun yang tidak terbukti demo:** rekomendasi eksternal dan saran Claude sama-sama memperlakukannya sebagai Live. **Diputuskan ulang (K-3, disetujui Fahmi 13 Okt 2026): akun tanpa label = Live**, sebagai jaring pengaman. Login 72159716 diberi label `OTB demo 2` di `.env` (langkah TA-1).
- **Hasil audit akun (K-3, 13 Okt 2026),** dari file di `Common\Files` dicocokkan dengan `ACCOUNT_LABELS`: ada 6 login. Lima berlabel (91811209 Finex live, 61823011 Finex demo, 70930952 OTB demo, 1003997005 MIFX demo, 413925678 Exness demo). **Satu tidak berlabel: 72159716 (PT. Orbi Trade Berjangka)**, berisi satu deal saja, yaitu setoran 5.000 USD berkomentar "Demo Deposit Awal" pada 2026.10.09 16:59. Bukti menunjukkan demo, tetapi kepastian penuh baru dari `ACCOUNT_TRADE_MODE` (F3). Rinciannya di `docs/RANCANGAN-2026-10-13-tim-akun-tab-indikator.md` bagian 2.
- **Keputusan K-2 (disetujui Fahmi 13 Okt 2026):** pelonggaran demo untuk Finex demo menunggu F3; OTB, MIFX, dan Exness boleh lebih dulu.
- **Catatan:** perubahan MQL, dipasang manual di keempat terminal.

### A2. Arsip tick untuk semua broker

- **Fakta:** arsip tick sudah ada (`server/services/tickHistory.ts`, HIST-1): append-only harian, menyimpan jam UTC, jam asli MT5, jam diterima, dan disimpan 120 hari. Saat ini isinya hanya `data/history/finex` dan `data/history/otb`.
- **Fakta:** selisih jam server hanya diatur untuk Finex dan OTB (`MT5_TZ_OFFSET_FINEX`, `MT5_TZ_OFFSET_OTB`). Bawaannya +3, padahal Exness terbukti UTC+0, jadi Exness akan salah bila tidak diatur.
- **Usulan:** arsip diperluas ke MIFX dan Exness. Broker tanpa selisih jam yang diatur eksplisit tetap diarsipkan, tetapi diberi tanda "zona belum terverifikasi" dan tidak dipakai untuk uji.

### A3. Gerbang kualitas data yang terlihat

| Pemeriksaan | Bila gagal |
| --- | --- |
| Candle hilang atau dobel di tengah data | DATA, dengan nama candle yang bermasalah |
| Kuotasi basi (umur kuotasi melewati batas per golongan) | TUNGGU, dengan umur kuotasi |
| Jam tidak urut atau dari masa depan | DATA |
| Simbol tidak cocok dengan spesifikasi | DATA |
| Spesifikasi lebih tua dari batas | TUNGGU |
| Kalender tidak diperbarui | Peringatan terlihat (bukan diam seperti sekarang) |
| Login di file tidak sesuai label akun | TUNGGU semua sinyal broker itu |
| EA atau service tidak memperbarui file melewati batas | TUNGGU, dengan nama EA/service dan jam terakhir diperbarui |

Layar selalu menampilkan kapan setiap EA dan service terakhir memperbarui filenya (`quotes.csv`, `positions.csv`, `equity.csv`, candle, kalender, sesi, spesifikasi, History).

Batas angka (umur kuotasi, umur spesifikasi) masih usulan dan ditetapkan per golongan saat dikerjakan.

### A4. Versi spesifikasi bertanggal

Setiap perubahan isi `MDBKA_Specs_<login>.csv` (kontrak, tick, lot, komisi) disimpan sebagai versi baru dengan tanggal berlaku. Trade dan kartu pola mencatat versi yang berlaku saat itu, supaya hasil lama tidak dihitung ulang dengan spesifikasi baru.

### A5. Pergantian jam musim (DST)

Banyak server MT5 menggeser jam pada akhir Oktober/awal November. Sesudah pergantian, selisih jam tiap broker dicek ulang dengan cara yang sama seperti verifikasi OTB (commit `6fec2ae`): selisih jam diterima dikurangi jam UTC tick baru harus sekitar ±1 detik.

### A6. Candle D1, W1, dan M15 live

Sama dengan rancangan alur trader, bagian 3.1 dan langkah T3. Dibutuhkan untuk arah D1, siklus 30 menit Tim 2, dan pembaca pola.

### A7. Satu kontrak keputusan untuk semua jalur (P0, paling mendesak)

**Akar masalah (dari kode, 13 Okt 2026):**

- Pemindai (`SymbolScannerPanel`), halaman detail sinyal (`SignalDetailPage`), pencatat entry server (`tradeEntryLog`), dan backtest sudah memakai satu fungsi yang sama: `scanSymbol` di `src/lib/symbolScanner.ts`.
- Hanya **Hasil analisa** (`App.tsx`) yang memakai jalur sendiri: `analyzeMarket(...)` lalu dibungkus enam penahan.

| | Pemindai (`scanSymbol`) | Hasil analisa (`App.tsx`) |
| --- | --- | --- |
| Sumber data | CSV candle H1 + kuotasi live + preset broker | Isian di layar: OCR screenshot, CSV, atau ketikan manual; pengaturan akun dari formulir |
| Strategi | Bisa memilih (`skor`, `candle`, `scalping`, `abc`) | Hanya `skor` (`analyzeMarket`) |
| Urutan penahan | biaya/risiko → spesifikasi → bukti → jeda → berita → **sesi** → pembukaan → korelasi | biaya/risiko → spesifikasi → jeda → berita → pembukaan → korelasi → bukti |
| Penjaga sesi | Ada | **Tidak ada** |

Akibatnya, untuk simbol dan jam yang sama, Hasil analisa bisa menampilkan BELI/JUAL padahal pemindai menahannya karena pasar segera tutup. Bila dua penjaga menahan bersamaan, kode alasannya juga bisa berbeda.

**Rancangan penyeragaman:**

1. **Satu bentuk "snapshot keputusan".** Semua masukan dikumpulkan menjadi satu objek: simbol, broker, akun dan jenis akun, candle (jumlah, jam candle terakhir, sidik jari isi), kuotasi (bid, ask, jam, umur), equity, kurs dan tanggalnya, preset broker, versi spesifikasi, kalender, sesi, posisi terbuka, data jeda, data bukti, strategi dan versi aturan, serta jam server dan jam nyata.
2. **Satu pembangun snapshot.** Pemindai dan Hasil analisa memanggil pembangun yang sama, dan gerbang kualitas data (A3) dijalankan di dalamnya, sekali.
3. **Satu fungsi penilai.** Snapshot dinilai oleh satu fungsi, yaitu `scanSymbol` yang sudah ada dan diperluas. Urutan penjaganya tetap: status ditentukan oleh penjaga pertama yang gagal. Untuk keperluan putar ulang, semua penjaga tetap dinilai dan dicatat (lulus, gagal, atau tidak dinilai).
4. **Isian manual tetap boleh, tetapi diberi tanda.** Bila Hasil analisa memakai angka OCR atau ketikan yang berbeda dari data live, hasilnya diberi label "Analisa manual — tidak setara pemindai" dan tidak dihitung sebagai bukti.
5. **Satu daftar kode alasan** (`DITAHAN_SESI`, `DITAHAN_JEDA`, dan seterusnya) dipakai di semua jalur dan di catatan keputusan (G2).
6. **Test kembar.** Untuk kumpulan snapshot contoh yang sama, keluaran pemindai dan Hasil analisa wajib identik: status, keputusan, SL, TP, lot, dan kode alasan.

**Urutan langkah kecil:**

| Langkah | Isi | Menyentuh Live? |
| --- | --- | --- |
| A7-1 | Test yang membuktikan perbedaan sekarang (penjaga sesi hilang di Hasil analisa) | Tidak |
| A7-2 | Tambahkan penjaga sesi ke Hasil analisa | Ya, menahan lebih sering (lebih aman) |
| A7-3 | Samakan urutan penahan Hasil analisa dengan pemindai | Kode alasan bisa berubah; keputusan tetap TUNGGU |
| A7-4 | Bentuk snapshot keputusan + pembangun bersama (modul murni) | Tidak |
| A7-5 | Hasil analisa memakai `scanSymbol` lewat snapshot bila datanya dari live/CSV; tanda "manual" bila tidak | Ya, langkah dan test tersendiri |
| A7-6 | Test kembar untuk semua jalur | Tidak |

**Keputusan Fahmi (13 Okt 2026):**

- A7-2 dan A7-3 **TIDAK diizinkan** mengubah Hasil analisa Finex yang terlihat. Walaupun rumus tidak berubah, perubahan dari BELI/JUAL menjadi TUNGGU tetap perubahan hasil, sehingga bertentangan dengan aturan mutlak 1.
- **Boleh sekarang:** A7-1, yaitu test yang hanya membuktikan perbedaan penjaga sesi, tanpa mengubah tampilan atau keputusan.
- **A7-2 dan A7-3 hanya sebagai shadow:** dihitung dan dicatat sebagai "seharusnya TUNGGU" untuk evaluasi, sementara hasil Finex tetap seperti sekarang (A8).
- Untuk menerapkannya pada hasil yang terlihat, aturan mutlak 1 harus lebih dulu diubah atau diberi pengecualian yang disetujui secara eksplisit (draf di A9).

### A8. Rancangan uji shadow untuk A7-2 dan A7-3

**Tujuan:** mengumpulkan bukti berapa kali, dan pada kondisi apa, Hasil analisa Finex berbeda dari pemindai, serta bagaimana hasil trade-nya. Tampilan dan keputusan Finex tidak berubah sedikit pun.

**Cara kerja:**

1. **Fungsi murni terpisah** `hitungShadowHasilAnalisa(hasilTerlihat, konteks)`. Masukannya hasil yang sudah tampil sekarang (`shownResult`) ditambah data sesi dan jam server yang sama. Keluarannya: keputusan terlihat, keputusan shadow (dengan penjaga sesi dan urutan pemindai), apakah berbeda, kode alasan shadow, dan arah asli.
2. **Satu arah saja:** shadow hanya membaca `shownResult`, tidak pernah menulis kembali. `shownResult` tidak dijadikan masukan apa pun yang tampil di layar.
3. **Aman bila gagal:** shadow dibungkus `try/catch`. Bila gagal atau data sesi tidak ada, tidak ada yang dicatat dan tampilan tetap utuh.
4. **Pencatatan lewat server:** App mengirim hasil shadow ke endpoint baru (usulan `POST /api/keputusan/shadow`). Server menulisnya ke `data/keputusan/` dengan `jalur: "hasil-shadow"` (format di G5).
5. **Kapan dicatat:** hanya bila keputusan shadow berbeda dari keputusan terlihat, maksimal sekali per simbol per candle H1. Tidak setiap render.
6. **Tidak ada perubahan layar** di Hasil analisa. Ringkasan hasil shadow nanti dibaca dari laporan terpisah, bukan dari kotak Hasil analisa.
7. **Evaluasi:** catatan shadow dipasangkan dengan trade yang dibuka pada simbol dan jam yang sama (lewat `entries` dan History). Yang dibandingkan: hasil trade saat shadow berkata "seharusnya TUNGGU (sesi)" dibanding trade lainnya. Penilaian dilakukan per golongan dengan n ≥ 20.

**Test pengaman (wajib lolos):**

- Untuk kumpulan masukan contoh, `shownResult` dengan dan tanpa shadow identik: keputusan, SL, TP, lot, alasan, dan peringatan.
- Shadow yang melempar error tidak mengubah `shownResult`.
- Test lama (sampai nomor 686) tetap hijau tanpa perubahan.

**Langkah:**

| Langkah | Isi | Mengubah tampilan? |
| --- | --- | --- |
| A7-1 | Test yang membuktikan penjaga sesi tidak ada di Hasil analisa | Tidak |
| S1 | Fungsi murni `hitungShadowHasilAnalisa` + test pengaman | Tidak |
| S2 | Penulis JSONL keputusan (G5) + endpoint shadow di server | Tidak |
| S3 | App memanggil shadow setelah `shownResult`, tanpa render | Tidak |
| S4 | Laporan shadow (halaman/panel terpisah dari Hasil analisa) | Tidak mengubah Hasil analisa |

**Diputuskan Fahmi (13 Okt 2026):** broker lain (OTB, MIFX, Exness) juga cukup shadow dulu, supaya bukti dan perilakunya seragam.

**Bukti yang sudah ada (temuan audit rancangan):** pencatat entry server sudah menilai sesi saat entry (`tradeEntryLog` mengirim `sessions` ke `scanSymbol`), sehingga entry berstatus `DITAHAN_SESI` sudah tercatat di `entries-<broker>.jsonl`. Data ini dipakai sebagai bukti utama; catatan shadow A8 sebagai pelengkap, karena shadow hanya muncul saat Hasil analisa dibuka.

### A9. Draf perubahan klausul aturan mutlak 1 — BELUM BERLAKU

Bunyi sekarang (`HANDOVER-CLAUDE.md`, bagian 5, butir 1):

> 1. Finex tetap broker default; hasil analisis Finex tidak boleh berubah.

**Draf usulan** (hanya berlaku bila disetujui eksplisit oleh Fahmi dan ditulis ke `HANDOVER-CLAUDE.md` dalam commit tersendiri):

> 1. Finex tetap broker default. Rumus dan hasil analisis Finex tidak boleh berubah, kecuali melalui pengecualian tertulis di bawah ini.
>
> 1a. **Pengecualian Penjaga Sesi.** Hasil analisa Finex boleh berubah dari BELI/JUAL menjadi TUNGGU **hanya** bila penjaga sesi (`sessionGuard.ts`) menyatakan pasar simbol itu sedang tutup atau akan tutup dalam batas yang berlaku (60 menit; saham jelang libur 240 menit), berdasarkan jam sesi resmi dari terminal broker. Syarat:
> - (i) Perubahan hanya ke arah lebih aman: BELI/JUAL → TUNGGU. Tidak pernah TUNGGU → BELI/JUAL.
> - (ii) Rumus `decisionEngine.ts` tidak diubah. SL, TP, dan lot pada sinyal yang tidak ditahan tetap sama persis.
> - (iii) Alasan tampil jelas ("Ditahan: sesi …"), dan arah asli tetap terlihat (`heldDecision`).
> - (iv) Bila data sesi tidak tersedia atau gagal dibaca, hasil tetap seperti sebelum pengecualian ini.
> - (v) Baru diaktifkan setelah uji shadow (A8) mencatat ≥ 20 kasus berbeda per golongan dan hasilnya ditinjau Fahmi.
> - (vi) Bisa dimatikan dengan satu saklar, yang mengembalikan perilaku lama secara persis.
>
> 1b. **Penyelarasan urutan penahan (opsional, disetujui terpisah).** Urutan penahan Hasil analisa boleh disamakan dengan pemindai bila keputusan, SL, TP, dan lot tetap sama persis. Yang boleh berbeda hanya teks dan kode alasan saat dua penahan berlaku bersamaan.
>
> 1c. Pengecualian lain di luar 1a dan 1b membutuhkan persetujuan eksplisit baru.
>
> Disetujui oleh: ______ Tanggal: ______

**Status:** draf. Aturan mutlak 1 yang berlaku tetap bunyi lama sampai baris persetujuan diisi.

### Langkah Fondasi Data

| Langkah | Isi | Menyentuh Live? |
| --- | --- | --- |
| F1 | Selisih jam MIFX dan Exness diatur eksplisit, arsip tick untuk semua broker | Tidak |
| F2 | Gerbang kualitas data (modul murni) + tampilan alasan | Bisa menahan sinyal; diuji dengan test tersendiri |
| F3 | EA menulis login dan jenis akun; server mencocokkan | Bisa menahan sinyal bila tidak cocok |
| F4 | Versi spesifikasi bertanggal | Tidak |
| F5 | Ekspor candle D1, W1, M15 live | Tidak |
| F6 | Cek DST sesudah pergantian jam musim | Tidak |
| F7 | Satu kontrak keputusan untuk semua jalur: A7-1 sekarang; A7-2/A7-3 hanya shadow (A8, langkah S1–S4); penerapan tampilan menunggu A9 | Lihat A7–A9 |

## B. Konteks per golongan (prioritas P1, sesudah A)

Semua data di bagian ini hanya ditampilkan sebagai konteks dan dicatat di kartu pola. Tidak menjadi pemicu sebelum lolos uji (rancangan alur trader, bagian 4). Sebelum mengimplementasikan, sumber resmi dan format datanya diriset dulu di web.

| Golongan | Konteks | Sumber yang diusulkan | Catatan |
| --- | --- | --- | --- |
| Forex JPY | Selisih yield obligasi AS–Jepang; jadwal Fed dan BoJ | Sumber resmi pemerintah/bank sentral | Seri harus sejalan waktunya dengan harga |
| Minyak | Stok minyak mingguan | EIA (laporan mingguan) | Data mingguan, bukan harga intraday |
| Forex, Emas, Minyak | Posisi pelaku pasar | CFTC COT | Berdasarkan posisi hari Selasa dan terbit belakangan; bukan pemicu intraday |

## C. Jalur Demo → Live

### C1. Prinsip

Hasil demo hanya boleh dipakai di Live bila memenuhi tiga syarat:
1. Dicatat dengan aturan yang **setara Live** (penjaga yang sama dengan Live), atau dinilai sebagai fitur uji yang jelas.
2. Dihitung ulang dengan **biaya akun Live broker yang sama**.
3. Lolos **3 lampu hijau**.

### C2. Buku Aturan berversi

- Satu berkas di repo (usulan: `config/buku-aturan.json`, BUKAN di `data/` yang tidak ikut git). Isinya: setiap strategi dan fitur (misalnya `skor`, `topdown`, "jeda tidak mengunci", "masuk lagi simbol sama", "siklus 30 menit") dengan nomor versi, parameter, dan status.
- Kolom tiap aturan: id, versi, nama, jenis (strategi/fitur/penjaga), **peran** (setup/konteks/penahan), golongan yang berlaku, timeframe, sumber data, parameter, status, tanggal aktif, pembuat, **alasan perubahan**, serta ringkasan hasil uji **sebelum dan sesudah** perubahan.
- Status: **UJI_DEMO → PERCOBAAN_LIVE → LIVE**, dan bisa turun ke **DICABUT**.
- Setiap kenaikan atau penurunan status adalah satu commit git, sehingga selalu ada jejak siapa, kapan, dan berdasarkan bukti apa.
- Akun Live hanya menjalankan versi berstatus PERCOBAAN_LIVE atau LIVE. Akun demo menjalankan semuanya.

### C3. Setiap trade dan kartu pola mencatat

- Versi aturan, login akun, jenis akun (dari A1), broker.
- **Setara Live: ya/tidak.** Bila tidak, daftar penjaga atau fitur yang dilonggarkan.
- Biaya nyata saat itu (spread, komisi, swap) dan versi spesifikasi (A4).

### C4. Hitung ulang dengan biaya Live

- Bukti dari demo broker A hanya berlaku untuk Live broker A, karena spread, komisi, dan spesifikasi berbeda antar broker.
- Setiap hasil demo dihitung ulang memakai spread akun Live (dari arsip tick Live, A2) dan komisi akun Live. Yang dinilai adalah hasil sesudah hitung ulang.
- **Bergantung pada A1:** terminal Finex dipakai bergantian untuk akun demo dan Live, sedangkan arsip tick belum mencatat login. Spread "Live" baru bisa dipisahkan setelah A1 (F3) selesai.
- **Fakta saat ini:** hanya Finex yang punya akun Live (91811209). Bukti dari OTB, MIFX, atau Exness demo baru bisa naik ke Live bila akun Live broker itu dibuka.

### C5. Tiga lampu hijau (disetujui Fahmi, 13 Okt 2026)

| Lampu | Syarat (per golongan, per versi aturan) |
| --- | --- |
| 1 — Backtest | Rapor data latih DAN ujian "layak" (untung ≥ 3% di atas titik impas, `MIN_EDGE_OVER_BREAKEVEN`) dan tetap untung di sebagian besar periode uji bergulir. Tambahan (K-8, disetujui Fahmi 13 Okt 2026): rapor dijalankan dengan equity akun Live, dan tidak boleh berstatus MODAL KURANG (pemeriksaan modal yang sudah ada di `backtestReport.ts`) |
| 2 — Demo | ≥ 20 rangkaian setara Live; rata-rata hasil > 0 sesudah dihitung ulang dengan biaya Live; rugi terbesar per rangkaian ≤ 1R; tidak ada pelanggaran gerbang kualitas data |
| 3 — Percobaan Live | 20 rangkaian di akun Live dengan lot minimum; rata-rata hasil tetap > 0 dan tidak lebih buruk dari demo melebihi 0,2R |

Sesudah ketiga lampu hijau, status menjadi LIVE dengan lot normal (risiko 1% dan batas golongan).

Bila hasil Live memburuk, aturan itu otomatis turun kembali ke demo (C7).

### C6. Fitur khusus demo

Fitur yang hanya aktif di demo (misalnya jeda tidak mengunci, masuk lagi simbol sama) diperlakukan sebagai fitur uji dengan versinya sendiri. Penilaiannya membandingkan rangkaian DENGAN fitur dan TANPA fitur pada golongan yang sama. Fitur baru boleh naik ke Live bila hasil dengan fitur tidak lebih buruk, lalu tetap melewati lampu 2 dan 3.

### C7. Turun kembali

Bila 20 rangkaian Live terakhir rata-ratanya ≤ 0, atau rugi beruntun melewati batas, status versi itu kembali ke UJI_DEMO dan ditampilkan jelas di layar. Penjaga yang sudah ada (bukti F5, jeda) tetap berjalan.

### C8. Kartu pola dari demo di Live

Kartu pola demo tetap menjadi bahan bakar analisa di Live, diberi tanda asal "demo". Kartu Live ditambahkan terpisah. Tampilan memisahkan keduanya, dan keputusan yang menahan atau membuka sinyal Live hanya memakai kartu setara Live.

### Langkah Jalur Demo → Live

| Langkah | Isi | Menyentuh Live? |
| --- | --- | --- |
| J1 | Bentuk Buku Aturan berversi + pembaca (modul murni) | Tidak |
| J2 | Tandai setiap entry dan kartu dengan versi aturan, akun, dan "setara Live" | Tidak |
| J3 | Hitung ulang hasil demo dengan biaya Live | Tidak |
| J4 | Papan 3 lampu hijau per golongan dan versi | Tampilan saja |
| J5 | Akun Live hanya menjalankan versi berstatus PERCOBAAN_LIVE/LIVE | Ya, langkah dan test tersendiri |
| J6 | Turun kembali otomatis (tampilan + status) | Ya, langkah dan test tersendiri |

## E. Risiko gabungan dan uji skenario (P1)

Batas 1% berlaku per setup, sedangkan penjaga korelasi dan margin bekerja per posisi. Bagian ini menambah gambaran **per akun**, karena masuk lagi di simbol yang sama kini diizinkan di demo.

- **Panel eksposur gabungan per akun:** total eksposur per mata uang (misalnya total USD naik/turun), per golongan (logam, energi, indeks, saham), eksposur kotor dan bersih, serta margin terpakai.
- **"Rugi gabungan bila semua SL kena"**, dalam USD, Rupiah, dan persen equity.
- **Skenario stres:** spread melebar (misalnya 3× rata-rata), gap melewati SL, atau semua posisi bergerak melawan bersamaan. Angka skenario diambil dari arsip tick dan History, bukan dikarang.
- Hanya pemantauan dan penahan (TUNGGU atau peringatan). Tidak mengubah batas risiko dan tidak membuka atau menutup posisi.

| Langkah | Isi | Menyentuh Live? |
| --- | --- | --- |
| E1 | Hitung eksposur gabungan + rugi bila semua SL kena (modul murni) | Tidak |
| E2 | Panel di layar | Tampilan saja |
| E3 | Skenario stres dari arsip tick/History | Tampilan saja |

## F. Pemantauan perubahan kondisi (P1)

- Dicatat per versi aturan dan per golongan: frekuensi sinyal, tingkat TUNGGU, alasan tahanan terbanyak, biaya rata-rata, dan hasil sesudahnya.
- Dibandingkan dengan patokan versi yang sama (periode awal). Bila berubah besar, versi itu ditandai "perlu ditinjau" dan kenaikan statusnya ke Live (C5) dihentikan sampai diuji ulang.
- Tidak ada penyetelan parameter otomatis.

| Langkah | Isi | Menyentuh Live? |
| --- | --- | --- |
| P-F1 | Ringkasan harian per versi aturan dari catatan keputusan (G2) | Tidak |
| P-F2 | Tanda "perlu ditinjau" + penghentian kenaikan status | Tidak (hanya status di Buku Aturan) |

## G. Struktur penyimpanan: versi aturan dan riwayat keputusan

### G0. Pilihan penyimpanan

- MDBKA sekarang tidak memakai database. Datanya berupa file: CSV dari MT5 dan JSONL append-only dari server (`entries-<broker>.jsonl`, `excursion-<broker>.jsonl`, arsip tick). `tickHistory.ts` sengaja tidak memakai database native agar tidak butuh kompilasi.
- **Usulan:** tetap memakai pola itu.
  - **Aturan** disimpan di repo, ikut git, supaya setiap perubahan punya jejak commit.
  - **Riwayat** (keputusan, rangkaian, kartu) disimpan sebagai JSONL append-only di `data/`.
- Bila nanti volume terlalu besar, JSONL bisa diimpor ke SQLite tanpa mengubah bentuk datanya.
- `data/` tidak ikut git, jadi wajib masuk tombol **Backup sekarang** yang sudah ada.

### G1. Tabel dan lokasinya

| Tabel | Lokasi | Ikut git? | Sifat |
| --- | --- | --- | --- |
| `aturan` (Buku Aturan) | `config/buku-aturan.json` | Ya | Versi baru = baris baru; versi lama tidak dihapus |
| `riwayat_status` | `config/riwayat-status.jsonl` | Ya | Append-only |
| `keputusan` | `data/keputusan/keputusan-<broker>-<YYYY-MM>.jsonl` | Tidak (backup) | Append-only |
| `penjaga_hasil` | Di dalam setiap baris `keputusan` | Tidak | Bagian dari keputusan |
| `rangkaian` | `data/rangkaian/rangkaian-<broker>.jsonl` | Tidak (backup) | Append-only; perubahan = baris baru |
| `kartu_pola` | `data/kartu/kartu-pola-<broker>.jsonl` | Tidak (backup) | Append-only, tidak pernah digabung |
| Sudah ada: `entries`, `excursion`, History MT5, arsip tick | Tetap di tempatnya | Tidak | Dihubungkan lewat tiket/PositionId |

### G2. Kolom utama

**`aturan`** — satu baris per versi.

| Kolom | Contoh / isi |
| --- | --- |
| `id`, `versi` | `topdown`, `1.0.0` |
| `nama`, `jenis`, `peran` | "Top-down H4/H1", strategi, setup |
| `golongan`, `timeframe`, `sumberData` | `["LOGAM"]`, `{setup:"H4", pemicu:"H1", arah:"D1"}`, daftar file |
| `parameter` | `{rrMin:2, slMinAtr:0.5, slMaksAtr:3, zonaAtr:0.25}` |
| `status` | `UJI_DEMO` / `PERCOBAAN_LIVE` / `LIVE` / `DICABUT` |
| `aktifSejak`, `dibuatOleh`, `alasanPerubahan` | tanggal, nama, teks |
| `ujiSebelum`, `ujiSesudah` | Ringkasan rapor (n, rata-rata R, rugi terbesar, drawdown) |
| `versiSebelumnya` | `0.9.0` atau null |

**`riwayat_status`** — satu baris per kenaikan atau penurunan status: `waktuUtc`, `aturanId`, `versi`, `dari`, `ke`, `alasan`, `buktiLampu` (ringkasan lampu 1–3), `commit` (hash git).

**`keputusan`** — satu baris per penilaian yang dicatat.

| Kelompok | Kolom |
| --- | --- |
| Identitas | `keputusanId` (UUID), `waktuUtc`, `waktuServer`, `waktuDiterima`, `jalur` (pemindai / hasil / entry / backtest) |
| Akun | `broker`, `login`, `jenisAkun` (demo / live / tidak-terbukti), `setaraLive` |
| Simbol | `simbol`, `golongan`, `versiSpesifikasi` |
| Aturan | `aturanId`, `versi` |
| Masukan | `sidikJariSnapshot` (hash SHA-256 dari isi snapshot), `bid`, `ask`, `umurKuotasiDetik`, `candleTerakhir`, `jumlahCandle`, nilai indikator (MA50, RSI, CCI, MACD, ATR), `kurs` dan tanggalnya, `equity` |
| Kualitas data | Daftar hasil gerbang A3 (nama pemeriksaan, lulus/gagal, alasan) |
| Penjaga | Daftar semua penjaga: `nama`, `hasil` (LULUS / GAGAL / TIDAK_DINILAI), `kodeAlasan`, `sumberData`, `umurData` |
| Hasil | `status`, `keputusan`, `arahAsli`, `entry`, `sl`, `tp`, `lot`, `risikoUsd`, `risikoRp`, `porsiBiaya`, `kodeAlasanUtama` |
| Manual | `sumber` (live / csv / ocr / manual) dan daftar angka yang diubah tangan |

Agar file tidak membengkak, pemindai hanya mencatat saat **status simbol berubah**, ditambah setiap status LOLOS, setiap entry, dan setiap penilaian Hasil analisa yang diminta pengguna.

**`rangkaian`**: `rangkaianId`, `broker`, `login`, `simbol`, `mulaiUtc`, `selesaiUtc`, `keputusanAwalId`, daftar `tiket` posisi, daftar `siklus` (waktu, saran Tim 2, alasan, tindakan Fahmi bila tercatat), `hasilR`, `hasilUsd`, `hasilRp`, `kategori`, `labelKartu`.

**`kartu_pola`**: `nomor` (urut per label, misalnya "Kasbi Bakar #0001"), `rangkaianId`, `label`, `sidikJari` (golongan, arah, arah D1, posisi terhadap MA50, rentang skor, pola, sesi, kondisi ATR), catatan Tim 3 sampai Tim 7, `setaraLive`, `asal` (demo/live), `aturanId`/`versi`, `versiSpesifikasi`, `dataTidakLengkap`, `waktuUtc`.

### G3. Hubungan antar tabel

- Satu versi `aturan` → banyak `keputusan`.
- Satu `keputusan` (jalur entry) → satu posisi (lewat `tiket` di `entries`).
- Satu `rangkaian` → beberapa posisi (open 1, open 2, …).
- Satu `rangkaian` yang sudah selesai → tepat satu `kartu_pola`.
- Posisi → History MT5 lewat `PositionId = tiket` (sama seperti sekarang).

### G4. Aturan integritas

- Tidak ada baris yang diubah atau dihapus. Koreksi ditulis sebagai baris baru dengan kolom `mengoreksi: <id lama>`.
- `sidikJariSnapshot` memastikan putar ulang memakai masukan yang persis sama.
- Retensi: `keputusan` non-LOLOS disimpan 120 hari, sama dengan arsip tick. `keputusan` LOLOS/entry, `rangkaian`, dan `kartu_pola` disimpan selamanya.
- Baris yang rusak dilewati saat dibaca, tidak membuat aplikasi berhenti (pola yang sama dengan `readTradeEntries`).

### G5. Spesifikasi teknis format JSONL

**Aturan berkas:**

| Hal | Ketentuan |
| --- | --- |
| Encoding | UTF-8 tanpa BOM; akhir baris LF (`\n`) |
| Satu baris | Tepat satu objek JSON lengkap, tanpa baris kosong di tengah |
| Penulisan | Hanya oleh proses server (satu penulis). Satu baris ditulis dalam satu panggilan `appendFileSync(baris + "\n")`. UI tidak menulis langsung; UI mengirim ke endpoint server |
| Rotasi | `keputusan`: satu berkas per broker per bulan (`keputusan-<broker>-<YYYY-MM>.jsonl`). `rangkaian` dan `kartu_pola`: satu berkas per broker |
| Pembacaan | Baris yang tidak bisa diurai dilewati dan dihitung sebagai "baris rusak" (tampil di layar), tidak menghentikan aplikasi |
| Perubahan | Tidak ada baris yang diubah atau dihapus. Koreksi = baris baru dengan `mengoreksi: "<id lama>"` |
| Versi format | Setiap baris punya `skema` (misalnya `"keputusan/1"`). Kolom baru boleh ditambah tanpa menaikkan versi; mengganti arti atau tipe kolom wajib menaikkan versi |

**Tipe nilai:**

| Jenis | Format |
| --- | --- |
| ID | `keputusanId`, `rangkaianId`: UUID v4 huruf kecil. `nomor` kartu: `"<Label> #NNNN"`, urut per label per broker, tidak pernah dipakai ulang |
| Waktu UTC | ISO 8601 dengan `Z`, presisi detik: `"2026-10-12T00:27:27Z"` |
| Waktu server | Teks asli MT5 apa adanya: `"2026.10.12 02:27:27"` |
| Harga | Angka JSON (bukan teks), sesuai digit simbol |
| USD | Angka, 2 desimal |
| Rupiah | Bilangan bulat |
| R | Angka, 2 desimal |
| Tidak diketahui | `null` (bukan 0, bukan teks kosong). Tidak ada angka karangan |
| Enum | Huruf besar: `"LULUS"`, `"GAGAL"`, `"TIDAK_DINILAI"`, `"DITAHAN_SESI"`, `"KASBI_BAKAR"`, … |

**Sidik jari snapshot (`sidikJariSnapshot`):** SHA-256 heksadesimal dari JSON kanonik isi snapshot. JSON kanonik = kunci diurutkan abjad, tanpa spasi, angka apa adanya. Dua snapshot dengan isi yang sama selalu menghasilkan sidik jari yang sama.

**Contoh baris `keputusan`** (kerangka; angka harga dan lot dari trade nyata AUDJPY akun Finex DEMO 61823011, 12 Okt 2026; nilai yang tidak diketahui ditulis `null`):

```json
{"skema":"keputusan/1","keputusanId":"<uuid>","jalur":"entry","waktuUtc":null,"waktuServer":"2026.10.12 02:27:27","waktuDiterima":null,"broker":"finex","login":"61823011","jenisAkun":"demo","setaraLive":null,"simbol":"AUDJPY","golongan":"FOREX_JPY","versiSpesifikasi":null,"aturanId":"skor","versi":"1","sidikJariSnapshot":null,"masukan":{"bid":null,"ask":null,"umurKuotasiDetik":null,"candleTerakhir":null,"jumlahCandle":null,"ma50":null,"rsi":null,"cci":null,"macd":null,"atr":null,"kursUsdIdr":null,"tanggalKurs":null,"equity":null},"kualitasData":[],"penjaga":[{"nama":"sesi","hasil":"TIDAK_DINILAI","kodeAlasan":null,"sumberData":null,"umurDataDetik":null}],"hasil":{"status":null,"keputusan":"BELI","arahAsli":"BELI","entry":110.528,"sl":110.379,"tp":110.759,"lot":0.01,"risikoUsd":null,"risikoRp":null,"porsiBiaya":null,"kodeAlasanUtama":null},"sumber":"live","diubahManual":[],"mengoreksi":null}
```

**Contoh baris `kartu_pola`** (trade yang sama; ditutup di SL pukul 19:42:24 jam server, hasil −$0,94 ≈ −Rp16.808 dengan kurs ECB 9 Okt Rp17.880,55):

```json
{"skema":"kartu_pola/1","nomor":"Pupare Rebus #0001","label":"PUPARE_REBUS","rangkaianId":"<uuid>","broker":"finex","asal":"demo","setaraLive":null,"aturanId":"skor","versi":"1","versiSpesifikasi":null,"waktuUtc":null,"sidikJari":{"golongan":"FOREX_JPY","arah":"BELI","arahD1":null,"posisiMa50":null,"rentangSkor":null,"pola":null,"sesi":null,"kondisiAtr":null},"hasil":{"r":-1.0,"usd":-0.94,"rp":-16808,"kategori":"RUGI_PENUH"},"catatanTim":{"tim3":null,"tim4":{"rrRencana":1.55,"catatan":"RR di bawah batas 2"},"tim5":null,"tim6":null,"tim6b":null,"tim7":{"komisiUsd":-0.01}},"dataTidakLengkap":true,"mengoreksi":null}
```

Catatan contoh: `r: -1.0` karena posisi ditutup tepat di SL (komisi belum dihitung ke R). `dataTidakLengkap: true` karena trade ini dibuka sebelum pencatat tim ada.

### Langkah penyimpanan

| Langkah | Isi | Menyentuh Live? |
| --- | --- | --- |
| G-1 | Tipe TypeScript untuk `aturan` dan `keputusan` + pembaca/penulis JSONL (modul murni + test) | Tidak |
| G-2 | `config/buku-aturan.json` awal berisi strategi yang sudah ada (`skor`, `candle`, `scalping`, `abc`) sebagai versi 1 | Tidak |
| G-3 | Pemindai mencatat `keputusan` saat status berubah | Tidak |
| G-4 | Hasil analisa dan pencatat entry mencatat `keputusan` | Tidak |
| G-5 | `rangkaian` dan `kartu_pola` (bersama K1–K2 di rancangan alur trader) | Tidak |
| G-6 | Folder baru masuk ke Backup sekarang | Tidak |

## D. Pekerjaan tertunda — MDBKA belum selesai selama ini belum diimplementasikan

Penetapan Fahmi, 13 Okt 2026: item di bawah wajib tercatat sebagai pekerjaan yang masih tertunda. Selama belum diimplementasikan, MDBKA dianggap belum selesai.

| # | Item | Alasan ditunda | Syarat untuk mulai | Status |
| --- | --- | --- | --- | --- |
| D1 | Catatan order lengkap: permintaan, penolakan, requote, latency | MDBKA tidak mengirim order sendiri | Sebagian bisa lewat EA `OnTradeTransaction` yang mencatat order manual di MT5 (permintaan, hasil, kode penolakan); latency penuh hanya bila suatu saat ada pengiriman order otomatis | TERTUNDA |
| D2 | NBBO, VWAP dari transaksi bursa, order book, imbalance lelang, opsi, ETF flow, breadth konstituen, EDGAR | Data berbayar atau berlisensi, bukan data broker CFD | Ada akun/feed resmi yang menyediakannya dan anggaran data | TERTUNDA |
| D3 | Basis spot–futures emas, kurva futures minyak, selisih Brent–WTI | Butuh data futures CME/ICE | Sumber data futures resmi + pemetaan simbol broker ke kontrak futures | TERTUNDA (tahap paling akhir) |
| D4 | Fase lelang IDX | MDBKA belum trading indeks/saham IDX | MDBKA mulai mendukung instrumen IDX | TERTUNDA |
| D5 | Tim tab **News** MT5 | MQL5 tidak menyediakan cara membaca isi tab News | Ada API/ekspor resmi dari terminal atau broker; sementara diganti Calendar + lonjakan ATR/gap | TERTUNDA |
| D6 | Tim tab **Mailbox** MT5 | Tidak ada cara membaca Mailbox dari program | Ada API/ekspor resmi | TERTUNDA |
| D7 | Tim tab **Articles** MT5 | Isi artikel bukan data terminal yang bisa dibaca EA | Ada API/ekspor resmi | TERTUNDA |
| D8 | Tim tab **Alerts** untuk alert yang dipasang manual di terminal | Alert manual di terminal tidak bisa dibaca MQL5 | Ada API/ekspor resmi; sementara tim Alerts mencatat peringatan buatan MDBKA sendiri | TERTUNDA (sebagian) |

Item lain yang belum dikerjakan dilacak di tabel langkah masing-masing rancangan (P0–P7, P5a, T1–T4, K1–K6, F1–F7, A7-1–A7-6, S1–S4, J1–J6, E1–E3, P-F1–P-F2, G-1–G-6), dengan urutan induk di `docs/AUDIT-RANCANGAN-2026-10-13.md`. Langkah tim per akun, tab, dan indikator (TA, TT, TI) ada di `docs/RANCANGAN-2026-10-13-tim-akun-tab-indikator.md`.
