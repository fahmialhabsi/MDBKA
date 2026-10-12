# Rancangan — Fondasi Data dan Jalur Demo → Live

13 Okt 2026 · Fahmi Alhabsi

> **Status:** DRAF DISKUSI. Belum ada kode yang diubah.
> **Terkait:** `docs/AUDIT-2026-10-13-analisa-dan-pembatasan-risiko.md` dan `docs/RANCANGAN-2026-10-13-alur-trader-profesional.md`.
> **Sifat:** sistem berbasis aturan, tanpa AI. TUNGGU adalah default. MDBKA tidak pernah mengirim order; semua order tetap manual di MT5.

## 0. Ringkasan

- **A. Fondasi Data** dikerjakan lebih dulu, sebelum Tim 2 dan kartu pola. Keduanya bergantung pada data yang benar: akun mana, jam berapa, dan apakah datanya lengkap.
- **B. Konteks per golongan** menyusul sesudah A: yield AS–Jepang, stok minyak EIA, laporan COT. Hanya sebagai konteks, bukan pemicu.
- **C. Jalur Demo → Live**: aturan yang terbukti di demo naik ke Live lewat 3 lampu hijau. Hasil demo hanya sah untuk Live bila dicatat "setara Live" dan dihitung ulang dengan biaya akun Live.
- **D. Pekerjaan tertunda**: daftar yang belum diimplementasikan. **Selama bagian D belum selesai, MDBKA dianggap belum selesai** (penetapan Fahmi, 13 Okt 2026).

## A. Fondasi Data (prioritas P0)

### A1. Identitas akun di semua data terminal

- **Fakta:** `positions.csv`, `equity.csv`, dan `quotes.csv` tidak memuat login atau jenis akun (audit, temuan 1).
- **Usulan:** EA menulis `ACCOUNT_LOGIN` dan `ACCOUNT_TRADE_MODE` (demo/kontes/riil) di setiap baris atau di header file. Server mencocokkannya dengan `ACCOUNT_LABELS`. Bila login di file berbeda dengan label, tampil peringatan dan semua sinyal broker itu TUNGGU.
- **Akun yang tidak terbukti demo:** rekomendasi eksternal dan saran Claude sama-sama memperlakukannya sebagai Live. Pilihan Fahmi di audit ("akun tanpa label = demo") masih berlaku sampai Fahmi memutuskan ulang.
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

Batas angka (umur kuotasi, umur spesifikasi) masih usulan dan ditetapkan per golongan saat dikerjakan.

### A4. Versi spesifikasi bertanggal

Setiap perubahan isi `MDBKA_Specs_<login>.csv` (kontrak, tick, lot, komisi) disimpan sebagai versi baru dengan tanggal berlaku. Trade dan kartu pola mencatat versi yang berlaku saat itu, supaya hasil lama tidak dihitung ulang dengan spesifikasi baru.

### A5. Pergantian jam musim (DST)

Banyak server MT5 menggeser jam pada akhir Oktober/awal November. Sesudah pergantian, selisih jam tiap broker dicek ulang dengan cara yang sama seperti verifikasi OTB (commit `6fec2ae`): selisih jam diterima dikurangi jam UTC tick baru harus sekitar ±1 detik.

### A6. Candle D1, W1, dan M15 live

Sama dengan rancangan alur trader, bagian 3.1 dan langkah T3. Dibutuhkan untuk arah D1, siklus 30 menit Tim 2, dan pembaca pola.

### Langkah Fondasi Data

| Langkah | Isi | Menyentuh Live? |
| --- | --- | --- |
| F1 | Selisih jam MIFX dan Exness diatur eksplisit, arsip tick untuk semua broker | Tidak |
| F2 | Gerbang kualitas data (modul murni) + tampilan alasan | Bisa menahan sinyal; diuji dengan test tersendiri |
| F3 | EA menulis login dan jenis akun; server mencocokkan | Bisa menahan sinyal bila tidak cocok |
| F4 | Versi spesifikasi bertanggal | Tidak |
| F5 | Ekspor candle D1, W1, M15 live | Tidak |
| F6 | Cek DST sesudah pergantian jam musim | Tidak |

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
- **Fakta saat ini:** hanya Finex yang punya akun Live (91811209). Bukti dari OTB, MIFX, atau Exness demo baru bisa naik ke Live bila akun Live broker itu dibuka.

### C5. Tiga lampu hijau (usulan Claude, menunggu persetujuan Fahmi)

| Lampu | Syarat (per golongan, per versi aturan) |
| --- | --- |
| 1 — Backtest | Rapor data latih DAN ujian "layak" (untung ≥ 3% di atas titik impas, `MIN_EDGE_OVER_BREAKEVEN`) dan tetap untung di sebagian besar periode uji bergulir |
| 2 — Demo | ≥ 20 rangkaian setara Live; rata-rata hasil > 0 sesudah dihitung ulang dengan biaya Live; rugi terbesar per rangkaian ≤ 1R; tidak ada pelanggaran gerbang kualitas data |
| 3 — Percobaan Live | 20 rangkaian di akun Live dengan lot minimum; rata-rata hasil tetap > 0 dan tidak lebih buruk dari demo melebihi 0,2R |

Sesudah ketiga lampu hijau, status menjadi LIVE dengan lot normal (risiko 1% dan batas golongan).

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

## D. Pekerjaan tertunda — MDBKA belum selesai selama ini belum diimplementasikan

Penetapan Fahmi, 13 Okt 2026: item di bawah wajib tercatat sebagai pekerjaan yang masih tertunda. Selama belum diimplementasikan, MDBKA dianggap belum selesai.

| # | Item | Alasan ditunda | Syarat untuk mulai | Status |
| --- | --- | --- | --- | --- |
| D1 | Catatan order lengkap: permintaan, penolakan, requote, latency | MDBKA tidak mengirim order sendiri | Sebagian bisa lewat EA `OnTradeTransaction` yang mencatat order manual di MT5 (permintaan, hasil, kode penolakan); latency penuh hanya bila suatu saat ada pengiriman order otomatis | TERTUNDA |
| D2 | NBBO, VWAP dari transaksi bursa, order book, imbalance lelang, opsi, ETF flow, breadth konstituen, EDGAR | Data berbayar atau berlisensi, bukan data broker CFD | Ada akun/feed resmi yang menyediakannya dan anggaran data | TERTUNDA |
| D3 | Basis spot–futures emas, kurva futures minyak, selisih Brent–WTI | Butuh data futures CME/ICE | Sumber data futures resmi + pemetaan simbol broker ke kontrak futures | TERTUNDA (tahap paling akhir) |
| D4 | Fase lelang IDX | MDBKA belum trading indeks/saham IDX | MDBKA mulai mendukung instrumen IDX | TERTUNDA |

Item lain yang belum dikerjakan dilacak di tabel langkah masing-masing rancangan (P0–P7, T1–T4, K1–K6, F1–F6, J1–J6).
