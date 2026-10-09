import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { HistoryPage } from "./components/history/HistoryPage";
import { parseHistoryPage } from "./lib/historyPageView";
import { SignalDetailPage } from "./components/analysis/SignalDetailPage";
import { parseSignalPage } from "./lib/signalPageView";
import { CalculatorPage } from "./components/analysis/CalculatorPage";
import { parseCalculatorPage } from "./lib/calculatorPageView";
import "./index.css";

if (import.meta.env.DEV) {
  globalThis.__MDBKA_DEBUG_ENABLED__ = true;
}

// Halaman History H3: `/?halaman=history&broker=…` dibuka di tab baru.
const historyPage = parseHistoryPage(window.location.search);
// Butir 3 P2: `/?halaman=sinyal&broker=…&symbol=…&equity=…` (detail pemindai).
const signalPage = parseSignalPage(window.location.search);
// Butir 4 C2: `/?halaman=kalkulator&…` (kalkulator target harga).
const calculatorPage = parseCalculatorPage(window.location.search);

ReactDOM.createRoot(document.getElementById("root" )!).render(
  <React.StrictMode>
    {historyPage !== null ? (
      <HistoryPage broker={historyPage.broker} />
    ) : calculatorPage !== null ? (
      <CalculatorPage prefill={calculatorPage} />
    ) : signalPage !== null ? (
      <SignalDetailPage broker={signalPage.broker} symbol={signalPage.symbol} equity={signalPage.equity} />
    ) : (
      <App />
    )}
  </React.StrictMode>
);
