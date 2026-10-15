"""Lolosyiob v6 — Scalping murni XAUUSD M1 (prinsip scalping dari Fahmi 15 Okt 2026 15:56 WIT).

Pakai: python3 xauusd_scalp_m1_bt.py <folder berisi MDBKA_XAUUSD_M1_LONG.csv>
ANGKA BEKU (ditulis sebelum uji):
  Sesi      : 13:00-17:00 UTC (22:00-02:00 WIT, tumpang-tindih London-New York, likuid)
  Berita    : tidak masuk 45 mnt sebelum s/d 15 mnt sesudah 08:30 & 10:00 New York
  Arah      : BELI bila close > VWAP harian (bobot tick volume, reset 00:00 UTC) DAN EMA9 > EMA20 DAN EMA20 naik vs 5 mnt lalu
  Pullback  : dalam 3 candle M1 terakhir, low <= EMA9 ; close sekarang > EMA9
  Momentum  : RSI14 M1 > 50 (konfirmasi, bukan sinyal tunggal)
  Pemicu    : close M1 > high candle M1 sebelumnya
  Mengejar  : lewati bila close - EMA20 > 1,5 x ATR14 M1
  SL        : low terendah 3 candle - 0,2 x ATR14 ; jarak SL 0,5-2 x ATR14
  Biaya     : spread <= 2x median 1 hari; biaya <= 10% jarak SL (gerbang MDBKA); rugi SL x 1,075 (slippage R-2)
  TP        : 0,5R (target kecil, ciri scalping) ; batas waktu 10 menit
  Risiko    : 0,5% equity/trade (rumus: unit = risiko Rp / (jarak SL + biaya)); batas rugi harian -2R -> berhenti hari itu;
              jeda MDBKA: 3 rugi berturut -> berhenti 24 jam
  JUAL      : cermin.
Kriteria: menang >= 70% setelah biaya (impas TP 0,5R butuh ~67% + biaya), K1-K7 seperti v5. Latih 60% / ujian 40% (7 blok).
VWAP memakai tick volume MT5 (bukan volume asli) — batas data.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xauusd_pullback_bt as v5  # noqa: E402  (load, ema, atr, rsi, berita)

SESI = (13 * 60, 17 * 60)
TP_R, TSTOP, DAILY_STOP_R, STREAK, PAUSE_H = 0.5, 10, -2.0, 3, 24


def siapkan(m1):
    d = m1.copy()
    d["tutup"] = d.t + pd.Timedelta("1min")
    d["e9"], d["e20"], d["atr"], d["rsi"] = v5.ema(d.close, 9), v5.ema(d.close, 20), v5.atr(d), v5.rsi(d.close)
    tp = (d.high + d.low + d.close) / 3
    hari = d.t.dt.floor("D")
    vol = d.tick_volume.clip(lower=1)
    d["vwap"] = (tp * vol).groupby(hari).cumsum() / vol.groupby(hari).cumsum()
    d["low3"], d["high3"] = d.low.rolling(3).min(), d.high.rolling(3).max()
    d["med_sp"] = d.sp.rolling(1440, min_periods=200).median().shift(1)
    sentuh_b = (d.low <= d.e9).astype(int).rolling(3).max() == 1
    sentuh_j = (d.high >= d.e9).astype(int).rolling(3).max() == 1
    beli = (d.close > d.vwap) & (d.e9 > d.e20) & (d.e20 > d.e20.shift(5)) & sentuh_b & (d.close > d.e9) & (d.rsi > 50) & (d.close > d.high.shift(1))
    jual = (d.close < d.vwap) & (d.e9 < d.e20) & (d.e20 < d.e20.shift(5)) & sentuh_j & (d.close < d.e9) & (d.rsi < 50) & (d.close < d.low.shift(1))
    d["arah"] = np.where(beli, "BELI", np.where(jual, "JUAL", ""))
    mnt = d.tutup.dt.hour * 60 + d.tutup.dt.minute
    d["sesi"] = (mnt >= SESI[0]) & (mnt <= SESI[1])
    return d


def jalankan(d):
    out, tolak = [], {}
    bebas = pd.Timestamp("1970-01-01", tz="UTC")
    hari_r, hari_stop, jeda_sampai, beruntun = {}, set(), bebas, 0

    def catat(k):
        tolak[k] = tolak.get(k, 0) + 1

    idx = d.index[(d.arah != "") & d.sesi]
    for i in idx:
        if i < 1500 or i + TSTOP + 1 >= len(d):
            continue
        m = d.loc[i]
        tm = m.tutup
        hari = tm.floor("D")
        if tm < bebas:
            catat("posisi masih terbuka"); continue
        if hari in hari_stop:
            catat("batas rugi harian -2R"); continue
        if tm < jeda_sampai:
            catat("jeda 3 rugi berturut (24 jam)"); continue
        if any(r - pd.Timedelta("45min") <= tm <= r + pd.Timedelta("15min") for r in v5.berita(tm)):
            catat("dekat berita"); continue
        beli = m.arah == "BELI"
        if (beli and m.close - m.e20 > 1.5 * m.atr) or (not beli and m.e20 - m.close > 1.5 * m.atr):
            catat("mengejar"); continue
        sp = float(m.sp)
        if np.isnan(m.med_sp) or sp > 2 * m.med_sp:
            catat("spread lebar"); continue
        entry = float(m.close + sp) if beli else float(m.close)
        sl = float(m.low3 - 0.2 * m.atr) if beli else float(m.high3 + 0.2 * m.atr + sp)
        dist = (entry - sl) if beli else (sl - entry)
        if not (0.5 * m.atr <= dist <= 2.0 * m.atr):
            catat("jarak SL di luar 0,5-2 ATR"); continue
        if sp + v5.COMM > 0.10 * dist:
            catat("gerbang biaya 10%"); continue
        tp = entry + TP_R * dist if beli else entry - TP_R * dist
        path = d.iloc[i + 1:i + 1 + TSTOP]
        if (path.t.iloc[-1] - path.t.iloc[0]) > pd.Timedelta(minutes=TSTOP + 5):
            catat("celah data"); continue
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
        r = ((keluar - entry) if beli else (entry - keluar)) / dist
        if cara == "SL":
            r *= v5.SLIP_SL
        r -= v5.COMM / dist
        out.append({"tutup": tm, "arah": m.arah, "jarak_usd": dist, "biaya_pct": (sp + v5.COMM) / dist, "cara": cara,
                    "menit": (jam - tm).total_seconds() / 60, "R": r, "hasil_idr": r * dist * v5.KURS_IDR})
        bebas = jam
        hari_r[hari] = hari_r.get(hari, 0.0) + r
        if hari_r[hari] <= DAILY_STOP_R:
            hari_stop.add(hari)
        beruntun = beruntun + 1 if r < 0 else 0
        if beruntun >= STREAK:
            jeda_sampai, beruntun = jam + pd.Timedelta(hours=PAUSE_H), 0
    return pd.DataFrame(out), tolak


def lap(tr, judul):
    if tr.empty:
        print(judul, "tidak ada trade"); return
    win, loss = tr.R[tr.R > 0].sum(), -tr.R[tr.R < 0].sum()
    print(f"{judul}: n={len(tr)} menang={100 * (tr.R > 0).mean():.1f}% TP={100 * (tr.cara == 'TP').mean():.1f}% "
          f"SL={100 * (tr.cara == 'SL').mean():.1f}% waktu={100 * (tr.cara == 'WAKTU').mean():.1f}% menit rata {tr.menit.mean():.1f} | "
          f"rata R={tr.R.mean():+.3f} PF={win / loss if loss else float('inf'):.2f} total R={tr.R.sum():+.2f} "
          f"Rp(0,01 lot)={tr.hasil_idr.sum():+,.0f} | SL median ${tr.jarak_usd.median():.2f} biaya {100 * tr.biaya_pct.median():.1f}% jarak SL")


if __name__ == "__main__":
    m1 = v5.load(sys.argv[1], "M1")
    d = siapkan(m1)
    print("Calon sinyal di sesi:", d[(d.arah != "") & d.sesi].arah.value_counts().to_dict())
    tr, tolak = jalankan(d)
    print("Ditolak:", dict(sorted(tolak.items(), key=lambda x: -x[1])))
    t0, t1 = d.t.iloc[1500], d.t.iloc[-1]
    batas = t0 + (t1 - t0) * v5.LATIH_FRAC
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
        print(f"Uji {i + 1} {edges[i]:%d %b}–{edges[i + 1]:%d %b %Y}: n={len(x):3d} menang={100 * (x.R > 0).mean() if len(x) else 0:4.0f}% "
              f"R={s:+7.2f} Rp={x.hasil_idr.sum():+10,.0f} -> {'BERHASIL' if len(x) and s > 0 else 'TIDAK'}")
    if len(uji):
        pf = uji.R[uji.R > 0].sum() / -uji.R[uji.R < 0].sum()
        k = {"K0 menang>=70%": (uji.R > 0).mean() >= 0.70, "K1 n>=20": len(uji) >= 20, "K2 rata R>0": uji.R.mean() > 0,
             "K3 PF>=1,2": pf >= 1.2, "K4 >=5/7": ok >= 5, "K5 terburuk>=-1,1R": uji.R.min() >= -1.1,
             "K6 tanpa blok terbaik>0": sum(per) - max(per) > 0, "K7 latih rata R>0": len(lat) > 0 and lat.R.mean() > 0}
        for kk, v in k.items():
            print(f"  {kk}: {'YA' if v else 'TIDAK'}")
        print("VONIS:", "BERHASIL" if all(k.values()) else "TIDAK BERHASIL")
        print("Per arah (ujian):", uji.groupby("arah").R.agg(["count", "sum"]).round(2).to_dict("index"))
        print("Per jam UTC (ujian):", uji.groupby(uji.tutup.dt.hour).R.agg(["count", "sum"]).round(2).to_dict("index"))
    tr.to_csv("xau_scalp_trades.csv", index=False)
