import { useRef } from "react";
import { useQuotesStream } from "../../hooks/useQuotesStream";
import { useNow } from "../../hooks/useNow";
import {
  formatAge,
  isClearlyStale,
  isStale,
} from "../../lib/dataFreshness";
import styles from "../../styles/liveQuotes.module.css";
import type { BrokerId } from "../../types/broker";

interface LiveQuotesProps {
  symbol: string;
  /** Sumber live mengikuti broker aktif (default = sumber utama backend). */
  brokerId?: BrokerId;
}

export function LiveQuotes({ symbol, brokerId }: LiveQuotesProps) {
  const { quote, isConnected, error } = useQuotesStream(
    symbol,
    5000,
    brokerId,
  );

  // Tahap P2 — kesegaran data (anti-timezone): catat kapan payload BERUBAH
  // menurut jam klien; seed awal dari timestamp snapshot (margin 12 jam).
  // Pola adjust-during-render yang React-endorse; lint refs/purity
  // experimental dimatikan terlingkup untuk blok ini saja (bukan file).
  const nowMs = useNow();
  /* eslint-disable react-hooks/refs, react-hooks/purity -- P2: sinkron ref prev-payload saat render, tanpa cascade (guard payloadKey berubah) */
  const payloadKey = quote
    ? `${quote.timestamp}|${quote.bid}|${quote.ask}`
    : "";
  const prevKeyRef = useRef("");
  const lastMsRef = useRef<number | null>(null);
  if (payloadKey !== "" && payloadKey !== prevKeyRef.current) {
    prevKeyRef.current = payloadKey;
    lastMsRef.current = Date.now();
  }
  const lastChangeMs = lastMsRef.current;
  const stale =
    quote !== null &&
    (isStale(lastChangeMs, nowMs) ||
      isClearlyStale(quote.timestamp, nowMs));
  const ageLabel =
    quote !== null && lastChangeMs !== null
      ? formatAge(nowMs - lastChangeMs)
      : null;
  /* eslint-enable react-hooks/refs, react-hooks/purity */

  const dotClass = !isConnected
    ? `${styles.dot} ${styles.dotOff}`
    : quote
      ? `${styles.dot} ${styles.dotLive}`
      : `${styles.dot} ${styles.dotPolling}`;

  return (
    <div className={styles.card} data-testid="live-quotes">
      <div className={styles.header}>
        <h3 className={styles.title}>Live Quotes</h3>
        <span className={styles.symbol}>{symbol || "-"}</span>
        <div className={dotClass} />
      </div>

      {error && (
        <p className={styles.error}>
          {error}
          {brokerId === "finex" && (
            <>
              {" "}
              Sumber Finex belum dikonfigurasi? Isi QUOTES_LOG_PATH_FINEX di
              .env backend lalu restart dev:backend.
            </>
          )}
        </p>
      )}

      {quote ? (
        <div>
          <div className={styles.grid}>
            <div className={`${styles.cell} ${styles.cellBid}`}>
              <span className={`${styles.label} ${styles.labelBid}`}>Bid</span>
              <span className={`${styles.value} ${styles.valueBid}`}>
                {quote.bid ? quote.bid.toFixed(5) : "-"}
              </span>
            </div>
            <div className={`${styles.cell} ${styles.cellAsk}`}>
              <span className={`${styles.label} ${styles.labelAsk}`}>Ask</span>
              <span className={`${styles.value} ${styles.valueAsk}`}>
                {quote.ask ? quote.ask.toFixed(5) : "-"}
              </span>
            </div>
          </div>
          <div className={styles.timestamp}>{quote.timestamp}</div>
        </div>
      ) : (
        <p className={styles.empty}>Menunggu data...</p>
      )}

      {isConnected && !error && (
        <p
          className={`${styles.footer} ${quote && !stale ? styles.statusLive : styles.statusPolling}`}
        >
          {quote
            ? stale
              ? `🟠 Data basi — update terakhir ${ageLabel ?? quote.timestamp}`
              : "🟢 SSE Connected"
            : "🟡 Polling..."}
        </p>
      )}

      {!isConnected && !error && (
        <p className={`${styles.footer} ${styles.statusOff}`}>
          🔴 Terputus — menunggu koneksi...
        </p>
      )}
    </div>
  );
}
