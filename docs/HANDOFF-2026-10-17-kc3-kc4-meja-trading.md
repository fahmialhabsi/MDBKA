# HANDOFF MDBKA — KC-3 multi-bahan, KC-4 Pengawas Demo, Backup Otomatis, Meja Trading (17 Okt 2026)

Dokumen serah-terima untuk melanjutkan pekerjaan MDBKA di sesi/chat baru.

- **Commit terakhir:** `e4f8c86` (17 Okt 2026 09:52, "feat(meja): halaman Meja Trading…"), sudah **di-push** ke `origin/main`.
- **Test terakhir:** **810 lolos, 0 gagal** (`npm run test`). `npm run lint` bersih. `npm run build` dan `npm run build:backend` sukses
  (warning ukuran chunk > 500 kB lama, belum perlu ditindak).
- **Nomor test berikutnya:** **815** (terakhir dipakai: 814).

> **MULAI DI SINI (sesi berikutnya)**
> 1. Baca bagian 0 (aturan kerja) dan bagian 3 (jebakan teknis) sebelum menyentuh kode.
> 2. Pasar forex tutup akhir pekan; posisi demo **GBPJPY** dan **CHFJPY** masih terbuka (bagian 4).
> 3. Tugas yang menunggu, urut prioritas, ada di bagian 6. Yang paling dekat: saat pasar buka Senin, uji tombol
>    **[Entry]** di halaman **Meja Trading** pada sinyal Lolos sungguhan, dan cek rekap KC-4 setelah GBPJPY tertutup.
> 4. Semua bukti trading saat ini **negatif** (bagian 2.7). Jangan menjanjikan profit; pekerjaan strategi berikutnya
>    menunggu arahan Fahmi.

---

## 0. ATURAN KERJA (WAJIB)

1. **Bahasa Indonesia** untuk semua jawaban ke Fahmi; ringkas, langsung ke hasil.
2. **MDBKA tidak pernah mengirim order.** Semua eksekusi manual oleh Fahmi di MT5. Fitur salin hanya menyalin angka.
3. **Jangan menebak angka.** Ambang/parameter baru harus berasal dari Fahmi, dokumen riset yang dibekukan, atau
   kode yang sudah ada. Angka tak diketahui = `null`, bukan karangan. Bila terpaksa memilih angka (mis. jadwal
   backup 6 jam), sebutkan terang-terangan bahwa itu pilihan dan bisa diubah.
4. **Pakai ulang logika yang sudah tervalidasi** (contoh sesi ini: lampu 2 memakai `lampRows()`, profit di TP memakai
   rumus biaya `decisionEngine.ts`, Meja Trading memakai pemindai yang sama dengan dashboard).
5. **`decisionEngine.ts` tidak diubah** tanpa persetujuan eksplisit Fahmi.
6. **Commit dan push hanya bila Fahmi meminta** ("Komit …", "Push ke remote"). Pesan commit Bahasa Indonesia,
   gaya `feat(scope): …` / `fix(scope): …`, diakhiri baris `Co-Authored-By` sesuai model.
7. **Verifikasi dengan data real**, bukan hanya test: jalankan endpoint/halaman di browser, bandingkan angka dengan
   hitungan manual. Sebutkan dengan jujur apa yang belum bisa diverifikasi.
8. **Sebelum perubahan berisiko** (hapus file/proses, ubah data), cek dulu kepemilikan dan minta izin bila bukan
   milik sesi sendiri.

---

## 1. Komit sesi ini (urut waktu, semua sudah di-push)

| Commit | Waktu (WIT) | Isi |
|---|---|---|
| `4d4b72a` | 16 Okt 20:02 | Remediasi audit KC-1..KC-4: idempotensi KC-3, hard-gate data KC-4 (≥365 hari), kontrak jabatan |
| `8927473` | 17 Okt 00:02 | KC-3 dipecah jadi **multi-bahan** (Badai, M-1, P-1, F-1); 2 bug performa diperbaiki; gerbang kualitas data cek **`harga_live`** (quotes.csv) terpisah dari equity.csv; **strip status kesehatan EA** di header dashboard |
| `8da27a6` | 17 Okt 00:55 | **F-1 Pencari Fakta jalan di `worker_threads`** (sebelumnya membekukan seluruh backend >4,5 menit) |
| `698d554` | 17 Okt 01:44 | **Profit bersih di TP (Rupiah)** per sinyal di pemindai + filter rentang **Rp5.000–Rp50.000** |
| `7e4fa77` | 17 Okt 02:06 | **KC-4 Pengawas Demo (lampu 2)**: rekap trade akun demo → map `RANGKAIAN_DEMO`, Formulir R hanya bila lampu 2 punya vonis |
| `f217037` | 17 Okt 08:34 | **Backup otomatis** terjadwal; kotak pengingat backup **dihapus dari dashboard** |
| `e4f8c86` | 17 Okt 09:52 | **Halaman Meja Trading** + tombol salin **[Entry]** + rincian pip/Rp SL/TP posisi terbuka; logika pemindai dipindah ke hook bersama |

---

## 2. Status per bagian

### 2.1 KC-3 Sekolah Merangkak — 4 bahan aktif
Registry: `src/lib/kc3BahanRegistry.ts` (`DAFTAR_BAHAN`). Penjalan: `server/services/kc3Runner.ts` (`runKc3` kini **async**).

| Bahan | TF | File logika | Hasil LATIH (Finex, data 763 hari) | Status |
|---|---|---|---|---|
| Badai (arah) | M15 | `kc3Penambang.ts` | n=94, rata-rata R −0,14 | GAGAL (tidak muncul di 14/16 bulan) — Jalan C |
| M-1 Mancing | H1 | `kc3BahanMancing.ts` | n=2.074, rata-rata R −0,18, menang 35,3% (impas 40%) | GAGAL — Jalan B |
| P-1 Petani Kebun | H1 | `kc3BahanPetani.ts` | n≈3.035, rata-rata R −0,07 | GAGAL — Jalan C |
| F-1 Pencari Fakta | H1 | `kc3BahanFakta.ts` | n=0 (tidak ada sinyal yang lolos saksi 1+2) | DIPROSES (Formulir R "belum bisa ditambang" menunggu keputusan Pusat) |

- Infrastruktur bersama: `kc3BahanShared.ts` (`NY_FORMATTER` di-cache level modul — dulu dibuat ulang per panggilan, jadi titik lambat nyata).
- `runKc3` membaca candle **sekali per timeframe** lalu dipakai ulang lintas bahan (dulu tiap bahan H1 membaca ulang 81 file).
- **F-1 di worker thread:** flag `beratDiThreadTerpisah: true` di registry. Dispatch `server/services/kc3WorkerRunner.ts`
  (`jalankanTambang`). Worker: `server/workers/kc3BahanWorker.ts`; **bootstrap dev** `server/workers/kc3BahanWorkerEntry.mjs`
  (lihat jebakan 3.2). Run penuh KC-3 ≈ **9,5 menit**; backend tetap responsif (~150 cek `/health` < 1 detik).
- Endpoint: `POST /api/cabang/KC-3/jalankan`, `GET /api/cabang/KC-3/bahan` (status tiap bahan untuk panel).
- **Belum ada pola yang LOLOS** → KC-4 (ujian K1–K7) belum punya bahan untuk diuji.

### 2.2 KC-4 Ruang Ujian
- Kepala Ruang Ujian + Penguji Data Lama (lampu 1) dan Auditor Trade: AKTIF (sebelum sesi ini). `runKc4` kini **async**;
  ujian & latih F-1 jalan paralel di dua worker.
- **Pengawas Demo (lampu 2) — BARU, AKTIF:**
  - Logika murni `src/lib/kc4PengawasDemo.ts` (`susunRangkaianDemo`, `formulirLampu2`); status lampu dari
    `lampRows()` (`greenLamps.ts`, syarat K-10: ≥20 rangkaian demo **setara Live**, rata-rata R>0, terburuk ≥−1,1R,
    tanpa entry saat data ditahan). Tidak ada ambang baru.
  - Penjalan `server/services/kc4DemoRunner.ts` (`runKc4Demo`, inti testable `simpanPengawasDemo`).
  - Endpoint `POST /api/cabang/KC-4/demo/jalankan`; panel `src/components/branch/Kc4DemoPanel.tsx` (tombol
    **"Rekap hasil demo"** di halaman KC-4) — tidak otomatis.
  - Map baru `RANGKAIAN_DEMO` (milik KC-4) + petugas `kc4-pengawas-demo` di `branchArchitecture.ts`.
  - Formulir R hanya untuk lampu 2 **HIJAU/MERAH**; bukti identik tidak dikirim dua kali.
  - Hasil real terakhir: **29 trade demo Finex** (TP 5, SL 15, manual 9, rata-rata R −0,06), hanya **2 setara Live**;
    semua golongan **BELUM** (Forex 1/20, Forex JPY 1/20, lainnya 0/20); 54 trade akun bukan-demo dikecualikan.
- Pengawas Live Minimum (lampu 3): **belum dibangun**.
- `evaluationRoutes.ts` dipecah: `makeCandlesOf` + `cardsForAccount` (dipakai ulang Pengawas Demo; perilaku sama).

### 2.3 Strip status kesehatan EA + gerbang `harga_live`
- `src/lib/dataQualityGate.ts`: check baru `harga_live` (quotes.csv) terpisah dari `ekspor_ea` (equity.csv), ambang sama
  (`MAX_EXPORT_AGE_SEC`). Latar: insiden EA MDBKAMultiLive lepas ±4 jam sementara equity tetap jalan.
- `GET /api/data-quality/semua` (`server/index.ts`); hook `src/hooks/useDataQualitySemua.ts`;
  komponen `src/components/dashboard/StatusKesehatanStrip.tsx` (pil Finex/OTB/MIFX/Exness di header; null = tidak
  terjangkau, tidak pernah pura-pura sehat).

### 2.4 Profit di TP (Rupiah)
- `src/lib/profitTarget.ts`: `profitAtTp()` (rumus biaya sama dengan mesin: (spread+slippage)×pointValue+komisi),
  `profitRangeOf()`, rentang **Rp5.000–Rp50.000** (ditetapkan Fahmi).
- `ScanPlan.profitAtTpUsd` (opsional) dihitung di `symbolScanner.ts`; kolom "Profit di TP" + checkbox filter di pemindai;
  baris profit di halaman detail sinyal.

### 2.5 Backup otomatis
- `server/services/backupJob.ts`: `runBackupOnce` + `startBackupSchedule` (dipasang di `server/index.ts`).
  Pertama **10 menit** setelah start, lalu tiap **6 jam**; jalan hanya bila data berubah dan backup terakhir ≥6 jam;
  **ditunda** bila ruang tujuan < kebutuhan + cadangan **2 GiB**. Angka 6 jam & 2 GiB = pilihan Claude, bisa diubah
  (`BACKUP_INTERVAL_MS`, `BACKUP_RESERVE_BYTES`).
- `dataBackup.ts`: kunci bersama `backupSedangJalan()`, `freeBytesAt()`, `estimateBackupBytes()` (file tick yang sudah
  ada di tujuan hanya dihitung selisihnya).
- Kotak pengingat (`BackupBanner.tsx`) **dihapus**; kegagalan/penundaan hanya tampil di **log backend**.
  Endpoint manual `POST /api/backup/run` tetap ada.
- Tujuan: `C:\Users\MyBook PRO K7V\Documents\MDBKA-Backup`. **Drive C: hanya tersisa ±4,9 GB (99% penuh).**
  Snapshot lama (±230 × ±6 MB) **tidak dihapus otomatis**.

### 2.6 Meja Trading (halaman baru)
- URL `/?halaman=meja&broker=…` (`src/lib/mejaTradingView.ts`, routing di `src/main.tsx`); tombol **"Meja Trading"**
  di header dashboard di samping "Kantor Cabang".
- Komponen: `src/components/meja/MejaTradingPage.tsx`, `MiniCandleChart.tsx` (SVG candle H1 + garis Entry/SL/TP).
- **Pemindai bersama:** logika dipindah apa adanya dari `SymbolScannerPanel.tsx` ke `src/hooks/useSymbolScan.ts`;
  dashboard dan Meja Trading memakai hitungan yang sama.
- **Tombol [Entry]** (`ScanCopyButtons.tsx`, juga di tabel pemindai dashboard): memulai kunci 10 detik yang **sama**
  dengan [SL] (`copyGuard.ts`: `CopyLock.entryCopied/slCopied`, `startCopyLock(…, "ENTRY")`); SL & TP diambil dari
  rencana terkunci itu; alur lama (SL dulu) tetap. Entry disalin **apa adanya** (harga pasar saat dihitung —
  keputusan Fahmi). Buy Stop harus di atas Ask, Sell Limit di atas Bid; MT5 bisa menolak bila terlalu dekat.
- Kartu order menampilkan tipe order MT5 (BELI → **Buy Stop**, JUAL → **Sell Limit**), lot, jarak pip SL/TP,
  profit di TP, risiko lot minimum.
- **Panel posisi:** `AutoPositionsSection` yang sudah ada + **total profit mengambang** + per posisi tabel SL/TP
  (harga, jarak dari entry, Rp bila kena) di `HoldingsDashboard.tsx` (`holding-levels-*`).
- **Pip/poin:** `src/lib/pipDistance.ts` — 1 pip Forex = **10 tick**; simbol lain dalam **poin** (1 tick) (penetapan Fahmi).
- Diverifikasi dengan data real (81 simbol, total +Rp67.075 = GBPJPY −Rp5.590 + CHFJPY +Rp72.665,
  GBPJPY SL 76,3 pip/−Rp87.090, TP 114,5 pip/+Rp130.725). **Tombol [Entry] belum dicoba pada sinyal live** (pasar tutup, 0 sinyal).

### 2.7 Bukti trading (jujur: negatif)
- Penjaga bukti F5 menahan semua sinyal "Lolos" di mode Live: **"terbukti rugi" (win rate 47,8%, n=23)**.
- Semua bahan KC-3 negatif di LATIH; lampu 2 semua golongan BELUM.
- Riset MQL5 (sesi ini, via browser — tool web search error): artikel *Meta-Labeling the Classics Part 2 (ADX)*
  (`mql5.com/en/articles/22754`) — hasil out-of-sample ketiga varian **tetap negatif** (−0,9 / −1,2 / −0,4 pip per trade).
  Karena itu bahan "W-1 Wilder DI + ADXR" **tidak** dibangun (juga karena tiap bahan baru menaikkan ambang
  "makin banyak dicoba, makin ketat" bagi bahan lain). Artikel *Three MACD Filters* hanya dibaca pengantarnya.

---

## 3. Jebakan teknis (pelajaran nyata sesi ini)

### 3.1 Jangan ada dua backend
`npm run dev` (Fahmi) + backend lain yang dijalankan Claude pernah hidup bersamaan → backend kedua tidak bisa memegang
port 3000 tapi **tetap menjalankan pencatat** → entry GBPJPY tercatat **dua kali**, arsip tick kemungkinan dobel.
Cek: `netstat -ano | grep ":3000 .*LISTENING"` dan daftar proses node
(`Get-CimInstance Win32_Process -Filter "Name='node.exe'"` + `CommandLine`). Harus hanya **satu** rantai
`tsx watch server/index.ts` dan **satu** `vite`. Server saat ini dijalankan dari sesi Claude; bila mati, jalankan
**satu** `npm run dev` saja.

### 3.2 tsx (ESM) vs tsc (CommonJS)
- `package.json` `"type": "module"`; dev via `tsx watch` (ESM). `tsconfig.server.json`/`tsconfig.test.json` mengompilasi
  ke **CommonJS** → sintaks `import.meta` **ditolak tsc (TS1343)**.
- Di bawah tsx, `__dirname`/`__filename` **undefined** pada modul yang di-import (hanya polyfill di skrip di luar proyek
  — tes di `/tmp` menipu).
- Solusi yang dipakai `kc3WorkerRunner.ts`: `typeof __dirname !== "undefined"` (cabang terkompilasi) vs
  `process.cwd()` (dev; pola sama dengan `faktaFile` di kc3/kc4Runner).
- `execArgv: ["--import","tsx/esm"]` pada `new Worker` **tidak** mendaftarkan loader di dalam worker
  ("Unknown file extension .ts"). Yang terbukti jalan: bootstrap `.mjs` polos yang memanggil
  `register()` dari `tsx/esm/api` lalu `import("./kc3BahanWorker.ts")`.
- `dist-server` dikompilasi CommonJS tanpa `package.json` `type: commonjs` (beda dengan `dist-tests`);
  **`npm run start:backend` belum pernah diverifikasi** berjalan.

### 3.3 Test harness
- `scripts/run-tests.ts` (satu file besar), `test(name, fn)` **sinkron**. Test async pakai **`testAsync(name, fn)`** —
  didaftarkan di posisi aslinya, dijalankan di IIFE akhir file.
- File yang hanya dirujuk lewat path runtime (mis. worker) **harus didaftarkan** di `include` `tsconfig.test.json`.
- Wiring pemindai dibaca lewat helper **`scannerSrc()`** (= `SymbolScannerPanel.tsx` + `useSymbolScan.ts`).
- Perintah: `npm run test` (= `tsc -p tsconfig.test.json && node scripts/prepare-tests.mjs && node dist-tests/scripts/run-tests.js`).

### 3.4 MT5 & data
- Terminal Finex (demo `61823011`, live `91811209`): `…\MetaQuotes\Terminal\C84535A6B43B3F94C032314C1C9A9F5B\MQL5\Files`.
  OTB `D0E8209F77C8CF37AD8BF550E51FF075`, MIFX `9CF14355DB10DCA27FBE7DA11B54CB92`, Exness `53785E099C927DB68A545C249CDBCE06`.
  Path dari `.env` (`POSITIONS_LOG_PATH_*`, dst.).
- **EA `ExportPositions`** harus terpasang di chart terminal Finex demo — sesi ini sempat lepas (positions.csv basi
  6,5 jam) sehingga entry tidak tercatat; sudah dipasang lagi oleh Fahmi.
- `MDBKAMultiLive` (EA) = equity.csv + quotes.csv; `MDBKAHistoryService` (service) = `Common\Files\MDBKA_History_<login>.csv`
  tiap 30 detik; `AutoExportMDBKAService`, `MDBKACalendarService`.
- **Backend harus hidup sebelum entry** — catatan entry (SL/TP awal, status pemindai, setara Live) hanya dibuat saat
  tiket pertama terlihat di positions.csv.
- Arsip tick `data/history/<broker>/ticks-YYYY-MM-DD.jsonl` = snapshot tiap 2 detik (±13 GB total). Bisa bolong saat
  koneksi MT5 putus (sesi ini: celah 131 menit 05:25–07:36 WIT).
- `GET /api/evaluation` (±6 detik) dan `/api/evaluation/cards` (±11 detik tanpa cache) **memblokir thread utama**
  (perilaku lama, belum diperbaiki).
- Akun Exness demo `413925678` = akun pembelajaran (K-11), bukan bukti lampu 2/3.

### 3.5 Lingkungan sesi Claude
- Direktori kerja sesi Claude kadang berpindah ke `E:\1-MyApp\React\ePeLARA` (proyek lain). Selalu pakai path absolut
  `E:\MDBKA` / `cd /e/MDBKA`.
- Port 3001 = frontend ePeLARA, **bukan** MDBKA. MDBKA: frontend **5173**, backend **3000**.
- `preview_start` bisa salah ambil konfigurasi proyek lain; navigasi langsung ke `http://localhost:5173` lebih aman.
- Tab browser yang tersembunyi memperlambat timer halaman — majukan tab sebelum membaca hasil.

---

## 4. Posisi demo terbuka (per 17 Okt 2026, pasar tutup)

| Simbol | Tiket | Arah/Lot | Entry | SL | TP | Catatan |
|---|---|---|---|---|---|---|
| GBPJPY | 484555783 | BUY 0,01 | 210.596 | 209.833 (76,3 pip, ≈ −Rp87.090) | 211.741 (114,5 pip, ≈ +Rp130.725) | Tercatat (dobel, lihat 3.1); status pemindai saat entry **DITAHAN_RISIKO** (risiko Rp86.901 > batas Forex JPY Rp31.818) → **setaraLive: false**, tidak menghitung lampu 2 |
| CHFJPY | 482941089 | BUY 0,01 | 191.041 | 189.183 | 193.916 | Dibuka 16 Okt 03:35 |

Setelah posisi tertutup (SL/TP/manual): tunggu ≤30 detik (History), lalu halaman KC-4 → **"Rekap hasil demo"**.
Posisi dibawa lewat akhir pekan: risiko swap dan gap pembukaan Senin.

---

## 5. Peta file baru/berubah sesi ini

**Baru**
- `src/lib/kc3BahanShared.ts`, `kc3BahanMancing.ts`, `kc3BahanPetani.ts`, `kc3BahanFakta.ts`, `kc3BahanRegistry.ts`
- `server/services/kc3WorkerRunner.ts`, `server/workers/kc3BahanWorker.ts`, `server/workers/kc3BahanWorkerEntry.mjs`
- `src/hooks/useDataQualitySemua.ts`, `src/components/dashboard/StatusKesehatanStrip.tsx`
- `src/lib/profitTarget.ts`
- `src/lib/kc4PengawasDemo.ts`, `server/services/kc4DemoRunner.ts`, `src/components/branch/Kc4DemoPanel.tsx`
- `server/services/backupJob.ts`
- `src/hooks/useSymbolScan.ts`, `src/lib/pipDistance.ts`, `src/lib/mejaTradingView.ts`,
  `src/components/meja/MejaTradingPage.tsx`, `src/components/meja/MiniCandleChart.tsx`

**Diubah (penting)**
- `server/services/kc3Runner.ts`, `kc4Runner.ts` (async), `server/routes/cabangRoutes.ts` (route async + `/KC-3/bahan`, `/KC-4/demo/jalankan`)
- `src/lib/branchArchitecture.ts` (`RANGKAIAN_DEMO`, petugas `kc4-pengawas-demo`), `src/lib/branchOffice.ts` (jabatan Pengawas Demo)
- `src/lib/dataQualityGate.ts`, `server/services/dataQuality.ts`, `server/index.ts` (route `/api/data-quality/semua`, jadwal backup)
- `src/lib/symbolScanner.ts` (`ScanPlan.profitAtTpUsd`), `src/components/analysis/SymbolScannerPanel.tsx` (pakai hook), `SignalDetailPage.tsx`
- `src/lib/copyGuard.ts`, `src/components/analysis/ScanCopyButtons.tsx` (tombol Entry)
- `src/components/holdings/HoldingsDashboard.tsx` (rincian level SL/TP)
- `server/routes/evaluationRoutes.ts` (`makeCandlesOf`, `cardsForAccount`), `server/services/dataBackup.ts`, `server/routes/backupRoutes.ts`
- `src/App.tsx` (strip kesehatan, tombol Meja Trading, BackupBanner dihapus), `src/main.tsx` (rute meja)
- `tsconfig.test.json` (+ `server/workers/kc3BahanWorker.ts`), `scripts/run-tests.ts` (`testAsync`, `scannerSrc`, test 808–814)

**Dihapus:** `src/components/layout/BackupBanner.tsx`

---

## 6. Pekerjaan yang menunggu (urut prioritas)

1. **Senin, saat pasar buka — uji Meja Trading live:** pilih sinyal Lolos (bila ada), tekan [Entry] → tempel ke Price
   Buy Stop/Sell Limit → [SL] → [TP]. Catat apakah MT5 menolak Entry di harga pasar; bila sering ditolak, minta Fahmi
   menetapkan aturan jarak pending (jangan menebak).
2. **Setelah GBPJPY/CHFJPY tertutup:** jalankan "Rekap hasil demo" di KC-4, cek trade masuk rekap dengan R dan kelompok benar.
3. **Disk C: hampir penuh (±4,9 GB):** usulkan ke Fahmi memindahkan `BACKUP_DIR` ke drive E: (±38 GB bebas) lewat `.env`,
   dan aturan retensi snapshot backup. **Butuh persetujuan** sebelum menghapus/memindahkan apa pun.
4. **Re-audit KC-5 dan sign-off seluruh tim** (ditunda Fahmi ke sesi terpisah).
5. **Strategi:** bukti masih negatif; menunggu arahan Fahmi (bahan KC-3 baru, Jalur Perbaikan B/C, atau lainnya).
6. **Lampu 3 (Pengawas Live Minimum)** belum dibangun.
7. Utang teknis (tidak mendesak): endpoint evaluasi memblokir thread utama 6–11 detik; `docs/STRUKTUR-ORGANISASI-KC1-KC3.md`
   kedaluwarsa; `npm run start:backend` belum diverifikasi; warning ukuran chunk Vite.

---

## 7. Perintah penting

```bash
cd /e/MDBKA
npm run dev                 # SATU backend (3000) + SATU frontend (5173)
npm run test                # 810 test
npm run lint
npm run build               # frontend
npm run build:backend       # dist-server (CommonJS)
curl -s http://localhost:3000/health
curl -s http://localhost:3000/api/data-quality/semua
curl -s -X POST http://localhost:3000/api/cabang/KC-3/jalankan        # ±9,5 menit (F-1 di worker)
curl -s -X POST http://localhost:3000/api/cabang/KC-4/demo/jalankan   # rekap demo, ±5–17 detik
```

Halaman: dashboard `http://localhost:5173/`, Meja Trading `/?halaman=meja&broker=finex`,
Kantor Cabang `/?halaman=cabang&kode=KC-n`.

---

## 8. Prompt siap-tempel untuk sesi baru

```text
Lanjutkan proyek MDBKA (E:\MDBKA, branch main, commit terakhir e4f8c86, 810 test lolos).
Baca docs/HANDOFF-2026-10-17-kc3-kc4-meja-trading.md sampai selesai sebelum mengubah apa pun,
terutama bagian 0 (aturan kerja) dan 3 (jebakan teknis). Jawab dalam Bahasa Indonesia.
Pastikan hanya ada satu backend dan satu frontend yang berjalan.
Tugas pertama: [isi sesuai kebutuhan, mis. "uji tombol Entry di Meja Trading pada sinyal live"
atau "cek rekap KC-4 setelah posisi GBPJPY tertutup"].
```
