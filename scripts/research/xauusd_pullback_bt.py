"""Lolosyiob v5 — Pullback XAUUSD M15/M5/M1 (angka beku disetujui Fahmi 15 Okt 2026 15:37 WIT).

Pakai: python3 xauusd_pullback_bt.py <folder berisi MDBKA_XAUUSD_M5_LONG.csv & MDBKA_XAUUSD_M1_LONG.csv>
Angka beku: docs/LOLOSYIOB-XAUUSD-PULLBACK-2026-10-15.md bagian 2 (no. 1-15). Tidak boleh disetel setelah melihat hasil.
Candle MT5 = bid; ask = bid + spread (point 0,01). Jam server = New York + 7 -> UTC.
"""
import os
import sys

import numpy as np
import pandas as pd

PT = float(os.environ.get("MDBKA_XAU_POINT", "0.01"))  # Finex 0,01; Exness 0,001
COMM = float(os.environ.get("MDBKA_COMM_PER_LOT", "1.0")) / 100  # $/lot -> $ per oz (Finex $1/lot = $0,01)
SLIP_SL = 1.075        # R-2: rugi SL x 1,075
SESI = (7 * 60, 17 * 60)
KURS_IDR = 17880
LATIH_FRAC = 0.60


def load(folder, tf):
    d = pd.read_csv(os.path.join(folder, f"MDBKA_XAUUSD_{tf}_LONG.csv"))
    srv = pd.to_datetime(d.time, format="%Y.%m.%d %H:%M")
    if os.environ.get("MDBKA_TZ", "NY7") == "UTC":  # Exness: jam server = UTC
        d["t"] = srv.dt.tz_localize("UTC")
    else:  # Finex: jam server = New York + 7
        ny = (srv - pd.Timedelta(hours=7)).dt.tz_localize("America/New_York", ambiguous="NaT", nonexistent="NaT")
        d["t"] = ny.dt.tz_convert("UTC")
    d = d.dropna(subset=["t"]).reset_index(drop=True)
    d["sp"] = d.spread * PT
    return d


def ema(s, n):
    return s.ewm(span=n, adjust=False).mean()


def atr(d, n=14):
    pc = d.close.shift(1)
    tr = pd.concat([d.high - d.low, (d.high - pc).abs(), (d.low - pc).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def rsi(c, n=14):
    dlt = c.diff()
    up = dlt.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-dlt.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn)


def berita(t):
    """Jam rilis 08:30 & 10:00 New York (hari kerja) di sekitar waktu t (UTC) -> list UTC."""
    ny = t.tz_convert("America/New_York")
    out = []
    for dd in (-1, 0, 1):
        day = (ny + pd.Timedelta(days=dd)).normalize()
        if day.weekday() >= 5:
            continue
        for hh, mm in ((8, 30), (10, 0)):
            out.append((day + pd.Timedelta(hours=hh, minutes=mm)).tz_convert("UTC"))
    return out


def m15_from_m5(m5):
    x = m5.set_index("t")
    g = x.resample("15min", label="left", closed="left")
    m15 = pd.DataFrame({"open": g.open.first(), "high": g.high.max(), "low": g.low.min(), "close": g.close.last(),
                        "n": g.close.count()}).dropna()
    m15 = m15[m15.n >= 2].reset_index()
    m15["tutup"] = m15.t + pd.Timedelta("15min")
    m15["e50"], m15["e200"] = ema(m15.close, 50), ema(m15.close, 200)
    m15["atr"] = atr(m15)
    m15["e50_1j"] = m15.e50.shift(4)
    return m15


def setups(m5, m15):
    m5 = m5.copy()
    m5["tutup"] = m5.t + pd.Timedelta("5min")
    m5["e20"], m5["atr"], m5["rsi"] = ema(m5.close, 20), atr(m5), rsi(m5.close)
    a = pd.merge_asof(m5.sort_values("tutup"), m15[["tutup", "close", "e50", "e200", "atr", "e50_1j"]]
                      .rename(columns={"close": "c15", "atr": "atr15"}), on="tutup", direction="backward")
    dekat_b = (a.low <= a.e20 + 0.25 * a.atr).astype(int).rolling(3).max() == 1
    dekat_j = (a.high >= a.e20 - 0.25 * a.atr).astype(int).rolling(3).max() == 1
    pb_low, pb_high = a.low.rolling(3).min(), a.high.rolling(3).max()
    prev_low, prev_high = a.low.shift(3).rolling(12).min(), a.high.shift(3).rolling(12).max()
    tren_naik = (a.e50 > a.e200) & (a.e50 - a.e200 >= 0.5 * a.atr15) & (a.e50 > a.e50_1j) & (a.c15 > a.e50)
    tren_turun = (a.e50 < a.e200) & (a.e200 - a.e50 >= 0.5 * a.atr15) & (a.e50 < a.e50_1j) & (a.c15 < a.e50)
    beli = tren_naik & dekat_b & (a.close > a.e20) & (pb_low > prev_low) & (a.rsi > 50)
    jual = tren_turun & dekat_j & (a.close < a.e20) & (pb_high < prev_high) & (a.rsi < 50)
    a["arah"] = np.where(beli, "BELI", np.where(jual, "JUAL", ""))
    a["pb_low"], a["pb_high"] = pb_low, pb_high
    a = a.iloc[300:]  # pemanasan EMA200 M15 / ATR
    return a[a.arah != ""]


def jalankan(m1, st):
    m1 = m1.copy()
    m1["tutup"] = m1.t + pd.Timedelta("1min")
    m1["hh5"] = m1.high.shift(1).rolling(5).max()
    m1["ll5"] = m1.low.shift(1).rolling(5).min()
    m1["med_sp"] = m1.sp.rolling(1440, min_periods=200).median().shift(1)
    tut = m1.tutup.values
    out, tolak, bebas_sejak = [], {}, pd.Timestamp("1970-01-01", tz="UTC")

    def catat(k):
        tolak[k] = tolak.get(k, 0) + 1

    for _, s in st.iterrows():
        if s.tutup < bebas_sejak:
            catat("posisi masih terbuka")
            continue
        beli = s.arah == "BELI"
        i0 = np.searchsorted(tut, s.tutup.to_datetime64(), side="right")
        trig = None
        for i in range(i0, min(i0 + 15, len(m1))):
            m = m1.iloc[i]
            if m.tutup > s.tutup + pd.Timedelta("15min"):
                break
            if (beli and m.close > m.hh5) or (not beli and m.close < m.ll5):
                trig = i
                break
        if trig is None:
            catat("pemicu M1 tidak muncul 15 menit")
            continue
        m = m1.iloc[trig]
        tm = m.tutup
        mnt = tm.hour * 60 + tm.minute
        if not (SESI[0] <= mnt <= SESI[1]):
            catat("di luar sesi")
            continue
        rilis = berita(tm)
        if any(r - pd.Timedelta("45min") <= tm <= r + pd.Timedelta("15min") for r in rilis):
            catat("dekat berita 08:30/10:00 NY")
            continue
        if (beli and m.close - s.e20 > s.atr) or (not beli and s.e20 - m.close > s.atr):
            catat("terlalu jauh (mengejar)")
            continue
        sp = float(m.sp)
        if np.isnan(m.med_sp) or sp > 2 * m.med_sp:
            catat("spread > 2x median")
            continue
        entry = float(m.close + sp) if beli else float(m.close)
        sl = float(s.pb_low - 0.2 * s.atr) if beli else float(s.pb_high + 0.2 * s.atr + sp)
        dist = (entry - sl) if beli else (sl - entry)
        if not (0.5 * s.atr <= dist <= 2.0 * s.atr):
            catat("jarak SL di luar 0,5-2 ATR")
            continue
        if sp + COMM > 0.10 * dist:
            catat("gerbang biaya 10%")
            continue
        tp = entry + 1.5 * dist if beli else entry - 1.5 * dist
        batas = tm + pd.Timedelta("30min")
        nxt = [r for r in rilis if tm < r <= batas]
        if nxt:
            batas = min(nxt) - pd.Timedelta("1min")
        path = m1.iloc[trig + 1:trig + 31]
        path = path[path.tutup <= batas]
        if len(path) == 0 or (path.t.iloc[-1] - path.t.iloc[0]) > pd.Timedelta("40min"):
            catat("celah data saat posisi")
            continue
        keluar, cara, jam = None, "WAKTU", path.tutup.iloc[-1]
        for p in path.itertuples():
            if beli:
                if p.low <= sl:
                    keluar, cara = min(sl, p.open), "SL"
                elif p.high >= tp:
                    keluar, cara = tp, "TP"
            else:
                if p.high + p.sp >= sl:
                    keluar, cara = max(sl, p.open + p.sp), "SL"
                elif p.low + p.sp <= tp:
                    keluar, cara = tp, "TP"
            if keluar is not None:
                jam = p.tutup
                break
        if keluar is None:
            last = path.iloc[-1]
            keluar = float(last.close if beli else last.close + last.sp)
            if nxt and last.tutup >= batas:
                cara = "BERITA"
        gross = (keluar - entry) if beli else (entry - keluar)
        r = gross / dist
        if cara == "SL":
            r *= SLIP_SL
        r -= COMM / dist
        out.append({"tutup": tm, "arah": s.arah, "jarak_usd": dist, "spread": sp, "cara": cara,
                    "menit": (jam - tm).total_seconds() / 60, "R": r, "hasil_idr": r * dist * KURS_IDR, "risk_idr": dist * KURS_IDR})
        bebas_sejak = jam
    return pd.DataFrame(out), tolak


def lap(tr, judul):
    if tr.empty:
        print(judul, "tidak ada trade"); return
    win, loss = tr.R[tr.R > 0].sum(), -tr.R[tr.R < 0].sum()
    tp = tr[tr.cara == "TP"]
    print(f"{judul}: n={len(tr)} TP<=30m {100 * len(tp) / len(tr):.1f}% (menit median {tp.menit.median():.0f}) "
          f"SL {100 * (tr.cara == 'SL').mean():.1f}% waktu {100 * (tr.cara == 'WAKTU').mean():.1f}% berita {100 * (tr.cara == 'BERITA').mean():.1f}% | "
          f"menang {100 * (tr.R > 0).mean():.1f}% rata R={tr.R.mean():+.3f} PF={win / loss if loss else float('inf'):.2f} total R={tr.R.sum():+.2f} "
          f"Rp(0,01 lot)={tr.hasil_idr.sum():+,.0f} | risiko median Rp{tr.risk_idr.median():,.0f} (SL ${tr.jarak_usd.median():.2f})")


if __name__ == "__main__":
    f = sys.argv[1]
    m5, m1 = load(f, "M5"), load(f, "M1")
    m15 = m15_from_m5(m5)
    st = setups(m5, m15)
    t0, t1 = m1.t.iloc[0] + pd.Timedelta(days=3), m1.t.iloc[-1]
    st = st[(st.tutup >= t0) & (st.tutup <= t1 - pd.Timedelta("1h"))]
    print("Setup M5:", st.arah.value_counts().to_dict())
    tr, tolak = jalankan(m1, st)
    print("Ditolak:", dict(sorted(tolak.items(), key=lambda x: -x[1])))
    batas = t0 + (t1 - t0) * LATIH_FRAC
    lat, uji = tr[tr.tutup < batas], tr[tr.tutup >= batas]
    print("Latih s/d", batas)
    lap(lat, "LATIH")
    lap(uji, "UJIAN")
    edges = [batas + (t1 - batas) * i / 7 for i in range(8)]
    per, ok = [], 0
    for i in range(7):
        x = uji[(uji.tutup >= edges[i]) & (uji.tutup < edges[i + 1])]
        s = float(x.R.sum())
        per.append(s)
        ok += len(x) > 0 and s > 0
        print(f"Uji {i + 1} {edges[i]:%d %b}–{edges[i + 1]:%d %b %Y}: n={len(x):3d} TP={int((x.cara == 'TP').sum()):3d} "
              f"R={s:+7.2f} Rp={x.hasil_idr.sum():+11,.0f} -> {'BERHASIL' if len(x) and s > 0 else 'TIDAK'}")
    if len(uji):
        pf = uji.R[uji.R > 0].sum() / -uji.R[uji.R < 0].sum()
        k = {"K1 n>=20": len(uji) >= 20, "K2 rata R>0": uji.R.mean() > 0, "K3 PF>=1,2": pf >= 1.2, "K4 >=5/7": ok >= 5,
             "K5 terburuk>=-1,1R": uji.R.min() >= -1.1, "K6 tanpa blok terbaik>0": sum(per) - max(per) > 0,
             "K7 latih rata R>0": len(lat) > 0 and lat.R.mean() > 0}
        for kk, v in k.items():
            print(f"  {kk}: {'YA' if v else 'TIDAK'}")
        print("VONIS:", "BERHASIL" if all(k.values()) else "TIDAK BERHASIL")
        print("Per arah (ujian):", uji.groupby("arah").R.agg(["count", "sum"]).round(2).to_dict("index"))
        print("Per jam UTC (ujian):", uji.groupby(uji.tutup.dt.hour).R.agg(["count", "sum"]).round(2).to_dict("index"))
        print("Terburuk:", round(uji.R.min(), 3))
    tr.to_csv("xau_trades.csv", index=False)
