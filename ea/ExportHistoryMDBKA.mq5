//+------------------------------------------------------------------+
//| ExportHistoryMDBKA.mq5 - ekspor SEMUA deal History (MDBKA #503+)  |
//| Tujuan: bahan jurnal pajak (profit, swap, komisi, setoran/tarik). |
//| Pakai: copy ke MQL5/Scripts, compile (F7), drag ke chart mana    |
//| pun di terminal FINEX (akun live 91811209), lalu jalankan.        |
//| Output (DITIMPA tiap dijalankan, aman diulang) di Common\Files:   |
//|   MDBKA_History_<login>.csv                                       |
//| Satu baris = satu deal. DealTicket unik -> impor backend anti-    |
//| duplikat. Waktu = waktu server broker (Finex GMT+3).              |
//+------------------------------------------------------------------+
#property script_show_inputs
#property strict

input datetime FromDate = D'2020.01.01 00:00'; // mulai ekspor dari tanggal
input string   FilePrefix = "MDBKA_History";

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

// Buang koma, kutip, dan baris baru supaya CSV tidak rusak.
string Clean(string s)
  {
   StringReplace(s, ",", " ");
   StringReplace(s, "\"", "'");
   StringReplace(s, "\r", " ");
   StringReplace(s, "\n", " ");
   return(s);
  }

void OnStart()
  {
   string login = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   string fileName = FilePrefix + "_" + login + ".csv";

   if(!HistorySelect(FromDate, TimeCurrent() + 86400))
     {
      Print("ExportHistoryMDBKA: HistorySelect gagal: ", GetLastError());
      return;
     }
   int total = HistoryDealsTotal();

   int h = FileOpen(fileName, FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_COMMON, ',');
   if(h == INVALID_HANDLE)
     {
      Print("ExportHistoryMDBKA: FileOpen gagal: ", GetLastError());
      return;
     }

   FileWrite(h, "DealTicket", "PositionId", "OrderTicket", "ServerTime", "Symbol", "Type",
             "Entry", "Volume", "Price", "Commission", "Swap", "Profit", "Fee",
             "Magic", "Comment", "Login", "Company", "AccountCurrency");

   string company = Clean(AccountInfoString(ACCOUNT_COMPANY));
   string accCcy  = AccountInfoString(ACCOUNT_CURRENCY);
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
   Print("=== ExportHistoryMDBKA: ", written, " deal -> ", fileName, " (Common\\Files) ===");
   Alert("ExportHistoryMDBKA selesai: ", written, " deal -> ", fileName);
  }
//+------------------------------------------------------------------+
