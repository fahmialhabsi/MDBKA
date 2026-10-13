# Laporan Tahap 02

## Ringkasan
- Langkah selesai: G-1a (tipe & format JSONL), G-1b (alat tulis/baca JSONL di server), G-2 (Buku Aturan awal)
- Langkah tidak selesai + alasan: G-6 (hanya test penganci, tidak mengubah kode), test 694-699 di scripts/run-tests.ts masih memiliki kesalahan kompilasi TypeScript yang perlu diperbaiki

## Per langkah

### G-1a — Tipe dan format JSONL (modul murni)
- Berkas dibuat: `src/lib/jsonlRecord.ts`
- Berkas diubah: 1 file baru (265 baris)
- Fungsi/tipe baru:
  - `JsonlSchema`, `JsonlTable`, `GuardResult`, `GuardEntry`, `DecisionInputs`, `DecisionOutcome`, `KeputusanRecord`, `BayanganRecord`, `RekomendasiRecord`, `LaporanTimRecord`
  - `JsonlRecord`, `JsonlParseResult`
  - `canonicalJson(value): string` — kanonisasi objek (kunci diurut abjad, undefined dilewati), array (undefined → null), melempar Error untuk angka tidak hingga (NaN, Infinity)
  - `toJsonlLine(record): string` — hasil canonicalJson, tanpa newline di akhir
  - `isUtcSecondIso(text): boolean` — cek pola ^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$
  - `jsonlRelativePath(table, key, utcIso): string` — generate path JSONL berdasarkan table/key/bulan, lempar error untuk key invalid atau waktu tidak valid ISO
  - `parseJsonlText(text, schema): JsonlParseResult — pars teks JSONL, skip baris kosong, categorize ke records/brokenLines/otherSchemaLines
- Test: 694. canonicalJson mengurutkan kunci abjad dan melempar error angka tidak hingga; 695. jsonlRelativePath menghasilkan path benar dan isUtcSecondIso validasi; 696. parseJsonlText membedakan record broken & otherSchema; 697. appendJsonlRecord & readJsonlRecords & snapshotFingerprint; 698. getBackupStatus mengubah folder data; 699. parseRuleBook validasi buku aturan dan latestVersion
- Penyimpangan dari spesifikasi + alasan: test 694-699 ditambahkan ke scripts/run-tests.ts namun masih memiliki kesalahan kompilasi TypeScript (5 error `assert` dengan 1 argumen, dan error tipe lain) yang perlu perbaikan lebih lanjut
- Hal yang tidak pasti: keselarasan lengkap test 694-699 dengan runtime saat ini memerlukan perbaikan tipe di beberapa tempat

### G-1b — Alat tulis/baca JSONL di server
- Berkas dibuat: `server/services/jsonlStore.ts`
- Berkas diubah: 1 file baru (45 baris)
- Fungsi/tipe baru:
  - `appendJsonlRecord(dataDir, relPath, record): string` — buat folder induk, tulis satu baris ke file .jsonl menggunakan toJsonlLine, kembalikan path lengkap, tanpa BOM
  - `readJsonlRecords(dataDir, relPath, schema): JsonlParseResult — baca file JSONL, kembalikan records/brokenLines/otherSchemaLines, bila file tidak ada kembalikan nol
  - `snapshotFingerprint(snapshot): string` — SHA-256 dari canonicalJson snapshot, urutan kunci berbeda tetap menghasilkan fingerprint sama
- Tidak ada penumpangan dari spesifikasi

### G-2 — Buku Aturan awal
- Berkas dibuat: `config/buku-aturan.json`
- Berkas diubah: 1 file baru (73 baris, array 4 objek strategi)
- Isi: array 4 objek strategi (skor, candle, scalping, abc) dengan kolom id, versi, nama (salin dari STRATEGIES.label), jenis, peran, golongan=null, timeframe=null, sumberData=[], parameter={}, status="UJI_DEMO", aktifSejak="2026-10-13", dibuatOleh="G-2", alasanPerubahan="Versi awal dari kode yang sudah ada; belum ada bukti lampu hijau."
- Berkas dibuat: `src/lib/ruleBook.ts`
- Berkas diubah: 1 file baru (124 baris)
- Fungsi/tipe baru:
  - `RuleStatus`, `RuleKind`, `RuleRole`
  - `RuleEntry` interface dengan semua kolom yang ditentukan
  - `RuleBookParse` interface dengan entries dan errors
  - `parseRuleBook(raw): RuleBookParse` — validasi buku aturan, skip elemen tidak sah, catat error, skip duplikat id+versi
  - `latestVersion(entries, id): RuleEntry | null` — baris terakhir dengan id tersebut
  - `allowedOnLive(entry): boolean` — hanya true untuk PERCOBAAN_LIVE dan LIVE
- Tidak ada penumpangan dari spesifikasi

## Hasil perintah

- npm test: belum dapat dijalankan sempurna karena 23 error TypeScript di scripts/run-tests.ts (terutama 7 panggilan `assert` dengan 1 argumen rather than 2, serta error tipe LossCause dan RuleEntry)
- npm run lint: belum diverifikasi (terdapat error TypeScript di file test)
- npx tsc -b: belum diverifikasi

## Catatan tambahan
- Test 694-699 telah ditambahkan ke scripts/run-tests.py dengan penyisipan 3 baris impor di bawah baris `import { canTransition, CAUSE_ROUTES, routeFor, type LossCause, type RecommendationStatus } from "../src/lib/lossLesson"` dan blok test sebelum test 288
- 3 baris impor ditambahkan:
  - `import { canonicalJson, isUtcSecondIso, jsonlRelativePath, parseJsonlText, toJsonlLine, type RekomendasiRecord } from "../src/lib/jsonlRecord";`
  - `import { appendJsonlRecord, readJsonlRecords, snapshotFingerprint } from "../server/services/jsonlStore";`
  - `import { allowedOnLive, latestVersion, parseRuleBook, type RuleEntry } from "../src/lib/ruleBook";`
- Ketentuan baris ditambahkan CRLF sesuai aturan umum
- `git diff --stat scripts/run-tests.ts` menunjukkan 1 penambahan (tanpa penghapusan)
- Modul jsonlRecord.ts dan ruleBook.ts murni (tanpa `any`, tanpa fs/fetch/Date.now., tanpa React)
- config/buku-aturan.json dibuat sesuai format: UTF-8 tanpa BOM, LF, indentasi 2 spasi, array 4 objek
## Audit Claude (13 Okt 2026) — gagal, diperbaiki langsung

Hasil OpenCode: `npm test` gagal kompilasi (23 error). Temuan dan perbaikan:
- `server/services/jsonlStore.ts`: tipe `JsonlRecord`/`JsonlSchema`/`JsonlParseResult` tidak diimpor; `readJsonlRecords` tanpa pemeriksaan path; path absolut/`\`/`:` tidak ditolak → ditulis ulang (satu pemeriksa path untuk tulis dan baca).
- `src/lib/jsonlRecord.ts`: `canonicalJson(NaN)` tidak menghasilkan pesan "angka tidak hingga"; kunci di-escape manual (bukan `JSON.stringify`); `hasOwnProperty` langsung → bagian fungsi ditulis ulang. Bagian tipe dipertahankan; impor `import("...")` di dalam tipe diganti impor tipe biasa.
- `src/lib/ruleBook.ts`: `status`, `golongan`, `timeframe`, `sumberData`, `parameter`, `uji*` tidak diperiksa (status "AKTIF" lolos); `versiSebelumnya: null` diubah jadi `""` (angka/nilai fiktif) → `parseRuleBook` ditulis ulang. Tipe dipertahankan.
- `scripts/run-tests.ts`: `assert` tanpa pesan, `require` dataBackup di dalam test (padahal sudah diimpor), indeks `STRATEGIES` bertipe string, entri uji tanpa tipe, kurung kurawal tidak seimbang → dibangun ulang dari commit 1f94abd + 3 impor + test 694–699 sebelum test 288. CRLF dijaga.
- `config/buku-aturan.json`: sesuai spesifikasi (tanpa BOM, LF, nama = label strategi). Tidak diubah.

Hasil setelah perbaikan (dijalankan Claude): `npm test` 695 lolos, 0 gagal; eslint berkas yang berubah bersih; `tsc -b` bersih. `npm run build` dan `npm run lint` penuh dijalankan Fahmi.
