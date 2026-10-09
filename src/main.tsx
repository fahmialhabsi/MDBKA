import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { HistoryPage } from "./components/history/HistoryPage";
import { parseHistoryPage } from "./lib/historyPageView";
import "./index.css";

if (import.meta.env.DEV) {
  globalThis.__MDBKA_DEBUG_ENABLED__ = true;
}

// Halaman History H3: `/?halaman=history&broker=…` dibuka di tab baru.
const historyPage = parseHistoryPage(window.location.search);

ReactDOM.createRoot(document.getElementById("root" )!).render(
  <React.StrictMode>
    {historyPage !== null ? <HistoryPage broker={historyPage.broker} /> : <App />}
  </React.StrictMode>
);
