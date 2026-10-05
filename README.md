# MDBKA — Merangkak Dari Bawah Ke Atas
Trading Education & Risk Calculator untuk MetaTrader 5 (OTB + Finex)

## 📋 Features

✅ **16 Simbol OTB** (16/16 terverifikasi ekspor CSV terminal Tahap 6E+6H)
✅ **OCR Auto-Extract** — screenshot Market Watch & Data Window → parsed otomatis
✅ **Dual Broker Support** — Finex (default) + OrbiTraderBerjangka
✅ **Risk Calculator** — equity risk %, lot recommendation, P&L projection
✅ **Swing Level Detection** — support/resistance dari CSV candle (50+)
✅ **FX Rate Live** — ECB daily rate, konversi CAD/CHF/JPY → USD
✅ **Swap Cost Calculator** — flat USD/lot (Finex) + percentage (OTB 10)
✅ **Holding Days Tracker** — intraday (0 hari) + swing (1-10 hari) holding cost
✅ **Triple-Swap Wednesday** — auto-deteksi hari Rabu × 3
✅ **Live Equity + Live Quotes** — SSE real-time dual-source (OTB + Finex), display-only
✅ **Monitor Posisi Manual** — catat posisi MT5, P&L live + sinyal exit (TP/SL/near/drift), tanpa order
✅ **Monitor Tab per Broker + Quick Exit** — tab Finex|OTB dengan counter, kartu expand per simbol, form "Tandai Keluar" (log lokal, bukan order)
✅ **Workspace per Broker** — analisa Finex & OTB tersimpan terpisah; pindah broker tak menghapus hasil
✅ **Responsive Dashboard** — sidebar live sticky desktop, stack mobile

## 🚀 Cara Pakai

### Setup
```bash
npm install
npm run dev
# Satu perintah menjalankan frontend 5173 + backend 3000 sekaligus.
# Buka http://localhost:5173
```

### Produksi / LAN
```bash
npm run build            # frontend → dist/
npm run build:backend    # backend → dist-server/
npm start                # preview 5173 + backend 3000 (butuh dist ter-build)
```
Akses non-localhost: isi `.env` (lihat `.env.example`) —
`FRONTEND_ORIGIN` untuk CORS backend, `VITE_API_BASE_URL` untuk frontend
lalu `npm run build` ulang (URL frontend dibake saat build).

### Arsip Tick Histori
Backend mengarsipkan setiap tick valid ke JSONL harian
(`data/history/{otb,finex}/ticks-YYYY-MM-DD.jsonl`, git-ignored) —
dedup otomatis, retensi default 120 hari, timestamp dinormalisasi ke UTC
(offset zona server MT5 via `MT5_TZ_OFFSET_OTB/_FINEX`).
Cakupan arsip: `GET /api/history/coverage` (per broker/simbol/rentang).
Biarkan backend jalan saat market buka agar histori terkumpul untuk
agregator candle masa depan.

### EA Pendukung (`ea/`)
- `ExportPositions.mq5` — tulis posisi open ke `positions.csv` tiap 5 dtk
  (compile di MetaEditor → drag ke chart → izinkan Algo Trading).
  Endpoint: `GET /api/positions?broker=` (Finex/OTB, 404 jujur bila EA
  belum dipasang). Posisi MT5 tampil read-only di tab monitor.

### Workflow Analisis
1. **Screenshot** → Terminal trading (Market Watch + Data Window region)
2. **Upload CSV** → Export 50+ candle dari MT5
3. **Extract Data** → OCR auto-parse + CSV swing level
4. **Pilih Broker** → Finex (default) atau OrbiTraderBerjangka
5. **Input Equity** → Dari akun trading (manual)
6. **Analisa** → Risk calculator → BELI/JUAL/TUNGGU score
7. **Holding Days** → Spinner 0-10 hari (untuk swing traders)

### Contoh: AUDCAD_ORB H1
- Bid/Ask: 0.98554 / 0.98573
- Risiko Maksimum: 10% (Rp481rb dari Rp4.8jt equity)
- Score: -2/5 TUNGGU (bearish tapi belum confirm)
- Swap 1 hari: -261 USD (dari -431.7 AUD @ XR 1.6512)

## 📊 Supported Symbols

**Finex (Default)**
- Forex: US100, GBPUSD
- (Expandable)

**OrbiTraderBerjangka (OTB)**
- Verified (16/16): GBPUSD_ORB + 10 simbol Tahap 6E + AUDCAD_ORB, EURCHF_ORB (6E-11/12) + NZDJPY_ORB, USDCHF_ORB, USDJPY_ORB (6H, preset baru dari CSV 03 Okt 2026: stops 20, step 0.10, margin 100k/100k/50k, komisi 33)
- Pending (0)

## ⚠️ Known Limitations

- **Live equity display-only** — tidak otomatis menimpa input equity manual (konfirmasi pengguna)
- **FX rate daily** — update 1x sehari (ECB), bukan real-time minute
- **Finex limited** — hanya 2 simbol untuk demo
- **OTB spread-mode** — `floating` adalah default kelas (tidak ada di ekspor CSV MT5); komisi 33/lot sesuai kolom Commission CSV

## 🛠️ Tech Stack

- React 19 + Vite + TypeScript
- OCR: regex + region-based text extraction
- CSV: Papa Parse (50+ candle validation)
- FX Rate: ECB free API (fallback hardcoded)
- Test: 453/453 lolos (zero regression)

## 🔌 Tahap 5E-STEP2: Live Equity (Node.js Backend)

### Running
```bash
npm run dev
# Frontend 5173 + backend 3000 sekaligus (satu perintah).

# Atau terpisah:
npm run dev:frontend   # Frontend 5173 saja
npm run dev:backend    # Backend 3000 saja (tsx watch server/index.ts)
```

### MT5 Integration
- Backend memantau log MT5 di `process.env.MT5_LOG_PATH`
  (file `.log` atau direktori `logs/`; default
  `AppData\Roaming\MetaTrader 5`). Lihat `.env.example`.
- Real-time balance/equity via SSE ke frontend, fallback polling
  5 dtk bila SSE putus. Tanpa log valid → API 404 (tanpa crash).
- Panel `LiveEquity` tampil di hasil analisa (info-only, tidak
  mengubah keputusan BELI/JUAL/TUNGGU maupun lot).

### API
- GET `/api/equity/latest` — snapshot terakhir (404 bila belum ada data)
- GET `/api/equity/stream` — SSE stream + heartbeat 30 dtk
- GET `/health` — liveness probe

## 🔌 Tahap 5E-STEP3: Live Quotes + Dual-Source (OTB + Finex)

- EA MT5 menulis `quotes.csv` (`Timestamp,Symbol,Bid,Ask`) per tick di tiap terminal
- Backend me-resolve sumber via `?broker=finex|orbitraderberjangka` (absen = default OTB, unknown = 400, belum dikonfigurasi = 404 — tanpa fallback diam)
- Env: `QUOTES_LOG_PATH` (OTB) + `QUOTES_LOG_PATH_FINEX` / `MT5_LOG_PATH_FINEX` (opsional, lihat `.env.example`)
- Ganti broker di UI me-reset snapshot live + hasil analisa lama (tanpa data basi lintas broker)

## 📝 Version

v1.0.1 — Tahap 5E Complete: dual-source live + responsive dashboard (3 Okt 2026)
v1.0.0 — MVP Complete (2 Okt 2026)

## 📧 Usage Notes

- Aplikasi pribadi (local, tidak cloud)
- Zero impact ke Finex MT5 (independen 100%)
- Safe unlimited trading, tanpa batasan waktu
- Documentation: lihat code comment di `/src`
