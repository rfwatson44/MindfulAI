import { Ad, SelectedRange } from "@/lib/types";

function formatValue(value: any, metricId: string | undefined): string {
  if (value === undefined || value === null) return "--";
  if (metricId === "spend" || metricId === "cpa" || metricId === "costPerResult") {
    return `$${Number(value).toFixed(2)}`;
  } else if (metricId === "ctr" || metricId === "roas") {
    return `${Number(value).toFixed(2)}%`;
  }
  return String(value).includes(".") ? Number(value).toFixed(2) : Number(value).toLocaleString();
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
      return higherIsBetter ? "in the top 25% (performing very well)" : "in the bottom 25% (performing very well)";
    } else if (percentile <= 50) {
      return higherIsBetter ? "above average" : "below average (which is good)";
    } else if (percentile <= 75) {
      return higherIsBetter ? "below average" : "above average (which is not ideal)";
    }
    return higherIsBetter ? "in the bottom 25% (underperforming)" : "in the top 25% (underperforming)";
  } catch (error) {
    return "difficult to compare";
  }
}

function getColumnStats(values: any[]) {
  const numericValues = values
    .map((v: any) => Number(v.value))
    .filter((v: number) => !isNaN(v));

  if (!numericValues.length) return null;

  return {
    average: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
    highest: Math.max(...numericValues),
    lowest: Math.min(...numericValues)
  };
}

function MetricSummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded bg-gray-50 px-3 py-2 flex items-center justify-between">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function ColumnSummary({ metric, values, metricId }: { metric: string; values: any[]; metricId: string }) {
  const stats = getColumnStats(values);
  if (!stats) return null;

  return (
    <div className="space-y-2 mb-4 last:mb-0">
      <h3 className="text-sm font-medium text-gray-700">{metric}</h3>
      <div className="flex gap-2">
        <MetricSummaryCard label="Average" value={formatValue(stats.average, metricId)} />
        <MetricSummaryCard label="Highest" value={formatValue(stats.highest, metricId)} />
        <MetricSummaryCard label="Lowest" value={formatValue(stats.lowest, metricId)} />
      </div>
    </div>
  );
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

  if (selectedRange.type === "column") {
    const metrics = selectedRange.metricName.split(", ");
    return (
      <div className="p-4">
        {metrics.map((metric, index) => (
          <ColumnSummary
            key={index}
            metric={metric}
            values={selectedRange.values.filter(v => v.metricName === metric)}
            metricId={selectedRange.metricId}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4">
      {selectedRange.type === "cell" && (
        <div className="rounded bg-gray-50 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{(selectedRange as any).metricName}</span>
            <span className="text-sm font-medium">{formatValue((selectedRange as any).value, (selectedRange as any).metricId)}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {getPerformanceText(selectedRange, adsData)}
          </div>
        </div>
      )}
      {selectedRange.type === "row" && (() => {
        const values = (selectedRange as any).values?.map((v: any) => Number(v.value)).filter((v: number) => !isNaN(v)) || [];
        if (!values.length) return <div className="text-sm">No numeric data</div>;
        const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);
        return (
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">Row metrics</div>
            <div className="flex gap-2">
              <MetricSummaryCard label="Average" value={formatValue(avg, undefined)} />
              <MetricSummaryCard label="Highest" value={formatValue(max, undefined)} />
              <MetricSummaryCard label="Lowest" value={formatValue(min, undefined)} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}