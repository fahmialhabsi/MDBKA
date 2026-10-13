# Tahap 02 — Fondasi catatan: format JSONL, bukti backup, Buku Aturan

**Fase:** 0 (tidak mengubah perilaku apa pun). **Nomor test:** 694–699. **Target akhir:** 695 lolos, 0 gagal.
**Tidak boleh disentuh di tahap ini:** semua berkas di aturan umum bagian 2 butir 1, ditambah `server/services/dataBackup.ts`, `server/index.ts`, `server/app.ts`, semua `server/routes/*`, `src/lib/strategyRegistry.ts` (hanya boleh diimpor).
**Belum ada yang menulis catatan di tahap ini.** Tahap ini hanya membuat format, alat tulis/baca, dan buku aturan. Pemakai pertamanya ada di tahap 03–05.

Urutan pengerjaan: G-1a → G-1b → G-6 → G-2.

Rancangan: `docs/RANCANGAN-2026-10-13-fondasi-data-dan-jalur-live.md` bagian C2, G1, G2, G4, G5; `docs/RANCANGAN-2026-10-13-tim-akun-tab-indikator.md` bagian 7, 11.1, 12.

---

## G-1a — Tipe dan format JSONL (modul murni)

**Berkas baru:** `src/lib/jsonlRecord.ts` (murni: tanpa `fs`, tanpa `crypto`, tanpa `Date.now()`).

**Impor yang dipakai (sudah ada):**
- `type BrokerId` dari `src/types/broker.ts` (`"finex" | "orbitraderberjangka" | "mifx" | "exness"`)
- `type ScanStatus` dari `src/lib/symbolScanner.ts`
- `type GuardClass` dari `src/lib/guardClass.ts`
- `type ShadowOutcome` dari `src/lib/shadowTrade.ts`
- `type LossCause`, `type RecommendationStatus`, `type RecommendationTarget` dari `src/lib/lossLesson.ts`

**Tipe (tulis persis):**

```ts
/** G-1 (13 Okt 2026) — format catatan JSONL append-only (fondasi G5). Murni. */
export type JsonlSchema = "keputusan/1" | "bayangan/1" | "rekomendasi/1" | "laporan_tim/1";
export type JsonlTable = "keputusan" | "bayangan" | "rekomendasi" | "laporan";

export type GuardResult = "LULUS" | "GAGAL" | "TIDAK_DINILAI";

export interface GuardEntry {
  readonly nama: string;
  readonly hasil: GuardResult;
  readonly kodeAlasan: string | null;
  readonly sumberData: string | null;
  readonly umurDataDetik: number | null;
}

export interface DecisionInputs {
  readonly bid: number | null;
  readonly ask: number | null;
  readonly umurKuotasiDetik: number | null;
  readonly candleTerakhir: string | null;
  readonly jumlahCandle: number | null;
  readonly ma50: number | null;
  readonly rsi: number | null;
  readonly cci: number | null;
  readonly macd: number | null;
  readonly atr: number | null;
  readonly kursUsdIdr: number | null;
  readonly tanggalKurs: string | null;
  readonly equity: number | null;
}

export interface DecisionOutcome {
  readonly status: ScanStatus | null;
  readonly keputusan: "BELI" | "JUAL" | "TUNGGU";
  readonly arahAsli: "BELI" | "JUAL" | "TUNGGU" | null;
  readonly entry: number | null;
  readonly sl: number | null;
  readonly tp: number | null;
  readonly lot: number | null;
  readonly risikoUsd: number | null;
  readonly risikoRp: number | null;
  readonly porsiBiaya: number | null;
  readonly kodeAlasanUtama: string | null;
}

export interface KeputusanRecord {
  readonly skema: "keputusan/1";
  readonly keputusanId: string;
  readonly jalur: "pemindai" | "hasil" | "entry" | "backtest";
  readonly waktuUtc: string | null;
  readonly waktuServer: string | null;
  readonly waktuDiterima: string | null;
  readonly broker: BrokerId;
  readonly login: string | null;
  readonly jenisAkun: "demo" | "live" | "tidak-terbukti";
  readonly setaraLive: boolean | null;
  readonly simbol: string;
  readonly golongan: string | null;
  readonly versiSpesifikasi: string | null;
  readonly aturanId: string;
  readonly versi: string;
  readonly sidikJariSnapshot: string | null;
  readonly masukan: DecisionInputs;
  readonly kualitasData: readonly GuardEntry[];
  readonly penjaga: readonly GuardEntry[];
  readonly hasil: DecisionOutcome;
  readonly sumber: "live" | "csv" | "ocr" | "manual";
  readonly diubahManual: readonly string[];
  readonly mengoreksi: string | null;
}

export interface BayanganRecord {
  readonly skema: "bayangan/1";
  readonly bayanganId: string;
  /** Satu baris saat dibuat (DIBUAT), satu baris saat selesai (SELESAI). */
  readonly fase: "DIBUAT" | "SELESAI";
  readonly waktuUtc: string;
  readonly broker: BrokerId;
  readonly login: string | null;
  readonly simbol: string;
  readonly golongan: string | null;
  readonly arah: "BELI" | "JUAL";
  readonly waktuSinyalServer: string;
  readonly entry: number;
  readonly sl: number;
  readonly tp: number;
  readonly lotTeoretis: number | null;
  readonly porsiBiaya: number | null;
  readonly ditahanOleh: ScanStatus;
  readonly kelasPenjaga: GuardClass;
  readonly aturanId: string;
  readonly versi: string;
  readonly hasil: ShadowOutcome | null;
  readonly waktuKeluarServer: string | null;
  readonly hargaKeluar: number | null;
  readonly r: number | null;
  readonly mfeR: number | null;
  readonly maeR: number | null;
  readonly mengoreksi: string | null;
}

export interface RekomendasiRecord {
  readonly skema: "rekomendasi/1";
  readonly rekomendasiId: string;
  readonly waktuUtc: string;
  readonly sebab: LossCause;
  readonly rekomendasi: string;
  readonly penerima: readonly RecommendationTarget[];
  readonly status: RecommendationStatus;
  readonly sumberJenis: "rangkaian" | "bayangan" | "uji";
  readonly sumberId: string;
  readonly broker: BrokerId | null;
  readonly simbol: string | null;
  readonly golongan: string | null;
  readonly catatan: string | null;
  readonly mengoreksi: string | null;
}

export interface LaporanTimRecord {
  readonly skema: "laporan_tim/1";
  readonly laporanId: string;
  readonly login: string;
  readonly broker: BrokerId;
  readonly jenisAkun: "demo" | "live" | "tidak-terbukti";
  readonly tim: string;
  readonly jendelaMulaiUtc: string;
  readonly jendelaSelesaiUtc: string;
  readonly sumberData: readonly { readonly berkas: string; readonly umurDetik: number | null }[];
  readonly kualitasData: readonly GuardEntry[];
  readonly temuan: readonly string[];
  readonly kejadianPenting: boolean;
  readonly diserahkanKe: readonly string[];
  readonly mengoreksi: string | null;
}

export type JsonlRecord = KeputusanRecord | BayanganRecord | RekomendasiRecord | LaporanTimRecord;

export interface JsonlParseResult {
  readonly records: readonly Record<string, unknown>[];
  readonly brokenLines: number;
  readonly otherSchemaLines: number;
}
```

**Fungsi (tulis persis tanda tangannya):**

1. `export function canonicalJson(value: unknown): string`
   - Objek: kunci diurutkan abjad (`Object.keys(...).sort()`), rekursif. Properti bernilai `undefined` dilewati (seperti `JSON.stringify`).
   - Array: urutan tetap; `undefined` di dalam array ditulis `null`.
   - Tanpa spasi. String dan boolean dan `null` memakai `JSON.stringify`.
   - Angka tidak hingga (`NaN`, `Infinity`) → **lempar `Error`** berisi `"angka tidak hingga"`. Jangan diam-diam diubah jadi `null` (aturan tanpa angka fiktif).
   - Tipe lain (fungsi, `bigint`, `symbol`) → lempar `Error`.
2. `export function toJsonlLine(record: JsonlRecord): string` → `canonicalJson(record)`. Tanpa `"\n"` di akhir.
3. `export function isUtcSecondIso(text: string): boolean` → `true` hanya untuk pola `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$`.
4. `export function jsonlRelativePath(table: JsonlTable, key: string | null, utcIso: string): string`
   - `utcIso` wajib lolos `isUtcSecondIso`, bila tidak → lempar `Error`. Bulan = `utcIso.slice(0, 7)`.
   - `key` wajib cocok `^[A-Za-z0-9_-]+$` untuk `keputusan`, `bayangan`, `laporan` (bila tidak, atau `null` → lempar `Error`). Untuk `rekomendasi`, `key` diabaikan.
   - Hasil (pemisah selalu `/`):
     - `keputusan` → `keputusan/keputusan-<key>-<YYYY-MM>.jsonl` (key = broker)
     - `bayangan` → `bayangan/bayangan-<key>-<YYYY-MM>.jsonl` (key = broker)
     - `laporan` → `laporan/laporan-<key>-<YYYY-MM>.jsonl` (key = login)
     - `rekomendasi` → `rekomendasi/rekomendasi.jsonl`
5. `export function parseJsonlText(text: string, schema: JsonlSchema): JsonlParseResult`
   - Pisah baris dengan `/\r?\n/`. Baris kosong/spasi saja dilewati (tidak dihitung).
   - Baris yang gagal `JSON.parse`, atau hasilnya bukan objek biasa (array/null/angka), atau tidak punya `skema` bertipe string → `brokenLines + 1`.
   - `skema` string tetapi berbeda dari `schema` → `otherSchemaLines + 1`.
   - Sisanya masuk `records` sesuai urutan berkas. Jangan melempar error.

**Test 694 — `canonicalJson` dan `toJsonlLine`:**
- `canonicalJson({ b: 1, a: [2, { d: null, c: "x" }] })` === `'{"a":[2,{"c":"x","d":null}],"b":1}'`.
- `canonicalJson({ a: 1, b: undefined })` === `'{"a":1}'`.
- Dua objek dengan isi sama tetapi urutan kunci berbeda menghasilkan teks yang sama.
- `canonicalJson({ a: Number.NaN })` melempar error yang pesannya memuat `"angka tidak hingga"` (tangkap dengan `catch (error)` lalu `error instanceof Error`; **dilarang** `catch (e: any)`).
- `toJsonlLine` untuk satu `RekomendasiRecord` contoh (sebab `"BIAYA_BESAR"`, penerima `["T-PELUANG", "T-BIAYA"]`, status `"DIUSULKAN"`, `sumberJenis "bayangan"`, `sumberId "b-1"`, `waktuUtc "2026-10-13T05:00:00Z"`, kolom lain `null`, `rekomendasiId "r-1"`, `rekomendasi "Data untuk ambang biaya per golongan"`) tidak memuat `"\n"` dan `JSON.parse` hasilnya punya `skema === "rekomendasi/1"`.

**Test 695 — `jsonlRelativePath`:**
- `("keputusan", "finex", "2026-10-12T00:27:27Z")` → `"keputusan/keputusan-finex-2026-10.jsonl"`.
- `("bayangan", "orbitraderberjangka", "2026-11-01T00:00:00Z")` → `"bayangan/bayangan-orbitraderberjangka-2026-11.jsonl"`.
- `("laporan", "61823011", "2026-10-13T05:00:00Z")` → `"laporan/laporan-61823011-2026-10.jsonl"`.
- `("rekomendasi", null, "2026-10-13T05:00:00Z")` → `"rekomendasi/rekomendasi.jsonl"`.
- `isUtcSecondIso("2026-10-12T00:27:27Z") === true`; `isUtcSecondIso("2026-10-12 00:27:27") === false`.
- Melempar error untuk: key `"../x"`, key `null` pada `keputusan`, waktu `"2026.10.12 02:27:27"`, waktu `"2026-10-12T00:27:27.000Z"`.

**Test 696 — `parseJsonlText`:** teks dengan CRLF berisi 6 baris: 2 baris `keputusan/1` sah, 1 baris kosong, 1 baris `{"skema":"bayangan/1"}`, 1 baris terpotong `{"skema":"keputusan/1","x":`, 1 baris `[1,2]`. Harapan: `records.length === 2` (urutan sama), `brokenLines === 2`, `otherSchemaLines === 1`.

---

## G-1b — Alat tulis/baca JSONL di server

**Berkas baru:** `server/services/jsonlStore.ts`. Ikuti gaya impor `server/services/tradeEntryLog.ts` (`node:fs`, `node:path`) dan tambahkan `node:crypto`.

```ts
/** G-1 (13 Okt 2026) — penulis/pembaca JSONL append-only (fondasi G5). Satu penulis: proses server. */
export function appendJsonlRecord(dataDir: string, relPath: string, record: JsonlRecord): string;
export function readJsonlRecords(dataDir: string, relPath: string, schema: JsonlSchema): JsonlParseResult;
export function snapshotFingerprint(snapshot: unknown): string;
```

- `relPath` wajib: tidak absolut, tidak memuat segmen `..`, memakai `/`, berakhiran `.jsonl`. Bila tidak → lempar `Error`. Gabungkan dengan `path.join(dataDir, ...relPath.split("/"))`.
- `appendJsonlRecord`: buat folder induk (`mkdirSync(..., { recursive: true })`), lalu **satu kali** `appendFileSync(file, toJsonlLine(record) + "\n", "utf8")`. Kembalikan path lengkap berkas. Tanpa BOM.
- `readJsonlRecords`: berkas tidak ada → `{ records: [], brokenLines: 0, otherSchemaLines: 0 }`. Ada → `parseJsonlText(readFileSync(file, "utf8"), schema)`.
- `snapshotFingerprint`: `createHash("sha256").update(canonicalJson(snapshot), "utf8").digest("hex")`.

**Test 697** (folder sementara, pola test 507: `require("node:os")`, `require("node:fs")`, `require("node:path")`, `fs.mkdtempSync(path.join(os.tmpdir(), "jsonl-"))`):
- Tulis 2 `RekomendasiRecord` ke `jsonlRelativePath("rekomendasi", null, "2026-10-13T05:00:00Z")`. Lalu tambahkan secara manual (`fs.appendFileSync`) satu baris rusak `{"skema":` + `"\n"`.
- `readJsonlRecords(...)` → `records.length === 2`, `brokenLines === 1`.
- Berkas tidak diawali BOM dan setiap baris diakhiri `"\n"` (bukan `"\r\n"`).
- `appendJsonlRecord(dir, "../luar.jsonl", rec)` melempar error dan berkas `luar.jsonl` tidak tercipta di folder induk.
- `readJsonlRecords(dir, "bayangan/tidak-ada.jsonl", "bayangan/1")` → kosong, 0, 0.
- `snapshotFingerprint({ b: 1, a: [2, { d: null, c: "x" }] })` === `"41f05899d3459a3ecc94ff088afcd290b9ae4f51dc9ddaa35a82a642ddb55070"` (SHA-256 dari teks kanonik di test 694, sudah dihitung).
- `snapshotFingerprint` untuk urutan kunci berbeda menghasilkan nilai sama.

---

## G-6 — Bukti folder baru ikut Backup

**Fakta kode (sudah diperiksa):** `getBackupStatus(dataDir, backupDir)` dan `runBackup` di `server/services/dataBackup.ts` menelusuri **seluruh** isi `data/` secara rekursif kecuali folder `history/`. Jadi folder `keputusan/`, `bayangan/`, `rekomendasi/`, `laporan/` **otomatis** ikut. **Jangan ubah `dataBackup.ts`.** Langkah ini hanya test pengunci.

**Test 698** (folder sementara `backup-g6-`): buat `data/keputusan/keputusan-finex-2026-10.jsonl`, `data/bayangan/bayangan-finex-2026-10.jsonl`, `data/rekomendasi/rekomendasi.jsonl`, `data/laporan/laporan-61823011-2026-10.jsonl` (isi apa saja satu baris), dan `data/history/finex/ticks-2026-10-12.jsonl`. Folder backup kosong (belum pernah backup). Harapan `getBackupStatus(dataDir, backupDir)`: `changedFiles === 4`, `historyPending === 1`, `due === true`. `getBackupStatus` sudah diimpor di `run-tests.ts` (jangan impor ulang).

---

## G-2 — Buku Aturan awal

### Berkas data: `config/buku-aturan.json`

UTF-8 tanpa BOM, LF, indentasi 2 spasi. Isi: **array** 4 objek, satu per strategi yang sudah ada di `STRATEGIES` (`src/lib/strategyRegistry.ts`), urutan `skor`, `candle`, `scalping`, `abc`. Setiap objek:

| Kolom | Nilai |
| --- | --- |
| `id` | id strategi |
| `versi` | `"1"` |
| `nama` | **salin persis** `label` dari `STRATEGIES[id].label` (jangan diketik ulang dari ingatan; baca berkasnya) |
| `jenis` | `"strategi"` |
| `peran` | `"setup"` |
| `golongan` | `null` (belum ditetapkan) |
| `timeframe` | `null` (belum ditetapkan) |
| `sumberData` | `[]` |
| `parameter` | `{}` |
| `status` | `"UJI_DEMO"` (belum ada bukti 3 lampu hijau untuk strategi mana pun) |
| `aktifSejak` | `"2026-10-13"` |
| `dibuatOleh` | `"G-2"` |
| `alasanPerubahan` | `"Versi awal dari kode yang sudah ada; belum ada bukti lampu hijau."` |
| `ujiSebelum` | `null` |
| `ujiSesudah` | `null` |
| `versiSebelumnya` | `null` |

### Modul murni: `src/lib/ruleBook.ts`

```ts
/** G-2 (13 Okt 2026) — Buku Aturan berversi: tipe + pembaca. Murni. */
export type RuleStatus = "UJI_DEMO" | "PERCOBAAN_LIVE" | "LIVE" | "DICABUT";
export type RuleKind = "strategi" | "fitur" | "penjaga";
export type RuleRole = "setup" | "konteks" | "penahan";

export interface RuleEntry {
  readonly id: string;
  readonly versi: string;
  readonly nama: string;
  readonly jenis: RuleKind;
  readonly peran: RuleRole;
  readonly golongan: readonly string[] | null;
  readonly timeframe: Readonly<Record<string, string>> | null;
  readonly sumberData: readonly string[];
  readonly parameter: Readonly<Record<string, number | string | boolean | null>>;
  readonly status: RuleStatus;
  readonly aktifSejak: string;
  readonly dibuatOleh: string;
  readonly alasanPerubahan: string;
  readonly ujiSebelum: Readonly<Record<string, number | null>> | null;
  readonly ujiSesudah: Readonly<Record<string, number | null>> | null;
  readonly versiSebelumnya: string | null;
}

export interface RuleBookParse {
  readonly entries: readonly RuleEntry[];
  readonly errors: readonly string[];
}

export function parseRuleBook(raw: unknown): RuleBookParse;
export function latestVersion(entries: readonly RuleEntry[], id: string): RuleEntry | null;
export function allowedOnLive(entry: RuleEntry): boolean;
```

- `parseRuleBook`: `raw` harus array, bila tidak → `entries: []`, satu error. Setiap elemen diperiksa kolom wajibnya (tipe dan enum sesuai `RuleEntry`; `aktifSejak` pola `YYYY-MM-DD`). Elemen tidak sah **dilewati** dan dicatat di `errors` dengan nomor urutnya (mulai 1). Pasangan `id`+`versi` ganda → elemen kedua dilewati + error. Tanpa `any`; periksa memakai `typeof` dan `Array.isArray`.
- `latestVersion`: baris **terakhir** di array dengan `id` itu (versi baru = baris baru), atau `null`.
- `allowedOnLive`: `true` hanya untuk `PERCOBAAN_LIVE` dan `LIVE`.

**Test 699:**
- `parseRuleBook(JSON.parse(readSrc("config/buku-aturan.json")))` → `errors.length === 0`, `entries.length === 4`; id berurutan sama dengan `STRATEGY_IDS`; setiap `nama === STRATEGIES[id].label`; semua `status === "UJI_DEMO"`; semua `allowedOnLive(...) === false`. (`STRATEGIES`, `STRATEGY_IDS` sudah diimpor di `run-tests.ts`; jangan impor ulang.)
- `parseRuleBook({})` → 0 entri, 1 error.
- Array berisi satu entri sah, satu entri dengan `status: "AKTIF"`, dan duplikat `id`+`versi` dari entri sah → 1 entri, 2 error.
- `latestVersion` pada dua baris `skor` versi `"1"` dan `"2"` → versi `"2"`; id tak dikenal → `null`.

---

## Cara menambah test (WAJIB, berbeda dari tahap 01)

1. **Dilarang menulis ulang `scripts/run-tests.ts` utuh.** Gunakan penyisipan teks saja.
2. **Impor:** tambahkan tepat 3 baris baru, langsung **di bawah** baris yang persis berbunyi
   `import { canTransition, CAUSE_ROUTES, routeFor, type LossCause, type RecommendationStatus } from "../src/lib/lossLesson";`
   - `import { canonicalJson, isUtcSecondIso, jsonlRelativePath, parseJsonlText, toJsonlLine, type RekomendasiRecord } from "../src/lib/jsonlRecord";`
   - `import { appendJsonlRecord, readJsonlRecords, snapshotFingerprint } from "../server/services/jsonlStore";`
   - `import { allowedOnLive, latestVersion, parseRuleBook, type RuleEntry } from "../src/lib/ruleBook";`
   (Hapus nama yang tidak terpakai dari baris impor bila lint mengeluh.)
3. **Test 694–699:** sisipkan **tepat sebelum** baris yang diawali
   `test("288. parseECBXml()`
   (baris itu ada tepat setelah blok test 693). Jangan menyentuh test 288 atau baris sesudahnya.
4. Semua baris yang ditambahkan memakai **CRLF**.
5. Setelah selesai, jalankan `git diff --stat scripts/run-tests.ts`. Hasil yang benar: hanya **penambahan** (sekitar 3 baris impor + blok test), **0 penghapusan**. Bila ada penghapusan, perbaikan Anda salah: kembalikan dan ulangi. Tulis keluaran perintah itu di laporan.

## Selesai tahap

- `npm test`: **695 lolos, 0 gagal.** Commit terakhir (21c20fe) lolos 689 test, jadi setiap error yang muncul berasal dari perubahan tahap ini. Jangan menulis "error sudah ada sebelumnya".
- `npm run lint`: tanpa error.
- `npx tsc -b`: tanpa error.
- Tulis `docs/OPENCODE/LAPORAN-TAHAP-02.md` (format aturan umum bagian 6), termasuk keluaran `git diff --stat`.
- Jangan commit.
