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
  
  // Check if the metric is related to spend or cost
  const isMonetary = metricId?.toLowerCase().includes("spent") || 
                    metricId?.toLowerCase().includes("cost");
  
  // Format percentages (xx.xx%)
  if (metricId === "ctr" || metricId === "roas") {
    return `${Number(value).toFixed(2)}%`;
  }
  
  // Format numbers with 2 decimal places for averages
  if (metricId?.toLowerCase().includes("average")) {
    const formattedValue = Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return isMonetary ? `$${formattedValue}` : formattedValue;
  }
  
  // Format regular numbers
  const formattedValue = isMonetary 
    ? Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
  
  return isMonetary ? `$${formattedValue}` : formattedValue;
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
        <MetricSummaryCard 
          label="Average" 
          value={formatValue(stats.average, metricId + "_average")} 
        />
        <MetricSummaryCard 
          label="Highest" 
          value={formatValue(stats.highest, metricId)} 
        />
        <MetricSummaryCard 
          label="Lowest" 
          value={formatValue(stats.lowest, metricId)} 
        />
      </div>
    </div>
  );
}

function RowSummary({ adName, values }: { adName: string; values: any[] }) {
  const spend = values.find(v => v.metricId === "spend")?.value || 0;
  const conversions = values.find(v => v.metricId === "conversions")?.value || 0;
  const costPerConversion = spend / (conversions || 1);

  return (
    <div className="space-y-2 mb-4 last:mb-0">
      <h3 className="text-sm font-medium text-gray-700">{adName}</h3>
      <div className="flex gap-2">
        <MetricSummaryCard 
          label="Spend" 
          value={formatValue(spend, "spend")} 
        />
        <MetricSummaryCard 
          label="Conversions" 
          value={formatValue(conversions, "conversions")} 
        />
        <MetricSummaryCard 
          label="Cost/Conv." 
          value={formatValue(costPerConversion, "costPerResult")} 
        />
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

  const showColumnSummary = selectedRange.type === "column";
  const showRowSummary = selectedRange.type === "row";
  const showCellSummary = selectedRange.type === "cell";

  return (
    <div className="p-4 space-y-6">
      {showColumnSummary && (
        <div>
          <h2 className="text-sm font-semibold mb-3 text-gray-900">Column Analysis</h2>
          {selectedRange.metricName.split(", ").map((metric, index) => (
            <ColumnSummary
              key={index}
              metric={metric}
              values={selectedRange.values.filter(v => v.metricName === metric)}
              metricId={selectedRange.metricId}
            />
          ))}
        </div>
      )}

      {showRowSummary && (
        <div>
          <h2 className="text-sm font-semibold mb-3 text-gray-900">Row Analysis</h2>
          {selectedRange.adName.split(", ").map((adName, index) => (
            <RowSummary
              key={index}
              adName={adName}
              values={selectedRange.values.filter(v => v.adName === adName)}
            />
          ))}
        </div>
      )}

      {showCellSummary && (
        <div>
          <h2 className="text-sm font-semibold mb-3 text-gray-900">Cell Analysis</h2>
          <div className="rounded bg-gray-50 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{(selectedRange as any).metricName}</span>
              <span className="text-sm font-medium">
                {formatValue((selectedRange as any).value, (selectedRange as any).metricId)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}