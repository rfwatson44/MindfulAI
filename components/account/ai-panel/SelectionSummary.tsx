import { SelectedRange } from "@/lib/types";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatValue(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toFixed(2);
}

function calculateMetricSummary(values: any[]) {
  const numericValues = values
    .map(v => typeof v.value === 'string' ? parseFloat(v.value) : v.value)
    .filter(v => !isNaN(v));

  if (numericValues.length === 0) return null;

  return {
    highest: Math.max(...numericValues),
    lowest: Math.min(...numericValues),
    average: numericValues.reduce((a, b) => a + b, 0) / numericValues.length
  };
}

function calculateRowSummary(values: any[]) {
  const spend = values.find(v => v.metricId === 'spend')?.value || 0;
  const conversions = values.find(v => v.metricId === 'conversions')?.value || 0;
  const costPerConversion = conversions > 0 ? spend / conversions : 0;

  return {
    spend,
    conversions,
    costPerConversion
  };
}

export default function SelectionSummary({
  selectedRange,
  isDetailsOpen,
  onToggleDetails,
}: {
  selectedRange: SelectedRange | null;
  isDetailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  if (!selectedRange) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
        No data selected. Click on cells, rows, or columns in the table to analyze.
      </div>
    );
  }

  // Calculate selection count
  let selectionCount = '';
  if (selectedRange.type === 'column') {
    const columnCount = selectedRange.values.length / (selectedRange.values.length / new Set(selectedRange.values.map(v => v.adId)).size);
    selectionCount = `${columnCount} column${columnCount > 1 ? 's' : ''} selected`;
  } else if (selectedRange.type === 'row') {
    const rowCount = selectedRange.values.length / (selectedRange.values.length / new Set(selectedRange.values.map(v => v.metricId)).size);
    selectionCount = `${rowCount} row${rowCount > 1 ? 's' : ''} selected`;
  } else {
    const cellCount = 1 + ((selectedRange as any).additionalSelections?.length || 0);
    selectionCount = `${cellCount} cell${cellCount > 1 ? 's' : ''} selected`;
  }

  return (
    <div className="space-y-4">
      {/* Selection Counter */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center justify-between">
          <div className="font-medium">
            {selectionCount}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleDetails}
            aria-label={isDetailsOpen ? "Hide details" : "Show details"}
          >
            {isDetailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {isDetailsOpen && (
          <div className="mt-4 space-y-4">
            {/* Column Selection Summary */}
            {selectedRange.type === 'column' && (() => {
              const summary = calculateMetricSummary(selectedRange.values);
              if (!summary) return null;
              
              return (
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg bg-background p-3 text-center">
                    <div className="text-sm text-muted-foreground">Highest</div>
                    <div className="mt-1 text-lg font-semibold">
                      {formatValue(summary.highest)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-background p-3 text-center">
                    <div className="text-sm text-muted-foreground">Lowest</div>
                    <div className="mt-1 text-lg font-semibold">
                      {formatValue(summary.lowest)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-background p-3 text-center">
                    <div className="text-sm text-muted-foreground">Average</div>
                    <div className="mt-1 text-lg font-semibold">
                      {formatValue(summary.average)}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Row Selection Summary */}
            {selectedRange.type === 'row' && (() => {
              const summary = calculateRowSummary(selectedRange.values);
              
              return (
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg bg-background p-3 text-center">
                    <div className="text-sm text-muted-foreground">Total Spend</div>
                    <div className="mt-1 text-lg font-semibold">
                      ${formatValue(summary.spend)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-background p-3 text-center">
                    <div className="text-sm text-muted-foreground">Total Conversions</div>
                    <div className="mt-1 text-lg font-semibold">
                      {formatValue(summary.conversions)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-background p-3 text-center">
                    <div className="text-sm text-muted-foreground">Avg. Cost/Conv.</div>
                    <div className="mt-1 text-lg font-semibold">
                      ${formatValue(summary.costPerConversion)}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Cell Selection Details */}
            {selectedRange.type === 'cell' && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Metric:</span>
                  <span className="font-medium">{selectedRange.metricName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Value:</span>
                  <span className="font-medium">
                    {typeof selectedRange.value === 'number' 
                      ? formatValue(selectedRange.value)
                      : selectedRange.value}
                  </span>
                </div>
                {(selectedRange as any).additionalSelections?.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-sm text-muted-foreground">Additional Selections:</div>
                    {(selectedRange as any).additionalSelections.map((selection: any, index: number) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span>{selection.metricName}:</span>
                        <span className="font-medium">
                          {typeof selection.value === 'number'
                            ? formatValue(selection.value)
                            : selection.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}