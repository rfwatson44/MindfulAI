import { SelectedRange } from "@/lib/types";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getColumnDistribution } from "./SummarizeTab";

function getSelectionSummary(selectedRange: SelectedRange): string {
  switch (selectedRange.type) {
    case "cell": {
      const totalSelections = 1 + (typeof (selectedRange as any).additionalSelections !== 'undefined' ? (selectedRange as any).additionalSelections.length : 0);
      return `${totalSelections} cell${totalSelections > 1 ? "s" : ""} selected`;
    }
    case "row": {
      const rowCount = selectedRange.adName.split(", ").length;
      return `${rowCount} row${rowCount > 1 ? "s" : ""} selected`;
    }
    case "column": {
      const columnCount = selectedRange.metricName.split(", ").length;
      return `${columnCount} column${columnCount > 1 ? "s" : ""} selected`;
    }
    default:
      return "Selection";
  }
}

export default function SelectionSummary({
  selectedRange,
  isDetailsOpen,
  onToggleDetails,
  onAnalyze = () => {},
}: {
  selectedRange: SelectedRange | null;
  isDetailsOpen: boolean;
  onToggleDetails: () => void;
  onAnalyze?: () => void;
}) {
  if (!selectedRange) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
        No data selected. Click on cells, rows, or columns in the table to analyze.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium">
          {getSelectionSummary(selectedRange)}
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
        <div className="mt-2 text-sm text-muted-foreground">
          {selectedRange.type === "cell" && (
            <>
              <div>
                <b>{(selectedRange as any).metricName}:</b> {(selectedRange as any).value}
              </div>
            </>
          )}
          {selectedRange.type === "row" && (
            <>
              <div><b>Row metrics:</b></div>
              <ul className="ml-4 list-disc">
                {(selectedRange as any).values?.map((v: any, i: number) => (
                  <li key={i}>{v.metricName}: {v.value}</li>
                ))}
              </ul>
            </>
          )}
          {selectedRange.type === "column" && (
            <>
              <div><b>Column metrics:</b></div>
              <ul className="ml-4 list-disc">
                {(selectedRange as any).values?.map((v: any, i: number) => (
                  <li key={i}>{v.adName}: {v.value}</li>
                ))}
              </ul>
              <div className="text-xs mt-2">
                Distribution: {getColumnDistribution(selectedRange as any)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}