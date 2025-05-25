"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

export default function MetaMarketingTest() {
  const [accountId, setAccountId] = useState("");
  const [selectedTimeframe, setSelectedTimeframe] = useState("6-month");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<any>(null);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [isStoppingJob, setIsStoppingJob] = useState(false);

  // Define the fetch functions for different data types
  const fetchAccountInfo = async (accountId: string, timeframe: string) => {
    const response = await fetch(
      `/api/meta-marketing-daily?action=getAccountInfo&accountId=${accountId}&timeframe=${timeframe}`
    );
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to fetch account info");
    }
    return response.json();
  };

  const fetchData = async (accountId: string, timeframe: string) => {
    // Always use get24HourData for consistency with the backend
    const response = await fetch(
      `/api/meta-marketing-daily?action=get24HourData&accountId=${accountId}&timeframe=${timeframe}`
    );
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to fetch data");
    }
    return response.json();
  };

  const fetchCampaigns = async (accountId: string, timeframe: string) => {
    const response = await fetch(
      `/api/meta-marketing-daily?action=getCampaigns&accountId=${accountId}&timeframe=${timeframe}`
    );
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to fetch campaigns");
    }
    return response.json();
  };

  // Function to stop background job
  const stopBackgroundJob = async () => {
    if (!currentRequestId) {
      alert("No running job to stop");
      return;
    }

    setIsStoppingJob(true);
    try {
      const response = await fetch(`/api/meta-marketing-daily/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: currentRequestId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to stop job");
      }

      const result = await response.json();
      alert(`Job stopped successfully: ${result.message}`);

      // Reset states
      setCurrentRequestId(null);
      setIsLoading(false);
      setData(null);
      setError(null);
    } catch (err) {
      console.error("Error stopping job:", err);
      alert(
        `Error stopping job: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setIsStoppingJob(false);
    }
  };

  // Combined fetch function
  const fetchAllData = async () => {
    if (!accountId) return null;
    setIsLoading(true);
    setError(null);
    setCurrentRequestId(null);

    try {
      // Always use the enhanced api/meta-marketing-daily endpoint
      // but with different timeframe parameter
      const timeframeParam = selectedTimeframe === "24h" ? "24h" : "6-month";

      if (selectedTimeframe === "24h") {
        // For 24h timeframe, use get24HourData
        const dailyData = await fetchData(accountId, timeframeParam);
        setData(dailyData);
        // Extract request ID if it's a background job
        if (dailyData.requestId) {
          setCurrentRequestId(dailyData.requestId);
        }
      } else {
        // For 6-month timeframe, we now also use the same approach but with the 6-month timeframe parameter
        const dailyData = await fetchData(accountId, timeframeParam);
        setData(dailyData);
        // Extract request ID if it's a background job
        if (dailyData.requestId) {
          setCurrentRequestId(dailyData.requestId);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("An unknown error occurred")
      );
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchAllData();
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-semibold mb-6">Meta Marketing API Test</h1>

      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <p className="text-sm text-yellow-800">
          This tool allows you to test the Meta Marketing API integration. The
          6-month sync fetches data from the last 6 months, while the Daily sync
          fetches only the last 24 hours of data.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="accountId"
              className="block text-sm font-medium mb-1"
            >
              Meta Ad Account ID
            </label>
            <input
              type="text"
              id="accountId"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="Enter your Meta Ad Account ID (e.g., act_123456789)"
              className="w-full p-2 border rounded-md"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Select Timeframe
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="timeframe"
                  value="6-month"
                  checked={selectedTimeframe === "6-month"}
                  onChange={() => setSelectedTimeframe("6-month")}
                  className="mr-2"
                />
                6-Month Data
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="timeframe"
                  value="24h"
                  checked={selectedTimeframe === "24h"}
                  onChange={() => setSelectedTimeframe("24h")}
                  className="mr-2"
                />
                Last 24 Hours
              </label>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={isLoading || !accountId}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
            >
              {isLoading ? "Loading..." : "Fetch Data"}
            </button>

            {(isLoading || currentRequestId) && (
              <button
                type="button"
                onClick={stopBackgroundJob}
                disabled={isStoppingJob}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-300"
              >
                {isStoppingJob ? "Stopping..." : "Stop Background Job"}
              </button>
            )}
          </div>

          {currentRequestId && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Background Job Running:</strong> {currentRequestId}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                This job is running in the background. You can stop it using the
                button above.
              </p>
            </div>
          )}
        </div>
      </form>

      {/* Results display */}
      {isLoading && (
        <div className="p-4 bg-gray-100 rounded-md">
          <p>
            Loading data... This might take some time depending on the account
            size.
          </p>
          {currentRequestId && (
            <p className="text-sm text-gray-600 mt-2">
              Job ID: {currentRequestId}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-100 border border-red-300 rounded-md">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
          <p className="text-red-700">{error.message}</p>
        </div>
      )}

      {!isLoading && data && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-md">
          <h3 className="text-lg font-semibold text-green-800 mb-2">
            Data Fetched Successfully
          </h3>

          <div className="mt-4">
            <h4 className="font-medium mb-2">Response Summary:</h4>
            <div className="p-2 bg-blue-50 rounded mb-2">
              <p className="text-blue-700">Timeframe: {selectedTimeframe}</p>
            </div>

            {data.cached && (
              <div className="p-2 bg-blue-50 rounded mb-2">
                <p className="text-blue-700">Data retrieved from cache</p>
              </div>
            )}

            {data.message && (
              <div className="p-2 bg-blue-50 rounded mb-2">
                <p className="text-blue-700">{data.message}</p>
              </div>
            )}

            {data.requestId && (
              <div className="p-2 bg-purple-50 rounded mb-2">
                <p className="text-purple-700">Request ID: {data.requestId}</p>
              </div>
            )}

            {data.dateRange && (
              <div className="mb-4">
                <p>
                  <strong>Date Range:</strong>
                </p>
                <p>From: {data.dateRange.since}</p>
                <p>To: {data.dateRange.until}</p>
              </div>
            )}

            {data.result && (
              <div className="mt-4">
                <details className="border p-2 rounded-md">
                  <summary className="cursor-pointer font-medium">
                    View Response Data
                  </summary>
                  <pre className="mt-2 bg-gray-100 p-3 rounded overflow-auto max-h-96 text-xs">
                    {JSON.stringify(data.result, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
