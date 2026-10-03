# CHANGELOG MDBKA

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

### Diketahui (deferred ke Tahap 6+)
- 10 simbol OTB pending menunggu verifikasi Specification
- Risiko JPY belum final; `maintenanceMargin` OTB placeholder
- FX rate harian ECB; Finex demo 2 simbol

## v1.0.0 — MVP Complete (2 Okt 2026)

13 simbol OTB, risk calculator, FX integration (ECB), swap dual-mode,
triple-swap Wednesday, live equity backend. Tag: `v1.0.0-stable`.
