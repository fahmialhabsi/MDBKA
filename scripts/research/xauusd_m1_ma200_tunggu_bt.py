# Uji sinyal M1 MA200 XAUUSDm Exness: lama TUNGGU + analisa tambahan (15 Okt 2026). Pakai: python3 xauusd_m1_ma200_tunggu_bt.py (baca MDBKA_XAUUSDm_M1_LONG.csv)
import pandas as pd, numpy as np
d=pd.read_csv('/mnt/user-data/uploads/Files/MDBKA_XAUUSDm_M1_LONG.csv'); d['t']=pd.to_datetime(d.time,format='%Y.%m.%d %H:%M',utc=True)
c,h,l=d.close.values,d.high.values,d.low.values; sp=d.spread.values*0.001; n=len(c)
ma=d.close.rolling(200).mean().values; slope=ma-np.roll(ma,20)
dl=d.close.diff(); up=dl.clip(lower=0).ewm(alpha=1/14,adjust=False).mean(); dn=(-dl.clip(upper=0)).ewm(alpha=1/14,adjust=False).mean(); rsi=(100-100/(1+up/dn)).values
pc=np.roll(c,1); tr=np.maximum(h-l,np.maximum(abs(h-pc),abs(l-pc))); atr=pd.Series(tr).ewm(alpha=1/14,adjust=False).mean().values
# timeframe besar dari M1 (candle tertutup saja -> shift)
def big(rule,maN):
    x=d.set_index('t').close.resample(rule).last().dropna(); m=x.rolling(maN).mean()
    side=np.sign(x-m).shift(1)  # candle sebelumnya (sudah tertutup)
    return side.reindex(d.t,method='ffill').values
h1=big('1h',200); h4=big('4h',200)
# badai M15
m15=d.set_index('t').resample('15min').agg({'high':'max','low':'min'}).dropna()
ang=m15.high.rolling(4).max()-m15.low.rolling(4).min(); med=ang.rolling(96,min_periods=40).median().shift(1)
badai=(ang>2*med).shift(1).reindex(d.t,method='ffill').fillna(False).values
jam=d.t.dt.hour.values
above=c>ma; below=c<ma
base_b=above&~np.roll(above,1)&(slope>0)&(rsi>50)&(rsi<70)
base_s=below&~np.roll(below,1)&(slope<0)&(rsi<50)&(rsi>30)
cut=d.t.iloc[0]+(d.t.iloc[-1]-d.t.iloc[0])*0.6
def run(delay=0, filt=None):
    res=[]; i=300
    while i<n-delay-32:
        if base_b[i] or base_s[i]:
            b=bool(base_b[i]); k=i+delay
            still=(c[k]>ma[k]) if b else (c[k]<ma[k])
            if still and (filt is None or filt(k,b)):
                e=c[k]+sp[k] if b else c[k]; dist=1.5*atr[k]; sl=e-dist if b else e+dist; tp=e+dist if b else e-dist; out=None
                for j in range(k+1,k+31):
                    if b:
                        if l[j]<=sl: out=sl;break
                        if h[j]>=tp: out=tp;break
                    else:
                        if h[j]+sp[j]>=sl: out=sl;break
                        if l[j]+sp[j]<=tp: out=tp;break
                if out is None: out=c[j] if b else c[j]+sp[j]
                res.append((d.t[k],((out-e) if b else (e-out))/dist,(out-e) if b else (e-out))); i=j; continue
        i+=1
    t=pd.DataFrame(res,columns=['t','R','usd']); a,u=t[t.t<cut],t[t.t>=cut]
    return len(a),a.R.mean(),(a.R>0).mean(),len(u),u.R.mean(),(u.R>0).mean(),u.usd.sum()
def show(nm,r): print(f"{nm:44s} LATIH n={r[0]:5d} R={r[1]:+.3f} menang={100*r[2]:4.1f}% | UJIAN n={r[3]:4d} R={r[4]:+.3f} menang={100*r[5]:4.1f}% ${r[6]:+.1f}")
print("== A. Lama menunggu setelah tembus MA200 (masih di sisi yang sama) ==")
for dly in (0,5,10,15,30,60): show(f"tunggu {dly} menit",run(dly))
print("== B. Analisa tambahan (tanpa menunggu) ==")
F={'H1 searah (harga H1 di sisi MA200 yang sama)':lambda k,b: h1[k]==(1 if b else -1),
   'H4 searah':lambda k,b: h4[k]==(1 if b else -1),
   'H1 & H4 searah':lambda k,b: h1[k]==(1 if b else -1) and h4[k]==(1 if b else -1),
   'jam ramai 13-17 UTC (22-02 WIT)':lambda k,b: 13<=jam[k]<17,
   'jam London 07-12 UTC':lambda k,b: 7<=jam[k]<12,
   'tidak badai':lambda k,b: not badai[k],
   'sedang badai':lambda k,b: bool(badai[k]),
   'H1&H4 searah + 13-17 UTC + tidak badai':lambda k,b: h1[k]==(1 if b else -1) and h4[k]==(1 if b else -1) and 13<=jam[k]<17 and not badai[k]}
for nm,f in F.items(): show(nm,run(0,f))
