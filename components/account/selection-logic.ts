import { Ad, Metric, SelectedRange } from "@/lib/types";

export type SelectionMode = "none" | "cells" | "rows" | "columns";

interface CellSelection {
  row: number;
  col: number;
}

export function getSelectionSummary(
  selectionMode: SelectionMode,
  selectedCells: CellSelection[],
  activeMetrics: Metric[],
  filteredData: Ad[]
): SelectedRange | null {
  const uniqueRows = Array.from(new Set(selectedCells.map((c) => c.row)));
  const uniqueCols = Array.from(new Set(selectedCells.map((c) => c.col)));
  const allMetrics = activeMetrics;

  // Debug logs
  console.debug("[selection-logic] selectionMode", selectionMode);
  console.debug("[selection-logic] selectedCells", selectedCells);
  console.debug("[selection-logic] uniqueRows", uniqueRows);
  console.debug("[selection-logic] uniqueCols", uniqueCols);
  console.debug("[selection-logic] activeMetrics", activeMetrics);
  console.debug("[selection-logic] filteredData length", filteredData.length);

  if (selectionMode === "columns" && uniqueCols.length > 0) {
    console.debug("[selection-logic] uniqueCols for columns", uniqueCols);
    // Fix: colIndex should directly map to activeMetrics index
    const metrics = uniqueCols
      .map((colIndex) => allMetrics[colIndex])
      .filter((m): m is Metric => m !== undefined);
    console.debug("[selection-logic] mapped metrics for columns (fixed)", metrics);
    console.debug("[selection-logic] metrics for columns", metrics);
    // For each metric, collect values for all ads
    const values = [] as any[];
    metrics.forEach((metric: Metric) => {
      filteredData.forEach((ad) => {
        let metricValue = metric.id === "name" ? ad.name : ad[metric.id as keyof Ad];
        // Special handling for conversions: extract mobile_app_install if present
        if (metric.id === "conversions" && metricValue && typeof metricValue === "object") {
          // Prefer mobile_app_install, else first property
          metricValue = metricValue.mobile_app_install ?? Object.values(metricValue)[0] ?? 0;
        }
        values.push({
          adId: ad.id,
          adName: ad.name,
          metricId: metric.id,
          metricName: metric.name,
          value: metricValue,
        });
      });
    });
    // If you want to use metricIds/metricNames in the future, update the SelectedRange type accordingly.
    return {
      type: "column" as const,
      metricId: metrics[0]?.id,
      metricName: metrics.map((m: Metric) => m.name).join(", "),
      values,
    };

  } else if (selectionMode === "rows" && uniqueRows.length > 0) {
    const ads = uniqueRows.map((rowIndex) => filteredData[rowIndex]);
    console.debug("[selection-logic] ads for rows", ads);
    const values = ads.flatMap((ad) =>
      allMetrics.map((metric: Metric) => ({
        adId: ad.id,
        adName: ad.name,
        metricId: metric.id,
        metricName: metric.name,
        value: metric.id === "name" ? ad.name : ad[metric.id as keyof Ad],
      }))
    );
    return {
      type: "row" as const,
      adId: ads[0]?.id,
      adName: ads.map((ad) => ad.name).join(", "),
      values,
    };
  } else if (selectionMode === "cells" && selectedCells.length > 0) {
    const selections = selectedCells.map((cell) => {
      const ad = filteredData[cell.row];
      const metric = activeMetrics[cell.col - 1];
      return {
        row: cell.row,
        col: cell.col,
        adId: ad?.id,
        adName: ad?.name ?? "",
        metricId: metric?.id,
        metricName: metric?.name,
        value: metric && ad ? ad[metric.id as keyof typeof ad] : undefined,
      };
    });
    console.debug("[selection-logic] selections for cells", selections);
    return {
      type: "cell" as const,
      adId: selections[0].adId!,
      adName: selections[0].adName!,
      metricId: selections[0].metricId!,
      metricName: selections[0].metricName!,
      value: selections[0].value,
      additionalSelections:
        selections.length > 1
          ? selections.slice(1).map((sel) => ({
              adId: sel.adId!,
              adName: sel.adName!,
              metricId: sel.metricId!,
              metricName: sel.metricName!,
              value: sel.value,
            }))
          : undefined,
    };
  }
  return null;
}
