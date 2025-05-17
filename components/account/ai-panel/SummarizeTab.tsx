import { Ad, SelectedRange } from "@/lib/types";

export function getColumnDistribution(selection: any): string {
  const values = selection.values.map((v: any) => Number(v.value)).filter((v: number) => !isNaN(v));
  if (!values.length) return "No numeric data available";
  
  const sum = values.reduce((a: number, b: number) => a + b, 0);
  const percentages = values.map((v: number) => (v / sum * 100).toFixed(1) + "%");
  return percentages.join(" / ");
}

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

function RowSummary({ values }: { values: any[] }) {
  const spend = values.find(v => v.metricId === "spend")?.value || 0;
  const conversions = values.find(v => v.metricId === "conversions")?.value || 0;
  const costPerConversion = spend / (conversions || 1);

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-700">Performance Metrics</div>
      <div className="flex gap-2">
        <MetricSummaryCard label="Spend" value={formatValue(spend, "spend")} />
        <MetricSummaryCard label="Conversions" value={formatValue(conversions, "conversions")} />
        <MetricSummaryCard label="Cost/Conv." value={formatValue(costPerConversion, "costPerResult")} />
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

  if (selectedRange.type === "row") {
    return (
      <div className="p-4">
        <RowSummary values={selectedRange.values} />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="rounded bg-gray-50 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">{(selectedRange as any).metricName}</span>
          <span className="text-sm font-medium">{formatValue((selectedRange as any).value, (selectedRange as any).metricId)}</span>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {getPerformanceText(selectedRange, adsData)}
        </div>
      </div>
    </div>
  );
}