"use client";

import { useState } from "react";
import {
  useMutation,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import Link from "next/link";

export default function TestCronPage() {
  const [queryClient] = useState(() => new QueryClient());
  const [selectedJob, setSelectedJob] = useState("daily-metrics");
  const [results, setResults] = useState<string | null>(null);

  const { mutate: runCronJob, status } = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/cron/${selectedJob}?secret=${process.env.NEXT_PUBLIC_CRON_SECRET}`
      );
      if (!response.ok) {
        throw new Error("Failed to run cron job");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setResults(data);
    },
    onError: (error) => {
      console.error("Error running cron job:", error);
      setResults(error instanceof Error ? error.message : "Unknown error");
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Test Cron Jobs</h1>

        <div className="mb-6">
          <select
            value={selectedJob}
            onChange={(e) => setSelectedJob(e.target.value)}
            className="border p-2 rounded mr-4"
          >
            <option value="daily-metrics">Daily Metrics Sync</option>
            <option value="weekly-details">Weekly Details Sync</option>
            <option value="marketing-ping">Marketing API Ping</option>
            {/* Add other jobs here as we implement them */}
          </select>

          <button
            onClick={() => runCronJob()}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
            disabled={status === "pending"}
          >
            {status === "pending" ? "Running..." : "Run"}
          </button>
        </div>

        <div className="mb-6">
          <Link
            href="/test-marketing-ping"
            className="text-blue-600 hover:underline"
          >
            Go to detailed Marketing API Ping Test page →
          </Link>
        </div>

        {results && (
          <div className="mt-6">
            <h2 className="text-xl font-semibold mb-4">Results:</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto">
              {JSON.stringify(results, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </QueryClientProvider>
  );
}
