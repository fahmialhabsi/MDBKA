//+------------------------------------------------------------------+
//| MDBKACalendarService.mq5 - ekspor Kalender Ekonomi MT5 (MDBKA)   |
//| Satpam Kalender langkah K1 (9 Okt 2026).                         |
//| Service MT5: jalan sendiri tanpa chart. Tiap CheckSeconds menulis |
//| ulang event penting (Tinggi + Sedang) dari kemarin s/d 7 hari ke |
//| depan. Jam = JAM SERVER broker (sama dengan quotes/positions).   |
//| Output: Common\Files\MDBKA_Calendar_<login>.csv (12 kolom).      |
//| + Satpam Sesi S1 (9 Okt 2026): MDBKA_Sessions_<login>.csv =      |
//|   jam TRADING tiap simbol Market Watch per hari (jam server),     |
//|   7 kolom: Symbol,Day(0=Minggu..6=Sabtu),Index,FromMin,ToMin,     |
//|   Company,Generated. FromMin/ToMin = menit sejak 00:00 (0..1440). |
//| + Spesifikasi V1 (9 Okt 2026): MDBKA_Specs_<login>.csv = spesifikasi|
//|   resmi tiap simbol Market Watch (contract size, tick, volume,     |
//|   swap, mata uang) agar MDBKA memverifikasi catatannya sendiri.    |
//| Pasang di KEDUA terminal (Finex & OTB): copy ke MQL5/Services,   |
//| compile (F7), Navigator > Services > klik kanan > Add Service >  |
//| pilih file ini > Start. Hanya membaca kalender; tidak trading.   |
//+------------------------------------------------------------------+
#property service
#property strict

input string FilePrefix   = "MDBKA_Calendar";
input int    DaysBack     = 1;
input int    DaysAhead    = 7;
input int    CheckSeconds = 300;
input string SessionPrefix = "MDBKA_Sessions";
input string SpecPrefix    = "MDBKA_Specs";

string Clean(string s)
  {
   StringReplace(s, ",", " ");
   StringReplace(s, "\"", "'");
   StringReplace(s, "\r", " ");
   StringReplace(s, "\n", " ");
   return(s);
  }

string ImportanceName(const ENUM_CALENDAR_EVENT_IMPORTANCE v)
  {
   if(v == CALENDAR_IMPORTANCE_HIGH)     return("HIGH");
   if(v == CALENDAR_IMPORTANCE_MODERATE) return("MODERATE");
   if(v == CALENDAR_IMPORTANCE_LOW)      return("LOW");
   return("NONE");
  }

string ImpactName(const ENUM_CALENDAR_EVENT_IMPACT v)
  {
   if(v == CALENDAR_IMPACT_POSITIVE) return("POSITIVE");
   if(v == CALENDAR_IMPACT_NEGATIVE) return("NEGATIVE");
   return("NA");
  }

// Nilai kalender disimpan x10^6; LONG_MIN = belum ada nilai -> kosong.
string ValueText(const long raw)
  {
   if(raw == LONG_MIN) return("");
   return(DoubleToString((double)raw / 1000000.0, 4));
  }

int WriteCalendar(const string fileName)
  {
   datetime now  = TimeCurrent();
   datetime from = now - DaysBack * 86400;
   datetime to   = now + DaysAhead * 86400;
   MqlCalendarValue values[];
   int total = CalendarValueHistory(values, from, to);
   if(total < 0)
     {
      Print("MDBKACalendarService: CalendarValueHistory gagal: ", GetLastError());
      return(-1);
     }

   int h = FileOpen(fileName, FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ, ',');
   if(h == INVALID_HANDLE)
     {
      Print("MDBKACalendarService: FileOpen gagal: ", GetLastError());
      return(-1);
     }
   FileWrite(h, "ServerTime", "Currency", "Country", "Importance", "Event",
             "Actual", "Forecast", "Previous", "Impact", "ValueId", "Company", "Generated");

   string company   = Clean(AccountInfoString(ACCOUNT_COMPANY));
   string generated = TimeToString(now, TIME_DATE | TIME_SECONDS);
   int written = 0;
   for(int i = 0; i < total; i++)
     {
      MqlCalendarEvent ev;
      if(!CalendarEventById(values[i].event_id, ev)) continue;
      if(ev.importance != CALENDAR_IMPORTANCE_HIGH && ev.importance != CALENDAR_IMPORTANCE_MODERATE)
         continue;
      MqlCalendarCountry c;
      if(!CalendarCountryById(ev.country_id, c)) continue;
      FileWrite(h,
                TimeToString(values[i].time, TIME_DATE | TIME_SECONDS),
                c.currency,
                c.code,
                ImportanceName(ev.importance),
                Clean(ev.name),
                ValueText(values[i].actual_value),
                ValueText(values[i].forecast_value),
                ValueText(values[i].prev_value),
                ImpactName(values[i].impact_type),
                (string)values[i].id,
                company,
                generated);
      written++;
     }
   FileClose(h);
   return(written);
  }

// Satpam Sesi S1: jam trading resmi broker (SymbolInfoSessionTrade) untuk
// semua simbol di Market Watch. Tanpa sesi pada suatu hari = pasar tutup.
int WriteSessions(const string fileName)
  {
   int h = FileOpen(fileName, FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ, ',');
   if(h == INVALID_HANDLE)
     {
      Print("MDBKACalendarService: FileOpen sesi gagal: ", GetLastError());
      return(-1);
     }
   FileWrite(h, "Symbol", "Day", "Index", "FromMin", "ToMin", "Company", "Generated");
   string company   = Clean(AccountInfoString(ACCOUNT_COMPANY));
   string generated = TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS);
   int written = 0;
   int total = SymbolsTotal(true);
   for(int i = 0; i < total; i++)
     {
      string sym = SymbolName(i, true);
      for(int d = 0; d < 7; d++)
        {
         for(uint k = 0; k < 10; k++)
           {
            datetime from, to;
            if(!SymbolInfoSessionTrade(sym, (ENUM_DAY_OF_WEEK)d, k, from, to)) break;
            FileWrite(h, Clean(sym), d, (int)k, (int)(from / 60), (int)(to / 60), company, generated);
            written++;
           }
        }
     }
   FileClose(h);
   return(written);
  }

// Spesifikasi V1: angka resmi broker per simbol (sama dengan jendela
// Specification MT5). Komisi tidak tersedia lewat SymbolInfo (lihat History).
int WriteSpecs(const string fileName)
  {
   int h = FileOpen(fileName, FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ, ',');
   if(h == INVALID_HANDLE)
     {
      Print("MDBKACalendarService: FileOpen spesifikasi gagal: ", GetLastError());
      return(-1);
     }
   FileWrite(h, "Symbol", "ContractSize", "TickSize", "TickValue", "Digits", "VolumeMin", "VolumeStep",
             "SwapMode", "SwapLong", "SwapShort", "ProfitCurrency", "MarginCurrency", "Company", "Generated");
   string company   = Clean(AccountInfoString(ACCOUNT_COMPANY));
   string generated = TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS);
   int total = SymbolsTotal(true);
   for(int i = 0; i < total; i++)
     {
      string sym = SymbolName(i, true);
      FileWrite(h,
                Clean(sym),
                DoubleToString(SymbolInfoDouble(sym, SYMBOL_TRADE_CONTRACT_SIZE), 4),
                DoubleToString(SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE), 8),
                DoubleToString(SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE), 8),
                (int)SymbolInfoInteger(sym, SYMBOL_DIGITS),
                DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN), 4),
                DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP), 4),
                (int)SymbolInfoInteger(sym, SYMBOL_SWAP_MODE),
                DoubleToString(SymbolInfoDouble(sym, SYMBOL_SWAP_LONG), 4),
                DoubleToString(SymbolInfoDouble(sym, SYMBOL_SWAP_SHORT), 4),
                SymbolInfoString(sym, SYMBOL_CURRENCY_PROFIT),
                SymbolInfoString(sym, SYMBOL_CURRENCY_MARGIN),
                company,
                generated);
     }
   FileClose(h);
   return(total);
  }

void OnStart()
  {
   Print("=== MDBKACalendarService START (tiap ", CheckSeconds, " dtk) ===");
   while(!IsStopped())
     {
      if(TerminalInfoInteger(TERMINAL_CONNECTED) && AccountInfoInteger(ACCOUNT_LOGIN) > 0)
        {
         string fileName = FilePrefix + "_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".csv";
         int n = WriteCalendar(fileName);
         if(n >= 0)
            Print("MDBKACalendarService: ", n, " event -> ", fileName);
         string sessFile = SessionPrefix + "_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".csv";
         int m = WriteSessions(sessFile);
         if(m >= 0)
            Print("MDBKACalendarService: ", m, " sesi -> ", sessFile);
         string specFile = SpecPrefix + "_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".csv";
         int k = WriteSpecs(specFile);
         if(k >= 0)
            Print("MDBKACalendarService: ", k, " spesifikasi -> ", specFile);
        }
      for(int s = 0; s < CheckSeconds && !IsStopped(); s++)
         Sleep(1000);
     }
   Print("=== MDBKACalendarService STOP ===");
  }
