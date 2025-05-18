"use client";

import { useState } from "react";
import {
  useQuery,
  useMutation,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import Link from "next/link";

export default function TestMarketingPingPage() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <MarketingPingContent queryClient={queryClient} />
    </QueryClientProvider>
  );
}

interface PingResult {
  success: boolean;
  timestamp: string;
  message?: string;
  details?: {
    account_id: string;
    name: string;
    account_status: string;
    currency: string;
  };
  error?: string;
}

interface PingHistoryItem {
  timestamp: string;
  account_id: string;
  successful: boolean;
  details?: Record<string, unknown>;
  error?: string;
}

interface PingHistoryResponse {
  data: PingHistoryItem[];
}

function MarketingPingContent({ queryClient }: { queryClient: QueryClient }) {
  const [pingResults, setPingResults] = useState<PingResult | null>(null);

  // Mutation for running the ping
  const { mutate: runPing, status: pingStatus } = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/cron/marketing-ping?secret=${process.env.NEXT_PUBLIC_CRON_SECRET}`
      );
      if (!response.ok) {
        throw new Error("Failed to run marketing ping");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setPingResults(data);
      queryClient.invalidateQueries({ queryKey: ["pingHistory"] });
    },
    onError: (error) => {
      console.error("Error running marketing ping:", error);
      setPingResults({
        success: false,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });

  // Query for fetching ping history
  const {
    isLoading,
    error,
    data: pingHistory,
    refetch,
  } = useQuery<PingHistoryResponse>({
    queryKey: ["pingHistory"],
    queryFn: async () => {
      const response = await fetch("/api/marketing-ping/history");
      if (!response.ok) {
        throw new Error("Failed to fetch ping history");
      }
      return response.json();
    },
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold mb-2">
          Meta Marketing API Ping Test
        </h1>
        <p className="text-gray-600">
          This page tests the cron job that pings the Meta Marketing API every 2
          hours to maintain advanced access.
        </p>
        <div className="mt-4">
          <Link href="/test-cron" className="text-blue-600 hover:underline">
            ← Back to all cron jobs
          </Link>
        </div>
      </header>

      <div className="mb-8 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Manual Ping Test</h2>
        <button
          onClick={() => runPing()}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled={pingStatus === "pending"}
        >
          {pingStatus === "pending" ? "Running..." : "Run Marketing API Ping"}
        </button>

        {pingResults && (
          <div className="mt-6">
            <h3 className="text-lg font-medium mb-2">Results:</h3>
            <div
              className={`p-4 rounded ${
                pingResults.success
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              <div className="flex items-center mb-2">
                <div
                  className={`w-3 h-3 rounded-full mr-2 ${
                    pingResults.success ? "bg-green-500" : "bg-red-500"
                  }`}
                ></div>
                <span className="font-medium">
                  {pingResults.success ? "Success" : "Failed"}
                </span>
              </div>
              <div className="text-sm text-gray-700">
                <p>
                  <span className="font-medium">Timestamp:</span>{" "}
                  {pingResults.timestamp && formatDate(pingResults.timestamp)}
                </p>
                {pingResults.success ? (
                  <div>
                    {pingResults.details && (
                      <>
                        <p>
                          <span className="font-medium">Account ID:</span>{" "}
                          {pingResults.details.account_id}
                        </p>
                        <p>
                          <span className="font-medium">Account Name:</span>{" "}
                          {pingResults.details.name}
                        </p>
                        <p>
                          <span className="font-medium">Status:</span>{" "}
                          {pingResults.details.account_status}
                        </p>
                        <p>
                          <span className="font-medium">Currency:</span>{" "}
                          {pingResults.details.currency}
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <p>
                    <span className="font-medium">Error:</span>{" "}
                    {pingResults.error}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Ping History</h2>
          <button
            onClick={() => refetch()}
            className="text-blue-600 hover:text-blue-800"
          >
            Refresh
          </button>
        </div>

        {isLoading ? (
          <p>Loading history...</p>
        ) : error ? (
          <p className="text-red-600">
            Error loading ping history:{" "}
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        ) : pingHistory && pingHistory.data && pingHistory.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 text-left">Timestamp</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Account ID</th>
                  <th className="px-4 py-2 text-left">Details</th>
                </tr>
              </thead>
              <tbody>
                {pingHistory.data.map((ping, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-4 py-2">{formatDate(ping.timestamp)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          ping.successful
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {ping.successful ? "Success" : "Failed"}
                      </span>
                    </td>
                    <td className="px-4 py-2">{ping.account_id}</td>
                    <td className="px-4 py-2">
                      {ping.successful ? (
                        ping.details ? (
                          JSON.stringify(ping.details).substring(0, 50) + "..."
                        ) : (
                          "N/A"
                        )
                      ) : (
                        <span className="text-red-600">{ping.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 italic">No ping history found.</p>
        )}
      </div>
    </div>
  );
}
