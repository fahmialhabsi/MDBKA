# CHANGELOG MDBKA

## v1.0.11-p2-freshness — Label Data-Basi Live (4 Okt 2026)

P2: panel LiveQuotes/LiveEquity menampilkan umur data + "data basi"
bila tick berhenti (>15 mnt tanpa payload baru atau snapshot >12 jam).
Anti-timezone: umur dari jam klien, bukan timestamp server MT5
(akhir pekan otomatis basi). Helper murni `src/lib/dataFreshness.ts`
+ `useNow`. **421/421 tests lolos** (418 + 422/423/424).

## v1.0.10-prod — Jalur Produksi + URL via Env (4 Okt 2026)

P0: base URL backend frontend via `VITE_API_BASE_URL`
(`src/lib/apiBaseUrl.ts`, CJS-safe tanpa import.meta; fallback localhost)
+ CORS backend via `FRONTEND_ORIGIN` (fallback localhost:5173).
P1: script `start`/`start:frontend`/`start:backend`
(`node dist-server/index.js` terverifikasi serve /health),
`.env.example` + README produksi/LAN.
**418/418 tests lolos** (415 + 419/420/421), lint clean, build OK.

## v1.0.9-tahap6h — 3 Preset Baru, 16/16 OTB (4 Okt 2026)

Tahap 6H: preset baru NZDJPY_ORB, USDCHF_ORB, USDJPY_ORB dari ekspor CSV
terminal (stops 20, step 0.10, margin 100k/100k/50k, Forex, komisi 33,
swap percentage sesuai CSV). Dropdown + gate 13 → 16/16 verified.
**415/415 tests lolos** (412 + 416/417/418 preset baru), zero regression.

## v1.0.8-tahap6g — Komisi Broker + Margin Getter (4 Okt 2026)

Keputusan broker dari CSV terminal 03 Okt 2026 (kolom Commission):
spec32 OTB 0.00 → **33.00 USD/lot**, Finex tanpa auto-fill → default
**1.00 USD/lot** (`FINEX_DEFAULT_COMMISSION`, override manual kept).
Validator komisi 33 kini konsisten tanpa warning untuk semua 13 simbol.
Baru: `getOtbMarginRequirements()` (data-layer display-only,
100000/100000/50000; decision engine tidak tersentuh).
**412/412 tests lolos** (410 + 414 margin + 415 matriks komisi).

## v1.0.7-tahap6e-final — 13/13 OTB Verified (4 Okt 2026)

Tahap 6E-11/12: AUDCAD_ORB + EURCHF_ORB dikonfirmasi dari 9 kolom baru
ekspor CSV terminal OTB (Stops_Level=20, Volume_Step=0.10, margin
100000/100000/50000, Forex, profit=quote, margin=USD, komisi 33.00).
Gate `VERIFIED_OTB_SYMBOLS`: 11 → 13/13, tidak ada pending tersisa.
Validator komisi 33 kini aktif untuk AUDCAD (test 246 diperbarui).
**410/410 tests lolos** (407 + 3 JPY 6F-1), zero regression.

## v1.0.5-tahap6e — Verifikasi 10 Simbol OTB (4 Okt 2026)

Tahap 6E: 10 simbol `_ORB` pending dikonfirmasi dari ekspor CSV terminal
OTB 03 Okt 2026 (digits, tickSize, swap long/short, min/max volume cocok
semua; komisi 33/lot dipertahankan, kolom Commission=0.00 CSV dianggap
tidak berlaku). Gate `VERIFIED_OTB_SYMBOLS`: 1 → 11
(GBPUSD + AUDCHF, AUDJPY, AUDNZD, AUDUSD, CADJPY, CHFJPY, EURAUD, EURCAD,
GBPAUD, USDCAD). Tersisa AUDCAD + EURCHF pending (field default kelas
menunggu jendela Specification). **407/407 tests lolos, zero regression.**

## v1.0.4-tahap6d — Spec32 Integration, 16 OTB (4 Okt 2026)

Tahap 6D OPSI 2: integrasi spec32 + 16 simbol OTB terverifikasi
(commission=0). HEAD `d968efe`. **407/407 tests lolos, zero regression.**

### Ditambahkan
- `src/lib/instrumentSpecs32.ts` — 32 instrument specs (data foundation Tahap 6B)
- `src/lib/jpySwapCalculator.ts` — formula swap JPY
- `src/lib/spec32Wiring.ts` + adapter layer Tahap 6C (parallel preview wiring, non-breaking)
- Tahap 6D: spec32 integration, 16 OTB verified
- Safety gate swap unverified di presentasi + label PENDING (Tahap 6A)

### Progres test
- v1.0.1: 349/349 → v1.0.2-tahap6-final: 382/382 → v1.0.3-tahap6c-safe: 397/397 → v1.0.4-tahap6d: 407/407

## v1.0.1 — Tahap 5E Complete (3 Okt 2026)

Dual-source live + responsive dashboard. **Tanpa breaking changes** — semua
perubahan aditif dan backward-compatible; tidak perlu migrasi dari v1.0.0.

### Ditambahkan
- Dual-source live MT5 (OTB + Finex): `server/types/liveSource.ts` resolver
  `?broker=finex|orbitraderberjangka` (400 unknown, 404 belum dikonfigurasi)
- Env `MT5_LOG_PATH_FINEX` + `QUOTES_LOG_PATH_FINEX` (opsional, fail-closed)
- Field opsional snapshot equity: `account`, `leverage`, `margin`,
  `freeMargin`, `marginLevel` + metrik turunan display-only di LiveEquity
- Sidebar live sticky (LiveQuotes + LiveEquity mengikuti `activeBrokerId`)
- Layout responsif: desktop 320px / tablet 300px / mobile stack full-width
- Stale-reset: ganti broker/simbol me-reset snapshot live + hasil analisa
- 8 test isolasi broker Finex (total 349/349 lolos, append-only)

### Diperbaiki
- Penomoran suite async bersifat lokal-suite (klarifikasi komentar)

### Diketahui (update 6G: tidak ada pending OTB tersisa)
- spreadMode floating = default kelas (tidak ada di ekspor CSV MT5)
- Harga quote JPY dinormalisasi ke invers di jalur percentage (6F-1);
  margin OTB tersedia via getter display-only (6G)
- FX rate harian ECB; Finex demo 2 simbol

## v1.0.0 — MVP Complete (2 Okt 2026)

13 simbol OTB, risk calculator, FX integration (ECB), swap dual-mode,
triple-swap Wednesday, live equity backend. Tag: `v1.0.0-stable`.
