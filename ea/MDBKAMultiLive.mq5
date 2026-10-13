//+------------------------------------------------------------------+
//| MDBKAMultiLive.mq5 — ekspor equity + quotes SEMUA simbol (MDBKA)  |
//| PENGGANTI MDBKAEquityLogger (yang hanya menulis 1 simbol).         |
//| Pasang: copy ke MQL5/Experts, compile (F7), drag ke SATU chart    |
//| mana pun, izinkan Algo Trading. Hapus EA logger lama agar tidak   |
//| adu tulis file yang sama. Menulis ulang tiap 2 detik:             |
//|   equity.csv : Timestamp,Balance,Equity,Profit,Leverage,Margin,    |
//|                FreeMargin,MarginLevel,Login,TradeMode (10 kolom)   |
//|   F3 (13 Okt 2026): Login + TradeMode (DEMO/CONTEST/REAL) dari     |
//|   AccountInfo — identitas akun TERBUKTI untuk backend MDBKA.       |
//|   quotes.csv : Timestamp,Symbol,Bid,Ask (semua Market Watch)        |
//| Backend MDBKA membaca keduanya (shared-read, tanpa lock).         |
//+------------------------------------------------------------------+
#property strict

input int    ExportIntervalSeconds = 2;
input string EquityFileName        = "equity.csv";
input string QuotesFileName        = "quotes.csv";

void OnInit()
  {
   Print("=== MDBKA Multi Live START: equity + quotes semua simbol tiap ", ExportIntervalSeconds, " dtk ===");
   EventSetTimer(ExportIntervalSeconds);
   Export();
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

void OnTimer()
  {
   Export();
  }

void Export()
  {
   ExportEquity();
   ExportQuotes();
  }

// F3: jenis akun dari server broker (bukan dari label buatan sendiri).
string TradeModeText()
  {
   long mode = AccountInfoInteger(ACCOUNT_TRADE_MODE);
   if(mode == ACCOUNT_TRADE_MODE_DEMO)
      return "DEMO";
   if(mode == ACCOUNT_TRADE_MODE_CONTEST)
      return "CONTEST";
   if(mode == ACCOUNT_TRADE_MODE_REAL)
      return "REAL";
   return "UNKNOWN";
  }

void ExportEquity()
  {
   int handle = FileOpen(EquityFileName, FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_SHARE_READ, ',');
   if(handle == INVALID_HANDLE)
     {
      Print("MDBKAMultiLive: equity FileOpen gagal: ", GetLastError());
      return;
     }
   string ts = TimeToString(TimeTradeServer(), TIME_DATE | TIME_SECONDS);
   FileWrite(handle,
             ts,
             DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2),
             DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2),
             DoubleToString(AccountInfoDouble(ACCOUNT_PROFIT), 2),
             IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)),
             DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN), 2),
             DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2),
             DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_LEVEL), 2),
             IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)),
             TradeModeText());
   FileClose(handle);
  }

void ExportQuotes()
  {
   // Hanya simbol Market Watch yang terlihat (tanpa mengubah langganan).
   int total = SymbolsTotal(true);
   if(total <= 0)
     {
      Print("MDBKAMultiLive: tidak ada simbol di Market Watch.");
      return;
     }
   int handle = FileOpen(QuotesFileName, FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_SHARE_READ, ',');
   if(handle == INVALID_HANDLE)
     {
      Print("MDBKAMultiLive: quotes FileOpen gagal: ", GetLastError());
      return;
     }
   FileWrite(handle, "Timestamp", "Symbol", "Bid", "Ask");
   string ts = TimeToString(TimeTradeServer(), TIME_DATE | TIME_SECONDS);
   for(int i = 0; i < total; i++)
     {
      string name = SymbolName(i, true);
      if(name == "")
         continue;
      long digits = 0;
      if(!SymbolInfoInteger(name, SYMBOL_DIGITS, digits))
         continue;
      double bid = 0.0, ask = 0.0;
      if(!SymbolInfoDouble(name, SYMBOL_BID, bid))
         continue;
      if(!SymbolInfoDouble(name, SYMBOL_ASK, ask))
         continue;
      if(!(bid > 0 && ask > bid))
         continue;
      FileWrite(handle,
                ts,
                name,
                DoubleToString(bid, (int)digits),
                DoubleToString(ask, (int)digits));
     }
   FileClose(handle);
  }
//+------------------------------------------------------------------+
