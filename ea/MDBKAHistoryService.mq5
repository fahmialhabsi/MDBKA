//+------------------------------------------------------------------+
//| MDBKAHistoryService.mq5 - ekspor History OTOMATIS (MDBKA #506)    |
//| Service MT5: jalan sendiri saat terminal start, tanpa chart,      |
//| tanpa klik. Tiap CheckSeconds dicek jumlah deal; bila berubah     |
//| (deal baru / setoran / penarikan) file CSV ditulis ulang utuh.    |
//| Output: Common\Files\MDBKA_History_<login>.csv (format sama       |
//| dengan ExportHistoryMDBKA.mq5, 18 kolom).                         |
//| Pasang: copy ke MQL5/Services, compile (F7), Navigator > Services |
//| > klik kanan > Add Service > pilih file ini > Start.              |
//| Pasang di terminal FINEX (akun live 91811209).                    |
//+------------------------------------------------------------------+
#property service
#property strict

input datetime FromDate     = D'2020.01.01 00:00';
input string   FilePrefix   = "MDBKA_History";
input int      CheckSeconds = 30;

string DealTypeName(const long t)
  {
   switch((int)t)
     {
      case DEAL_TYPE_BUY:                      return("BUY");
      case DEAL_TYPE_SELL:                     return("SELL");
      case DEAL_TYPE_BALANCE:                  return("BALANCE");
      case DEAL_TYPE_CREDIT:                   return("CREDIT");
      case DEAL_TYPE_CHARGE:                   return("CHARGE");
      case DEAL_TYPE_CORRECTION:               return("CORRECTION");
      case DEAL_TYPE_BONUS:                    return("BONUS");
      case DEAL_TYPE_COMMISSION:               return("COMMISSION");
      case DEAL_TYPE_COMMISSION_DAILY:         return("COMMISSION_DAILY");
      case DEAL_TYPE_COMMISSION_MONTHLY:       return("COMMISSION_MONTHLY");
      case DEAL_TYPE_COMMISSION_AGENT_DAILY:   return("COMMISSION_AGENT_DAILY");
      case DEAL_TYPE_COMMISSION_AGENT_MONTHLY: return("COMMISSION_AGENT_MONTHLY");
      case DEAL_TYPE_INTEREST:                 return("INTEREST");
      case DEAL_TYPE_BUY_CANCELED:             return("BUY_CANCELED");
      case DEAL_TYPE_SELL_CANCELED:            return("SELL_CANCELED");
     }
   return("TYPE_" + IntegerToString((int)t));
  }

string DealEntryName(const long e)
  {
   switch((int)e)
     {
      case DEAL_ENTRY_IN:     return("IN");
      case DEAL_ENTRY_OUT:    return("OUT");
      case DEAL_ENTRY_INOUT:  return("INOUT");
      case DEAL_ENTRY_OUT_BY: return("OUT_BY");
     }
   return("ENTRY_" + IntegerToString((int)e));
  }

string Clean(string s)
  {
   StringReplace(s, ",", " ");
   StringReplace(s, "\"", "'");
   StringReplace(s, "\r", " ");
   StringReplace(s, "\n", " ");
   return(s);
  }

// Tulis ulang CSV utuh. Return jumlah deal ditulis, -1 bila gagal.
int WriteHistory(const string fileName)
  {
   if(!HistorySelect(FromDate, TimeCurrent() + 86400))
      return(-1);
   int total = HistoryDealsTotal();
   int h = FileOpen(fileName, FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ, ',');
   if(h == INVALID_HANDLE)
     {
      Print("MDBKAHistoryService: FileOpen gagal: ", GetLastError());
      return(-1);
     }
   string login   = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   string company = Clean(AccountInfoString(ACCOUNT_COMPANY));
   string accCcy  = AccountInfoString(ACCOUNT_CURRENCY);

   FileWrite(h, "DealTicket", "PositionId", "OrderTicket", "ServerTime", "Symbol", "Type",
             "Entry", "Volume", "Price", "Commission", "Swap", "Profit", "Fee",
             "Magic", "Comment", "Login", "Company", "AccountCurrency");
   int written = 0;
   for(int i = 0; i < total; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0)
         continue;
      string symbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
      int digits = 5;
      if(symbol != "")
         digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      FileWrite(h,
                IntegerToString((long)ticket),
                IntegerToString(HistoryDealGetInteger(ticket, DEAL_POSITION_ID)),
                IntegerToString(HistoryDealGetInteger(ticket, DEAL_ORDER)),
                TimeToString((datetime)HistoryDealGetInteger(ticket, DEAL_TIME), TIME_DATE | TIME_SECONDS),
                symbol,
                DealTypeName(HistoryDealGetInteger(ticket, DEAL_TYPE)),
                DealEntryName(HistoryDealGetInteger(ticket, DEAL_ENTRY)),
                DoubleToString(HistoryDealGetDouble(ticket, DEAL_VOLUME), 2),
                DoubleToString(HistoryDealGetDouble(ticket, DEAL_PRICE), digits),
                DoubleToString(HistoryDealGetDouble(ticket, DEAL_COMMISSION), 2),
                DoubleToString(HistoryDealGetDouble(ticket, DEAL_SWAP), 2),
                DoubleToString(HistoryDealGetDouble(ticket, DEAL_PROFIT), 2),
                DoubleToString(HistoryDealGetDouble(ticket, DEAL_FEE), 2),
                IntegerToString(HistoryDealGetInteger(ticket, DEAL_MAGIC)),
                Clean(HistoryDealGetString(ticket, DEAL_COMMENT)),
                login, company, accCcy);
      written++;
     }
   FileClose(h);
   return(written);
  }

void OnStart()
  {
   int lastTotal = -1;
   Print("=== MDBKAHistoryService START (cek tiap ", CheckSeconds, " dtk) ===");
   while(!IsStopped())
     {
      if(TerminalInfoInteger(TERMINAL_CONNECTED) && AccountInfoInteger(ACCOUNT_LOGIN) > 0)
        {
         string fileName = FilePrefix + "_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".csv";
         if(HistorySelect(FromDate, TimeCurrent() + 86400))
           {
            int total = HistoryDealsTotal();
            if(total != lastTotal)
              {
               int n = WriteHistory(fileName);
               if(n >= 0)
                 {
                  lastTotal = total;
                  Print("MDBKAHistoryService: ", n, " deal -> ", fileName);
                 }
              }
           }
        }
      Sleep(CheckSeconds * 1000);
     }
  }
//+------------------------------------------------------------------+
