# MDBKA — Merangkak Dari Bawah Ke Atas
Trading Education & Risk Calculator untuk MetaTrader 5 (OTB + Finex)

## 📋 Features

✅ **13 Simbol OTB** (13/13 terverifikasi ekspor CSV terminal Tahap 6E)
✅ **OCR Auto-Extract** — screenshot Market Watch & Data Window → parsed otomatis
✅ **Dual Broker Support** — Finex (default) + OrbiTraderBerjangka
✅ **Risk Calculator** — equity risk %, lot recommendation, P&L projection
✅ **Swing Level Detection** — support/resistance dari CSV candle (50+)
✅ **FX Rate Live** — ECB daily rate, konversi CAD/CHF/JPY → USD
✅ **Swap Cost Calculator** — flat USD/lot (Finex) + percentage (OTB 10)
✅ **Holding Days Tracker** — intraday (0 hari) + swing (1-10 hari) holding cost
✅ **Triple-Swap Wednesday** — auto-deteksi hari Rabu × 3
✅ **Live Equity + Live Quotes** — SSE real-time dual-source (OTB + Finex), display-only
✅ **Responsive Dashboard** — sidebar live sticky desktop, stack mobile

## 🚀 Cara Pakai

### Setup
```bash
npm install
npm run dev
# Buka http://localhost:5173
```

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
- Verified (13/13): GBPUSD_ORB + 10 simbol Tahap 6E (AUDCHF, AUDJPY, AUDNZD, AUDUSD, CADJPY, CHFJPY, EURAUD, EURCAD, GBPAUD, USDCAD) + AUDCAD_ORB, EURCHF_ORB (Tahap 6E-11/12: stops 20, step 0.10, margin 100k/100k/50k, komisi 33 — dikonfirmasi ekspor CSV terminal 03 Okt 2026)
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
- Test: 412/412 lolos (zero regression)

## 🔌 Tahap 5E-STEP2: Live Equity (Node.js Backend)

### Running
```bash
# Terminal 1+2 sekaligus:
npm run dev:both

# Atau terpisah:
npm run dev              # Frontend 5173
npm run dev:backend      # Backend 3000 (tsx watch server/index.ts)
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
