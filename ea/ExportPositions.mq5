//+------------------------------------------------------------------+
//| ExportPositions.mq5 — ekspor posisi open ke positions.csv (MDBKA)  |
//| Pasang: File > Open Data Folder > MQL5/Experts, compile (F7),      |
//| drag ke chart mana pun, izinkan Algo Trading. Menulis ulang file  |
//| setiap 5 detik (timer). Format:                                   |
//| Ticket,Symbol,Type,Volume,PriceOpen,SL,TP,TimeOpen                 |
//| Type = BUY/SELL. Posisi tertutup otomatis hilang dari file.       |
//+------------------------------------------------------------------+
#property strict

input int    ExportIntervalSeconds = 5;
input string OutFileName           = "positions.csv";

void OnInit()
  {
   Print("=== ExportPositions START: menulis ", OutFileName, " tiap ", ExportIntervalSeconds, " dtk ===");
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
   int total = PositionsTotal();
   int handle = FileOpen(OutFileName, FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_SHARE_READ, ',');
   if(handle == INVALID_HANDLE)
     {
      Print("ExportPositions: FileOpen gagal: ", GetLastError());
      return;
     }
   FileWrite(handle, "Ticket", "Symbol", "Type", "Volume", "PriceOpen", "SL", "TP", "TimeOpen");
   for(int i = total - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;
      string symbol = PositionGetString(POSITION_SYMBOL);
      long   ptype  = PositionGetInteger(POSITION_TYPE);
      double vol    = PositionGetDouble(POSITION_VOLUME);
      double open   = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl     = PositionGetDouble(POSITION_SL);
      double tp     = PositionGetDouble(POSITION_TP);
      datetime t    = (datetime)PositionGetInteger(POSITION_TIME);
      // Presisi per SIMBOL posisi (bukan _Digits milik chart EA):
      // tanpa ini AUDUSD 0.69812 terekam 0.698 bila EA di chart CFD.
      int    digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      // FileClose tiap tulis agar backend bisa shared-read (tanpa lock).
      FileWrite(handle,
                ticket,
                symbol,
                (ptype == POSITION_TYPE_BUY ? "BUY" : "SELL"),
                DoubleToString(vol, 2),
                DoubleToString(open, digits),
                DoubleToString(sl, digits),
                DoubleToString(tp, digits),
                TimeToString(t, TIME_DATE | TIME_SECONDS));
     }
   FileClose(handle);
  }
//+------------------------------------------------------------------+
