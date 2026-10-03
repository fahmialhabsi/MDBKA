import { useQuotesStream } from "../../hooks/useQuotesStream";
import styles from "../../styles/liveQuotes.module.css";

interface LiveQuotesProps {
  symbol: string;
}

export function LiveQuotes({ symbol }: LiveQuotesProps) {
  const { quote, isConnected, error } = useQuotesStream(symbol);

  const dotClass = !isConnected
    ? `${styles.dot} ${styles.dotOff}`
    : quote
      ? `${styles.dot} ${styles.dotLive}`
      : `${styles.dot} ${styles.dotPolling}`;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>Live Quotes</h3>
        <span className={styles.symbol}>{symbol || "-"}</span>
        <div className={dotClass} />
      </div>

      {error && <p className={styles.error}>{error}</p>}

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
          className={`${styles.footer} ${quote ? styles.statusLive : styles.statusPolling}`}
        >
          {quote ? "🟢 SSE Connected" : "🟡 Polling..."}
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
