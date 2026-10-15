"""Analisa akun pembelajaran (15 Okt 2026): titik lemah & titik baik per faktor, latih 70% / ujian 30%.

Pakai: python3 learning_account_factors.py posisi.json <folder Common Files>
posisi.json dari scripts/research/dump_account_trades.ts. Hasil: docs/ANALISA-AKUN-PEMBELAJARAN-EXNESS-2026-10-15.md.
"""
import json, sys, pandas as pd, numpy as np
t=pd.DataFrame(json.load(open(sys.argv[1])))
D1DIR=sys.argv[2]
t["open"]=pd.to_datetime(t.openTime,format="%Y.%m.%d %H:%M:%S")
t=t.sort_values("open").reset_index(drop=True)
t["dir"]=np.where(t.side=="BUY",1,-1)
t["move"]=t.dir*(t.closePrice-t.openPrice)          # gerak harga (bebas lot)
t["win"]=t.net>0
t["jam"]=t.open.dt.hour                              # Exness server = UTC+0
t["sesi"]=pd.cut(t.jam,[-1,6,11,15,20,23],labels=["ASIA 00-07","EROPA 07-12","EROPA+AS 12-16","AS 16-21","SEPI 21-24"])
t["durasi"]=pd.cut(t.durationMin,[-1,0,4,14,59,179,1e9],labels=["<1 mnt","1-4 mnt","5-14 mnt","15-59 mnt","1-3 jam",">3 jam"])
t["lot"]=pd.cut(t.volume,[0,0.019,0.099,0.99,9.99,1e9],labels=["0,01","0,02-0,09","0,1-0,99","1-9,99",">=10"])
t["hari"]=t.open.dt.day_name()
# arah D1 (MA50 D1, kemiringan 5 hari, pita 0,25 ATR — sama dengan d1Direction MDBKA)
def d1dir_series(sym):
    try: d=pd.read_csv(f"{D1DIR}/MDBKA_{sym}_D1.csv")
    except FileNotFoundError: return None
    d["day"]=d.time.str[:10]
    d["ma"]=d.close.rolling(50).mean(); d["mab"]=d.ma.shift(5)
    tr=pd.concat([d.high-d.low,(d.high-d.close.shift()).abs(),(d.low-d.close.shift()).abs()],axis=1).max(axis=1)
    d["atr"]=tr.ewm(alpha=1/14,adjust=False).mean()
    def lab(r):
        if pd.isna(r.ma) or pd.isna(r.mab): return None
        b=0.25*r.atr
        if r.close>r.ma+b and r.ma>r.mab: return "NAIK"
        if r.close<r.ma-b and r.ma<r.mab: return "TURUN"
        return "NETRAL"
    d["lab"]=d.apply(lab,axis=1)
    return dict(zip(d.day,d.lab))
maps={s:d1dir_series(s) for s in t.symbol.unique()}
def d1_for(r):
    m=maps.get(r.symbol); 
    if not m: return None
    day=r.openTime[:10]; prev=[k for k in m if k<day]
    return m[max(prev)] if prev else None
t["d1"]=t.apply(d1_for,axis=1)
t["vs_d1"]=np.where(t.d1.isna(),"?",np.where(t.d1=="NETRAL","D1 netral",np.where(((t.dir==1)&(t.d1=="NAIK"))|((t.dir==-1)&(t.d1=="TURUN")),"searah D1","melawan D1")))
cut=int(len(t)*0.7); t["fase"]=np.where(t.index<cut,"latih","ujian")
print("Periode",t.open.min(),"->",t.open.max(),"| posisi",len(t),"| batas latih/ujian",t.open.iloc[cut])
print("Simbol",t.symbol.value_counts().to_dict(),"| exit",t.exit.value_counts().to_dict(),"| ber-SL",int(t.sl.notna().sum()))
def summ(g):
    return pd.Series(dict(n=len(g),menang=round(g.win.mean()*100,1),gerak_rata=round(g.move.mean(),3),bersih_juta=round(g.net.sum()/1e6,1)))
for f in ["symbol","sesi","durasi","lot","vs_d1","side","exit","hari"]:
    sub=t[t.symbol=="XAUUSDm"] if f!="symbol" else t
    tab=sub.groupby([f,"fase"],observed=True).apply(summ,include_groups=False).unstack("fase")
    print(f"\n== {f} (XAUUSDm kecuali baris simbol) ==")
    print(tab.to_string())

# Rasio untung:rugi dan win rate impas (bagian 2 dokumen).
x = t[t.symbol == "XAUUSDm"]
for f in ["latih", "ujian"]:
    g = x[x.fase == f]
    w, l = g[g.move > 0].move, g[g.move <= 0].move
    print(f, "untung rata", round(w.mean(), 2), "rugi rata", round(l.mean(), 2), "rasio", round(w.mean() / -l.mean(), 2),
          "menang %", round((g.move > 0).mean() * 100, 1), "impas %", round(100 * (-l.mean()) / (w.mean() - l.mean()), 1))
print("dibuka pada detik yang sama:", round(x.duplicated("openTime").mean(), 3), "| porsi rugi Rp dari lot>=10:", round(x[x.volume >= 10].net.sum() / x.net.sum(), 2))
