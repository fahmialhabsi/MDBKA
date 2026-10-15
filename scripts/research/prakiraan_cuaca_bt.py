"""Lolosyiob — Kerja Cepat v2 "Prakiraan Cuaca" (logika BMKG), 15 Okt 2026.

Bahan: hanya bahan yang sudah ada = riwayat candle M5 server Finex (bahan 2: OHLC bid, spread, MACD 12,26,9 MT5).
Pakai: python3 prakiraan_cuaca_bt.py <folder MDBKA_<PAIR>_M5_LONG.csv>

LOGIKA (dibekukan sebelum uji):
  Pengamatan (1 jam ke belakang = 12 candle M5, di candle t tertutup):
    main = macd_main, sig = macd_signal, hist = main - sig
    d_main = main_t - main_(t-12), d_hist = hist_t - hist_(t-12)   ("perubahan saat itu")
    angin  = range 12 candle (max high - min low)
  Kategori prakiraan 30 menit ke depan (6 candle):
    BADAI       : angin > 2 x median angin 288 candle sebelumnya, ATAU spread > 2 x median   -> jangan trading
    CERAH_NAIK  : main > 0, hist > 0, d_main > 0, d_hist > 0                                    -> BELI
    CERAH_TURUN : main < 0, hist < 0, d_main < 0, d_hist < 0                                    -> JUAL
    BERAWAN     : selain itu                                                                    -> tidak ada prakiraan
  Sesi 07:00-16:00 UTC; pasangan USDJPY, EURJPY, GBPUSD, GBPJPY, EURUSD.
  Uji trade: masuk di close t (ask utk BELI), SL = 1 x angin dari harga masuk, keluar di close t+6 (30 menit)
    atau SL lebih dulu; gerbang biaya 10% jarak SL; 1 posisi/pasangan; tolak bila berbagi mata uang dgn posisi terbuka.
  Data: LATIH 28 Sep 2025 - 30 Apr 2026 (hanya dilihat), UJIAN 1 Mei - 15 Okt 2026 dibagi 7 blok (uji 1-7).
  Kriteria (di UJIAN): K1 n>=20, K2 rata R>0, K3 PF>=1,2, K4 >=5/7 blok >0, K5 terburuk >=-1,1R,
    K6 tanpa blok terbaik >0, K7 LATIH juga rata R>0 (arah sama).
  Skill prakiraan (gaya BMKG): ketepatan CERAH dibanding klimatologi (peluang dasar arah yang sama di semua candle sesi).
"""
import os
import sys

import numpy as np
import pandas as pd

PAIRS = ["USDJPY", "EURJPY", "GBPUSD", "GBPJPY", "EURUSD"]
LOOK, AHEAD, MED_N = 12, 6, 288
BADAI_K, SPREAD_K, MAX_COST = 2.0, 2.0, 0.10
SESI = (7 * 60, 16 * 60)
LATIH_AKHIR = pd.Timestamp("2026-05-01", tz="UTC")
KURS_IDR = 17880


def load(folder):
    out = {}
    for s in PAIRS:
        d = pd.read_csv(os.path.join(folder, f"MDBKA_{s}_M5_LONG.csv"))
        srv = pd.to_datetime(d.time, format="%Y.%m.%d %H:%M")
        ny = (srv - pd.Timedelta(hours=7)).dt.tz_localize("America/New_York", ambiguous="NaT", nonexistent="NaT")
        d["t"] = ny.dt.tz_convert("UTC")
        d = d.dropna(subset=["t", "macd_main", "macd_signal"]).reset_index(drop=True)
        d["sp"] = d.spread * (0.001 if s.endswith("JPY") else 0.00001)
        out[s] = d
    return out


def kategori(d):
    main, sig = d.macd_main, d.macd_signal
    hist = main - sig
    dm, dh = main - main.shift(LOOK), hist - hist.shift(LOOK)
    angin = d.high.rolling(LOOK).max() - d.low.rolling(LOOK).min()
    med_angin = angin.rolling(MED_N, min_periods=50).median().shift(1)
    med_sp = d.sp.rolling(MED_N, min_periods=50).median().shift(1)
    rapat = (d.t.diff() == pd.Timedelta("5min")).astype(int)
    run = rapat.groupby((rapat == 0).cumsum()).cumsum()
    kat = np.where((angin > BADAI_K * med_angin) | (d.sp > SPREAD_K * med_sp), "BADAI",
                   np.where((main > 0) & (hist > 0) & (dm > 0) & (dh > 0), "CERAH_NAIK",
                            np.where((main < 0) & (hist < 0) & (dm < 0) & (dh < 0), "CERAH_TURUN", "BERAWAN")))
    kat = pd.Series(kat, index=d.index).where(run >= LOOK + 26, "DATA_KURANG").where(med_angin.notna(), "DATA_KURANG")
    tutup = d.t + pd.Timedelta("5min")
    mnt = tutup.dt.hour * 60 + tutup.dt.minute
    ke_depan_ok = (d.t.shift(-AHEAD) - d.t) == pd.Timedelta(minutes=5 * AHEAD)
    return pd.DataFrame({"t": d.t, "tutup": tutup, "kat": kat, "angin": angin, "sesi": (mnt >= SESI[0]) & (mnt <= SESI[1]),
                         "ok": ke_depan_ok, "c": d.close, "c6": d.close.shift(-AHEAD), "sp": d.sp, "sp6": d.sp.shift(-AHEAD)})


def skill(cats):
    """Ketepatan prakiraan vs klimatologi (semua candle sesi yang valid)."""
    rows = []
    for nama, x in cats.items():
        x = x[x.sesi & x.ok & (x.kat != "DATA_KURANG")]
        naik = (x.c6 - (x.c + x.sp)) > 0           # BELI di ask, jual di bid 30 menit kemudian: untung?
        turun = ((x.c - (x.c6 + x.sp6)) > 0)        # JUAL di bid, beli kembali di ask
        for per, m in (("LATIH", x.t < LATIH_AKHIR), ("UJIAN", x.t >= LATIH_AKHIR)):
            rows.append({"pasangan": nama, "periode": per, "n_semua": int(m.sum()),
                         "dasar_naik": naik[m].mean(), "dasar_turun": turun[m].mean(),
                         "n_cerah_naik": int((m & (x.kat == "CERAH_NAIK")).sum()),
                         "tepat_cerah_naik": naik[m & (x.kat == "CERAH_NAIK")].mean(),
                         "n_cerah_turun": int((m & (x.kat == "CERAH_TURUN")).sum()),
                         "tepat_cerah_turun": turun[m & (x.kat == "CERAH_TURUN")].mean(),
                         "badai_pct": (x.kat[m] == "BADAI").mean()})
    return pd.DataFrame(rows)


def trades(data, cats):
    jpy = data["USDJPY"].set_index("t").close
    sinyal = []
    for s, x in cats.items():
        y = x[x.sesi & x.ok & x.kat.isin(["CERAH_NAIK", "CERAH_TURUN"])]
        for i in y.index:
            sinyal.append((x.tutup[i], s, i))
    sinyal.sort()
    out, tolak, terbuka = [], {}, []
    for tutup, s, i in sinyal:
        terbuka = [z for z in terbuka if z[1] > tutup]
        if any(set([z[0][:3], z[0][3:]]) & set([s[:3], s[3:]]) for z in terbuka):
            tolak["korelasi/posisi terbuka"] = tolak.get("korelasi/posisi terbuka", 0) + 1
            continue
        d, x = data[s], cats[s]
        beli = x.kat[i] == "CERAH_NAIK"
        sp = float(d.sp[i])
        entry = float(d.close[i] + sp) if beli else float(d.close[i])
        dist = float(x.angin[i])
        sl = entry - dist if beli else entry + dist
        uj = float(jpy.asof(d.t[i])) if s.endswith("JPY") else None
        com = 1.0 / 100000 if s.endswith("USD") else uj / 100000
        if not dist > 0 or (sp + com) > MAX_COST * dist:
            tolak["gerbang biaya 10%"] = tolak.get("gerbang biaya 10%", 0) + 1
            continue
        keluar, cara, k = None, "WAKTU", AHEAD
        for j in range(1, AHEAD + 1):
            m = d.iloc[i + j]
            if beli and m.low <= sl:
                keluar, cara, k = min(sl, m.open), "SL", j
            elif not beli and m.high + m.sp >= sl:
                keluar, cara, k = max(sl, m.open + m.sp), "SL", j
            if keluar is not None:
                break
        if keluar is None:
            m = d.iloc[i + AHEAD]
            keluar = float(m.close if beli else m.close + m.sp)
        r = ((keluar - entry) if beli else (entry - keluar)) / dist - com / dist
        pip = 0.01 if s.endswith("JPY") else 0.0001
        pv = 0.10 if s.endswith("USD") else 0.10 * 100 / uj
        ridr = dist / pip * pv * KURS_IDR
        out.append({"tutup": tutup, "sym": s, "arah": "BELI" if beli else "JUAL", "sl_pip": dist / pip,
                    "biaya_pip": (sp + com) / pip, "cara": cara, "R": r, "risk_idr": ridr, "hasil_idr": r * ridr})
        terbuka.append((s, tutup + pd.Timedelta(minutes=5 * k)))
    return pd.DataFrame(out), tolak


def ringkas(tr, judul):
    if tr.empty:
        print(judul, "tidak ada trade"); return
    win, loss = tr.R[tr.R > 0].sum(), -tr.R[tr.R < 0].sum()
    print(f"{judul}: n={len(tr)} menang={100 * (tr.R > 0).mean():.1f}% rata R={tr.R.mean():+.3f} PF={win / loss:.2f} "
          f"total R={tr.R.sum():+.2f} Rp(0,01 lot)={tr.hasil_idr.sum():+,.0f} | keluar {tr.cara.value_counts().to_dict()}")


if __name__ == "__main__":
    data = load(sys.argv[1])
    cats = {s: kategori(d) for s, d in data.items()}
    sk = skill(cats)
    pd.set_option("display.width", 250)
    print("===== Skill prakiraan (ketepatan vs klimatologi) =====")
    print(sk.round(3).to_string(index=False))
    for per in ("LATIH", "UJIAN"):
        z = sk[sk.periode == per]
        wn = (z.tepat_cerah_naik * z.n_cerah_naik).sum() / z.n_cerah_naik.sum()
        wt = (z.tepat_cerah_turun * z.n_cerah_turun).sum() / z.n_cerah_turun.sum()
        bn = (z.dasar_naik * z.n_semua).sum() / z.n_semua.sum()
        bt = (z.dasar_turun * z.n_semua).sum() / z.n_semua.sum()
        print(f"{per}: CERAH_NAIK tepat {wn:.1%} vs dasar {bn:.1%} | CERAH_TURUN tepat {wt:.1%} vs dasar {bt:.1%}")
    tr, tolak = trades(data, cats)
    t0 = max(c.t.iloc[0] for c in cats.values()) + pd.Timedelta(days=2)
    tr = tr[tr.tutup >= t0]
    print("\nDitolak:", tolak)
    lat, uji = tr[tr.tutup < LATIH_AKHIR], tr[tr.tutup >= LATIH_AKHIR]
    ringkas(lat, "LATIH")
    ringkas(uji, "UJIAN")
    t1 = uji.tutup.max() + pd.Timedelta("1min")
    edges = [LATIH_AKHIR + (t1 - LATIH_AKHIR) * i / 7 for i in range(8)]
    per_blok, ok = [], 0
    for i in range(7):
        x = uji[(uji.tutup >= edges[i]) & (uji.tutup < edges[i + 1])]
        s = float(x.R.sum())
        per_blok.append(s)
        ok += len(x) > 0 and s > 0
        print(f"Uji {i + 1} {edges[i]:%d %b}–{edges[i + 1]:%d %b %Y}: n={len(x):3d} menang={int((x.R > 0).sum()):3d} R={s:+7.2f} "
              f"Rp={x.hasil_idr.sum():+11,.0f} -> {'BERHASIL' if len(x) and s > 0 else 'TIDAK'}")
    if len(uji):
        pf = uji.R[uji.R > 0].sum() / -uji.R[uji.R < 0].sum()
        k = {"K1 n>=20": len(uji) >= 20, "K2 rata R>0": uji.R.mean() > 0, "K3 PF>=1,2": pf >= 1.2, "K4 >=5/7": ok >= 5,
             "K5 terburuk>=-1,1R": uji.R.min() >= -1.1, "K6 tanpa blok terbaik>0": sum(per_blok) - max(per_blok) > 0,
             "K7 latih rata R>0": len(lat) > 0 and lat.R.mean() > 0}
        for kk, v in k.items():
            print(f"  {kk}: {'YA' if v else 'TIDAK'}")
        print("VONIS:", "BERHASIL" if all(k.values()) else "TIDAK BERHASIL")
        print("Per pasangan (ujian):", uji.groupby("sym").R.agg(["count", "sum"]).round(2).to_dict("index"))
        print("Per arah (ujian):", uji.groupby("arah").R.agg(["count", "sum"]).round(2).to_dict("index"))
        print("Per jam UTC (ujian):", uji.groupby(uji.tutup.dt.hour).R.agg(["count", "sum"]).round(2).to_dict("index"))
        print("SL pip median:", round(uji.sl_pip.median(), 1), "biaya pip median:", round(uji.biaya_pip.median(), 2),
              "risiko Rp median:", f"{uji.risk_idr.median():,.0f}")
    tr.to_csv("cuaca_trades.csv", index=False)
