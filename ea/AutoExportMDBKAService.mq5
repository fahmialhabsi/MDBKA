//+------------------------------------------------------------------+
//| AutoExportMDBKAService.mq5                                       |
//| Ekspor 200 candle H1 tertutup tiap ada candle H1 baru (simbol)   |
//+------------------------------------------------------------------+
#property service

#define CANDLE_COUNT   200   // 8 Okt 2026: 50 -> 200 agar RSI/ATR/MACD (Wilder/EMA) mendekati MT5
#define CHECK_EVERY_MS 10000

string   g_names[];
datetime g_last[];

//--- cari/daftarkan simbol di tabel waktu candle terakhir
int FindIndex(const string sym)
   {
   int n = ArraySize(g_names);
   for(int i = 0; i < n; i++)
      if(g_names[i] == sym)
         return i;
   ArrayResize(g_names, n + 1);
   ArrayResize(g_last, n + 1);
   g_names[n] = sym;
   g_last[n]  = 0;
   return n;
   }

//--- ekspor candle; baca data dulu, baru tulis file
bool ExportSymbolCandles(string symbol, int candleCount)
   {
   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(symbol, PERIOD_H1, 1, candleCount, rates);
   if(copied <= 0)
      {
      PrintFormat("Gagal baca candle %s: %d", symbol, GetLastError());
      return false;
      }

   string filename = "MDBKA_" + symbol + "_H1.csv";
   int handle = FileOpen(filename, FILE_COMMON | FILE_WRITE | FILE_CSV | FILE_ANSI, ',');
   if(handle == INVALID_HANDLE)
      {
      PrintFormat("Gagal buka file %s. Error=%d", filename, GetLastError());
      return false;
      }

   FileWrite(handle, "time", "open", "high", "low", "close", "tick_volume");
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   for(int i = 0; i < copied; i++)
      {
      FileWrite(handle,
                TimeToString(rates[i].time, TIME_DATE | TIME_MINUTES),
                DoubleToString(rates[i].open, digits),
                DoubleToString(rates[i].high, digits),
                DoubleToString(rates[i].low, digits),
                DoubleToString(rates[i].close, digits),
                (string)rates[i].tick_volume);
      }
   FileClose(handle);
   return true;
   }

//--- loop utama service
void OnStart()
   {
   PrintFormat("=== AutoExportMDBKA Service START (%s) ===",
               AccountInfoString(ACCOUNT_COMPANY));

   while(!IsStopped())
      {
      int total    = SymbolsTotal(true);
      int exported = 0;

      for(int i = 0; i < total && !IsStopped(); i++)
         {
         string   sym       = SymbolName(i, true);
         datetime closedBar = iTime(sym, PERIOD_H1, 1);
         if(closedBar == 0)
            continue;                        // data H1 belum siap

         int idx = FindIndex(sym);
         if(closedBar != g_last[idx] && ExportSymbolCandles(sym, CANDLE_COUNT))
            {
            g_last[idx] = closedBar;
            exported++;
            }
         }

      if(exported > 0)
         PrintFormat("%s | Update H1: %d file diekspor",
                     TimeToString(TimeCurrent(), TIME_DATE | TIME_MINUTES), exported);

      Sleep(CHECK_EVERY_MS);
      }

   Print("=== AutoExportMDBKA Service STOP ===");
   }