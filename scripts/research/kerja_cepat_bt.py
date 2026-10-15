"""Metode "Kerja Cepat" (rancangan Lolosyiob, 15 Okt 2026) — uji logika + uji 7 hari data Finex nyata.

Bahan mentah 1: kuotasi bid/ask Finex berstempel waktu (arsip tick MDBKA, +-2 detik).
  Dari bahan ini saja diturunkan: candle M1/M5 (mid), spread, jam sesi.
Bahan cadangan (hanya dipakai bila 7 uji gagal): ditentukan dari analisa sebab gagal.

Pakai: python3 kerja_cepat_bt.py <gabungan-m1.csv> [--bahan2 <file>]
  gabungan-m1.csv = keluaran scalp_finex_agg.py (digabung semua hari).

PARAMETER DIBEKUKAN SEBELUM UJI (tidak boleh disetel ulang sesudah melihat hasil):
  PASANGAN  : USDJPY, EURJPY, GBPUSD, GBPJPY, EURUSD (biaya / range M5 <= 0,30; handoff bagian 3)
  JAM       : 12 candle M5 (60 menit) -> "naik/turun ke parkiran": |delta| >= 2 x rata-rata range M5 jam itu
  OBROLAN   : 6 candle M5 (30 menit) tenang: range <= 2 x rata-rata range M5 jam itu,
              dan tidak membalik > 50% gerak jam
  GELAS     : candle M5 ke-19 berwarna searah (hijau naik / merah turun) DAN close menembus range 30 menit
  SESI      : candle pemicu ditutup 07:00-16:00 UTC (16:00-01:00 WIT)
  SPREAD    : spread saat masuk <= 2 x median spread pasangan itu (288 candle M5 sebelumnya)
  SL        : sisi lain range 30 menit + 1 spread
  GERBANG   : biaya pulang-pergi (spread + komisi $1/lot) <= 10% jarak SL  (gerbang 10% MDBKA utuh)
  TP        : 1,5R ; TIME-STOP 60 menit ; SL & TP di menit yang sama -> dianggap SL (konservatif)
  KORELASI  : maks 1 posisi per pasangan; sinyal ditolak bila berbagi mata uang dengan posisi terbuka
KRITERIA BERHASIL (dibekukan): K1 n>=20, K2 rata-rata R bersih >0, K3 profit factor >=1,2,
  K4 >=5 dari 7 hari uji ber-R >0 (hari tanpa trade = tidak berhasil), K5 rugi terburuk >= -1,1R,
  K6 total R tanpa hari terbaik tetap >0.
"""
import sys

import numpy as np
import pandas as pd

PAIRS = ["USDJPY", "EURJPY", "GBPUSD", "GBPJPY", "EURUSD"]
UJI_DAYS = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13", "2026-10-14"]
N_JAM, N_OBROL = 12, 6
K_ARAH, K_TENANG, MAX_BALIK = 2.0, 2.0, 0.5
TP_R, TIME_STOP_MIN, MAX_COST_SHARE = 1.5, 60, 0.10
SPREAD_MULT, SPREAD_LOOKBACK = 2.0, 288
SESI = (7 * 60, 16 * 60)
KURS_IDR = 17880  # kurs ECB yang dipakai tinjauan risiko 15 Okt 2026


def pip_of(sym: str) -> float:
    return 0.01 if sym.endswith("JPY") else 0.0001


def comm_price(sym: str, price: float) -> float:
    """Komisi $1/lot pulang-pergi dalam satuan harga (1 lot = 100.000 unit)."""
    if sym.endswith("USD"):
        return 1.0 / 100000
    if sym.startswith("USD"):
        return price / 100000  # USDJPY: $1 = price JPY
    return 0.0  # diisi di luar (butuh USDJPY)


# ---------------------------------------------------------------- inti flowchart (murni)
def nilai_sinyal(c: pd.DataFrame, t: int) -> dict:
    """Menilai candle pemicu ke-t. c: candle M5 berurutan tanpa celah (kolom o,h,l,c).
    Mengembalikan {'arah': 'BELI'|'JUAL'|None, 'alasan': str, 'h30', 'l30'}."""
    jam = c.iloc[t - N_OBROL - N_JAM:t - N_OBROL]
    obrol = c.iloc[t - N_OBROL:t]
    g = c.iloc[t]
    r_m5 = float((jam.h - jam.l).mean())
    if r_m5 <= 0:
        return {"arah": None, "alasan": "data datar"}
    delta = float(jam.c.iloc[-1] - jam.o.iloc[0])
    if delta >= K_ARAH * r_m5:
        arah = "BELI"
    elif delta <= -K_ARAH * r_m5:
        arah = "JUAL"
    else:
        return {"arah": None, "alasan": "P1 tidak ada arah jam"}
    h30, l30 = float(obrol.h.max()), float(obrol.l.min())
    if h30 - l30 > K_TENANG * r_m5:
        return {"arah": None, "alasan": "P2 obrolan tidak tenang"}
    batas = float(jam.o.iloc[0]) + MAX_BALIK * delta
    if (arah == "BELI" and l30 < batas) or (arah == "JUAL" and h30 > batas):
        return {"arah": None, "alasan": "P2 obrolan membalik > 50%"}
    if arah == "BELI" and not (g.c > g.o and g.c > h30):
        return {"arah": None, "alasan": "P3 gelas bukan hijau tembus atas"}
    if arah == "JUAL" and not (g.c < g.o and g.c < l30):
        return {"arah": None, "alasan": "P3 gelas bukan merah tembus bawah"}
    return {"arah": arah, "alasan": "lolos P1-P3", "h30": h30, "l30": l30}


# ---------------------------------------------------------------- uji logika (7 skenario buatan)
def _candles(rows):
    return pd.DataFrame(rows, columns=["o", "h", "l", "c"])


def _naik_jam(start=100.0, step=0.10):
    rows, p = [], start
    for _ in range(N_JAM):
        rows.append([p, p + step + 0.02, p - 0.01, p + step])
        p += step
    return rows, p


def uji_logika() -> list:
    hasil = []
    jam, p = _naik_jam()  # jam naik 1,2 ; r_m5 = 0,13 -> delta 1,2 >= 0,26
    tenang = [[p, p + 0.05, p - 0.05, p] for _ in range(N_OBROL)]  # range 0,10
    kasus = [
        ("1 Naik jelas, tenang, gelas hijau tembus", jam + tenang + [[p, p + 0.2, p - 0.01, p + 0.15]], "BELI"),
        ("2 Turun jelas (cermin kasus 1)", None, "JUAL"),
        ("3 Jam tanpa arah", [[100, 100.05, 99.95, 100]] * N_JAM + tenang + [[p, p + 0.2, p, p + 0.15]], None),
        ("4 Obrolan tidak tenang", jam + [[p, p + 0.5, p - 0.5, p]] * N_OBROL + [[p, p + 0.7, p, p + 0.6]], None),
        ("5 Gelas merah padahal jam naik", jam + tenang + [[p + 0.1, p + 0.2, p, p + 0.06]], None),
        ("6 Gelas hijau tapi tidak tembus", jam + tenang + [[p - 0.02, p + 0.04, p - 0.03, p + 0.03]], None),
        ("7 Obrolan tenang tapi membalik > 50%", [[100 + 0.1 * i, 100 + 0.1 * i + 0.35, 100 + 0.1 * i - 0.15, 100 + 0.1 * i + 0.1] for i in range(N_JAM)]
         + [[100.6, 100.65, 100.55, 100.6]] * N_OBROL + [[100.6, 100.85, 100.6, 100.8]], None),
    ]
    for nama, rows, harap in kasus:
        if rows is None:  # cermin kasus 1
            base = kasus[0][1]
            rows = [[200 - o, 200 - l, 200 - h, 200 - cl] for o, h, l, cl in base]
        c = _candles(rows)
        r = nilai_sinyal(c, len(c) - 1)
        hasil.append((nama, harap, r["arah"], r["alasan"], r["arah"] == harap))
    return hasil


# ---------------------------------------------------------------- data nyata
def load_m1(path: str) -> pd.DataFrame:
    cols = ["sym", "t", "o", "h", "l", "c", "sp", "spmax", "nq", "bid", "ask"]
    d = pd.read_csv(path, names=cols)
    d = d[d.sym.isin(PAIRS)].copy()
    d["t"] = pd.to_datetime(d.t, utc=True)
    wd, mins = d.t.dt.weekday, d.t.dt.hour * 60 + d.t.dt.minute
    d = d[~((wd >= 5) | ((wd == 4) & (mins >= 21 * 60)) | ((wd == 6)))]
    return d.sort_values(["sym", "t"]).reset_index(drop=True)


def to_m5(m1: pd.DataFrame) -> pd.DataFrame:
    m1 = m1.assign(b5=m1.t.dt.floor("5min"))
    g = m1.groupby(["sym", "b5"])
    m5 = g.agg(o=("o", "first"), h=("h", "max"), l=("l", "min"), c=("c", "last"), sp=("sp", "mean"),
               bid=("bid", "last"), ask=("ask", "last"), nmin=("o", "size")).reset_index()
    return m5[m5.nmin >= 3].rename(columns={"b5": "t"})


def jalankan(m1: pd.DataFrame, m5: pd.DataFrame, saring=None):
    trades, tolak = [], {}
    m1_by = {s: x.set_index("t") for s, x in m1.groupby("sym")}
    usdjpy_last = float(m1[m1.sym == "USDJPY"].c.iloc[-1])
    sinyal = []
    for sym, c in m5.groupby("sym"):
        c = c.reset_index(drop=True)
        med_sp = c.sp.rolling(SPREAD_LOOKBACK, min_periods=50).median().shift(1)
        gap_ok = (c.t.diff() == pd.Timedelta("5min"))
        span = N_JAM + N_OBROL
        run = gap_ok.astype(int).groupby((~gap_ok).cumsum()).cumsum()
        for t in range(span, len(c)):
            if run.iloc[t] < span:
                continue
            tutup = c.t.iloc[t] + pd.Timedelta("5min")
            mnt = tutup.hour * 60 + tutup.minute
            if not (SESI[0] <= mnt <= SESI[1]):
                continue
            r = nilai_sinyal(c, t)
            if r["arah"] is None:
                tolak[r["alasan"]] = tolak.get(r["alasan"], 0) + 1
                continue
            sinyal.append((tutup, sym, r, c.iloc[t], med_sp.iloc[t]))
    sinyal.sort(key=lambda x: x[0])
    terbuka = []  # (sym, sampai)
    for tutup, sym, r, g, med in sinyal:
        terbuka = [x for x in terbuka if x[1] > tutup]
        sp_in = float(g.ask - g.bid)
        if np.isnan(med) or sp_in > SPREAD_MULT * med:
            tolak["P4 spread lebar / belum ada median"] = tolak.get("P4 spread lebar / belum ada median", 0) + 1
            continue
        if any(x[0] == sym or set([x[0][:3], x[0][3:]]) & set([sym[:3], sym[3:]]) for x in terbuka):
            tolak["P6 korelasi / posisi masih terbuka"] = tolak.get("P6 korelasi / posisi masih terbuka", 0) + 1
            continue
        if saring is not None:
            alasan = saring(sym, tutup)
            if alasan:
                tolak[alasan] = tolak.get(alasan, 0) + 1
                continue
        beli = r["arah"] == "BELI"
        entry = float(g.ask if beli else g.bid)
        sl = r["l30"] - sp_in if beli else r["h30"] + sp_in
        risk = entry - sl if beli else sl - entry
        if sym.endswith("JPY") and not sym.startswith("USD"):
            com = usdjpy_last / 100000
        else:
            com = comm_price(sym, entry)
        if risk <= 0 or (sp_in + com) > MAX_COST_SHARE * risk:
            tolak["P5 gerbang biaya 10%"] = tolak.get("P5 gerbang biaya 10%", 0) + 1
            continue
        tp = entry + TP_R * risk if beli else entry - TP_R * risk
        path = m1_by[sym].loc[tutup:tutup + pd.Timedelta(minutes=TIME_STOP_MIN - 1)]
        if len(path) < TIME_STOP_MIN * 0.8:
            tolak["data habis / celah saat posisi"] = tolak.get("data habis / celah saat posisi", 0) + 1
            continue
        keluar, cara, jam_keluar = None, "TIME", path.index[-1] + pd.Timedelta("1min")
        for ts, m in path.iterrows():
            half = m.sp / 2
            if beli:
                lo, hi = m.l - half, m.h - half
                if lo <= sl:
                    keluar, cara = min(sl, m.o - half), "SL"
                elif hi >= tp:
                    keluar, cara = tp, "TP"
            else:
                lo, hi = m.l + half, m.h + half
                if hi >= sl:
                    keluar, cara = max(sl, m.o + half), "SL"
                elif lo <= tp:
                    keluar, cara = tp, "TP"
            if keluar is not None:
                jam_keluar = ts + pd.Timedelta("1min")
                break
        if keluar is None:
            last = path.iloc[-1]
            keluar = float(last.bid if beli else last.ask)
        gross = (keluar - entry) if beli else (entry - keluar)
        rnet = gross / risk - com / risk
        pip = pip_of(sym)
        pipval_001 = 0.10 if sym.endswith("USD") else (0.10 * 100 / usdjpy_last if sym.endswith("JPY") else 0.10 / entry)
        risk_idr = risk / pip * pipval_001 * KURS_IDR
        trades.append({"tutup": tutup, "hari": tutup.strftime("%Y-%m-%d"), "sym": sym, "arah": r["arah"], "entry": entry,
                       "sl_pip": risk / pip, "biaya_pip": (sp_in + com) / pip, "cara": cara, "R": rnet,
                       "menit": (jam_keluar - tutup).total_seconds() / 60, "risk_idr_001": risk_idr,
                       "hasil_idr_001": rnet * risk_idr})
        terbuka.append((sym, jam_keluar))
    return pd.DataFrame(trades), tolak


def rapor(tr: pd.DataFrame, tolak: dict, judul: str) -> bool:
    print(f"\n===== {judul} =====")
    print("Ditolak per langkah:", dict(sorted(tolak.items(), key=lambda x: -x[1])))
    if tr.empty:
        print("Tidak ada trade."); return False
    u = tr[tr.hari.isin(UJI_DAYS)]
    print(f"Pemanasan 5 Okt (tidak dihitung): {len(tr) - len(u)} trade")
    hari_ok = 0
    for i, d in enumerate(UJI_DAYS, 1):
        x = u[u.hari == d]
        s = x.R.sum() if len(x) else 0.0
        ok = len(x) > 0 and s > 0
        hari_ok += ok
        print(f"Uji {i} {d}: n={len(x):2d} menang={int((x.R > 0).sum()):2d} R={s:+.2f} "
              f"Rp(0,01 lot)={x.hasil_idr_001.sum():+,.0f} -> {'BERHASIL' if ok else 'TIDAK'}")
    n = len(u)
    if n == 0:
        print("Tidak ada trade di 7 hari uji."); return False
    win = u.R[u.R > 0].sum(); loss = -u.R[u.R < 0].sum()
    pf = win / loss if loss > 0 else float("inf")
    per_hari = u.groupby("hari").R.sum()
    tanpa_terbaik = per_hari.sum() - per_hari.max()
    k = {"K1 n>=20": n >= 20, "K2 rata-rata R>0": u.R.mean() > 0, "K3 PF>=1,2": pf >= 1.2,
         "K4 >=5/7 hari": hari_ok >= 5, "K5 rugi terburuk>=-1,1R": u.R.min() >= -1.1, "K6 tanpa hari terbaik >0": tanpa_terbaik > 0}
    print(f"Total n={n} win={100 * (u.R > 0).mean():.0f}% rata R={u.R.mean():+.3f} PF={pf:.2f} terburuk={u.R.min():+.2f} "
          f"tanpa hari terbaik={tanpa_terbaik:+.2f}R total Rp(0,01 lot)={u.hasil_idr_001.sum():+,.0f}")
    print("Cara keluar:", u.cara.value_counts().to_dict(), "| lama rata (menit):", round(u.menit.mean(), 1))
    print("Per pasangan:", u.groupby("sym").R.agg(["count", "sum"]).round(2).to_dict("index"))
    print("Per jam UTC:", u.groupby(u.tutup.dt.hour).R.agg(["count", "sum"]).round(2).to_dict("index"))
    print("SL pip median:", round(u.sl_pip.median(), 1), "| biaya pip median:", round(u.biaya_pip.median(), 2),
          "| risiko Rp median (0,01 lot):", f"{u.risk_idr_001.median():,.0f}")
    for kk, v in k.items():
        print(f"  {kk}: {'YA' if v else 'TIDAK'}")
    lolos = all(k.values())
    print("VONIS:", "BERHASIL" if lolos else "TIDAK BERHASIL")
    return lolos


if __name__ == "__main__":
    print("===== Uji logika flowchart (7 skenario buatan) =====")
    for nama, harap, dapat, alasan, ok in uji_logika():
        print(f"{'OK  ' if ok else 'GAGAL'} {nama}: harap={harap} dapat={dapat} ({alasan})")
    m1 = load_m1(sys.argv[1])
    m5 = to_m5(m1)
    tr, tolak = jalankan(m1, m5)
    rapor(tr, tolak, "Kerja Cepat — bahan 1 (kuotasi bid/ask)")
    tr.to_csv("kerja_cepat_trades_bahan1.csv", index=False)
