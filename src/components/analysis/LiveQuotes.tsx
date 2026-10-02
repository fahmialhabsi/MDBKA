import { useQuotesStream } from "../../hooks/useQuotesStream";

interface LiveQuotesProps {
  symbol: string;
}

export function LiveQuotes({ symbol }: LiveQuotesProps) {
  const { quote, isConnected, error } = useQuotesStream(symbol);

  return (
    <div className="rounded-lg border border-gray-300 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Live Quotes</h3>
        <div
          className={`h-2 w-2 rounded-full ${
            isConnected ? "bg-green-500" : "bg-red-500"
          }`}
        />
      </div>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {quote ? (
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Bid:</span>
            <span className="font-mono font-semibold text-blue-600">
              {quote.bid ? quote.bid.toFixed(5) : "-"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Ask:</span>
            <span className="font-mono font-semibold text-green-600">
              {quote.ask ? quote.ask.toFixed(5) : "-"}
            </span>
          </div>
          <div className="mt-2 text-xs text-gray-500">{quote.timestamp}</div>
        </div>
      ) : (
        <p className="text-xs text-gray-500">Menunggu data...</p>
      )}

      {isConnected && !error && (
        <p className="mt-2 text-xs text-gray-400">
          {quote ? "SSE Connected" : "Polling..."}
        </p>
      )}
    </div>
  );
}
