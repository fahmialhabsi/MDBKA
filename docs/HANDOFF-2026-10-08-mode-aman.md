# HANDOFF MDBKA — Mode Aman (8 Okt 2026)

Dokumen serah-terima untuk melanjutkan pekerjaan MDBKA di chat baru.
Commit terakhir kode: **faabdb4** (branch `main`; sesi 8 Okt: 32a7299 → faabdb4).
Test terakhir: **563 lolos, 0 gagal**, build sukses (peringatan chunk > 500 kB hanya peringatan).
Nomor test terakhir: **567** → test baru mulai **568**.

---

## 0. GUARD KERJA (WAJIB DIPATUHI)

1. **Bahasa Indonesia**, jawaban ringkas (maks ±5 baris kecuali penjelasan bug kompleks).
2. **Root cause / audit read-only dulu**, baru coding. Jelaskan temuan sebelum mengubah.
3. **Satu perubahan kecil per langkah**, verifikasi tiap langkah sebelum lanjut.
4. **Pengguna yang menjalankan** `npm run build; npm test` lalu `git add -A; git commit -m "..."; git push`
   di Windows PowerShell (`PS E:\MDBKA>`). Claude memberi perintah + pesan commit, lalu menunggu hasilnya.
5. **Jangan bilang selesai sebelum terbukti** (test lolos, data dicek). Bila keliru, akui dan koreksi.
6. **Jumlah uang ditampilkan dalam Rupiah** (USD boleh di samping).
7. **Prinsip trading Fahmi (dasar semua desain):**
   > "biar profitnya sedikit itu lebih baik dan penting, dari pada mengejar profitnya tinggi tetapi malah minus yang didapat"
   Default TUNGGU; jangan pernah mengklaim sinyal "terbukti" tanpa data History ≥ 20 trade.
8. **Jangan merusak yang sudah jalan.** Pernah terjadi ("aplikasinya mulai ngaco") → dipulihkan dengan git stash + audit.
   Bila ragu, audit dulu, tanya pengguna.
9. MDBKA **tidak pernah menempatkan/menutup order**. Semua sinyal (breakeven, time-stop) hanya tampilan; eksekusi manual di MT5.
10. Bukan nasihat keuangan — keputusan trade tetap di tangan Fahmi.
11. **Setiap langkah selesai WAJIB disertai penjelasan bahasa awam (tidak teknis)**, sebelum pengguna commit:
    - **Apa yang dibuat** — diibaratkan benda/alat sehari-hari (mis. "kalkulator rekaman ulang").
    - **Contoh nyata dari trade Fahmi sendiri** (simbol, angka, Rupiah) agar langsung terbayang.
    - **Kegunaannya** — pertanyaan trading apa yang jadi bisa dijawab, dikaitkan ke prinsip "profit kecil lebih baik".
    - **Keterbatasan / kejujuran data** (mis. data hanya sejak tanggal X).
    - **Yang berubah di layar saat ini** (atau "belum ada, baru mesin hitung") + langkah berikutnya.
    Detail teknis (nama file, fungsi, test) boleh menyusul secara singkat, bukan di depan.

### Cara kerja teknis (dari chat lama, lewat jembatan perangkat / Claude desktop)
- Repo di Windows: `E:\MDBKA` (di VM: `$HOME/mnt/MDBKA`). Terminal MT5 di VM: `$HOME/mnt/Terminal`.
- Edit file dengan python read-modify-write (`open(..., newline='')`) agar CRLF/LF tetap; atau tulis file
  lalu `device_commit_files`. Jangan menyalin ulang isi file dari output tool (bisa terpotong).
- **tsc tidak bisa jalan di VM** (TS7 binary Windows). ESLint bisa: `node node_modules/eslint/bin/eslint.js <file>`.
- Test runner: `scripts/run-tests.ts` (CommonJS via `tsconfig.test.json`, **tidak bisa import .tsx** → logika
  yang dites taruh di modul `.ts`). Test async taruh di IIFE terakhir sebelum baris ringkasan. Tes terakhir: **567**.
- Uji cepat modul server/lib di VM bisa: Node 22 `--experimental-strip-types` + hook resolve `.ts` (lihat sesi 8 Okt);
  tulis hasil uji ke folder sementara, JANGAN ke `data/` asli.
- `tsx` juga tidak jalan di VM (esbuild Windows) → test hanya bisa dijalankan pengguna. `scripts/run-tests.ts` CRLF:
  sisipkan teks dengan `\r\n`. File CRLF lain: `src/types/analysis.ts`, `AnalysisResult.tsx`.
- Test `readSrc` mengecek teks sumber: bila kalimat kode diubah, sesuaikan test lamanya (pernah gagal di 538).
- TS: objek uji dengan `decision: "BELI" as const` membuat tipe sempit → pakai anotasi `ReturnType<typeof analyzeMarket>`.
- `git diff` di VM bisa menampilkan seluruh run-tests.ts berubah (CRLF campur) — itu artefak VM; git Windows menormalkan.
- Frontend wajib memakai `API_BASE_URL` (`src/lib/apiBaseUrl.ts`), **jangan** `/api` relatif (akan kena Vite → HTML).

---

## 1. Arsitektur singkat

- **Backend** Express: `tsx watch server/index.ts`, port **3000**. **Frontend** React 19 + Vite + TS, port **5173**.
- **Broker / terminal MT5**
  | Broker | BrokerId | Terminal ID | Akhiran simbol | Komisi |
  |---|---|---|---|---|
  | OTB (PT Orbi Trade Berjangka) | `orbitraderberjangka` | `D0E8209F77C8CF37AD8BF550E51FF075` | `_ORB` (+ `.US`, `.DEC`) | $33/lot, hanya sisi IN |
  | Finex (PT Finex Bisnis Solusi Futures) | `finex` | `C84535A6B43B3F94C032314C1C9A9F5B` | tanpa akhiran (`#` saham) | $1/lot |
- **Akun** (`.env` → `ACCOUNT_LABELS=91811209:Finex live,61823011:Finex demo,70930952:OTB demo`).
- **EA / Service MT5** (sumber di `ea/`):
  - `MDBKAMultiLive` (EA) → `equity.csv` (8 kolom) + `quotes.csv`. **Jangan** pakai `MDBKAEquityLogger` lama (9 kolom, bentrok).
  - `ExportPositions` (EA) → `positions.csv` (presisi pakai `SYMBOL_DIGITS` per simbol).
  - `AutoExportMDBKAService` (service) → `Common\Files\MDBKA_<sym>_H1.csv`, **200 candle** (sejak 22cb986).
  - `MDBKAHistoryService` (service) → `Common\Files\MDBKA_History_<login>.csv` (kolom 16 = Company).
- `quotes.csv` memakai jam server yang sama untuk semua simbol → "pasar tutup" dideteksi dari candle H1 terakhir
  dibanding candle terbaru broker yang sama (selisih ≥ 2 jam = tutup/basi).
- Jam di positions.csv dan quotes.csv = **jam server MT5** (format `YYYY.MM.DD HH:MM:SS`).

---

## 2. Yang sudah selesai (urut commit)

| Commit | Isi |
|---|---|
| bc7ecc1 | Kurs BI dicabut; Rupiah pakai ECB (`getCachedEcbRates()` di `server/routes/fxRoutes.ts`) |
| 7a085b6 | Presisi harga per simbol di ExportPositions; `formatPriceDistance` |
| 3f65bfe | **Mode Aman**: gerbang biaya 10% (`MAX_COST_SHARE_OF_RISK = 0.1`), risiko lot minimum, default risiko 1% |
| 852e8c3 / 29e524a | Panduan TUNGGU + panel header menampilkan alasan Mode Aman (`src/lib/signalReason.ts`) |
| 080a348 | Hapus kode mati T1–T4 (useLiveQuotes, srCalculator, signalAnalyzer, liveQuotesStore, dll.) |
| 1b8b722 | `GET /api/candles?broker=` (`server/routes/candlesRoutes.ts`) |
| b8cee12 / 9c557a3 / 61e5468 | Pemindai simbol: `src/lib/symbolScanner.ts` + `SymbolScannerPanel.tsx` (status LOLOS / DITAHAN_BIAYA / DITAHAN_RISIKO / TUNGGU / PASAR_TUTUP / DATA) |
| 080c780 | **4b** catatan entry posisi (`server/services/tradeEntryLog.ts` → `data/trades/entries-<broker>.jsonl`) + **backup** (`dataBackup.ts`, `backupRoutes.ts`, `BackupBanner.tsx`; tujuan `~/Documents/MDBKA-Backup`) |
| edcfcbb | **4c-1** `server/services/tradeEvaluation.ts` + `GET /api/evaluation` (`evaluationRoutes.ts`) |
| 46ce504 | **4c-2** panel "Evaluasi trade — hasil nyata" (`TradeEvaluationPanel.tsx`, helper `src/lib/evaluationView.ts`) |
| 11a3946 | **4d** label Lolos di pemindai = win rate nyata bila n ≥ 20 (`mergeGroupStats`, `lolosLabel`), merah bila terbukti rugi |
| ba6ff11 | **Breakeven +0,5R** (`BREAKEVEN_R_MULTIPLE = 0.5`) + **time-stop 3 jam** (`checkTimeStop`, `TIME_STOP_HOURS = 3`) di monitor posisi (`HoldingsDashboard.tsx`) |
| 22cb986 | AutoExportMDBKAService ekspor **200 candle H1** (dulu 50); salinan di `ea/AutoExportMDBKAService.mq5`. Diverifikasi: 150 file × 201 baris |
| 32a7299 | **Analisa otomatis tanpa upload**: pilih simbol → CSV dari `/api/candles` masuk alur `handleCsvLoaded` (`src/lib/autoCandle.ts`). Upload manual tetap cadangan |
| 39fa063 | **Saldo & setoran per akun** dari History MT5 (`server/services/accountBalance.ts`, field `balance` di `/api/evaluation`). Cocok MT5: OTB $5.000,22 |
| 549ade1 | **Header saldo Rupiah** 3 akun (`AccountBalancesBar.tsx`, `accountBalanceView.ts`); live di depan; setoran Rupiah asli dari komentar deal |
| abb1f6a / 2412c15 | **Taruhan ganda**: `src/lib/correlationGuard.ts` (eksposur mata uang, Emas/Perak sendiri, "Saham AS" = indeks AS + saham .US/#, "Minyak"); pemindai status `DITAHAN_KORELASI`; pencatat entry menilai terhadap posisi LAIN |
| fb3e81c | Status pemindai = tombol: hanya **Lolos** aktif → pilih simbol + gulir ke `#hasil-analisa`; status lain disabled (tooltip alasan) |
| 4b61766 | Hasil analisa ikut menahan taruhan ganda (`applyDoubleBetHold`, `heldBy: "korelasi"`, kotak ungu) |
| e0168a2 / 9385c5e | **Jeda 3 rugi beruntun**: `src/lib/lossStreakGuard.ts` (24 jam jam server, demo+live per broker, fail-safe tanpa jam server), `useLossPause`, pemindai `DITAHAN_JEDA` + baris "Rugi beruntun n/3", Hasil analisa `heldBy: "jeda"` (kotak merah) |
| e8ede7d | **Format harga ikut desimal simbol** (`priceDigits`/`formatPrice` di `tickSize.ts`): kartu Entry/SL/TP, kotak "Salin order" (titik desimal, siap tempel MT5), Live Quotes. US30 = 2, forex = 5, JPY = 3 |
| 25edb19 | **MDBKAHistoryService** tulis ulang History saat ganti akun (`lastLogin`), walau jumlah deal sama. Sudah di-compile & restart di Finex + OTB (0 errors) |
| 6fec2ae | **Zona jam OTB**: server OTB ternyata UTC+2 (bukan +3) → `.env` `MT5_TZ_OFFSET_OTB=2` (+ `.env.example`). Terverifikasi: selisih `received_at`−`ts_utc` tick OTB baru ±1 dtk (dulu 1 jam). Tick lama tidak ditulis ulang; `ts_raw` tetap benar. Cek ulang offset saat pergantian jam musim (akhir Okt/awal Nov) |
| 616f1da | **5a MFE/MAE** — `server/services/tradeExcursion.ts` `computeExcursion(trade, ticks)`: untung terbaik (MFE) & rugi terdalam (MAE) selama trade terbuka; BUY pakai bid, SELL pakai ask; cocok lewat jam server (`ts_raw`); R bila SL diketahui; cakupan PENUH / PARSIAL (celah > 60 dtk) / TANPA_DATA. Belum tersambung ke UI. Test 543–545 |
| 23a5a6a | **5b1** `server/services/excursionReader.ts` — baca arsip tick **streaming** (baris demi baris; jangan readFileSync file 300–420 MB), tiap file dibaca sekali untuk semua trade, file tanggal ±1 hari, saring `ts_raw`. ±18 dtk untuk 3 file OTB. Test 546 |
| 95faeb9 | **5b2** `server/services/excursionCache.ts` — buku `data/trades/excursion-<broker>.jsonl` (kunci `<login>:<positionId>`, baris terakhir menang). Final bila PENUH atau tutup > 1 jam sebelum tick terbaru; selain itu dihitung ulang. Test 547–548 |
| 84239db | **5b3** `server/services/excursionJob.ts` `runExcursionPass` (trade belum tercatat → hitung → catat yang final) + `newestTickRaw` (baca 8 KB ekor). Test 549 |
| 86bb43b | **5b4** `startExcursionSchedule` dipasang di `server/index.ts`: 5 dtk setelah start lalu tiap 10 menit, tidak bertumpuk, gagal hanya dilog. Terverifikasi: 36 trade tercatat 13:03 WIT. Test 550 |
| af71278 | **5c** `GET /api/evaluation` + `excursions` per akun (`excursionsForLogin`, per positionId; data trade lama tak berubah). Test 551 |
| 923bf5f | **5d** panel Evaluasi: kolom **Untung terbaik / Rugi terdalam** di "Lihat trade terakhir" (`excursionCell`; ≈ sebagian, – tanpa rekaman, … sedang dihitung). Test 552 |
| 2887221 | **5e** MFE/MAE dalam **Rupiah**: `grossProfit` di `tradeEvaluation.ts`; `usdPerPriceUnit` = profit kotor ÷ gerak harga (angka asli broker); tooltip USD + R. Perkiraan kurs hari ini. Terverifikasi di layar (US100 +Rp9.945.000 / −Rp6.755.000). Test 553 |
| 8dcc5b8 | **4b-1** start hanya baca **ekor** file arsip (`readTailText`, 8 MB) untuk kunci dedup; sekaligus perbaiki bug lama (dulu mengingat 20.000 tick PERTAMA, kini TERBARU). Test 554 |
| 76ee998 | **4b-2** `compact()` sekali per file: daftar `data/history/<broker>/compacted.json` (nama → ukuran), lewati file hari ini (UTC), baca per potongan 4 MB (`forEachLineSync`), tulis ulang via `.tmp` + rename hanya bila ada duplikat. Terverifikasi: 5 file/broker dicentang, 0 duplikat, start berikutnya cepat. Test 555 |
| 5308b19 | **4b-3** `coverage()` per potongan + test penjaga: tidak ada lagi readFileSync file arsip (kecuali `compacted.json`). Endpoint `/api/history/coverage` tetap SINKRON (±1–2 mnt) — hanya diagnosa manual, jangan dipakai UI. Test 556 |
| 426f329 | **6a-1** `tradeEntryLog` opsi `getPauseReason(timeOpen)` → `pauseReason` ke `scanSymbol`; gagal baca = tanpa jeda (catatan tetap ditulis). Test 557 |
| f350ae3 | **6a-2** `server/index.ts`: jeda dari History MT5 broker yang sama (`collectAccountEvaluations` + `checkLossStreak`) pada **jam server entry**. Entry saat jeda → `DITAHAN_JEDA`, bukan `LOLOS`. Test 558 |
| 1968ef6 | **5-1** `breakevenCostDistance(holding, convert)` di `exitMonitor.ts`: komisi USD ÷ (contract×lot dlm USD), dibulatkan NAIK ke tick; `checkBreakeven(..., costDistance)` opsional (tanpa = SL di entry seperti dulu). Biaya ≥ profit / tanpa kurs → SL di entry + catatan. Spread tidak ditambah, swap & slippage diabaikan. AUDUSD_ORB 0,10 @0,69811 → SL 0,69844. Test 559–560 |
| 5fdc105 | **5-2** kotak BREAKEVEN (`HoldingsDashboard.tsx`) pakai SL + biaya; baris `breakeven-cost` "Biaya komisi RpX (Y USD) sudah ditutup oleh SL ini". Test 561 |
| e8f4116 | Kotak "Salin order": tombol **Salin SL** (`copy-sl`) & **Salin TP** (`copy-tp`) — angka saja, siap tempel ke kolom MT5; tombol "Salin order" DIHAPUS atas permintaan Fahmi (teks order tetap tampil). Terverifikasi tempel di MT5 (US500, JP225). Test 562 |
| c9de232 | **Format harga indeks bulat**: `tickSizeForSymbol` kini menerima `decimals: 0` (dulu jatuh ke 0.00001 → JP225 "68761.00000"). JP225/HK50 = 0 desimal seperti MT5; tick 1 (juga placeholder spread & pembulatan BE). Terverifikasi di layar. Test 563 |
| 58ee5a3 | **R1 buku golongan risiko** `src/lib/riskGroup.ts` (`riskGroupOf`, `RISK_GROUPS`, akhiran `_ORB`/`.DEC` dibuang; tak dikenal = ditahan). 150 simbol dicek: semua tergolong benar. Test 564 |
| 33c0f8b | **R2 mesin analisa**: `BrokerSettings.riskCap` opsional (`RiskCapInput`), `riskCapFor(symbol, usdIdr)`; batas = **min(1% equity, batas golongan Rupiah÷kurs)**; golongan ditahan / tanpa kurs → TUNGGU + `heldReason` Rupiah; `signalReason` pakai heldReason. `BrokerSettingsForm` pakai `NumericBrokerKey` (riskCap bukan isian form). Test 565 |
| 622b1f6 | **R3** batas golongan dipasang di `App.tsx` (effectiveBroker) & `symbolScanner.ts` (pencatat entry server ikut). Terverifikasi: JP225 "Ditahan: risiko Rp339.978 > batas Indeks Rp150.000", #HSBA golongan ditahan. Test 566 |
| 597c8e4 | **Fix pointValue Finex non-USD**: `withUsdPointValue` kini juga konversi Finex (mata uang kuotasi dari spec32). Dulu USDJPY terbaca Rp3,6 jt (yen dianggap USD), kini ±Rp24 rb; CHF/CAD/GBP/NZD/AUD meleset 0,6–1,3× ikut benar. Test 496 lama ("Finex tetap" = bug) diganti. Terverifikasi di layar |
| faabdb4 | **R3b** analisa diulang otomatis sekali begitu kurs USD→Rp termuat (`kursRetryRef`); pesan "kurs belum tersedia" saat start hilang. Terverifikasi. Test 567 |

### Aturan Mode Aman yang aktif sekarang
1. Default **TUNGGU**; sinyal hanya bila skor (MA50, CCI, MACD, RSI) kompak.
2. **Risiko 1%** equity per trade; lot minimum melebihi batas → "Ditahan: risiko lot minimum".
3. **Gerbang biaya**: (spread + slippage)·pointValue + komisi ≤ **10%** dari risiko, selain itu "Ditahan: biaya X% (maks 10%)".
   Saat ditahan: decision = TUNGGU, SL/TP/lot = null, `heldBy`/`heldDecision`/`costShareOfRisk` diisi.
4. **Breakeven di +0,5R** (instruksi Modify SL = entry **+ biaya komisi** di MT5; tanpa kurs/spec → entry).
5. **Time-stop 3 jam** (selisih jam server quote − jam buka; holding manual format ISO tidak dinilai).
6. **Bukti n ≥ 20**: "Lolos · belum terbukti (n/20)" → "Lolos · win rate X% (n=N)"; merah "terbukti rugi" bila ekspektansi ≤ 0.
   Demo + live satu broker digabung.
7. Data indikator dari **200 candle H1**.
8. **Taruhan ganda diblok**: sinyal searah eksposur posisi terbuka broker aktif → TUNGGU (pemindai + Hasil analisa).
   Aturan USD ketat: posisi apa pun "USD naik/turun" memblok semua sinyal dengan arah USD yang sama.
9. **Jeda 24 jam setelah 3 rugi berturut-turut** (per broker, demo+live). Didahulukan dari taruhan ganda.
10. Urutan tahanan di Hasil analisa: jeda → taruhan ganda (biaya/risiko dari `analyzeMarket`).
11. **Batas risiko per golongan (penetapan Fahmi 8 Okt)** — dipakai yang lebih kecil dengan 1% equity; tanpa kurs = ditahan:
    | Golongan | Batas | | Golongan | Batas |
    |---|---|---|---|---|
    | Forex (tanpa JPY) | Rp35 rb | | Indeks (US30/100/500, DE30, UK100, HK50, JP225) | Rp150 rb |
    | Forex JPY | Rp35 rb | | Saham AS (# Finex, .US OTB) | Rp50 rb |
    | Logam (XAU, XAG) | Rp150 rb | | Forex tidak lazim (USDEUR, USDGBP, USDHKD, GBXUSD) | ditahan |
    | Minyak (XTIUSD, CLU) | Rp150 rb | | Saham Eropa & HK (#ADS…#763) | ditahan |
    Ubah angka hanya di `RISK_GROUPS` (`src/lib/riskGroup.ts`).

### Hasil evaluasi (patokan "sebelum Mode Aman", semua kelompok TANPA_CATATAN)
| Akun | Trade | Win rate | Bersih | Rata-rata untung / rugi |
|---|---|---|---|---|
| OTB demo 70930952 | 15 | 27% | −$183,18 ≈ −Rp3,27 juta | +$7,59 / −$19,41 |
| Finex live 91811209 | 19 | 21% | −$13,71 ≈ −Rp245 ribu | +$0,98 / −$1,18 |
| Finex demo 61823011 | 0 | – | – | – |

Temuan: 3 posisi OTB yang ditahan berhari-hari ≈ **89% kerugian**. Backtest: edge ≈ 0 di semua horizon, negatif
setelah biaya; 3 jam relatif terbaik; TP kecil butuh win rate ±67% untuk impas.

---

## 3. Peta file penting

**Frontend**
- `src/App.tsx` — urutan: section broker → `BackupBanner` → `SymbolScannerPanel` → `TradeEvaluationPanel` → workGrid.
- `src/calculations/decisionEngine.ts` (analyzeMarket, Mode Aman), `indicators.ts` (min 50 candle), `swingDetector.ts` (swing terdekat).
- `src/lib/symbolScanner.ts`, `signalReason.ts`, `evaluationView.ts`, `exitMonitor.ts`, `tickSize.ts`, `marketReset.ts`.
- `src/components/analysis/SymbolScannerPanel.tsx`, `TradeEvaluationPanel.tsx`; `components/layout/BackupBanner.tsx`, `LiveSignalsPanel.tsx`;
  `components/holdings/HoldingsDashboard.tsx` (monitor posisi: TIME-STOP amber, BREAKEVEN hijau).
- `src/types/analysis.ts` (AnalysisResult + `costShareOfRisk`, `heldBy`, `heldDecision`).

**Backend**
- `server/index.ts` (wiring reader + entry log per broker), `server/app.ts` (mount routes).
- Routes: `candlesRoutes.ts`, `evaluationRoutes.ts`, `backupRoutes.ts`, `fxRoutes.ts`, `marginRoutes.ts` (`resolveCommonFilesDir`).
- Services: `tradeEntryLog.ts`, `tradeEvaluation.ts`, `dataBackup.ts`.
- `data/` di-gitignore (entries jsonl, history tick) → hanya aman lewat tombol **Backup sekarang**.

**Endpoint**
- `GET /api/candles?broker=` → `{broker, items:[{symbol,csv,modified,quote}]}`
- `GET /api/evaluation` → `{accounts:[{login,label,company,broker,evaluation:{trades,overall,byGroup,bySymbol,openPositions}}]}`
- `GET /api/backup/status`, `POST /api/backup/run` (409 bila sedang jalan)

**Dokumen**
- Jurnal: "Jurnal Evaluasi Trading MDBKA — 7 Okt 2026" — https://claude.ai/code/artifact/bdf0fd56-04d2-419d-a48a-cd5c6717ae86
  (rev 17; berisi ringkasan, evaluasi posisi, bug data, backtest + koreksi, aturan, audit History, bagian
  "Evaluasi trade dan aturan Mode Aman yang aktif (8 Okt 2026)", checklist langkah berikutnya).
- `docs/Roadmap MDBKA — Finex dan OrbiTraderBerjangka (OTB).md`, `docs/calculation-rules.md`.

---

## 4. Kondisi terbuka / perlu diperhatikan

- **Audit 8 Okt (5 trade LOLOS Finex demo, bersih ≈ −$5,44 ≈ −Rp97 rb, win 3/5):** rugi besar XTIUSD JUAL −$8 = −1R tepat (SL dipatuhi, MFE hanya 0,08R → sinyal meleset, bukan bug). Akar masalah: risiko 0,01 lot tidak seimbang (minyak ±Rp143 rb vs forex ±Rp12–31 rb) → dijawab batas golongan (R1–R3). Catatan jujur: GBPUSD & GBPCHF menang setelah ditahan **7–8 jam** (melewati time-stop 3 jam); AUDCHF SL hanya 5,4 pip (kena dalam 7 menit). Usulan berikut yang belum dikerjakan: **jarak SL minimum** (mis. berbasis ATR).
- XTIUSD BELI 8 Okt ditutup di SL breakeven+komisi 90,57 → +$0,09 (bukti pertama BE+komisi bekerja).
- Rencana grafik per simbol (tab ala MT5) **dibatalkan** Fahmi (pekerjaan terlalu banyak). Mockup tersimpan: https://claude.ai/artifact/Hv6o51xhKruFGUTu2x8sqG

- ~~**JEDA AKTIF Finex**~~ (berakhir 09:50, lihat bawah) sejak XTIUSD rugi (8 Okt): 3 rugi beruntun (CADJPY, EURCHF live + XTIUSD demo) → semua sinyal Finex
  ditahan sampai **2026.10.09 04:47 jam server**. OTB tidak jeda (trade terakhir US100 +$186,70).
- Format SL/TP baru di Hasil analisa lolos test 541 tapi belum dilihat langsung (tunggu sinyal Lolos berikutnya).
- Pindah akun demo↔live: chart/EA/service tidak perlu di-attach ulang; server MDBKA saja yang dijalankan ulang.
- Rencana online: disarankan **VPS Windows** (MT5 + MDBKA satu mesin, wajib login + HTTPS). Belum diputuskan.
- Finex demo punya posisi terbuka (GBPUSD/GBPCHF/XTIUSD SELL) → beberapa sinyal JUAL GBP/minyak berstatus Taruhan ganda.
- Jeda Finex 8 Okt **sudah berakhir 09:50 jam server** (GBPUSD +$1,63 & GBPCHF +$1,51 memutus rantai); entry NZDUSD/XTIUSD/AUDCHF 10:11–10:17 benar tercatat LOLOS (dicek dari History, bukan bug).
- Pencatat entry server kini ikut menilai jeda (6a). **Belum terlihat langsung**: baris log `✓ Entry finex #… → DITAHAN_JEDA` muncul hanya bila posisi baru dibuka saat jeda DAN pemindai menilai Lolos.
- Kotak BREAKEVEN + biaya (5-2) **belum terlihat langsung** — tunggu posisi ber-SL yang profitnya ≥ 0,5R, lalu cek angka SL & baris Rupiah.

- Posisi OTB masih terbuka sejak 6 Okt: **META.US BUY 0,10 @741,07 tanpa SL/TP**, **AUDUSD_ORB BUY 0,10 @0,69811**
  (SL 0,69311, TP 0,70626). Keduanya kena TIME-STOP; META tanpa SL = risiko tak terbatas. Keputusan di tangan Fahmi.
- OTB Experts log 03:28: `ExportPositions: FileOpen gagal: 5004` (sekali; kemungkinan file sedang dibaca). Pantau bila berulang.
- Belum ada trade Mode Aman tercatat → label pemindai masih "belum terbukti (0/20)".
- Backup pertama sudah sukses; banner muncul lagi bila data penting berubah.
- Buku MFE/MAE (`data/trades/excursion-*.jsonl`) di-gitignore seperti `data/` lain → ikut tombol **Backup sekarang**.

---

## 5. Langkah berikutnya (urutan usulan)

1. **Kumpulkan ≥ 20 trade Mode Aman berstatus Lolos**, lalu nilai ulang di panel Evaluasi trade (win rate, ekspektansi, R).
2. ~~Peringatan korelasi~~ ✅ selesai (diblok, bukan sekadar peringatan).
3. ~~Pause setelah 3 kali rugi berturut-turut~~ ✅ selesai (jeda 24 jam).
4. ~~Gerak terbaik/terburuk (MFE/MAE) tiap trade dari arsip tick~~ ✅ **selesai** (5a–5e, 616f1da → 2887221).
   - Temuan: dari 6 trade OTB berekaman, 4 sempat untung lebih besar dari hasil akhir (GBPUSD JUAL 5 Okt sempat
     ≈+Rp586 rb, ditutup −Rp61 rb; US100 sempat +Rp9,9 jt, ditutup +Rp3,3 jt). 29 trade sebelum 5 Okt = tanpa rekaman.
   - Usulan lanjutan (perlu bukti ≥ 20 trade Mode Aman dulu): aturan ambil untung lebih cepat / BE berbasis MFE.
4b. ~~Risiko arsip tick > 512 MB/hari~~ ✅ **selesai** (4b-1…4b-3, 8dcc5b8 → 5308b19). Koreksi audit: file > 512 MB dulu
   *dilewati diam-diam* (bukan crash); masalah utama justru start lambat (compact baca semua arsip ±25 dtk/file).
5. ~~Biaya breakeven (SL = entry + biaya)~~ ✅ selesai (5-1, 5-2; 1968ef6 → 5fdc105). Verifikasi layar menunggu.
6. ~~Pencatat entry ikut status jeda~~ ✅ selesai (6a-1, 6a-2; 426f329 → f350ae3). Sisa **6b**: akun ke-4 di header — hanya bila ada file History akun baru.
6c. ~~Batas risiko per golongan~~ ✅ selesai (R1–R3b, 58ee5a3 → faabdb4).
6d. Usulan: **jarak SL minimum** (SL terlalu sempit tertembus noise, mis. AUDCHF 5,4 pip). Belum diputuskan.
7. Opsional (prioritas terendah, disarankan dilewati): kecilkan bundle JS (±509 kB) dengan dynamic import — tidak berpengaruh ke keputusan trading.

Setiap langkah: audit read-only → jelaskan → satu perubahan kecil + test baru (mulai nomor **562**) →
ESLint → pengguna build/test/commit → verifikasi.

---

## 6. Prompt pembuka untuk chat baru (salin-tempel)

> Lanjutkan proyek MDBKA (repo E:\MDBKA, GitHub fahmialhabsi/MDBKA, branch main, lihat git log,
> 563 test lolos). Baca dulu `docs/HANDOFF-2026-10-08-mode-aman.md` dan patuhi bagian GUARD KERJA:
> Bahasa Indonesia ringkas, audit read-only dulu, satu perubahan kecil per langkah, saya yang menjalankan
> build/test/commit, jumlah dalam Rupiah, dan prinsip "profit kecil lebih baik daripada mengejar profit besar
> lalu minus". Langkah berikutnya: kumpulkan trade Mode Aman (langkah 1); opsi 5 & 6a sudah selesai (cek layar BREAKEVEN + log DITAHAN_JEDA bila terjadi).
> Setiap langkah selesai, jelaskan dulu dalam bahasa awam (GUARD no. 11) sebelum saya commit.
