"""Uji riset 3 strategi versi MDBKA (rancangan docs/RANCANGAN-2026-10-16-strategi-versi-mdbka.md).

Angka dibekukan & disetujui Fahmi 16 Okt 2026 09:44 WIT. Riset saja — decisionEngine.ts tidak diubah.
Pakai: python strategi_versi_mdbka_bt.py <folder Common Files> <spec.csv> <audit-skor.csv>
  spec.csv  : symbol,spread,pointValue,commission,minLot,timeStop,group (dibuat dari kode MDBKA, preset Finex)
  audit csv : berkas perkara strategi skor (npm run backtest -- --equity 758 --simpan-audit) — bahan F-1.
Aturan uji bersama:
  - candle H1 = harga bid; ask = bid + spread (Margin Finex); biaya komisi = commission / pointValue (harga).
  - SL & TP di candle sama -> SL. Candle masuk ikut dicek SL (hati-hati), TP baru dari candle berikutnya.
  - satu posisi per simbol. Latih < 2025.10.14 13:48 (jam server), ujian sesudahnya, 7 blok.
  - ATR H1 = rata-rata sederhana True Range 14 candle yang SUDAH tutup. MA50 = SMA50 close.
  - D1 dirakit dari H1 per tanggal server Finex (tutup harian NY 17:00 = 00:00 server); hanya hari yang sudah tutup.
  - Gerbang biaya: biaya pulang-pergi <= 10% jarak SL.
Batas: "Perahu layak" (lot minimum vs risiko akun), satpam berita/sesi/korelasi tidak ikut diuji; hasil dalam R.
"""
import sys
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

LATIH_AKHIR = pd.Timestamp("2025-10-14 13:48")
NY = ZoneInfo("America/New_York")


def load(folder, sym):
    d = pd.read_csv(f"{folder}/MDBKA_{sym}_H1_LONG.csv")
    d["t"] = pd.to_datetime(d.time, format="%Y.%m.%d %H:%M")
    d = d.drop_duplicates("t").sort_values("t").reset_index(drop=True)
    pc = d.close.shift(1)
    tr = pd.concat([d.high - d.low, (d.high - pc).abs(), (d.low - pc).abs()], axis=1).max(axis=1)
    d["atr"] = tr.rolling(14).mean().shift(1)  # ATR candle yang sudah tutup sebelum candle ini
    d["ma50"] = d.close.rolling(50).mean()
    d["rng"] = d.high - d.low
    d["day"] = d.t.dt.normalize()
    daily = d.groupby("day").agg(h=("high", "max"), l=("low", "min"), c=("close", "last"))
    daily["sma20"] = daily.c.rolling(20).mean()
    daily["sma20_5"] = daily.sma20.shift(5)
    prev = daily.shift(1)  # nilai hari KEMARIN (sudah tutup)
    d = d.join(prev.rename(columns=lambda c: "d1_" + c), on="day")
    ny = (d.t - pd.Timedelta(hours=7)).dt.tz_localize(NY, ambiguous="NaT", nonexistent="shift_forward")
    d["utc_h"] = ny.dt.tz_convert("UTC").dt.hour
    # hari terakhir per tanggal (untuk cek musim berganti P-1)
    d["last_of_day"] = d.day != d.day.shift(-1)
    return d, daily


def musim(row):
    if pd.isna(row.d1_sma20) or pd.isna(row.d1_sma20_5):
        return ""
    if row.d1_c > row.d1_sma20 and row.d1_sma20 > row.d1_sma20_5:
        return "BELI"
    if row.d1_c < row.d1_sma20 and row.d1_sma20 < row.d1_sma20_5:
        return "JUAL"
    return ""


def simulate(d, i0, beli, entry, sl, tp, sp, max_bars, check_entry_candle, be_at_1r=False, d1_exit=None):
    """Mulai cek dari candle i0 (candle masuk bila check_entry_candle). Kembalikan (keluar, cara, idx)."""
    risk = abs(entry - sl)
    cur_sl, n = sl, len(d)
    H, L, C, O = d.high.values, d.low.values, d.close.values, d.open.values
    start = i0 if check_entry_candle else i0 + 1
    held = 0
    for k in range(start, n):
        first = k == i0
        if not first:
            held += 1
        h, l = H[k], L[k]
        if beli:
            if l <= cur_sl:
                return min(cur_sl, O[k]) if not first else cur_sl, "SL" if cur_sl != entry else "IMPAS", k
            if not first and h >= tp:
                return max(tp, O[k]) if O[k] > tp else tp, "TP", k
            if be_at_1r and not first and h >= entry + risk:
                cur_sl = max(cur_sl, entry)
        else:
            if h + sp >= cur_sl:
                return max(cur_sl, O[k] + sp) if not first else cur_sl, "SL" if cur_sl != entry else "IMPAS", k
            if not first and l + sp <= tp:
                return min(tp, O[k] + sp) if O[k] + sp < tp else tp, "TP", k
            if be_at_1r and not first and l + sp <= entry - risk:
                cur_sl = min(cur_sl, entry)
        if d1_exit is not None and not first and d1_exit(k):
            return (C[k] if beli else C[k] + sp), "MUSIM", k
        if max_bars is not None and held >= max_bars:
            return (C[k] if beli else C[k] + sp), "WAKTU", k
    return None, "TERBUKA", n - 1


def r_of(beli, entry, keluar, risk, com):
    return ((keluar - entry) if beli else (entry - keluar)) / risk - com / risk


def mancing(sym, d, spec):
    sp, com = spec.spread, spec.commission / spec.pointValue
    out, free = [], 0
    med = d.rng.rolling(96).median().shift(1)
    calm = (d.rng.shift(1) <= 2 * med.shift(0))  # candle terakhir yg tutup vs median 96 sebelumnya
    used = set()
    for i in range(len(d)):
        if i < free or pd.isna(d.atr[i]) or pd.isna(d.d1_h[i]) or not (7 <= d.utc_h[i] < 20) or not calm[i]:
            continue
        a, H, L = d.atr[i], d.d1_h[i], d.d1_l[i]
        for beli in (True, False):
            key = (d.day[i], beli)
            if key in used:
                continue
            if beli:
                entry = L + 0.1 * a  # harga ask umpan BELI
                if not (d.open[i] + sp > entry and d.low[i] + sp <= entry):
                    continue
                sl = L - 0.5 * a
                risk = entry - sl
                tp = entry + risk
            else:
                entry = H - 0.1 * a  # harga bid umpan JUAL
                if not (d.open[i] < entry and d.high[i] >= entry):
                    continue
                sl = H + 0.5 * a
                risk = sl - entry
                tp = entry - risk
            used.add(key)
            if risk <= 0 or (sp + com) > 0.10 * risk:
                continue
            keluar, cara, k = simulate(d, i, beli, entry, sl, tp, sp, 3, True)
            if keluar is None:
                continue
            out.append(dict(sym=sym, t=d.t[i], arah="BELI" if beli else "JUAL", cara=cara,
                            R=r_of(beli, entry, keluar, risk, com)))
            free = k + 1
            break
    return out


def petani(sym, d, spec):
    sp, com = spec.spread, spec.commission / spec.pointValue
    out, i, n = [], 1, len(d)
    C, O, Lo, Hi, MA = d.close.values, d.open.values, d.low.values, d.high.values, d.ma50.values
    up = (d.d1_c > d.d1_sma20) & (d.d1_sma20 > d.d1_sma20_5)
    dn = (d.d1_c < d.d1_sma20) & (d.d1_sma20 < d.d1_sma20_5)
    MUS = np.where(up, "BELI", np.where(dn, "JUAL", ""))
    while i < n - 1:
        if pd.isna(MA[i]) or pd.isna(MA[i + 1]) or pd.isna(d.atr[i + 1]):
            i += 1
            continue
        j = i + 1
        m = MUS[j]
        beli = m == "BELI" and O[i] > MA[i] and Lo[i] <= MA[i] and C[j] > MA[j]
        jual = m == "JUAL" and O[i] < MA[i] and Hi[i] >= MA[i] and C[j] < MA[j]
        if not (beli or jual):
            i += 1
            continue
        a = d.atr[j]
        if beli:
            entry, sl = C[j] + sp, Lo[i] - 1.5 * a
        else:
            entry, sl = C[j], Hi[i] + 1.5 * a + sp
        risk = abs(entry - sl)
        if risk <= 0 or (sp + com) > 0.10 * risk:
            i += 1
            continue
        tp = entry + 3 * risk if beli else entry - 3 * risk
        t0 = d.t[j]

        def d1_exit(k, beli=beli, t0=t0):
            if d.t[k] - t0 >= pd.Timedelta(days=10):
                return True
            if not d.last_of_day[k]:
                return False
            # close harian hari k vs SMA20 harian termasuk hari k
            nxt = k + 1
            if nxt >= n or pd.isna(d.d1_sma20[nxt]):
                return False
            return (d.d1_c[nxt] < d.d1_sma20[nxt]) if beli else (d.d1_c[nxt] > d.d1_sma20[nxt])

        keluar, cara, k = simulate(d, j, beli, entry, sl, tp, sp, None, False, be_at_1r=True, d1_exit=d1_exit)
        if keluar is None:
            break
        if cara == "MUSIM" and d.t[k] - t0 >= pd.Timedelta(days=10):
            cara = "10HARI"
        out.append(dict(sym=sym, t=d.t[j], arah="BELI" if beli else "JUAL", cara=cara,
                        R=r_of(beli, entry, keluar, risk, com)))
        i = k + 1
    return out


def fakta(sym, d, spec, sig):
    sp, com = spec.spread, spec.commission / spec.pointValue
    idx = {t: i for i, t in enumerate(d.t)}
    out, free = [], 0
    C, Hi, Lo = d.close.values, d.high.values, d.low.values
    for s in sig.itertuples():
        i = idx.get(s.t)
        if i is None or i < free:
            continue
        beli = s.direction == "BELI"
        dist = abs(s.entry - s.stopLoss)
        j = next((k for k in (i + 1, i + 2) if k < len(d) and ((C[k] > Hi[i]) if beli else (C[k] < Lo[i]))), None)
        if j is None:
            continue
        m = d.iloc[j]
        if pd.isna(m.d1_sma20) or not ((m.d1_c > m.d1_sma20) if beli else (m.d1_c < m.d1_sma20)):
            continue
        entry = C[j] + sp if beli else C[j]
        sl = entry - dist if beli else entry + dist
        tp = entry + 1.5 * dist if beli else entry - 1.5 * dist
        if (sp + com) > 0.10 * dist:
            continue
        keluar, cara, k = simulate(d, j, beli, entry, sl, tp, sp, 3 if spec.timeStop else None, False)
        if keluar is None:
            continue
        out.append(dict(sym=sym, t=d.t[j], arah="BELI" if beli else "JUAL", cara=cara,
                        R=r_of(beli, entry, keluar, dist, com)))
        free = k + 1
    return out


def nilai(tr, judul):
    lat, uji = tr[tr.t < LATIH_AKHIR], tr[tr.t >= LATIH_AKHIR]
    if len(uji) == 0:
        print(f"{judul}: ujian n=0")
        return
    t1 = uji.t.max() + pd.Timedelta("1min")
    edges = [LATIH_AKHIR + (t1 - LATIH_AKHIR) * i / 7 for i in range(8)]
    blok = [float(uji[(uji.t >= edges[i]) & (uji.t < edges[i + 1])].R.sum()) for i in range(7)]
    pos, neg = uji.R[uji.R > 0].sum(), -uji.R[uji.R < 0].sum()
    pf = pos / neg if neg > 0 else float("inf")
    k = {"K1": len(uji) >= 20, "K2": uji.R.mean() > 0, "K3": pf >= 1.2, "K4": sum(b > 0 for b in blok) >= 5,
         "K5": uji.R.min() >= -1.1, "K6": sum(blok) - max(blok) > 0, "K7": len(lat) > 0 and lat.R.mean() > 0}
    cara = uji.cara.value_counts(normalize=True).mul(100).round(0).astype(int).to_dict()
    print(f"{judul}: latih n={len(lat)} R={lat.R.mean() if len(lat) else float('nan'):+.3f} | ujian n={len(uji)} "
          f"menang {100 * (uji.R > 0).mean():.0f}% R={uji.R.mean():+.3f} PF={pf:.2f} terburuk={uji.R.min():+.2f} "
          f"blok+={sum(b > 0 for b in blok)}/7 | keluar {cara} | gagal: {[x for x, v in k.items() if not v] or '-'}"
          f" -> {'LOLOS' if all(k.values()) else 'TIDAK LOLOS'}")


if __name__ == "__main__":
    folder, spec_f, audit_f = sys.argv[1:4]
    spec = pd.read_csv(spec_f).set_index("symbol")
    spec["timeStop"] = spec.timeStop.astype(str).str.lower() == "true"
    audit = pd.read_csv(audit_f)
    audit["t"] = pd.to_datetime(audit.signalTime, format="%Y.%m.%d %H:%M")
    hasil = {"M-1 Mancing": [], "P-1 Petani Kebun": [], "F-1 Pencari Fakta": []}
    for sym in spec.index:
        try:
            d, _ = load(folder, sym)
        except FileNotFoundError:
            continue
        s = spec.loc[sym]
        hasil["M-1 Mancing"] += mancing(sym, d, s)
        hasil["P-1 Petani Kebun"] += petani(sym, d, s)
        hasil["F-1 Pencari Fakta"] += fakta(sym, d, s, audit[audit.symbol == sym].sort_values("t"))
    for nama, rows in hasil.items():
        tr = pd.DataFrame(rows)
        tr["grp"] = tr.sym.map(spec.group)
        print("=" * 20, nama)
        nilai(tr, "SEMUA")
        for g, x in tr.groupby("grp"):
            nilai(x, f"  {g}")
        tr.to_csv(f"{nama.split()[0]}_trades.csv", index=False)
