//+------------------------------------------------------------------+
//| ExportLongH1MDBKA.mq5                                            |
//| B1 (12 Okt 2026) - bahan ALAT UJI DATA LAMA (backtest).          |
//| Ekspor N candle H1 TERTUTUP semua simbol Market Watch ke         |
//| Common\Files\MDBKA_<simbol>_H1_LONG.csv (format SAMA dengan      |
//| AutoExportMDBKAService). Jalankan MANUAL sekali per terminal.    |
//| Tidak menyentuh file live MDBKA_<simbol>_H1.csv / service lama.  |
//| E2b (12 Okt 2026): pilihan InpPeriod. H1 (default) = perilaku B1 |
//| persis; H4 -> Common\Files\MDBKA_<simbol>_H4_LONG.csv.           |
//+------------------------------------------------------------------+
#property script_show_inputs

input ENUM_TIMEFRAMES InpPeriod = PERIOD_H1; // timeframe: H1 (default) atau H4
input int InpCandleCount = 5000;   // jumlah candle tertutup (H1 ~10 bulan; H4 ~3 tahun)
input int InpRetry       = 5;      // coba ulang bila histori masih diunduh

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
   string filename = "MDBKA_" + symbol + "_" + tf + "_LONG.csv";
   int handle = FileOpen(filename, FILE_COMMON | FILE_WRITE | FILE_CSV | FILE_ANSI, ',');
   if(handle == INVALID_HANDLE)
      {
      PrintFormat("GAGAL buka file %s (error %d)", filename, GetLastError());
      return 0;
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
   if(InpPeriod != PERIOD_H1 && InpPeriod != PERIOD_H4)
      {
      Print("GAGAL: InpPeriod wajib H1 atau H4 (yang dibaca MDBKA).");
      return;
      }
   PrintFormat("=== ExportLongH1MDBKA START (%s) | %s | %d candle/simbol ===",
               AccountInfoString(ACCOUNT_COMPANY), EnumToString(InpPeriod), InpCandleCount);

   int total = SymbolsTotal(true);
   int ok = 0;
   for(int i = 0; i < total && !IsStopped(); i++)
      if(ExportLong(SymbolName(i, true), InpCandleCount) > 0)
         ok++;

   PrintFormat("=== SELESAI: %d dari %d simbol diekspor ke Common\\Files ===", ok, total);
   }
