# Roadmap MDBKA — Finex dan OrbiTraderBerjangka (OTB)

**Nama aplikasi:** MDBKA — *Merangkak Dari Bawah Ke Atas*  
**Versi roadmap:** 1.0  
**Tanggal:** 3 Oktober 2026  
**Repository kerja:** `E:\MDBKA`  
**Branch sumber terbaru:** `main`  
**Status baseline terakhir:** Build berhasil, 323 test lolos, lint bersih  
**Tujuan dokumen:** Menjadi pedoman pengembangan, pengujian, verifikasi broker, dan pemeliharaan MDBKA tanpa merusak perilaku Finex ketika fitur OrbiTraderBerjangka dikembangkan.

---

## 1. Ringkasan Eksekutif

MDBKA adalah aplikasi analisis trading berbasis React, TypeScript, Vite, Tailwind CSS, OCR Tesseract.js, data candle CSV MetaTrader 5, Market Watch, Data Window, perhitungan risiko, swap, live equity, dan live quotes.

Aplikasi saat ini mendukung dua konteks broker:

1. **Finex** sebagai baseline utama dan jalur yang harus dipertahankan.
2. **OrbiTraderBerjangka (OTB)** sebagai broker tambahan dengan simbol bersuffix `_ORB`, misalnya `GBPUSD_ORB`.

Prinsip utama roadmap:

> **Finex tidak boleh berubah hasilnya hanya karena OTB ditambahkan.**

> **OTB tidak boleh menggunakan angka Finex sebagai fallback finansial.**

> **Data broker yang belum diverifikasi harus ditampilkan sebagai “Perlu verifikasi broker”, bukan diisi dengan tebakan.**

Status umum saat roadmap ini dibuat:

- Finex: **aman secara struktur, perlu regresi manual final**.
- OTB: **fitur inti sudah tersedia secara kode, tetapi parameter finansial, konversi mata uang, dan integrasi live masih memerlukan verifikasi dan perbaikan**.
- LiveQuotes: **kode tersedia, browser end-to-end dan kontrak SSE perlu diverifikasi**.
- Risiko JPY dan konversi swap non-USD: **belum boleh dianggap final**.

---

## 2. Tujuan Produk

### 2.1 Tujuan utama

MDBKA harus membantu pengguna:

- mengambil data dari screenshot MT5;
- membaca Market Watch dan Data Window;
- membaca OHLC serta indikator teknikal;
- menghubungkan atau mengunggah CSV candle MT5;
- mendeteksi Support dan Resistance dari candle;
- menyesuaikan parameter berdasarkan broker aktif;
- menghitung bias teknikal BUY/JUAL/TUNGGU;
- menghitung Entry, Stop Loss, Take Profit, RR, dan lot teoritis;
- menghitung risiko terhadap equity;
- menampilkan swap dan biaya holding bila data broker valid;
- menampilkan equity dan quotes live secara transparan;
- mencegah pencampuran data antarbroker dan antarsimbol.

### 2.2 Batasan produk

MDBKA bukan jaminan profit dan bukan sistem eksekusi order otomatis. Hasil aplikasi adalah analisis berbasis data input dan parameter broker yang harus diverifikasi pengguna melalui terminal MT5.

Aplikasi wajib membedakan:

- **bias teknikal**;
- **status kelengkapan data**;
- **status validasi skala/simbol**;
- **status risiko**;
- **status verifikasi parameter broker**.

---

## 3. Prinsip Arsitektur

### 3.1 Isolasi broker

Arsitektur yang dipertahankan:

```text
MDBKA Core
├── Finex adapter/configuration
└── OrbiTraderBerjangka adapter/configuration
```

Decision engine boleh tetap dipakai bersama selama input broker sudah dinormalisasi dan divalidasi dengan benar.

### 3.2 Satu sumber broker aktif

State utama harus memiliki satu sumber kebenaran:

```ts
type BrokerId = "finex" | "orbitraderberjangka";
```

State broker aktif berada di `App.tsx` dan diteruskan melalui props. Jangan membuat state broker aktif kedua di komponen anak.

### 3.3 Identitas simbol

Setiap data yang berasal dari broker harus membedakan:

```ts
{
  brokerId: "finex" | "orbitraderberjangka",
  brokerSymbol: "GBPUSD" | "GBPUSD_ORB",
  instrumentFamily: "GBPUSD",
  timeframe: "H1"
}
```

- `brokerSymbol` mempertahankan nama asli terminal.
- `instrumentFamily` digunakan untuk klasifikasi instrumen.
- Simbol exact dipakai untuk pencocokan CSV, OCR, Market Watch, dan quotes.

### 3.4 Fail-closed

Jika data penting tidak lengkap atau tidak terverifikasi:

- jangan menebak;
- jangan memakai preset broker lain;
- jangan mengisi angka fiktif;
- tampilkan warning;
- tahan perhitungan risiko final jika perlu.

---

## 4. Baseline Finex

Finex adalah baseline yang harus dibekukan secara fungsional.

### 4.1 Komponen yang harus tetap stabil

- `src/lib/instrumentConfig.ts`
- `src/calculations/decisionEngine.ts`
- `src/calculations/inputValidator.ts`
- `src/calculations/scaleValidator.ts`
- `src/components/extraction/ocrParser.ts`
- `src/lib/marketWatchParser.ts`
- `src/components/analysis/SwingLevelsForm.tsx`
- `src/components/analysis/CsvFileConnector.tsx`
- `src/lib/marketReset.ts`
- preset Finex
- formula Entry, S/L, T/P, RR, dan lot

Perubahan terhadap modul tersebut harus memiliki alasan, test regresi, dan pembuktian bahwa hasil Finex tidak berubah.

### 4.2 Dukungan Finex yang dipertahankan

- daftar simbol Finex;
- normalisasi simbol Finex;
- validasi skala harga;
- label spread `pip` untuk forex;
- label spread `index points` untuk indeks;
- preset contract size dan point value Finex;
- OCR Market Watch;
- OCR Data Window;
- CSV candle;
- swing Support/Resistance;
- reset data ketika simbol berganti;
- validasi equity;
- peringatan risiko minimum lot;
- decision engine broker-agnostic.

### 4.3 Kriteria penerimaan Finex

Finex dianggap aman apabila:

1. default broker tetap Finex;
2. preset Finex tidak berubah;
3. fixture Finex menghasilkan hasil yang sama sebelum dan sesudah OTB;
4. CSV Finex tidak diterima pada konteks OTB yang berbeda;
5. OCR Finex tidak mengambil data simbol lain;
6. S/R Finex masuk ke market state;
7. build berhasil;
8. seluruh test regresi lolos;
9. lint bersih;
10. alur manual Finex berhasil diuji ulang.

---

## 5. Fondasi Multi-Broker

### 5.1 Modul utama

Modul yang sudah atau perlu dipertahankan:

```text
src/types/broker.ts
src/lib/brokerRegistry.ts
src/lib/brokerSymbols.ts
src/lib/otbInstrumentConfig.ts
src/components/analysis/BrokerSelector.tsx
```

### 5.2 Registry broker

Registry harus menyediakan:

- `DEFAULT_BROKER_ID = "finex"`;
- profile Finex read-only dari konfigurasi lama;
- profile OTB terpisah;
- validasi `BrokerId`;
- daftar simbol berdasarkan broker aktif;
- tidak ada object mutable bersama yang dapat tertimpa.

### 5.3 Pergantian broker

Ketika broker berubah:

1. ubah broker aktif;
2. muat daftar simbol broker baru;
3. bersihkan hasil analisis lama;
4. putuskan koneksi CSV lama;
5. hapus S/R dari konteks lama;
6. hapus atau tandai ulang data market yang tidak kompatibel;
7. pertahankan equity manual jika secara UI memang aman;
8. jangan menyalin tick value, contract size, komisi, atau volume dari broker lama;
9. tampilkan notifikasi broker aktif;
10. jangan menghasilkan angka OTB otomatis jika preset belum terverifikasi.

---

## 6. Roadmap OTB

### Tahap OTB-1 — Broker selector dan konteks

**Status:** selesai secara kode.

Target:

- dropdown Finex/OTB;
- Finex tetap default;
- badge broker aktif;
- warning OTB ketika parameter belum terverifikasi;
- state broker tunggal;
- reset aman saat broker berubah.

Kriteria penerimaan:

- Finex tidak berubah;
- OTB dapat dipilih;
- daftar simbol berubah sesuai broker;
- hasil lama dibersihkan;
- test selector lolos.

### Tahap OTB-2 — Exact symbol mapping

**Status:** selesai secara kode, perlu verifikasi terminal.

Target awal:

- `GBPUSD_ORB`;
- `AUDCAD_ORB`;
- `EURCHF_ORB`;
- simbol `_ORB` lain sesuai daftar aktual terminal.

Aturan:

- `GBPUSD_ORB` tidak boleh dinormalisasi menjadi `GBPUSD` untuk pencocokan exact;
- OCR boleh mengenali simbol exact;
- CSV harus cocok dengan simbol dan broker aktif;
- simbol family tanpa suffix harus menghasilkan warning ketika konteks OTB aktif.

### Tahap OTB-3 — Preset instrumen

**Status:** tersedia secara kode, sebagian belum terverifikasi.

Setiap preset harus memuat atau secara eksplisit menandai:

- broker symbol;
- instrument family;
- asset class;
- digits;
- price range;
- spread mode dan nilai spread bila tersedia;
- point size;
- tick size;
- tick value;
- profit currency;
- margin currency;
- contract size;
- min volume;
- max volume;
- volume step;
- stops level;
- initial margin;
- hedged/maintenance margin bila tersedia;
- calculation mode;
- commission;
- swap type;
- swap long;
- swap short;
- triple-swap weekday;
- sumber dan tanggal verifikasi.

Sebuah preset hanya boleh berstatus **terverifikasi** bila seluruh field wajib berasal dari Specification broker atau sumber resmi yang terdokumentasi.

### Tahap OTB-4 — Verifikasi GBPUSD_ORB

**Prioritas pertama.**

Data yang harus diambil dari MT5 OTB:

- Symbol: `GBPUSD_ORB`;
- Digits;
- Contract size;
- Tick size;
- Tick value;
- Profit currency;
- Margin currency;
- Spread mode dan spread;
- Stops level;
- Volume minimum;
- Volume maximum;
- Volume step;
- Initial margin;
- Hedged margin;
- Maintenance margin;
- Calculation mode;
- Commission;
- Swap long/short dan satuannya;
- hari triple swap;
- equity akun demo;
- Bid/Ask aktual;
- CSV candle aktual.

Tidak boleh mengisi field yang belum terlihat dengan nilai Finex.

### Tahap OTB-5 — Risiko dan volume

**Status:** ada secara kode, belum final.

Kebutuhan:

- minimum lot OTB harus benar-benar dipatuhi;
- lot step harus benar;
- volume di bawah minimum tidak boleh dianggap rekomendasi valid;
- initial margin harus dipisahkan dari contract size;
- tick value harus dikaitkan dengan profit currency;
- account currency harus diketahui;
- konversi ke USD harus benar;
- jika parameter penting kosong, risiko final harus ditahan.

Status yang disarankan:

```text
Bias teknikal: JUAL
Status risiko: BELUM DAPAT DIVERIFIKASI
```

Bukan hanya menampilkan `JUAL` seolah-olah order siap dilakukan.

### Tahap OTB-6 — Komisi

**Status:** tersedia, perlu verifikasi.

Aturan:

- komisi tidak boleh disamakan ke 13 simbol tanpa bukti;
- komisi harus memiliki satuan dan basis yang jelas;
- perbedaan komisi antarvolume harus dimodelkan jika broker menerapkannya;
- override manual pengguna boleh dilakukan;
- override harus menghasilkan warning;
- komisi Finex tetap manual sesuai perilaku lama.

### Tahap OTB-7 — Swap

**Status:** tersedia secara kode, formula non-USD perlu audit.

Dukung:

- flat currency;
- points bila broker memakai points;
- percentage bila broker memakai persentase;
- BUY/SELL;
- holding days;
- intraday;
- triple swap;
- profit currency;
- konversi ke account currency.

Jangan mencampur:

- swap value;
- tick value;
- point value;
- commission;
- initial margin.

### Tahap OTB-8 — FX conversion

**Status:** tersedia, tetapi perlu diperbaiki/diverifikasi.

Konversi harus memiliki definisi eksplisit:

```text
amount in profit currency
→ exchange rate pasangan yang benar
→ amount in account currency
```

Kebutuhan:

- tidak melabeli hasil sebagai USD jika sebenarnya masih EUR atau mata uang lain;
- handling pasangan langsung dan terbalik;
- fallback rate diberi label fallback;
- rate memiliki timestamp/source;
- error kurs tidak diam-diam menjadi angka final.

### Tahap OTB-9 — Live Equity

**Status:** terpasang sebagai display-only.

Alur:

```text
MT5 log
→ MT5LogReader
→ /api/equity/latest atau /stream
→ useEquityStream
→ LiveEquity
```

Kebijakan saat ini:

- LiveEquity tidak otomatis menimpa equity manual;
- pengguna harus mengonfirmasi jika ingin memakai nilai live;
- snapshot idealnya memiliki brokerId, account/server context, dan timestamp;
- equity Finex dan OTB harus tidak tertukar.

### Tahap OTB-10 — Live Quotes

**Status:** frontend tersedia, browser test dan SSE perlu diselesaikan.

Kebutuhan:

- REST dan SSE memiliki kontrak yang sama;
- `init` dan `update` di-unpack dengan benar;
- quote simbol berbeda ditolak;
- quote broker berbeda ditolak atau diberi warning;
- SSE error melakukan fallback polling;
- tidak ada polling ganda;
- cleanup EventSource benar;
- timestamp ditampilkan;
- stale quote detection tersedia;
- format digit mengikuti profil instrumen;
- LiveQuotes tidak otomatis menimpa market state;
- status display-only terlihat jelas.

### Tahap OTB-11 — Manual browser test

Skenario:

1. jalankan backend pada port 3000;
2. jalankan frontend pada port 5173;
3. pilih OTB;
4. pilih `GBPUSD_ORB`;
5. upload CSV OTB;
6. tempel screenshot Market Watch dan Data Window OTB;
7. ekstrak data;
8. periksa Bid/Ask/OHLC/indikator;
9. periksa S/R;
10. periksa parameter broker;
11. isi equity OTB;
12. lakukan analisis;
13. periksa status risiko;
14. periksa LiveEquity;
15. periksa LiveQuotes;
16. kembali ke Finex;
17. ulangi alur Finex dan bandingkan hasil baseline.

---

## 7. Live Equity dan Live Quotes

### 7.1 Backend

Script backend harus jelas dan terdokumentasi:

```powershell
npm run dev:server
```

atau nama aktual yang tercantum di `package.json`.

Frontend:

```powershell
npm run dev
```

Endpoint harus menyediakan:

- REST latest;
- SSE stream;
- heartbeat;
- cleanup;
- error response;
- fallback polling.

### 7.2 Kontrak SSE quotes

Gunakan tipe eksplisit:

```ts
type QuoteSseEnvelope =
  | { type: "init"; data: QuoteSnapshot[] }
  | { type: "update"; data: QuoteSnapshot };
```

Hook tidak boleh membaca envelope sebagai `QuoteSnapshot` langsung.

### 7.3 Test live

Test harus benar-benar menguji:

- init;
- update;
- malformed JSON;
- symbol mismatch;
- SSE error;
- fallback polling;
- cleanup;
- tidak ada duplicate polling;
- tidak ada reconnect storm.

---

## 8. Test Strategy

### 8.1 Kelompok test

1. Finex regression.
2. Broker registry.
3. Broker selector.
4. Symbol mapping.
5. OCR.
6. Market Watch.
7. CSV.
8. Support/Resistance.
9. Input validation.
10. Scale validation.
11. Risk and lot.
12. OTB preset.
13. Commission.
14. Swap.
15. FX conversion.
16. Triple swap.
17. Live equity.
18. Live quotes.
19. Browser integration.

### 8.2 Aturan test runner

- satu runner asynchronous utama;
- satu `process.exit`;
- tidak menggunakan `pass=true` sebagai pengganti assertion;
- test async benar-benar menunggu hasil;
- error async diteruskan ke status gagal;
- test fixture mencantumkan sumber atau status fixture;
- tidak menghapus test lama tanpa alasan.

### 8.3 Target regresi

Setiap perubahan harus menjalankan:

```powershell
npm run build
npm test
npm run lint
```

Target baseline saat dokumen dibuat:

```text
Build: berhasil
Test: 323/323 lolos
Lint: bersih
```

Jika jumlah test berubah, laporan wajib menjelaskan:

- test baru;
- test dihapus, bila ada;
- alasan perubahan;
- kelompok fitur yang terdampak.

---

## 9. Prioritas Risiko

### P0 — Harus diselesaikan sebelum risiko OTB dianggap final

1. Perbaiki risiko JPY yang masih diperlakukan seolah-olah USD.
2. Samakan kontrak SSE quotes server dan frontend.
3. Perkuat test harness async.
4. Perketat `hasOtbPresetForSymbol` agar field VERIFY tidak dianggap lengkap.
5. Pastikan tick size dan tick value berasal dari Specification.
6. Pastikan initial margin tidak disamakan secara otomatis dengan contract size.
7. Perbaiki konversi profit currency ke account currency.

### P1 — Harus diverifikasi sebelum demo serius

1. Komisi semua simbol.
2. Minimum volume dan volume step.
3. Stops level dan satuannya.
4. Swap type dan unit.
5. Triple-swap weekday broker.
6. Spread floating dan nilainya.
7. Suffix simbol terminal.
8. Equity dari akun dan server yang benar.
9. Format quotes dan timestamp.
10. Live backend browser test.

### P2 — UX dan maintainability

1. Stale quote detection.
2. Label broker/simbol pada LiveQuotes.
3. Tombol “Gunakan equity live” dengan konfirmasi.
4. Dokumentasi `QUOTES_LOG_PATH`.
5. Status sumber setiap parameter.
6. Pesan “bias teknikal” versus “status risiko”.
7. Dashboard charts.
8. Alert system.
9. Backtesting.

---

## 10. Definition of Done

### 10.1 Finex done

Finex dapat disebut selesai apabila:

- seluruh fitur baseline berfungsi;
- test regresi lolos;
- hasil fixture sebelum/sesudah identik;
- manual browser test berhasil;
- tidak ada kontaminasi OTB;
- parameter broker sesuai terminal Finex;
- tidak ada error UI kritis.

### 10.2 OTB GBPUSD_ORB done

`GBPUSD_ORB` dapat disebut selesai apabila:

- Specification lengkap tersimpan;
- tick size terverifikasi;
- tick value terverifikasi;
- contract size terverifikasi;
- volume min/max/step terverifikasi;
- komisi terverifikasi;
- swap terverifikasi;
- initial margin dipisahkan dengan benar;
- risk calculator memakai currency conversion yang benar;
- CSV dan OCR exact match;
- browser test berhasil;
- test runtime live berhasil;
- Finex regression tetap lolos.

### 10.3 OTB multi-symbol done

Simbol OTB lain hanya boleh diaktifkan satu per satu setelah:

- specification masing-masing tersedia;
- preset tidak sekadar menyalin simbol lain;
- test parameter masing-masing tersedia;
- mata uang profit diperhitungkan;
- swap dan komisi diverifikasi;
- risiko minimum volume diuji.

---

## 11. Prosedur Kerja Setiap Perubahan

1. Pastikan branch dan status Git.
2. Buat checkpoint bila baseline bersih.
3. Audit file yang akan diubah.
4. Buat perubahan minimal.
5. Tambahkan test.
6. Jalankan build.
7. Jalankan test.
8. Jalankan lint.
9. Uji browser jika menyentuh integrasi live.
10. Review diff.
11. Commit dengan pesan yang spesifik.
12. Catat perubahan pada roadmap.

Perintah standar:

```powershell
git branch --show-current
git status
npm run build
npm test
npm run lint
git diff --stat
git diff
```

Jangan menggunakan:

```powershell
git add .
```

untuk checkpoint sensitif tanpa memeriksa file yang akan ikut ter-commit.

---

## 12. Checkpoint Git yang Direkomendasikan

- `baseline: stable Finex before isolated OrbiTraderBerjangka`
- `foundation: add isolated broker registry`
- `feat: add isolated broker selector`
- `fix: guard risk percentage when equity is missing`
- `fix: safely propagate CSV swing levels to market state`
- `feat: add OTB symbol mapping and presets`
- `feat: add OTB swap calculation`
- `feat: add OTB FX conversion`
- `feat: add live equity reader`
- `feat: add live quotes reader`
- `fix: align quote SSE contract`
- `test: strengthen async quote stream tests`
- `fix: validate OTB preset completeness`
- `fix: convert multi-currency risk safely`

Setiap commit harus menjelaskan apakah Finex berubah atau tidak.

---

## 13. Urutan Langkah Berikutnya

Urutan paling aman berdasarkan kondisi aktual:

### Langkah sekarang

1. Commit guard `LiveQuotes.tsx` — sudah dilakukan pada `main`.
2. Jalankan backend dan frontend secara terpisah.
3. Uji endpoint REST quotes.
4. Uji endpoint SSE.
5. Verifikasi LiveQuotes di browser.

### Setelah LiveQuotes

6. Perbaiki kontrak SSE jika mismatch.
7. Perkuat test harness.
8. Tambahkan test runtime untuk init/update/error/cleanup.
9. Perketat validasi kelengkapan preset OTB.

### Setelah validasi teknis

10. Verifikasi lengkap Specification `GBPUSD_ORB`.
11. Perbaiki kalkulasi tick value dan currency conversion.
12. Verifikasi komisi dan volume rules.
13. Audit swap dan triple swap.
14. Uji manual GBPUSD_ORB end-to-end.
15. Uji regresi Finex end-to-end.

### Ditunda

16. Aktifkan simbol JPY untuk risiko final.
17. Aktifkan seluruh simbol OTB pending.
18. Dashboard chart.
19. Alert system.
20. Backtesting.

---

## 14. Checklist Pengguna

### Finex

- [ ] Broker Finex dipilih.
- [ ] Simbol Finex benar.
- [ ] Screenshot dari terminal Finex.
- [ ] CSV dari terminal Finex.
- [ ] Bid/Ask diverifikasi.
- [ ] OHLC dan indikator lengkap.
- [ ] S/R masuk ke form market.
- [ ] Equity berasal dari akun Finex.
- [ ] Contract size dan point value sesuai Specification.
- [ ] Analisis tidak tertahan karena data kurang.
- [ ] Risiko minimum lot diperiksa.
- [ ] Hasil dibandingkan dengan baseline.

### OrbiTraderBerjangka

- [ ] Broker OTB dipilih.
- [ ] Simbol exact, misalnya `GBPUSD_ORB`, dipilih.
- [ ] Specification lengkap tersedia.
- [ ] Tick size diverifikasi.
- [ ] Tick value diverifikasi.
- [ ] Profit currency diverifikasi.
- [ ] Contract size diverifikasi.
- [ ] Minimum volume diverifikasi.
- [ ] Volume step diverifikasi.
- [ ] Komisi diverifikasi.
- [ ] Swap long/short dan unit diverifikasi.
- [ ] Triple-swap weekday diverifikasi.
- [ ] CSV berasal dari terminal OTB.
- [ ] Screenshot berasal dari terminal OTB.
- [ ] Equity berasal dari akun OTB.
- [ ] Tidak ada data Finex yang tercampur.
- [ ] Risiko menggunakan currency conversion yang benar.
- [ ] Browser test berhasil.
- [ ] Hasil diberi label perlu verifikasi jika ada field belum lengkap.

---

## 15. Kesimpulan Roadmap

MDBKA telah mencapai fondasi multi-broker yang kuat dan Finex tetap menjadi baseline yang terlindungi. OTB sudah memiliki struktur simbol, preset, swap, live equity, dan live quotes, tetapi status OTB harus tetap dibedakan antara:

- **tersedia secara kode**;
- **lulus test fixture**;
- **terverifikasi dari Specification broker**;
- **teruji manual di browser**;
- **layak dipakai untuk perhitungan risiko**.

Prioritas utama bukan menambah banyak fitur baru, melainkan memastikan:

1. LiveQuotes benar-benar bekerja end-to-end.
2. Kontrak SSE konsisten.
3. Test runtime kuat.
4. Tick value dan currency conversion benar.
5. Preset OTB hanya dianggap valid jika lengkap dan terverifikasi.
6. Finex tetap menghasilkan hasil yang sama.

> **Status rekomendasi:** Finex dapat dilanjutkan untuk pengujian dan penggunaan sesuai verifikasi broker. OTB dapat digunakan untuk pengujian teknis dan demo terbatas, tetapi jangan menganggap kalkulasi risiko OTB final sampai P0 dan verifikasi Specification selesai.
