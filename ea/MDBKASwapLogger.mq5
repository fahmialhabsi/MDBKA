//+------------------------------------------------------------------+
//| MDBKASwapLogger.mq5 — log posisi open + swap per jam (MDBKA #500) |
//| Tujuan: bukti swap NYATA dari terminal (bukan rumus tebakan).     |
//| Pasang: copy ke MQL5/Experts, compile (F7), drag ke SATU chart    |
//| mana pun, izinkan Algo Trading. Terminal harus tetap menyala      |
//| melewati rollover (laptop jangan sleep).                          |
//| File (APPEND, tidak ditimpa) di folder Common\Files:              |
//|   MDBKA_SwapLog_<login>.csv                                        |
//| Baris ditulis saat: START, tiap ganti jam server (HOURLY), dan    |
//| setiap kali nilai swap posisi berubah (SWAP_CHANGE = rollover).   |
//| Spec swap simbol (mode, long, short, hari triple) ikut dicatat,   |
//| jadi screenshot Specification tidak wajib lagi.                    |
//+------------------------------------------------------------------+
#property strict

input int    CheckIntervalSeconds = 60;
input string FilePrefix           = "MDBKA_SwapLog";

string g_file      = "";
int    g_lastHour  = -1;
ulong  g_tickets[];
double g_swaps[];

int OnInit()
  {
   g_file = FilePrefix + "_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".csv";
   MqlDateTime dt;
   TimeToStruct(TimeTradeServer(), dt);
   g_lastHour = dt.hour;
   EventSetTimer(CheckIntervalSeconds);
   WriteSnapshot("START");
   Print("=== MDBKA Swap Logger START: ", g_file, " (Common\\Files), cek tiap ", CheckIntervalSeconds, " dtk ===");
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

void OnTimer()
  {
   MqlDateTime dt;
   TimeToStruct(TimeTradeServer(), dt);
   if(dt.hour != g_lastHour)
     {
      g_lastHour = dt.hour;
      WriteSnapshot("HOURLY");
      return;
     }
   if(SwapChanged())
      WriteSnapshot("SWAP_CHANGE");
  }

// True bila ada posisi baru/tertutup atau nilai swap berubah sejak snapshot terakhir.
bool SwapChanged()
  {
   int total = PositionsTotal();
   if(total != ArraySize(g_tickets))
      return(true);
   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;
      double swap = PositionGetDouble(POSITION_SWAP);
      bool found = false;
      for(int k = 0; k < ArraySize(g_tickets); k++)
        {
         if(g_tickets[k] == ticket)
           {
            found = true;
            if(MathAbs(g_swaps[k] - swap) > 0.000001)
               return(true);
            break;
           }
        }
      if(!found)
         return(true);
     }
   return(false);
  }

void WriteSnapshot(const string reason)
  {
   int h = FileOpen(g_file, FILE_READ | FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ, ',');
   if(h == INVALID_HANDLE)
     {
      Print("MDBKA Swap Logger: FileOpen gagal: ", GetLastError());
      return;
     }
   bool empty = (FileSize(h) == 0);
   FileSeek(h, 0, SEEK_END);
   if(empty)
      FileWrite(h, "ServerTime", "GmtTime", "LocalTime", "Reason", "Login", "Company",
                "AccountCurrency", "Balance", "Equity", "Ticket", "Symbol", "Type",
                "Volume", "PriceOpen", "PriceCurrent", "Bid", "Ask", "Swap", "Profit",
                "SwapMode", "SwapLong", "SwapShort", "Swap3Day", "ContractSize",
                "CalcMode", "BaseCurrency", "ProfitCurrency", "TimeOpen");

   string serverTime = TimeToString(TimeTradeServer(), TIME_DATE | TIME_SECONDS);
   string gmtTime    = TimeToString(TimeGMT(), TIME_DATE | TIME_SECONDS);
   string localTime  = TimeToString(TimeLocal(), TIME_DATE | TIME_SECONDS);
   string login      = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   string company    = AccountInfoString(ACCOUNT_COMPANY);
   string accCcy     = AccountInfoString(ACCOUNT_CURRENCY);
   string balance    = DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2);
   string equity     = DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2);

   int total = PositionsTotal();
   ArrayResize(g_tickets, 0);
   ArrayResize(g_swaps, 0);

   if(total == 0)
      FileWrite(h, serverTime, gmtTime, localTime, reason + "_NO_POSITIONS", login, company,
                accCcy, balance, equity, "", "", "", "", "", "", "", "", "", "",
                "", "", "", "", "", "", "", "", "");

   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;
      string symbol = PositionGetString(POSITION_SYMBOL);
      int    digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      long   ptype  = PositionGetInteger(POSITION_TYPE);
      double swap   = PositionGetDouble(POSITION_SWAP);

      int n = ArraySize(g_tickets);
      ArrayResize(g_tickets, n + 1);
      ArrayResize(g_swaps, n + 1);
      g_tickets[n] = ticket;
      g_swaps[n]   = swap;

      FileWrite(h,
                serverTime, gmtTime, localTime, reason, login, company, accCcy, balance, equity,
                IntegerToString((long)ticket),
                symbol,
                (ptype == POSITION_TYPE_BUY ? "BUY" : "SELL"),
                DoubleToString(PositionGetDouble(POSITION_VOLUME), 2),
                DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), digits),
                DoubleToString(PositionGetDouble(POSITION_PRICE_CURRENT), digits),
                DoubleToString(SymbolInfoDouble(symbol, SYMBOL_BID), digits),
                DoubleToString(SymbolInfoDouble(symbol, SYMBOL_ASK), digits),
                DoubleToString(swap, 2),
                DoubleToString(PositionGetDouble(POSITION_PROFIT), 2),
                EnumToString((ENUM_SYMBOL_SWAP_MODE)SymbolInfoInteger(symbol, SYMBOL_SWAP_MODE)),
                DoubleToString(SymbolInfoDouble(symbol, SYMBOL_SWAP_LONG), 4),
                DoubleToString(SymbolInfoDouble(symbol, SYMBOL_SWAP_SHORT), 4),
                EnumToString((ENUM_DAY_OF_WEEK)SymbolInfoInteger(symbol, SYMBOL_SWAP_ROLLOVER3DAYS)),
                DoubleToString(SymbolInfoDouble(symbol, SYMBOL_TRADE_CONTRACT_SIZE), 2),
                EnumToString((ENUM_SYMBOL_CALC_MODE)SymbolInfoInteger(symbol, SYMBOL_TRADE_CALC_MODE)),
                SymbolInfoString(symbol, SYMBOL_CURRENCY_BASE),
                SymbolInfoString(symbol, SYMBOL_CURRENCY_PROFIT),
                TimeToString((datetime)PositionGetInteger(POSITION_TIME), TIME_DATE | TIME_SECONDS));
     }
   FileClose(h);
  }
//+------------------------------------------------------------------+
