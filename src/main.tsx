import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

if (import.meta.env.DEV) {
  globalThis.__MDBKA_DEBUG_ENABLED__ = true;
}

ReactDOM.createRoot(document.getElementById("root" )!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
