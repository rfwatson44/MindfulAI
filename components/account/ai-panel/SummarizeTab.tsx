import { Ad, SelectedRange } from "@/lib/types";

function formatValue(value: any, metricId: string | undefined): string {
  if (value === undefined || value === null) return "--";
  if (metricId === "spend" || metricId === "cpa" || metricId === "costPerResult") {
    return `$${Number(value).toFixed(2)}`;
  } else if (metricId === "ctr" || metricId === "roas") {
    return `${Number(value).toFixed(2)}%`;
  } else {
    return String(value).includes(".") ? Number(value).toFixed(2) : Number(value).toLocaleString();
  }
}

function getPerformanceText(selection: SelectedRange, adsData: Ad[]): string {
  if (selection.type !== "cell" || !adsData.length) return "comparable";
  try {
    const metricId = (selection as any).metricId;
    const value = Number((selection as any).value);
    if (isNaN(value)) return "not directly comparable";
    const allValues = adsData
      .map((ad: any) => Number(ad[metricId as keyof Ad]))
      .filter((v: any) => !isNaN(v));
    if (!allValues.length) return "the only available data point";
    const sorted = [...allValues].sort((a, b) => b - a);
    const rank = sorted.indexOf(value) + 1;
    const percentile = Math.round((rank / allValues.length) * 100);
    const higherIsBetter = !["cpa", "costPerResult"].includes(metricId);
    if (percentile <= 25) {
      return higherIsBetter ?
        "in the top 25% (performing very well)" :
        "in the bottom 25% (performing very well)";
    } else if (percentile <= 50) {
      return higherIsBetter ?
        "above average" :
        "below average (which is good)";
    } else if (percentile <= 75) {
      return higherIsBetter ?
        "below average" :
        "above average (which is not ideal)";
    } else {
      return higherIsBetter ?
        "in the bottom 25% (underperforming)" :
        "in the top 25% (underperforming)";
    }
  } catch (error) {
    return "difficult to compare";
  }
}

function getRowRecommendation(selection: SelectedRange): string {
  if (selection.type !== "row") return "analyzing more data";
  const ctr = (selection as any).values?.find((v: any) => v.metricId === "ctr")?.value;
  const conversions = (selection as any).values?.find((v: any) => v.metricId === "conversions")?.value;
  const spend = (selection as any).values?.find((v: any) => v.metricId === "spend")?.value;
  if (!ctr || !conversions || !spend) return "collecting more data for a complete analysis";
  const numCTR = Number(ctr);
  const numConversions = Number(conversions);
  const numSpend = Number(spend);
  if (numCTR < 1.5) {
    return "improving the creative or targeting to increase click-through rate";
  } else if (numConversions < 5 && numSpend > 100) {
    return "reviewing the landing page experience to improve conversion rate";
  } else if (numCTR > 2.5 && numConversions > 10) {
    return "increasing budget to scale this successful ad";
  } else {
    return "maintaining the current strategy while testing new variations";
  }
}

export function getColumnDistribution(selection: SelectedRange): string {
  if (selection.type !== "column") return "Select a column to see distribution.";
  const values = (selection as any).values
    .map((v: any) => Number(v.value) || 0)
    .filter((v: any) => !isNaN(v));
  if (!values.length) return "No valid numeric data available.";
  const total = values.reduce((a: number, b: number) => a + b, 0);
  const avg = total / values.length;
  const metricName = (selection as any).metricName?.toLowerCase() || "metric";
  const belowAvg = values.filter((v: number) => v < avg * 0.75).length;
  const nearAvg = values.filter((v: number) => v >= avg * 0.75 && v <= avg * 1.25).length;
  const aboveAvg = values.filter((v: number) => v > avg * 1.25).length;
  const belowPct = Math.round((belowAvg / values.length) * 100);
  const nearPct = Math.round((nearAvg / values.length) * 100);
  const abovePct = Math.round((aboveAvg / values.length) * 100);
  return `${abovePct}% of ads have above-average ${metricName}, ${nearPct}% are near average, and ${belowPct}% are below average.`;
}

export default function SummarizeTab({ selectedRange, adsData }: { selectedRange: SelectedRange | null; adsData: Ad[] }) {
  if (!selectedRange) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
        <span className="mb-2 text-2xl">🤖</span>
        <p>Select data to get a summary</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4">

        {selectedRange.type === "cell" && (
          <>
            <div className="text-sm">
              <b>{(selectedRange as any).metricName}:</b> {formatValue((selectedRange as any).value, (selectedRange as any).metricId)}
            </div>
            <div className="text-xs text-muted-foreground">
              Performance: {getPerformanceText(selectedRange, adsData)}
            </div>
          </>
        )}
        {selectedRange.type === "row" && (() => {
          const values = (selectedRange as any).values?.map((v: any) => Number(v.value)).filter((v: number) => !isNaN(v)) || [];
          if (!values.length) return <div className="text-sm">No numeric data</div>;
          const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
          const max = Math.max(...values);
          const min = Math.min(...values);
          return (
            <div className="text-sm">
              <b>Row metrics:</b>
              <div>High: {formatValue(max, undefined)}</div>
              <div>Low: {formatValue(min, undefined)}</div>
              <div>Average: {formatValue(avg, undefined)}</div>
            </div>
          );
        })()}
        {selectedRange.type === "column" && (() => {
          const values = (selectedRange as any).values?.map((v: any) => Number(v.value)).filter((v: number) => !isNaN(v)) || [];
          if (!values.length) return <div className="text-sm">No numeric data</div>;
          const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
          const max = Math.max(...values);
          const min = Math.min(...values);
          // Get metric names for display
          const metricNames = (selectedRange as any).metricName || ((selectedRange as any).values?.[0]?.metricName ?? "Metric");
          return (
            <>
              <div className="font-medium mb-4 text-xl">
                Summary for {metricNames}
              </div>
              <div className="flex flex-row gap-4 w-full">
                <div className="flex-1 rounded-lg bg-gray-100 p-6 flex flex-col items-center">
                  <div className="text-gray-500 text-base mb-1">Average</div>
                  <div className="text-3xl font-bold">{formatValue(avg, undefined)}</div>
                </div>
                <div className="flex-1 rounded-lg bg-gray-100 p-6 flex flex-col items-center">
                  <div className="text-gray-500 text-base mb-1">Highest</div>
                  <div className="text-3xl font-bold">{formatValue(max, undefined)}</div>
                </div>
                <div className="flex-1 rounded-lg bg-gray-100 p-6 flex flex-col items-center">
                  <div className="text-gray-500 text-base mb-1">Lowest</div>
                  <div className="text-3xl font-bold">{formatValue(min, undefined)}</div>
                </div>
              </div>
              <div className="bg-gray-200 rounded-lg p-6 mt-6 text-left">
                <div className="font-semibold mb-2">Distribution</div>
                <div className="text-gray-700 text-base">
                  {getColumnDistribution(selectedRange as any)}
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
