# Aturan Umum untuk OpenCode — Proyek MDBKA

Baca berkas ini **setiap kali** sebelum mengerjakan satu tahap. Kerjakan **hanya** tahap yang disebut di prompt. Bila spesifikasi tahap bertentangan dengan kode yang ada, atau ada hal yang tidak pasti, **berhenti dan tulis di laporan**. Jangan menebak.

## 1. Konteks singkat

- MDBKA: aplikasi analisa trading berbasis aturan (tanpa AI). React 19 + Vite + TypeScript (frontend), Express + `tsx` (server, `server/`). Data dari 4 terminal MT5 (Finex, OTB, MIFX, Exness) lewat berkas CSV di `Common\Files` dan folder terminal.
- MDBKA **tidak pernah mengirim order**. Semua order manual oleh pemilik (Fahmi).
- Mode Aman: **TUNGGU adalah default**; BELI/JUAL hanya bila lolos semua penjaga.
- Rancangan lengkap (baca bila tahap merujuknya):
  - `docs/AUDIT-RANCANGAN-2026-10-13.md` — keputusan K-1 s.d. K-9, peta urutan induk.
  - `docs/RANCANGAN-2026-10-13-alur-trader-profesional.md`
  - `docs/RANCANGAN-2026-10-13-fondasi-data-dan-jalur-live.md`
  - `docs/RANCANGAN-2026-10-13-tim-akun-tab-indikator.md`
  - `docs/SOP-2026-10-13-tim-mdbka.md`
  - `HANDOVER-CLAUDE.md` bagian 5 (aturan mutlak) dan 12.

## 2. Aturan mutlak (tidak boleh dilanggar)

1. **Jangan ubah berkas ini** kecuali tahap menyebutnya secara eksplisit:
   - `src/calculations/decisionEngine.ts` (rumus keputusan, lot, gerbang biaya `MAX_COST_SHARE_OF_RISK`)
   - `src/components/extraction/ocrParser.ts`, `src/lib/marketWatchParser.ts`, `src/lib/csvCandleParser.ts` (parser)
   - `src/lib/instrumentConfig.ts` (preset Finex)
   - `.env` (diisi Fahmi sendiri)
   - `ea/*.mq5` (EA/service MT5)
   - `src/App.tsx`
2. **Hasil analisa Finex yang tampil tidak boleh berubah** (aturan mutlak 1). Penjaga sesi untuk Hasil analisa hanya boleh **shadow**.
3. **Test lama tidak boleh dihapus.** Hanya boleh ditambah. Bila sebuah test lama terpaksa diubah, beri komentar alasan di baris itu dan sebutkan di laporan.
4. **Tanpa `any`** (ESLint `@typescript-eslint/no-explicit-any` = error), termasuk `catch (e: any)`: pakai `catch (error)` + `error instanceof Error`. **Tanpa impor ganda** (`no-duplicate-imports` = error).
5. **Tanpa angka fiktif.** Nilai yang tidak diketahui = `null`, bukan 0 dan bukan karangan.
6. **Jangan hapus atau ganti nama fungsi yang sudah ada.** Tanpa refactor besar.
7. **Jangan menjalankan git yang menulis**: `commit`, `add`, `push`, `checkout`, `stash`, `reset`, `rebase`, `merge`. Boleh `git status` dan `git diff` untuk membaca. Commit dilakukan Fahmi setelah audit.
8. **Modul baru di `src/lib/` harus murni**: tanpa React, tanpa `fs`/`fetch`/I-O, tanpa jam sistem (`Date.now()`); waktu selalu dari parameter.

## 3. Format berkas

- `scripts/run-tests.ts` memakai **CRLF** (ada satu baris LF lama di sekitar baris 7890; biarkan). Baris yang ditambahkan wajib CRLF.
- Beberapa `.tsx` ber-BOM + CRLF. Sebelum mengedit berkas lama, periksa BOM dan akhir barisnya, lalu pertahankan.
- Berkas baru: UTF-8 tanpa BOM, LF.
- Komentar dan pesan bahasa Indonesia, singkat. Awali komentar blok modul baru dengan kode langkah dan tanggal, contoh: `/** LAB-1 (13 Okt 2026) — ... */`.

## 4. Sistem test (BUKAN vitest/jest)

- Satu berkas: `scripts/run-tests.ts`. Bentuk test:
  ```ts
  test("688. Judul singkat bahasa Indonesia", () => {
    assert(kondisi, "pesan bila gagal");
  });
  ```
- Helper yang tersedia di berkas itu: `test`, `assert`, `readSrc(rel)` (membaca isi berkas sumber), `analyzeMarket`, `modeAmanMarket`, `modeAmanBroker`, dan banyak impor lain di bagian atas berkas.
- **Nomor test dan titik sisip ditulis di berkas tahap** (berupa teks penanda yang persis, bukan nomor baris). Nomor test di berkas ini **tidak** urut dari atas ke bawah (blok test 288 dst. ada setelah test terbaru), jadi jangan menyisip berdasarkan nomor.
- **Dilarang menulis ulang `scripts/run-tests.ts` utuh.** Hanya penyisipan teks. Setelah selesai, `git diff --stat scripts/run-tests.ts` harus menunjukkan 0 penghapusan (kecuali tahap menyebut baris yang dihapus).
- Impor modul baru ditambahkan di bagian impor atas berkas. Satu modul = satu baris impor (jangan dobel). Bila modul sudah diimpor, tambahkan nama ke baris yang ada.
- **Commit terakhir selalu lolos semua test.** Error yang muncul setelah Anda bekerja berasal dari perubahan Anda. Jangan menulis "error sudah ada sebelumnya".
- `tsconfig.test.json` cukup memuat `scripts/run-tests.ts`; modul lain ikut terkompilasi lewat impor. **Tidak perlu** menambah berkas baru ke `include`.
- Perintah: `npm test` (tsc test → `dist-tests` → runner), `npm run build` (`tsc -b && vite build`), `npm run lint`.

## 5. Cara kerja per langkah

1. Baca spesifikasi langkah di berkas tahap.
2. Periksa kode yang dirujuk (nama fungsi, tipe, baris). Bila berbeda dari spesifikasi: berhenti untuk langkah itu, tulis di laporan.
3. Kerjakan perubahan sekecil mungkin.
4. Tambahkan test sesuai spesifikasi.
5. Jalankan `npm test` dan `npm run lint` (boleh), catat hasilnya.
6. Lanjut ke langkah berikutnya di tahap yang sama.

## 6. Laporan wajib

Tulis `docs/OPENCODE/LAPORAN-TAHAP-XX.md` (XX = nomor tahap) dengan format:

```markdown
# Laporan Tahap XX

## Ringkasan
- Langkah selesai: ...
- Langkah tidak selesai + alasan: ...

## Per langkah
### <kode langkah>
- Berkas dibuat: ...
- Berkas diubah: ... (baris kira-kira)
- Fungsi/tipe baru: ...
- Test: nomor ... (judul)
- Penyimpangan dari spesifikasi + alasan: ... (tulis "tidak ada" bila tidak ada)
- Hal yang tidak pasti: ...

## Hasil perintah
- npm test: X lolos, Y gagal
- npm run lint: ...
```

Jangan menulis klaim yang tidak diperiksa. Bila tidak menjalankan sebuah perintah, tulis "tidak dijalankan".
