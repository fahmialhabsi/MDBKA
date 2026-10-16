# HANDOFF MDBKA — Kantor Cabang: KC-1 + KC-2 Selesai (16 Okt 2026)

Dokumen serah-terima untuk melanjutkan pekerjaan **Kantor Cabang MDBKA** di sesi/chat baru.
Commit terakhir: **1eee08e** (16 Okt 2026, "feat: KC-2 Jembatan MT5 dibangun lengkap"), sudah **di-push** ke `origin/main`.
Test terakhir terverifikasi: **776 lolos, 0 gagal** dari 776 pengujian. Build produksi (`npm run build`) **sukses**
(2022 modules, `dist/assets/index-*.js` 691,07 kB — ada warning ukuran chunk > 500 kB, **belum perlu ditindak**,
tidak mempengaruhi keputusan trading).

> **MULAI DI SINI (sesi berikutnya):** KC-1 "Pilih Pijakan" dan KC-2 "Jembatan MT5" **sudah dibangun & aktif**.
> Langkah berikutnya sesuai roadmap (`docs/RANCANGAN-2026-10-16-kantor-cabang-mdbka.md` bagian 9) adalah
> **Tahap C3: KC-3 "Sekolah Merangkak"** (Penambang Fakta + Jalur Perbaikan A–E). Belum ada kode KC-3 yang dibangun —
> hanya kerangka kontrak di `src/lib/branchArchitecture.ts` (petugas KC-3 berstatus `DITUNDA`).
> **Sebelum mulai KC-3**, cek dulu ke Fahmi: apakah KC-1 sudah benar-benar "disetujui" oleh Pusat di halaman
> `/?halaman=cabang&kode=KC-1` (klik Setuju pada Formulir R "Broker Terpilih")? Map `PILIHAN_BROKER` **harus ada**
> dan disetujui sebelum KC-2 (`runKc2`) bisa jalan tanpa error "Belum ada broker terpilih dari KC-1", dan sebelum
> KC-3 bisa menerima `PILIHAN_BROKER` + `DAFTAR_DATA`.

---

## 0. GUARD KERJA (WAJIB DIPATUHI)

Proyek ini punya **dua alur kerja berbeda** yang perlu dipahami sebelum menyentuh kode:

1. **Pembagian peran (dari `RANCANGAN-2026-10-16-kantor-cabang-mdbka.md` §2):**
   - **Fahmi** (Pimpinan Pusat) — memutuskan Setuju/Tolak/Tunda, menjalankan test/build/commit secara normal.
   - **Claude** (Konsultan Perancang, di luar aplikasi) — merancang, menulis prompt tahap untuk OpenCode, mengaudit hasil. **Tanpa wewenang memutuskan.**
   - **OpenCode** (Pelaksana Pembangunan, di luar aplikasi) — membangun kode dari prompt tahap yang disetujui Fahmi.
   - File KC-2 (`kc2Runner.ts`, `Kc2Panel.tsx`, `kc2Bridge.ts`) di sesi ini ditemukan **sudah dibangun** (kemungkinan oleh OpenCode) saat sesi baru dimulai, dalam keadaan uncommitted. Sesi Claude ini hanya **menjalankan test/build untuk verifikasi, lalu commit & push atas permintaan langsung Fahmi** — bukan menulis kode KC-2 dari nol.
2. **Aturan OpenCode** (`docs/OPENCODE/00-ATURAN-UMUM.md`, berlaku saat OpenCode membangun tahap baru):
   - **Dilarang** mengubah: `decisionEngine.ts`, parser OCR/CSV, `instrumentConfig.ts`, `.env`, `ea/*.mq5`, `App.tsx` — kecuali tahap menyebutnya eksplisit.
   - **Tanpa `any`**, tanpa impor ganda, tanpa angka fiktif (tidak diketahui = `null`).
   - **Jangan hapus/ganti nama fungsi lama.** Tanpa refactor besar.
   - **OpenCode dilarang menjalankan git yang menulis** (commit/add/push/stash/reset/dll.) — hanya `git status`/`git diff`. Commit biasanya dilakukan Fahmi sendiri setelah mengaudit. *(Sesi Claude ini adalah pengecualian: Fahmi secara eksplisit meminta Claude commit+push kali ini.)*
   - Modul baru di `src/lib/` harus **murni** (tanpa React/fs/fetch/`Date.now()` — waktu selalu lewat parameter).
   - Setiap tahap OpenCode wajib menulis laporan `docs/OPENCODE/LAPORAN-TAHAP-XX.md`.
3. **Prinsip dasar MDBKA (semua modul):** MDBKA **tidak pernah mengirim order** (semua eksekusi manual di MT5 oleh Fahmi); Mode Aman — default TUNGGU; uang ditampilkan dalam Rupiah (kurs ECB, sumber disebut); bukan nasihat keuangan.
4. **Cabang (KC-n) hanya boleh memberi REKOMENDASI** — tidak pernah memutuskan, tidak pernah mengubah `decisionEngine.ts`, tidak pernah mengirim order. Hanya Pusat (Fahmi) yang memutuskan Setuju/Tolak/Tunda.
5. **Bahasa Indonesia**, jawaban ringkas, root-cause/audit dulu baru coding, satu perubahan kecil per langkah.

---

## 1. Arsitektur singkat — Kantor Cabang

```
KC-1 Pilih Pijakan ──► KC-2 Jembatan MT5 ──► KC-3 Sekolah Merangkak ──► KC-4 Ruang Ujian ──► Pusat (lampu 1-2-3)
   (broker mana)        (data & fungsi)        (latih + try-out)            (ujian & demo)
KC-5 Pembukuan & Pajak ── berjalan sendiri, setiap bulan ──────────────────────────────────► Pusat
```

- **Urutan pembangunan asli** (dari roadmap, diputuskan Fahmi 16 Okt): C0 ✅ → **C2 (KC-2) ✅** → **C1 (KC-1) ✅** → C3 (KC-3) → C4 → C5 (paling akhir).
  Catatan: urutan C2-sebelum-C1 di dokumen rupanya tertukar di praktiknya — commit log menunjukkan **KC-1 dibangun duluan** (`dab3e16`), KC-2 menyusul (`1eee08e`). Keduanya sudah selesai; yang tersisa KC-3→4→5.
- **Kontrak hasil antar-cabang ("map")** — setiap map punya **satu pemilik tetap**; cabang lain hanya boleh **membaca**:

  | Map | Pemilik | Isi | Dibaca oleh |
  |---|---|---|---|
  | `KARTU_BROKER` | KC-1 | 6 kriteria satu broker, tiap angka + sumber | KC-1 Kepala |
  | `PILIHAN_BROKER` | KC-1 | satu broker terpilih + alasan | KC-2, KC-3 |
  | `DAFTAR_DATA` | KC-2 | file per simbol/timeframe: rentang, jumlah candle, lubang | KC-1 Petugas Data, KC-3 |
  | `KATALOG_FUNGSI` | KC-2 | fungsi MT5 tersedia vs dibutuhkan | KC-3 Penambang |
  | `PEMBAGIAN_DATA` | KC-3 (belum dibangun) | batas latih 60% · try-out 20% · ujian 20% (segel) | KC-3, KC-4 |
  | `POLA_CALON` | KC-3 (belum dibangun) | kondisi, bahan, angka beku, hasil latih & try-out | KC-3, KC-4 |
  | `CATATAN_PERBAIKAN` | KC-3 (belum dibangun) | diagnosis + jalan A–E + hasil | KC-2 |

- **Penyimpanan:** `data/cabang/<kode>/hasil/<MAP>-<tanggal UTC>.json` (map/hasil) dan arsip Formulir R + keputusan Pusat terpisah, keduanya **ditulis sekali, tidak ditimpa**. Folder `data/` di-gitignore.
- **Halaman:** `/?halaman=cabang&kode=KC-n`, dirender oleh `src/components/branch/BranchPage.tsx`. `App.tsx` tidak disentuh — pola routing cabang terpisah via `main.tsx`.
- **Status petugas** (`src/lib/branchArchitecture.ts`, konstanta `PETUGAS`): KC-1 **semua AKTIF** (5 petugas), KC-2 **semua AKTIF** (2 petugas: `kc2-kepala`, `kc2-katalog`), KC-3 **semua DITUNDA** (3 petugas: `kc3-kepala`, `kc3-penambang`, `kc3-perbaikan`).
- **Aturan kerangka teruji otomatis** (`contractErrors`, `branchFlows`, `bolehBaca`, `jalanBoleh`, `splitPeriods`): petugas hanya menulis map cabangnya sendiri; segel ujian hanya boleh dibaca KC-4; split data tetap 60/20/20; jalur perbaikan wajib E_ARSIP di percobaan ke-7.

---

## 2. Yang sudah selesai (urut commit)

| Commit | Isi |
|---|---|
| `1734d34` | **Tahap C0**: Formulir R + arsip `data/cabang/` (`branchStore.ts`) + halaman cabang (`BranchPage.tsx`) + `branchOffice.ts` (kontrak tipe dasar) |
| `548b1cc` / `ffcc06e` | Dokumentasi: Jalur Perbaikan + Buku Bahan Bakar (KC-3), aturan "rekomendasi wajib satu pilihan jadi" |
| `dab3e16` | **KC-1 "Pilih Pijakan" dibangun lengkap**: `src/lib/kc1Assessment.ts` (aturan nilai 4 prinsip, gugur wajib, nilai akhir), `server/services/kc1Runner.ts` (`runKc1`, baca `config/kc1-fakta-broker.json` + file MT5), `Kc1Panel.tsx` (panel penilaian broker di halaman KC-1), route `POST /api/cabang/KC-1/jalankan`, Formulir R otomatis |
| `1eee08e` | **KC-2 "Jembatan MT5" dibangun lengkap**: `src/lib/kc2Bridge.ts` (murni — `scanCandles`, `ringkas`, `periksaMasalah`, `formulirKc2`, `KATALOG_FUNGSI` tetap), `server/services/kc2Runner.ts` (`runKc2` — baca `PILIHAN_BROKER` dari KC-1, pindai file Common Files broker terpilih, tulis `DAFTAR_DATA` + `KATALOG_FUNGSI`, Formulir R bila ada masalah), `Kc2Panel.tsx` (tabel ringkasan per timeframe + lubang data + katalog fungsi MT5, tombol "Jalankan pemeriksaan KC-2"), route `POST /api/cabang/KC-2/jalankan`, wiring `BranchPage.tsx` + `cabangRoutes.ts`; `branchArchitecture.ts` KC-2 petugas AKTIF; `run-tests.ts` test baru untuk KC-2 (test terakhir bertambah dari suite lama; lihat `git log -p 1eee08e` untuk nomor pasti) |

### KC-1 "Pilih Pijakan" — ringkasan aturan nilai (dibekukan di `kc1Assessment.ts`)
- **Gugur wajib:** tanpa akun demo · tidak ada golongan lot minimum 0,01 · belum terverifikasi Bappebti · tidak ada golongan data ≥ 365 hari.
- **4 prinsip (0–100 masing-masing), nilai akhir = rata-rata:** Merangkak (lot 0,01 + setoran ≤ Rp500rb) · Dari Bawah (biaya termurah antar-broker) · Ke Atas (legal + akun live) · Terbukti (demo ada + demo≈live + data ≥365 hari).
- Fakta broker yang **tidak bisa dibaca dari MT5** (legalitas, setoran minimum) dicatat manual di `config/kc1-fakta-broker.json` (skema `kc1-fakta/1`, diisi Konsultan/Claude dari sumber terbuka, ditetapkan Pusat). Per 16 Okt 2026: Finex & OTB & MIFX legal (Bappebti), **Exness tidak legal** (tidak ada di daftar Bappebti).
- 4 broker dinilai: Finex, OTB (`orbitraderberjangka`), MIFX, Exness — akun demo masing-masing tercatat di config.

### KC-2 "Jembatan MT5" — ringkasan logika (`kc2Bridge.ts` + `kc2Runner.ts`)
- `runKc2` **menolak jalan** (melempar `Kc2Error`, HTTP 409) bila KC-1 belum punya `PILIHAN_BROKER` tersimpan, atau broker itu tidak ada di `config/kc1-fakta-broker.json`.
- Memindai `Common\Files`: file `MDBKA_<simbol>_<TF>_LONG.csv` (H4/H1/M15/M5/M1) milik broker terpilih (disaring lewat `MDBKA_Margin_<broker>.csv`) → `scanCandles` menghasilkan rentang, jumlah candle, lubang per simbol+timeframe.
- Mengecek umur file `MDBKA_Margin_<broker>.csv`, `MDBKA_Specs_<loginDemo>.csv`, dan candle otomatis `MDBKA_<simbol>_H1.csv` (basi vs `now` yang di-inject — modul tetap murni, jam dari parameter caller).
- `periksaMasalah` → daftar `Masalah` terstruktur (kode + teks + langkah perbaikan) ditampilkan di `Kc2Panel` sebagai kotak kuning; kosong → "Tidak ada temuan — data sehat" (hijau).
- `KATALOG_FUNGSI` saat ini masih **daftar tetap** (`kc2Bridge.ts`) — belum ada input dinamis dari KC-3 (`CATATAN_PERBAIKAN`), karena KC-3 belum dibangun.
- Hasil tersimpan jadi map `DAFTAR_DATA` + `KATALOG_FUNGSI` di `data/cabang/KC-2/hasil/`; Formulir R hanya dikirim bila `formulirKc2` menilai ada masalah yang perlu keputusan Pusat.

---

## 3. Peta file penting

**Frontend (Kantor Cabang)**
- `src/components/branch/BranchPage.tsx` — halaman cabang generik; merender `Kc1Panel`/`Kc2Panel` sesuai `branch.code`, lalu daftar rekomendasi + Meja Rekomendasi.
- `src/components/branch/Kc1Panel.tsx`, `src/components/branch/Kc2Panel.tsx` — panel per cabang; pola: tombol "Jalankan pemeriksaan", fetch `GET /api/cabang/:kode/hasil/:jenis`, tampilkan tabel + masalah/kotak status.
- `src/lib/branchOffice.ts` — tipe dasar bersama (`BranchCode`, `Recommendation`, dll.), **murni**.
- `src/lib/branchArchitecture.ts` — kontrak map, `PETUGAS`, `branchFlows`, `contractErrors`, aturan segel/jalur perbaikan; **murni**, diuji otomatis.
- `src/lib/kc2Bridge.ts` — logika murni KC-2 (lihat §2).
- `src/lib/kc1Assessment.ts` — logika murni KC-1 (aturan nilai).

**Backend (Kantor Cabang)**
- `server/routes/cabangRoutes.ts` — semua endpoint `/api/cabang/*` (lihat daftar endpoint di komentar atas berkas; route generik `POST /:kode/rekomendasi`, `POST /:kode/:id/keputusan`, `GET /:kode/hasil/:jenis`, plus route khusus per cabang `POST /KC-1/jalankan`, `POST /KC-2/jalankan`).
- `server/services/kc1Runner.ts`, `server/services/kc2Runner.ts` — penjalan tiap cabang (I/O: baca file MT5 di Common Files, baca config, panggil logika murni, simpan hasil).
- `server/services/branchStore.ts` — penyimpanan `data/cabang/` (map hasil, Formulir R, keputusan Pusat); "ditulis sekali, tidak ditimpa".
- `server/app.ts` baris ~122 — `app.use("/api/cabang", createCabangRoutes())`.
- `config/kc1-fakta-broker.json` — fakta broker yang tidak bisa dibaca dari MT5 (legalitas, setoran minimum); diisi manual, `null` = belum diketahui.

**Dokumen roadmap/arsitektur (baca sebelum lanjut ke KC-3)**
- `docs/RANCANGAN-2026-10-16-kantor-cabang-mdbka.md` — rancangan lengkap KC-1 s/d KC-5 (SOP, kriteria, Jalur Perbaikan A–E, Buku Bahan Bakar KC-3, target Rp per jam KC-4, data pinjaman KC-5).
- `docs/ARSITEKTUR-2026-10-16-kc1-kc3.md` — kontrak map formal + diagram alur KC-1→KC-3.
- `docs/STRUKTUR-ORGANISASI-KC1-KC3.md` — **dibuat otomatis dari kode** per 16 Okt; perlu **diregenerasi** setelah KC-3 dibangun (saat ini masih menyebut "KC-2 dan KC-3 DITUNDA" — KC-2 sudah tidak akurat lagi, sudah AKTIF).
- `docs/OPENCODE/00-ATURAN-UMUM.md`, `docs/OPENCODE/PETA-TAHAP.md`, `docs/OPENCODE/TAHAP-0{1..4}.md` + `LAPORAN-TAHAP-0{1..4}.md` — riwayat tahap OpenCode sebelumnya (bukan Kantor Cabang — modul lama, cek `PETA-TAHAP.md` untuk konteks penomoran tahap bila mau lanjut dengan OpenCode lagi).

---

## 4. Kondisi terbuka / perlu diperhatikan

- **`docs/STRUKTUR-ORGANISASI-KC1-KC3.md` sudah sedikit basi** — masih menulis "KC-2 DITUNDA" padahal kode (`branchArchitecture.ts`) sudah AKTIF sejak commit `1eee08e`. Dokumen ini "dibuat otomatis dari kode" per catatannya sendiri — sebaiknya diregenerasi (atau diedit manual) sebelum dipakai sebagai referensi tahap berikutnya, supaya tidak menyesatkan prompt tahap KC-3.
- **Belum ada verifikasi UI langsung** untuk KC-2 di sesi ini (hanya test otomatis 776/776 + build). Fahmi perlu membuka `/?halaman=cabang&kode=KC-2` di browser, menekan "Jalankan pemeriksaan KC-2", dan mengecek tabel ringkasan + katalog fungsi tampil benar dengan data broker yang sudah disetujui di KC-1.
- **Prasyarat KC-2 berjalan tanpa error**: KC-1 harus sudah menghasilkan `PILIHAN_BROKER` yang **disetujui Pusat** (lewat tombol Setuju di Formulir R KC-1). Belum dicek di sesi ini apakah langkah persetujuan itu sudah dilakukan Fahmi — bila belum, `POST /api/cabang/KC-2/jalankan` akan mengembalikan 409 "Belum ada broker terpilih dari KC-1".
- **KATALOG_FUNGSI KC-2 masih statis** — belum ada jalur otomatis dari `CATATAN_PERBAIKAN` KC-3 (karena KC-3 belum dibangun). Saat KC-3 mulai dibangun, `kc2Bridge.ts` kemungkinan perlu disentuh lagi untuk menerima permintaan bahan dari KC-3 (lihat SOP KC-2 langkah 4–5 di rancangan).
- **Peringatan ukuran bundle JS** (691 kB, > 500 kB) muncul lagi di build — ini peringatan lama yang sudah pernah dicatat "prioritas terendah, disarankan dilewati" di handoff sebelumnya (`HANDOFF-2026-10-08-mode-aman.md` §5 poin 7). Tidak berpengaruh ke keputusan trading maupun ke fitur Kantor Cabang. Jangan dikerjakan kecuali Fahmi minta eksplisit.
- **Governance commit**: commit `1eee08e` dibuat **oleh sesi Claude ini**, bukan oleh Fahmi sendiri di PowerShell seperti kebiasaan lama (`HANDOFF-2026-10-08` §0 poin 4) maupun aturan OpenCode (dilarang commit). Ini terjadi karena **Fahmi secara eksplisit memerintahkan** "berikan dulu patch commit dan push" di sesi ini. Sesi berikutnya tidak perlu menganggap ini pola baku — tetap tanya Fahmi sebelum commit/push kecuali diminta lagi secara eksplisit.
- Belum dicek: apakah ada petugas KC-1/KC-2 yang hasilnya salah bila broker yang disetujui Pusat bukan Finex (mis. OTB/MIFX) — `kc2Runner.ts` generik lewat `config/kc1-fakta-broker.json`, tapi belum ada uji nyata selain lewat test otomatis (data file sungguhan MT5 broker lain mungkin berbeda struktur/penamaan).

---

## 5. Langkah berikutnya (urutan usulan, sesuai roadmap §9)

1. **Verifikasi UI KC-1 & KC-2** langsung di browser (lihat §4) — pastikan Formulir R KC-1 sudah ada keputusan Pusat sebelum lanjut.
2. **Regenerasi/perbarui `docs/STRUKTUR-ORGANISASI-KC1-KC3.md`** agar status KC-2 tercatat AKTIF dengan benar.
3. **Tahap C3: KC-3 "Sekolah Merangkak"** — bangun `src/lib/patternBook.ts`(?) + skrip Penambang Fakta + Penyaring Kebetulan + Pengawas Try-out + Pustakawan, sesuai SOP di `RANCANGAN-2026-10-16-kantor-cabang-mdbka.md` §6 dan §6a (Jalur Perbaikan A–E, Buku Bahan Bakar). Ingat: **KC-3 tidak boleh membaca bagian data UJIAN** — hanya KC-4 (`bolehBaca` di `branchArchitecture.ts` sudah menegakkan ini, tinggal diimplementasikan di penjalan KC-3).
4. Tulis prompt tahap untuk OpenCode (ikuti pola `docs/OPENCODE/TAHAP-XX.md` + `00-ATURAN-UMUM.md`) **atau** lanjutkan langsung di sesi Claude Code ini — tergantung preferensi Fahmi saat sesi baru dimulai (tanyakan dulu, jangan asumsikan).
5. Setiap langkah: audit read-only dulu → jelaskan ke Fahmi dalam bahasa awam → satu perubahan kecil + test baru → ESLint → `npm test`/`npm run build` → verifikasi UI bila relevan → commit (tanya dulu siapa yang commit).

---

## Sumber tambahan
- Konteks akun saldo real: cek `server/services/accountBalance.ts` bila KC-5 (pembukuan) mulai dikerjakan jauh di kemudian hari (paling akhir per roadmap §9).
- Lampiran utang SPT OP Coretax (untuk KC-5 nanti): https://news.ddtc.co.id/literasi/tips-trik/1816908/cara-isi-lampiran-utang-dalam-spt-tahunan-wp-orang-pribadi-via-coretax
