"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TableFilters } from "@/components/account/table-filters";
import { MetricsSelector } from "@/components/account/metrics-selector";
import { Ad, Metric, SelectedRange } from "@/lib/types";
import { DEFAULT_METRICS, OPTIONAL_METRICS } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface AdTableProps {
  data: Ad[];
  onSelectionChange: (selection: SelectedRange | null) => void;
}

export function AdTable({ data, onSelectionChange }: AdTableProps) {
  const [activeMetrics, setActiveMetrics] = useState<Metric[]>(DEFAULT_METRICS);
  const [filteredData, setFilteredData] = useState<Ad[]>(data);
  const [selectedCells, setSelectedCells] = useState<Array<{ row: number; col: number }>>([]);
  const [showAnalyzeButton, setShowAnalyzeButton] = useState(false);

  // Update filtered data when data changes
  useMemo(() => {
    setFilteredData(data);
  }, [data]);

  // Helper function to determine if a metric is numeric
  const isNumericMetric = (metricId: string): boolean => {
    return metricId !== "name";
  };

  // Helper function to check if a cell is selected
  const isCellSelected = (rowIndex: number, colIndex: number): boolean => {
    return selectedCells.some(cell => cell.row === rowIndex && cell.col === colIndex);
  };

  // Handle metric selection
  const handleMetricToggle = (metric: Metric) => {
    if (activeMetrics.some((m) => m.id === metric.id)) {
      setActiveMetrics(activeMetrics.filter((m) => m.id !== metric.id));
    } else {
      setActiveMetrics([...activeMetrics, metric]);
    }
  };

  // Handle filters
  const handleFiltersChange = (filtered: Ad[]) => {
    setFilteredData(filtered);
  };

  // Handle cell selection
  const handleCellClick = (
    rowIndex: number,
    colIndex: number,
    event: React.MouseEvent
  ) => {
    event.preventDefault();
    
    if (event.metaKey || event.ctrlKey) {
      // Toggle individual cell selection
      const cellIndex = selectedCells.findIndex(
        cell => cell.row === rowIndex && cell.col === colIndex
      );
      
      if (cellIndex >= 0) {
        // Remove cell if already selected
        setSelectedCells(selectedCells.filter((_, i) => i !== cellIndex));
      } else {
        // Add new cell to selection
        setSelectedCells([...selectedCells, { row: rowIndex, col: colIndex }]);
      }
    } else {
      // Single cell selection
      setSelectedCells([{ row: rowIndex, col: colIndex }]);
    }
    
    setShowAnalyzeButton(true);
  };

  // Handle header click (select column)
  const handleHeaderClick = (colIndex: number, event: React.MouseEvent) => {
    const columnCells = Array.from(
      { length: filteredData.length },
      (_, i) => ({ row: i, col: colIndex })
    );

    if (event.metaKey || event.ctrlKey) {
      // Add or remove column from selection
      const isColumnSelected = selectedCells.some(cell => cell.col === colIndex);
      if (isColumnSelected) {
        setSelectedCells(selectedCells.filter(cell => cell.col !== colIndex));
      } else {
        setSelectedCells([...selectedCells, ...columnCells]);
      }
    } else {
      setSelectedCells(columnCells);
    }
    setShowAnalyzeButton(true);
  };

  // Handle row header click (select row)
  const handleRowHeaderClick = (rowIndex: number, event: React.MouseEvent) => {
    const rowCells = Array.from(
      { length: activeMetrics.length + 1 },
      (_, i) => ({ row: rowIndex, col: i })
    );

    if (event.metaKey || event.ctrlKey) {
      // Add or remove row from selection
      const isRowSelected = selectedCells.some(cell => cell.row === rowIndex);
      if (isRowSelected) {
        setSelectedCells(selectedCells.filter(cell => cell.row !== rowIndex));
      } else {
        setSelectedCells([...selectedCells, ...rowCells]);
      }
    } else {
      setSelectedCells(rowCells);
    }
    setShowAnalyzeButton(true);
  };

  // Update selection range for AI panel
  const updateSelectionRange = () => {
    if (selectedCells.length === 0) {
      onSelectionChange(null);
      return;
    }

    const allMetrics = [{ id: "name", name: "Ad Name" }, ...activeMetrics];
    
    // Group cells by column and row to detect full column/row selections
    const columnGroups = new Map<number, number>();
    const rowGroups = new Map<number, number>();
    selectedCells.forEach(cell => {
      columnGroups.set(cell.col, (columnGroups.get(cell.col) || 0) + 1);
      rowGroups.set(cell.row, (rowGroups.get(cell.row) || 0) + 1);
    });

    // Check for full column selections
    const fullColumns = Array.from(columnGroups.entries())
      .filter(([_, count]) => count === filteredData.length)
      .map(([col]) => col);

    // Check for full row selections
    const fullRows = Array.from(rowGroups.entries())
      .filter(([_, count]) => count === allMetrics.length)
      .map(([row]) => row);

    if (fullColumns.length > 0) {
      // Multiple column selection
      const metrics = fullColumns.map(colIndex => allMetrics[colIndex]);
      const values = metrics.flatMap(metric => 
        filteredData.map(ad => ({
          adId: ad.id,
          adName: ad.name,
          metricId: metric.id,
          metricName: metric.name,
          value: metric.id === "name" ? ad.name : ad[metric.id as keyof Ad],
        }))
      );
      
      onSelectionChange({
        type: "column",
        metricId: metrics[0].id,
        metricName: metrics.map(m => m.name).join(", "),
        values,
      });
    } else if (fullRows.length > 0) {
      // Multiple row selection
      const ads = fullRows.map(rowIndex => filteredData[rowIndex]);
      const values = ads.flatMap(ad =>
        allMetrics.map(metric => ({
          adId: ad.id,
          adName: ad.name,
          metricId: metric.id,
          metricName: metric.name,
          value: metric.id === "name" ? ad.name : ad[metric.id as keyof Ad],
        }))
      );
      
      onSelectionChange({
        type: "row",
        adId: ads[0].id,
        adName: ads.map(ad => ad.name).join(", "),
        values,
      });
    } else {
      // Individual cell selection
      const selections = selectedCells.map(cell => {
        const ad = filteredData[cell.row];
        const metric = allMetrics[cell.col];
        return {
          adId: ad.id,
          adName: ad.name,
          metricId: metric.id,
          metricName: metric.name,
          value: metric.id === "name" ? ad.name : ad[metric.id as keyof Ad],
        };
      });
      
      onSelectionChange({
        type: "cell",
        ...selections[0],
        additionalSelections: selections.slice(1),
      });
    }
  };

  // Handle analyze button click
  const handleAnalyzeClick = () => {
    updateSelectionRange();
    setShowAnalyzeButton(false);
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-4 border-b border-border p-4 md:flex-row md:items-center">
        <TableFilters data={data} onFiltersChange={handleFiltersChange} />
        <div className="flex-shrink-0 md:ml-auto">
          <MetricsSelector
            activeMetrics={activeMetrics}
            availableMetrics={OPTIONAL_METRICS}
            onToggle={handleMetricToggle}
          />
        </div>
      </div>
      
      <div className="relative overflow-auto">
        <Table className="relative table-fixed border-collapse">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted">
              {/* Row header (empty corner) */}
              <TableHead className="sticky left-0 z-10 w-12 bg-muted/50 p-0">
                <div className="flex h-full w-full items-center justify-center border-r border-border">
                  #
                </div>
              </TableHead>
              
              {/* Ad preview/name column */}
              <TableHead
                className="sticky left-12 z-10 w-64 cursor-pointer bg-muted/50 p-2 font-medium hover:bg-muted/80"
                onClick={(e) => handleHeaderClick(0, e)}
              >
                <div className="flex items-center justify-between">
                  <span>Ad</span>
                </div>
              </TableHead>
              
              {/* Metric columns */}
              {activeMetrics.map((metric, index) => (
                <TableHead
                  key={metric.id}
                  className={cn(
                    "cursor-pointer whitespace-nowrap p-2 font-medium hover:bg-muted/80",
                    isNumericMetric(metric.id) ? "text-center" : ""
                  )}
                  style={{ width: "150px" }}
                  onClick={(e) => handleHeaderClick(index + 1, e)}
                >
                  <div className={cn(
                    "flex items-center",
                    isNumericMetric(metric.id) ? "justify-center" : "justify-between"
                  )}>
                    <span>{metric.name}</span>
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((ad, rowIndex) => (
              <TableRow
                key={ad.id}
                className="group hover:bg-muted/50"
              >
                {/* Row header */}
                <TableCell
                  className="sticky left-0 z-10 cursor-pointer bg-muted/50 p-0 text-center font-medium text-muted-foreground group-hover:bg-muted/50"
                  onClick={(e) => handleRowHeaderClick(rowIndex, e)}
                >
                  <div className="flex h-full w-full items-center justify-center border-r border-border">
                    {rowIndex + 1}
                  </div>
                </TableCell>
                
                {/* Ad preview/name */}
                <TableCell
                  className={cn(
                    "sticky left-12 z-10 h-16 bg-background p-2 group-hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded border border-border bg-muted">
                      {ad.previewUrl ? (
                        <img
                          src={ad.previewUrl}
                          alt={ad.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                          No preview
                        </div>
                      )}
                    </div>
                    <div className="truncate font-medium">{ad.name}</div>
                  </div>
                </TableCell>
                
                {/* Metric cells */}
                {activeMetrics.map((metric, colIndex) => (
                  <TableCell
                    key={metric.id}
                    className={cn(
                      "cursor-pointer p-2",
                      isNumericMetric(metric.id) ? "text-center" : "text-right",
                      isCellSelected(rowIndex, colIndex + 1) ? "bg-primary/10" : ""
                    )}
                    onClick={(e) => handleCellClick(rowIndex, colIndex + 1, e)}
                  >
                    {formatMetricValue(ad[metric.id as keyof Ad], metric.id)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Floating Analyze Button */}
        {showAnalyzeButton && (
          <div className="fixed bottom-6 right-6 z-50">
            <Button
              onClick={handleAnalyzeClick}
              size="lg"
              className="shadow-lg"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Analyze Selection
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function to format metric values
function formatMetricValue(value: any, metricId: string): string {
  if (value === undefined || value === null) return "--";
  
  if (metricId === "spend" || metricId === "cpa" || metricId === "costPerResult") {
    return `$${value.toFixed(2)}`;
  } else if (metricId === "ctr" || metricId === "roas") {
    return `${value.toFixed(2)}%`;
  } else {
    return value.toLocaleString();
  }
}