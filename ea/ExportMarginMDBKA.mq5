//+------------------------------------------------------------------+
//| ExportMarginMDBKA.mq5 - margin per 1 lot via OrderCalcMargin     |
//| Output: Common\Files\MDBKA_Margin_<BrokerTag>.csv (ANSI, koma)   |
//+------------------------------------------------------------------+
#property script_show_inputs
input string BrokerTag = "";   // kosong = deteksi otomatis dari nama broker

void OnStart()
{
   string tag = BrokerTag;
   if(tag == "")
   {
      string company = AccountInfoString(ACCOUNT_COMPANY);
      if(StringFind(company, "Finex") >= 0)     tag = "Finex";
      else if(StringFind(company, "Orbi") >= 0) tag = "OTB";
      else
      {
         Print("MDBKA margin: broker tidak dikenal '", company, "', isi BrokerTag manual");
         return;
      }
   }
   string fname = "MDBKA_Margin_" + tag + ".csv";
   int h = FileOpen(fname, FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_COMMON, ',');
   if(h == INVALID_HANDLE)
   {
      Print("MDBKA margin: gagal buka ", fname, " err=", GetLastError());
      return;
   }
   FileWrite(h, "Symbol", "Ask", "Bid", "Margin_Buy_1Lot", "Margin_Sell_1Lot",
             "Account_Leverage", "Account_Currency", "Exported");
   int total = SymbolsTotal(true);
   int ok = 0;
   for(int i = 0; i < total; i++)
   {
      string sym = SymbolName(i, true);
      int    dg  = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
      double bid = SymbolInfoDouble(sym, SYMBOL_BID);
      double mBuy = -1.0, mSell = -1.0;
      if(ask > 0 && !OrderCalcMargin(ORDER_TYPE_BUY, sym, 1.0, ask, mBuy))   mBuy = -1.0;
      if(bid > 0 && !OrderCalcMargin(ORDER_TYPE_SELL, sym, 1.0, bid, mSell)) mSell = -1.0;
      if(mBuy > 0) ok++;
      FileWrite(h, sym, DoubleToString(ask, dg), DoubleToString(bid, dg),
                DoubleToString(mBuy, 2), DoubleToString(mSell, 2),
                (string)AccountInfoInteger(ACCOUNT_LEVERAGE),
                AccountInfoString(ACCOUNT_CURRENCY),
                TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS));
   }
   FileClose(h);
   Print("MDBKA margin: ", ok, "/", total, " simbol -> Common\\Files\\", fname);
}