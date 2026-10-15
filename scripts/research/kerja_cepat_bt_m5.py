"""Lolosyiob — uji putaran 2 metode "Kerja Cepat" dengan bahan 2 (riwayat candle M5 server Finex).

Pakai: python3 kerja_cepat_bt_m5.py <folder berisi MDBKA_<PAIR>_M5_LONG.csv> [--cocok gabungan-m1.csv]

Parameter langkah P1-P6 SAMA PERSIS dengan kerja_cepat_bt.py (dibekukan 15 Okt 2026, sebelum data ini ada).
Penyesuaian karena bentuk bahan 2 (bukan penyetelan):
  - Candle MT5 = harga BID; ask = bid + spread (kolom spread, point). Spread masuk = spread candle pemicu.
  - Jam server Finex = jam New York + 7 (buka mingguan selalu Senin 01:00 server), lalu diubah ke UTC.
  - Jalur keluar dinilai per candle M5 (bukan M1): SL & TP di candle yang sama -> SL (konservatif).
  - Uji 1-7 = 7 blok waktu berurutan dengan panjang kalender sama.
Varian B (didaftarkan di dokumen sebelum data ada): + saksi MACD(12,26,9): BELI bila macd_main > 0, JUAL bila < 0.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kerja_cepat_bt as kc  # noqa: E402  (nilai_sinyal + parameter beku)

N_BLOK = 7


def load(folder: str) -> dict:
    out = {}
    for s in kc.PAIRS:
        d = pd.read_csv(os.path.join(folder, f"MDBKA_{s}_M5_LONG.csv"))
        srv = pd.to_datetime(d.time, format="%Y.%m.%d %H:%M")
        ny = (srv - pd.Timedelta(hours=7)).dt.tz_localize("America/New_York", ambiguous="NaT", nonexistent="NaT")
        d["t"] = ny.dt.tz_convert("UTC")
        d = d.dropna(subset=["t"]).rename(columns={"open": "o", "high": "h", "low": "l", "close": "c"})
        pt = 0.001 if s.endswith("JPY") else 0.00001
        d["sp"] = d.spread * pt
        out[s] = d.reset_index(drop=True)[["t", "o", "h", "l", "c", "sp", "macd_main"]]
    return out


def jalankan(data: dict, varian_b: bool, dari=None, sampai=None):
    trades, tolak = [], {}
    span = kc.N_JAM + kc.N_OBROL
    jpy = data["USDJPY"].set_index("t").c
    sinyal = []
    for sym, c in data.items():
        if dari is not None:
            c = c[(c.t >= dari - pd.Timedelta(days=3)) & (c.t < sampai + pd.Timedelta(days=1))].reset_index(drop=True)
        med = c.sp.rolling(kc.SPREAD_LOOKBACK, min_periods=50).median().shift(1)
        ok5 = c.t.diff() == pd.Timedelta("5min")
        run = ok5.astype(int).groupby((~ok5).cumsum()).cumsum()
        for t in range(span, len(c)):
            if run.iloc[t] < span:
                continue
            tutup = c.t.iloc[t] + pd.Timedelta("5min")
            if dari is not None and not (dari <= tutup < sampai):
                continue
            mnt = tutup.hour * 60 + tutup.minute
            if not (kc.SESI[0] <= mnt <= kc.SESI[1]):
                continue
            r = kc.nilai_sinyal(c, t)
            if r["arah"] is None:
                tolak[r["alasan"]] = tolak.get(r["alasan"], 0) + 1
                continue
            if varian_b:
                m = c.macd_main.iloc[t]
                if pd.isna(m) or (r["arah"] == "BELI" and not m > 0) or (r["arah"] == "JUAL" and not m < 0):
                    tolak["P7 saksi MACD tidak searah"] = tolak.get("P7 saksi MACD tidak searah", 0) + 1
                    continue
            sinyal.append((tutup, sym, t, r, med.iloc[t], c))
    sinyal.sort(key=lambda x: (x[0], x[1]))
    terbuka = []
    for tutup, sym, t, r, md, c in sinyal:
        terbuka = [x for x in terbuka if x[1] > tutup]
        g = c.iloc[t]
        sp_in = float(g.sp)
        if np.isnan(md) or sp_in > kc.SPREAD_MULT * md:
            tolak["P4 spread lebar / belum ada median"] = tolak.get("P4 spread lebar / belum ada median", 0) + 1
            continue
        if any(set([x[0][:3], x[0][3:]]) & set([sym[:3], sym[3:]]) for x in terbuka):
            tolak["P6 korelasi / posisi masih terbuka"] = tolak.get("P6 korelasi / posisi masih terbuka", 0) + 1
            continue
        beli = r["arah"] == "BELI"
        entry = float(g.c + sp_in) if beli else float(g.c)
        sl = r["l30"] - sp_in if beli else r["h30"] + 2 * sp_in  # h30 bid -> ask + 1 spread
        risk = entry - sl if beli else sl - entry
        uj = float(jpy.asof(g.t)) if sym.endswith("JPY") else None
        com = 1.0 / 100000 if sym.endswith("USD") else (uj / 100000 if uj else np.nan)
        if not (risk > 0) or np.isnan(com) or (sp_in + com) > kc.MAX_COST_SHARE * risk:
            tolak["P5 gerbang biaya 10%"] = tolak.get("P5 gerbang biaya 10%", 0) + 1
            continue
        n_bar = kc.TIME_STOP_MIN // 5
        path = c.iloc[t + 1:t + 1 + n_bar]
        if len(path) < n_bar or (path.t.diff().dropna() != pd.Timedelta("5min")).any() or path.t.iloc[0] != tutup:
            tolak["celah data saat posisi"] = tolak.get("celah data saat posisi", 0) + 1
            continue
        tp = entry + kc.TP_R * risk if beli else entry - kc.TP_R * risk
        keluar, cara, k = None, "TIME", n_bar
        for i, m in enumerate(path.itertuples(), 1):
            if beli:
                if m.l <= sl:
                    keluar, cara = min(sl, m.o), "SL"
                elif m.h >= tp:
                    keluar, cara = tp, "TP"
            else:
                if m.h + m.sp >= sl:
                    keluar, cara = max(sl, m.o + m.sp), "SL"
                elif m.l + m.sp <= tp:
                    keluar, cara = tp, "TP"
            if keluar is not None:
                k = i
                break
        if keluar is None:
            last = path.iloc[-1]
            keluar = float(last.c if beli else last.c + last.sp)
        gross = (keluar - entry) if beli else (entry - keluar)
        rnet = gross / risk - com / risk
        pip = kc.pip_of(sym)
        pv = 0.10 if sym.endswith("USD") else 0.10 * 100 / uj
        risk_idr = risk / pip * pv * kc.KURS_IDR
        trades.append({"tutup": tutup, "sym": sym, "arah": r["arah"], "sl_pip": risk / pip, "biaya_pip": (sp_in + com) / pip,
                       "cara": cara, "R": rnet, "menit": 5 * k, "risk_idr_001": risk_idr, "hasil_idr_001": rnet * risk_idr})
        terbuka.append((sym, tutup + pd.Timedelta(minutes=5 * k)))
    return pd.DataFrame(trades), tolak


def blok_batas(data: dict):
    t0 = max(d.t.iloc[0] for d in data.values()) + pd.Timedelta(days=2)  # pemanasan median spread
    t1 = min(d.t.iloc[-1] for d in data.values())
    edges = [t0 + (t1 - t0) * i / N_BLOK for i in range(N_BLOK + 1)]
    return edges


def rapor(tr: pd.DataFrame, tolak: dict, edges, judul: str) -> dict:
    print(f"\n===== {judul} =====")
    print("Ditolak per langkah:", dict(sorted(tolak.items(), key=lambda x: -x[1])))
    blok_ok = 0
    per_blok = []
    for i in range(N_BLOK):
        x = tr[(tr.tutup >= edges[i]) & (tr.tutup < edges[i + 1])] if len(tr) else tr
        s = float(x.R.sum()) if len(x) else 0.0
        ok = len(x) > 0 and s > 0
        blok_ok += ok
        per_blok.append(s)
        print(f"Uji {i + 1} {edges[i]:%d %b %Y}–{edges[i + 1]:%d %b %Y}: n={len(x):3d} menang={int((x.R > 0).sum()) if len(x) else 0:3d} "
              f"R={s:+7.2f} Rp(0,01 lot)={x.hasil_idr_001.sum() if len(x) else 0:+11,.0f} -> {'BERHASIL' if ok else 'TIDAK'}")
    if tr.empty:
        print("Tidak ada trade"); return {"lolos": False, "per_blok": per_blok}
    win = tr.R[tr.R > 0].sum(); loss = -tr.R[tr.R < 0].sum()
    pf = win / loss if loss > 0 else float("inf")
    tanpa = sum(per_blok) - max(per_blok)
    k = {"K1 n>=20": len(tr) >= 20, "K2 rata-rata R>0": tr.R.mean() > 0, "K3 PF>=1,2": pf >= 1.2,
         "K4 >=5/7 blok": blok_ok >= 5, "K5 rugi terburuk>=-1,1R": tr.R.min() >= -1.1, "K6 tanpa blok terbaik >0": tanpa > 0}
    print(f"Total n={len(tr)} win={100 * (tr.R > 0).mean():.1f}% rata R={tr.R.mean():+.3f} PF={pf:.2f} terburuk={tr.R.min():+.2f} "
          f"tanpa blok terbaik={tanpa:+.2f}R total R={tr.R.sum():+.2f} Rp(0,01 lot)={tr.hasil_idr_001.sum():+,.0f}")
    print("Cara keluar:", tr.cara.value_counts().to_dict(), "| lama rata (menit):", round(tr.menit.mean(), 1))
    print("Per pasangan:", tr.groupby("sym").R.agg(["count", "sum", "mean"]).round(3).to_dict("index"))
    print("Per jam UTC:", tr.groupby(tr.tutup.dt.hour).R.agg(["count", "sum"]).round(2).to_dict("index"))
    print("Per arah:", tr.groupby("arah").R.agg(["count", "sum"]).round(2).to_dict("index"))
    print("SL pip median:", round(tr.sl_pip.median(), 1), "| biaya pip median:", round(tr.biaya_pip.median(), 2),
          "| risiko Rp median (0,01 lot):", f"{tr.risk_idr_001.median():,.0f}")
    for kk, v in k.items():
        print(f"  {kk}: {'YA' if v else 'TIDAK'}")
    lolos = all(k.values())
    print("VONIS:", "BERHASIL" if lolos else "TIDAK BERHASIL")
    return {"lolos": lolos, "per_blok": per_blok}


if __name__ == "__main__":
    data = load(sys.argv[1])
    edges = blok_batas(data)
    print("Rentang uji:", edges[0], "s/d", edges[-1])
    tra, ta = jalankan(data, False)
    tra = tra[(tra.tutup >= edges[0]) & (tra.tutup < edges[-1])]
    ra = rapor(tra, ta, edges, "Varian A — Kerja Cepat (vonis utama)")
    trb, tb = jalankan(data, True)
    trb = trb[(trb.tutup >= edges[0]) & (trb.tutup < edges[-1])]
    rb = rapor(trb, tb, edges, "Varian B — Kerja Cepat + saksi MACD")
    lebih_baik = sum(b >= a for a, b in zip(ra["per_blok"], rb["per_blok"]))
    print(f"\nVarian B tidak lebih buruk dari A di {lebih_baik}/7 blok")
    tra.to_csv("kc_m5_A.csv", index=False)
    trb.to_csv("kc_m5_B.csv", index=False)
