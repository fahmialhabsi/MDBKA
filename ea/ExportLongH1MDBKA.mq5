//+------------------------------------------------------------------+
//| ExportLongH1MDBKA.mq5                                            |
//| B1 (12 Okt 2026) - bahan ALAT UJI DATA LAMA (backtest).          |
//| Ekspor N candle H1 TERTUTUP semua simbol Market Watch ke         |
//| Common\Files\MDBKA_<simbol>_H1_LONG.csv (format SAMA dengan      |
//| AutoExportMDBKAService). Jalankan MANUAL sekali per terminal.    |
//| Tidak menyentuh file live MDBKA_<simbol>_H1.csv / service lama.  |
//| E2b (12 Okt 2026): pilihan InpPeriod. H1 (default) = perilaku B1 |
//| persis; H4 -> Common\Files\MDBKA_<simbol>_H4_LONG.csv.           |
//| E3 (12 Okt 2026): M15 -> MDBKA_<simbol>_M15_LONG.csv (scalping). |
//| LOLOSYIOB bahan 2 (15 Okt 2026, izin Fahmi): M5 ->                |
//|   MDBKA_<simbol>_M5_LONG.csv + kolom spread (point), macd_main,  |
//|   macd_signal (iMACD 12,26,9 close; sinyal MT5 = SMA dari main). |
//|   Format H1/H4/M15 TIDAK berubah. InpSymbols membatasi simbol.   |
//+------------------------------------------------------------------+
#property script_show_inputs

input ENUM_TIMEFRAMES InpPeriod = PERIOD_H1; // timeframe: H1 (default), H4, atau M15
input int InpCandleCount = 5000;   // jumlah candle tertutup (H1 ~10 bulan; H4 ~3 tahun; M15: isi 30000 ~1,2 tahun)
input int InpRetry       = 5;      // coba ulang bila histori masih diunduh
input string InpSymbols  = "";     // kosong = semua Market Watch; M5 disarankan: USDJPY,EURJPY,GBPUSD,GBPJPY,EURUSD (M5: isi 75000 ~1 tahun)

//--- MACD standar MT5 (12,26,9): 26 = EMA lambat. Hanya untuk file M5.
#define MACD_FAST   12
#define MACD_SLOW   26
#define MACD_SIGNAL 9

//--- simbol diminta? (InpSymbols kosong = semua)
bool Wanted(const string symbol)
   {
   if(StringLen(InpSymbols) == 0)
      return true;
   string parts[];
   int n = StringSplit(InpSymbols, ',', parts);
   for(int i = 0; i < n; i++)
      {
      string p = parts[i];
      StringTrimLeft(p);
      StringTrimRight(p);
      if(p == symbol)
         return true;
      }
   return false;
   }

//--- nilai MACD sejajar dengan rates (mulai candle tertutup 1, lama -> baru); gagal = false
bool MacdBuffers(const string symbol, const int count, double &mainBuf[], double &sigBuf[])
   {
   int h = iMACD(symbol, PERIOD_M5, MACD_FAST, MACD_SLOW, MACD_SIGNAL, PRICE_CLOSE);
   if(h == INVALID_HANDLE)
      return false;
   ArraySetAsSeries(mainBuf, false);
   ArraySetAsSeries(sigBuf, false);
   bool ok = false;
   for(int t = 0; t < InpRetry * 4 && !IsStopped(); t++)
      {
      if(BarsCalculated(h) >= count + 1
         && CopyBuffer(h, 0, 1, count, mainBuf) == count
         && CopyBuffer(h, 1, 1, count, sigBuf) == count)
         {
         ok = true;
         break;
         }
      Sleep(500);                        // indikator masih menghitung
      }
   IndicatorRelease(h);
   return ok;
   }

//--- angka MACD; kosong bila tidak ada (tidak dikarang)
string MacdText(const bool ok, const double v, const int digits)
   {
   if(!ok || v == EMPTY_VALUE)
      return "";
   return DoubleToString(v, digits + 2);
   }

//--- baca candle (coba ulang selama MT5 mengunduh histori), lalu tulis file
int ExportLong(const string symbol, const int candleCount)
   {
   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = -1;
   for(int t = 0; t < InpRetry && !IsStopped(); t++)
      {
      ResetLastError();
      copied = CopyRates(symbol, InpPeriod, 1, candleCount, rates);
      if(copied >= candleCount)
         break;
      Sleep(1000);                       // histori belum lengkap: tunggu
      }
   if(copied <= 0)
      {
      PrintFormat("GAGAL %s: candle tidak terbaca (error %d)", symbol, GetLastError());
      return 0;
      }

   string tf = (InpPeriod == PERIOD_H4) ? "H4" : "H1";
   if(InpPeriod == PERIOD_M15)
      tf = "M15";
   bool m5 = (InpPeriod == PERIOD_M5);
   if(m5)
      tf = "M5";
   string filename = "MDBKA_" + symbol + "_" + tf + "_LONG.csv";
   int handle = FileOpen(filename, FILE_COMMON | FILE_WRITE | FILE_CSV | FILE_ANSI, ',');
   if(handle == INVALID_HANDLE)
      {
      PrintFormat("GAGAL buka file %s (error %d)", filename, GetLastError());
      return 0;
      }

   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double macdMain[], macdSig[];
   bool macdOk = m5 && MacdBuffers(symbol, copied, macdMain, macdSig);
   if(macdOk && iTime(symbol, PERIOD_M5, 1) != rates[copied - 1].time)
      macdOk = false;                     // candle baru terbentuk saat menunggu: MACD bisa bergeser 1 candle
   if(m5 && !macdOk)
      PrintFormat("%s: MACD belum terbaca, kolom MACD dikosongkan", symbol);
   if(m5)
      FileWrite(handle, "time", "open", "high", "low", "close", "tick_volume", "spread", "macd_main", "macd_signal");
   else
      FileWrite(handle, "time", "open", "high", "low", "close", "tick_volume");
   for(int i = 0; i < copied; i++)
      {
      if(m5)
         {
         string mMain = "", mSig = "";       // kosong bila MACD tidak terbaca
         if(macdOk)
            {
            mMain = MacdText(true, macdMain[i], digits);
            mSig  = MacdText(true, macdSig[i], digits);
            }
         FileWrite(handle,
                   TimeToString(rates[i].time, TIME_DATE | TIME_MINUTES),
                   DoubleToString(rates[i].open, digits),
                   DoubleToString(rates[i].high, digits),
                   DoubleToString(rates[i].low, digits),
                   DoubleToString(rates[i].close, digits),
                   (string)rates[i].tick_volume,
                   (string)rates[i].spread,
                   mMain,
                   mSig);
         continue;
         }
      FileWrite(handle,
                TimeToString(rates[i].time, TIME_DATE | TIME_MINUTES),
                DoubleToString(rates[i].open, digits),
                DoubleToString(rates[i].high, digits),
                DoubleToString(rates[i].low, digits),
                DoubleToString(rates[i].close, digits),
                (string)rates[i].tick_volume);
      }
   FileClose(handle);

   //--- laporan jujur: jumlah candle + rentang tanggal (bisa < diminta)
   PrintFormat("%s | %d candle | %s s/d %s%s",
               symbol, copied,
               TimeToString(rates[0].time, TIME_DATE | TIME_MINUTES),
               TimeToString(rates[copied - 1].time, TIME_DATE | TIME_MINUTES),
               copied < candleCount ? "  (KURANG dari diminta)" : "");
   return copied;
   }

void OnStart()
   {
   if(InpPeriod != PERIOD_H1 && InpPeriod != PERIOD_H4 && InpPeriod != PERIOD_M15 && InpPeriod != PERIOD_M5)
      {
      Print("GAGAL: InpPeriod wajib H1, H4, M15, atau M5 (yang dibaca MDBKA).");
      return;
      }
   PrintFormat("=== ExportLongH1MDBKA START (%s) | %s | %d candle/simbol ===",
               AccountInfoString(ACCOUNT_COMPANY), EnumToString(InpPeriod), InpCandleCount);

   int total = SymbolsTotal(true);
   int ok = 0;
   for(int i = 0; i < total && !IsStopped(); i++)
      {
      string sym = SymbolName(i, true);
      if(!Wanted(sym))
         continue;
      if(ExportLong(sym, InpCandleCount) > 0)
         ok++;
      }

   PrintFormat("=== SELESAI: %d dari %d simbol diekspor ke Common\\Files ===", ok, total);
   }
