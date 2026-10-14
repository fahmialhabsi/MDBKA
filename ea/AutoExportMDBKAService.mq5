//+------------------------------------------------------------------+
//| AutoExportMDBKAService.mq5                                       |
//| Ekspor 200 candle H1 tertutup tiap ada candle H1 baru (simbol)   |
//| F5 (Tahap 16, 15 Okt 2026): juga M15/D1/W1 tertutup, tiap ada     |
//| candle baru di timeframe itu. File H1 tetap sama persis.          |
//| Hanya MEMBACA candle & menulis CSV — tidak pernah mengirim order. |
//+------------------------------------------------------------------+
#property service

#define CANDLE_COUNT   200   // 8 Okt 2026: 50 -> 200 agar RSI/ATR/MACD (Wilder/EMA) mendekati MT5
#define CHECK_EVERY_MS 10000
#define COUNT_M15      200   // F5: ±2 hari perdagangan
#define COUNT_D1       300   // F5: ±1 tahun (level harian, arah D1)
#define COUNT_W1       150   // F5: ±3 tahun (arah mingguan)

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
   return ExportSymbolCandlesTf(symbol, PERIOD_H1, "H1", candleCount);
   }

//--- F5: ekspor candle tertutup timeframe apa pun → MDBKA_<simbol>_<TF>.csv
bool ExportSymbolCandlesTf(string symbol, ENUM_TIMEFRAMES tf, string tfName, int candleCount)
   {
   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(symbol, tf, 1, candleCount, rates);
   if(copied <= 0)
      {
      PrintFormat("Gagal baca candle %s %s: %d", symbol, tfName, GetLastError());
      return false;
      }

   string filename = "MDBKA_" + symbol + "_" + tfName + ".csv";
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

//--- F5: 1 bila file timeframe ini ditulis ulang (candle tertutup baru), selain itu 0
int ExportIfNewBar(const string sym, ENUM_TIMEFRAMES tf, const string tfName, int count)
   {
   datetime bar = iTime(sym, tf, 1);
   if(bar == 0)
      return 0;                              // data timeframe ini belum siap
   int idx = FindIndex(sym + "|" + tfName);
   if(bar == g_last[idx] || !ExportSymbolCandlesTf(sym, tf, tfName, count))
      return 0;
   g_last[idx] = bar;
   return 1;
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
         // F5: timeframe tambahan, masing-masing hanya saat candle-nya berganti.
         exported += ExportIfNewBar(sym, PERIOD_M15, "M15", COUNT_M15);
         exported += ExportIfNewBar(sym, PERIOD_D1, "D1", COUNT_D1);
         exported += ExportIfNewBar(sym, PERIOD_W1, "W1", COUNT_W1);
         }

      if(exported > 0)
         PrintFormat("%s | Update candle (H1/M15/D1/W1): %d file diekspor",
                     TimeToString(TimeCurrent(), TIME_DATE | TIME_MINUTES), exported);

      Sleep(CHECK_EVERY_MS);
      }

   Print("=== AutoExportMDBKA Service STOP ===");
   }