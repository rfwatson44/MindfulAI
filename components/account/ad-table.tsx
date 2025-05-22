"use client";

<<<<<<< HEAD
import React, { useState, useMemo, useEffect, useRef } from "react";
=======
import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
>>>>>>> main
import {
  Table,
  TableBody,
  TableCell,
<<<<<<< HEAD
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TableFilters } from "@/components/account/table-filters";
import { MetricsSelector } from "@/components/account/metrics-selector";
=======
  TableRow,
} from "@/components/ui/table";
import { cn, parseConversions } from "@/lib/utils";
import { AdTableHeader } from "@/components/account/ad-table-header";
import { getSelectionSummary, SelectionMode } from "./selection-logic";
import { AdTableFilters } from "@/components/account/ad-table-filters";
import { AdTableDebugCell } from "./ad-table-debug";
import AdTableRow from "./ad-table-row";
>>>>>>> main
import { Ad, Metric, SelectedRange } from "@/lib/types";
import { DEFAULT_METRICS, OPTIONAL_METRICS } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
<<<<<<< HEAD
=======
import AdDetailsModal from "./AdDetailsModal";
import { AIPanel } from "./ai-panel";
>>>>>>> main

interface AdTableProps {
  data: Ad[];
  onSelectionChange: (selection: SelectedRange | null) => void;
}

<<<<<<< HEAD
export function AdTable({ data, onSelectionChange }: AdTableProps) {
  const [activeMetrics, setActiveMetrics] = useState<Metric[]>(DEFAULT_METRICS);
  const [filteredData, setFilteredData] = useState<Ad[]>(data);
  const [selectedCells, setSelectedCells] = useState<Array<{ row: number; col: number }>>([]);
  const [showAnalyzeButton, setShowAnalyzeButton] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'none' | 'cells' | 'rows' | 'columns'>('none');
=======
function AdImageCell({ thumbnailUrl, alt }: { thumbnailUrl?: string; alt: string }) {
  const [imgSrc, setImgSrc] = React.useState<string>("/fallback-thumbnail.png");
  const [isLoaded, setIsLoaded] = React.useState(false);
  const hasValidThumbnail = thumbnailUrl && typeof thumbnailUrl === "string" && thumbnailUrl.trim() !== "";

  React.useEffect(() => {
    if (!hasValidThumbnail) return;
    const realImg = new window.Image();
    realImg.src = `/api/proxy-image?url=${encodeURIComponent(thumbnailUrl!)}`;
    realImg.onload = () => {
      setImgSrc(realImg.src);
      setIsLoaded(true);
    };
    // If error, keep fallback
  }, [thumbnailUrl, hasValidThumbnail]);

  // If showing placeholder, don't animate
  const isPlaceholder = imgSrc === "/fallback-thumbnail.png";

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={`h-full w-full object-cover transition-opacity duration-500 ${!isPlaceholder && isLoaded ? 'opacity-100' : 'opacity-0'}`}
      style={{ background: '#f3f3f3' }}
      onLoad={() => { if (!isPlaceholder) setIsLoaded(true); }}
    />
  );
}

interface AdTablePropsWithAnalyze extends AdTableProps {
  showAnalyzeButton?: boolean;
  setShowAnalyzeButton?: (show: boolean) => void;
  aiPanelOpen?: boolean;
  setAIPanelOpen?: (open: boolean) => void;
}

function AdTable({ data, onSelectionChange, showDebug = false, showAnalyzeButton: showAnalyzeButtonProp, setShowAnalyzeButton: setShowAnalyzeButtonProp, aiPanelOpen: aiPanelOpenProp, setAIPanelOpen: setAIPanelOpenProp }: AdTablePropsWithAnalyze & { showDebug?: boolean }) {
  console.log("[AdTable] Rendered. data.length:", data.length);
  // DEBUG: Component mount/unmount
  React.useEffect(() => {
    console.log('[AdTable] MOUNT');
    return () => {
      console.log('[AdTable] UNMOUNT');
    };
  }, []);

  // DEBUG: Props received
  console.log('[AdTable] PROPS', { data, onSelectionChange, showDebug });

  // DEBUG: Component loaded
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [activeMetrics, setActiveMetrics] = useState<Metric[]>(DEFAULT_METRICS);
  const [filteredData, setFilteredData] = useState<Ad[]>(data);

  React.useEffect(() => {
    console.log('[AdTable] data prop changed:', data);
    setFilteredData(data);
  }, [data]);

  React.useEffect(() => {
    console.log('[AdTable] filteredData updated:', filteredData);
  }, [filteredData]);

  const [selectedCells, setSelectedCells] = useState<
    Array<{ row: number; col: number }>
  >([]);
  const [showAnalyzeButtonLocal, setShowAnalyzeButtonLocal] = useState(false);
  const [aiPanelOpenLocal, setAIPanelOpenLocal] = useState(false);
  const showAnalyzeButton = typeof showAnalyzeButtonProp === 'boolean' ? showAnalyzeButtonProp : showAnalyzeButtonLocal;
  const setShowAnalyzeButton = setShowAnalyzeButtonProp || setShowAnalyzeButtonLocal;
  const aiPanelOpen = typeof aiPanelOpenProp === 'boolean' ? aiPanelOpenProp : aiPanelOpenLocal;
  const setAIPanelOpen = setAIPanelOpenProp || setAIPanelOpenLocal;
  const [selectionMode, setSelectionMode] = useState<
    "none" | "cells" | "rows" | "columns"
  >("none");
>>>>>>> main
  const [tableWidth, setTableWidth] = useState<number>(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollStartLeft, setScrollStartLeft] = useState(0);
<<<<<<< HEAD
  
=======

  const handleOpenAdModal = (ad: Ad) => setSelectedAd(ad);
  const handleCloseAdModal = () => setSelectedAd(null);

  // DEBUG: Log incoming data
  useEffect(() => {
    // console.log('[AdTable] MOUNT data prop:', data);
    if (!data || data.length === 0) {
      // console.warn('[AdTable] WARNING: data prop is empty or undefined!');
    }
  }, [data]);

>>>>>>> main
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTableWidth = () => {
      const containerWidth = window.innerWidth - 288; // Sidebar width
      setTableWidth(Math.max(containerWidth - 48, 800)); // Min width 800px
    };

    updateTableWidth();
<<<<<<< HEAD
    window.addEventListener('resize', updateTableWidth);
    
    return () => {
      window.removeEventListener('resize', updateTableWidth);
=======
    window.addEventListener("resize", updateTableWidth);

    return () => {
      window.removeEventListener("resize", updateTableWidth);
>>>>>>> main
    };
  }, []);

  const handleScroll = () => {
<<<<<<< HEAD
    if (!tableContainerRef.current || !scrollbarRef.current || !thumbRef.current) return;
=======
    if (
      !tableContainerRef.current ||
      !scrollbarRef.current ||
      !thumbRef.current
    )
      return;
>>>>>>> main

    const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current;
    const scrollRatio = scrollLeft / (scrollWidth - clientWidth);
    const scrollbarWidth = scrollbarRef.current.clientWidth;
    const thumbWidth = thumbRef.current.clientWidth;
    const maxScroll = scrollbarWidth - thumbWidth;
<<<<<<< HEAD
    
=======

>>>>>>> main
    setScrollLeft(scrollRatio * maxScroll);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
<<<<<<< HEAD
      if (!isDragging || !tableContainerRef.current || !scrollbarRef.current || !thumbRef.current) return;
=======
      if (
        !isDragging ||
        !tableContainerRef.current ||
        !scrollbarRef.current ||
        !thumbRef.current
      )
        return;
>>>>>>> main

      const scrollbarWidth = scrollbarRef.current.clientWidth;
      const thumbWidth = thumbRef.current.clientWidth;
      const maxScroll = scrollbarWidth - thumbWidth;
      const delta = e.clientX - startX;
<<<<<<< HEAD
      const newScrollLeft = Math.max(0, Math.min(scrollStartLeft + delta, maxScroll));
      
      const scrollRatio = newScrollLeft / maxScroll;
      const maxTableScroll = tableContainerRef.current.scrollWidth - tableContainerRef.current.clientWidth;
=======
      const newScrollLeft = Math.max(
        0,
        Math.min(scrollStartLeft + delta, maxScroll)
      );

      const scrollRatio = newScrollLeft / maxScroll;
      const maxTableScroll =
        tableContainerRef.current.scrollWidth -
        tableContainerRef.current.clientWidth;
>>>>>>> main
      tableContainerRef.current.scrollLeft = scrollRatio * maxTableScroll;
      setScrollLeft(newScrollLeft);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
<<<<<<< HEAD
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
=======
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
>>>>>>> main
    };
  }, [isDragging, startX, scrollStartLeft]);

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.clientX);
    setScrollStartLeft(scrollLeft);
  };

  const handleTrackClick = (e: React.MouseEvent) => {
<<<<<<< HEAD
    if (!tableContainerRef.current || !scrollbarRef.current || !thumbRef.current) return;
    
=======
    if (
      !tableContainerRef.current ||
      !scrollbarRef.current ||
      !thumbRef.current
    )
      return;

>>>>>>> main
    const rect = scrollbarRef.current.getBoundingClientRect();
    const clickPosition = e.clientX - rect.left;
    const scrollbarWidth = scrollbarRef.current.clientWidth;
    const thumbWidth = thumbRef.current.clientWidth;
    const maxScroll = scrollbarWidth - thumbWidth;
    const scrollRatio = clickPosition / scrollbarWidth;
<<<<<<< HEAD
    
    const maxTableScroll = tableContainerRef.current.scrollWidth - tableContainerRef.current.clientWidth;
    tableContainerRef.current.scrollLeft = scrollRatio * maxTableScroll;
  };

  useMemo(() => {
    setFilteredData(data);
  }, [data]);

  const isNumericMetric = (metricId: string): boolean => {
    return metricId !== "name";
  };

  const isCellSelected = (rowIndex: number, colIndex: number): boolean => {
    return selectedCells.some(cell => cell.row === rowIndex && cell.col === colIndex);
  };

=======

    const maxTableScroll =
      tableContainerRef.current.scrollWidth -
      tableContainerRef.current.clientWidth;
    tableContainerRef.current.scrollLeft = scrollRatio * maxTableScroll;
  };

>>>>>>> main
  const handleMetricToggle = (metric: Metric) => {
    if (activeMetrics.some((m) => m.id === metric.id)) {
      setActiveMetrics(activeMetrics.filter((m) => m.id !== metric.id));
    } else {
      setActiveMetrics([...activeMetrics, metric]);
    }
  };

  const handleFiltersChange = (filtered: Ad[]) => {
    setFilteredData(filtered);
  };

  const handleCellClick = (
    rowIndex: number,
    colIndex: number,
    event: React.MouseEvent
  ) => {
    event.preventDefault();
<<<<<<< HEAD
    
    if (event.metaKey || event.ctrlKey) {
      if (selectionMode === 'none' || selectionMode === 'cells') {
        setSelectionMode('cells');
        const cellIndex = selectedCells.findIndex(
          cell => cell.row === rowIndex && cell.col === colIndex
        );
        
        if (cellIndex >= 0) {
          setSelectedCells(selectedCells.filter((_, i) => i !== cellIndex));
        } else {
          setSelectedCells([...selectedCells, { row: rowIndex, col: colIndex }]);
        }
      }
    } else {
      setSelectionMode('cells');
      setSelectedCells([{ row: rowIndex, col: colIndex }]);
    }
    
    setShowAnalyzeButton(true);
  };

  const handleHeaderClick = (colIndex: number, event: React.MouseEvent) => {
    const columnCells = Array.from(
      { length: filteredData.length },
      (_, i) => ({ row: i, col: colIndex })
    );

    if (event.metaKey || event.ctrlKey) {
      if (selectionMode === 'none' || selectionMode === 'columns') {
        setSelectionMode('columns');
        const isColumnSelected = selectedCells.some(cell => cell.col === colIndex);
        if (isColumnSelected) {
          setSelectedCells(selectedCells.filter(cell => cell.col !== colIndex));
=======

    if (event.metaKey || event.ctrlKey) {
      if (selectionMode === "none" || selectionMode === "cells") {
        setSelectionMode("cells");
        const cellIndex = selectedCells.findIndex(
          (cell) => cell.row === rowIndex && cell.col === colIndex
        );

        if (cellIndex >= 0) {
          setSelectedCells(selectedCells.filter((_, i) => i !== cellIndex));
        } else {
          setSelectedCells([
            ...selectedCells,
            { row: rowIndex, col: colIndex },
          ]);
        }
      }
    } else {
      setSelectionMode("cells");
      setSelectedCells([{ row: rowIndex, col: colIndex }]);
    }


  };

  const handleHeaderClick = (colIndex: number, event: React.MouseEvent) => {
    const columnCells = Array.from({ length: filteredData.length }, (_, i) => ({
      row: i,
      col: colIndex,
    }));

    if (event.metaKey || event.ctrlKey) {
      if (selectionMode === "none" || selectionMode === "columns") {
        setSelectionMode("columns");
        const isColumnSelected = selectedCells.some(
          (cell) => cell.col === colIndex
        );
        if (isColumnSelected) {
          setSelectedCells(
            selectedCells.filter((cell) => cell.col !== colIndex)
          );
>>>>>>> main
        } else {
          setSelectedCells([...selectedCells, ...columnCells]);
        }
      }
    } else {
<<<<<<< HEAD
      setSelectionMode('columns');
      setSelectedCells(columnCells);
    }
    setShowAnalyzeButton(true);
=======
      setSelectionMode("columns");
      setSelectedCells(columnCells);
    }

>>>>>>> main
  };

  const handleRowHeaderClick = (rowIndex: number, event: React.MouseEvent) => {
    const rowCells = Array.from(
      { length: activeMetrics.length + 1 },
      (_, i) => ({ row: rowIndex, col: i })
    );

    if (event.metaKey || event.ctrlKey) {
<<<<<<< HEAD
      if (selectionMode === 'none' || selectionMode === 'rows') {
        setSelectionMode('rows');
        const isRowSelected = selectedCells.some(cell => cell.row === rowIndex);
        if (isRowSelected) {
          setSelectedCells(selectedCells.filter(cell => cell.row !== rowIndex));
=======
      if (selectionMode === "none" || selectionMode === "rows") {
        setSelectionMode("rows");
        const isRowSelected = selectedCells.some(
          (cell) => cell.row === rowIndex
        );
        if (isRowSelected) {
          setSelectedCells(
            selectedCells.filter((cell) => cell.row !== rowIndex)
          );
>>>>>>> main
        } else {
          setSelectedCells([...selectedCells, ...rowCells]);
        }
      }
    } else {
<<<<<<< HEAD
      setSelectionMode('rows');
      setSelectedCells(rowCells);
    }
    setShowAnalyzeButton(true);
  };

  const updateSelectionRange = () => {
    if (selectedCells.length === 0) {
      onSelectionChange(null);
      return;
    }

    const allMetrics = [{ id: "name", name: "Ad Name" }, ...activeMetrics];
    
    const uniqueRows = Array.from(new Set(selectedCells.map(cell => cell.row)));
    const uniqueCols = Array.from(new Set(selectedCells.map(cell => cell.col)));

    if (selectionMode === 'columns') {
      const metrics = uniqueCols.map(colIndex => allMetrics[colIndex]);
      const values = metrics.flatMap(metric => 
        filteredData.map(ad => ({
=======
      setSelectionMode("rows");
      setSelectedCells(rowCells);
    }
  };

  useEffect(() => {
    // No-op
  }, [selectedCells.length, showAnalyzeButtonProp, showAnalyzeButtonLocal, aiPanelOpenProp, aiPanelOpenLocal]);

  useEffect(() => {
    if (selectionMode === "columns") {
      const metrics = uniqueCols.map((colIndex) => allMetrics[colIndex]);
      const values = metrics.flatMap((metric: Metric) =>
        filteredData.map((ad) => ({
>>>>>>> main
          adId: ad.id,
          adName: ad.name,
          metricId: metric.id,
          metricName: metric.name,
          value: metric.id === "name" ? ad.name : ad[metric.id as keyof Ad],
        }))
      );
<<<<<<< HEAD
      
      onSelectionChange({
        type: "column",
        metricId: metrics[0].id,
        metricName: metrics.map(m => m.name).join(", "),
        values,
      });
    } else if (selectionMode === 'rows') {
      const ads = uniqueRows.map(rowIndex => filteredData[rowIndex]);
      const values = ads.flatMap(ad =>
        allMetrics.map(metric => ({
=======
      const selection = {
        type: "column" as const,
        metricId: metrics[0]?.id,
        metricName: metrics.map((m: Metric) => m.name).join(", "),
        values,
      };
      // console.log('[AdTable] Calling onSelectionChange with (columns):', selection);
      onSelectionChange(selection);
    } else if (selectionMode === "rows") {
      const ads = uniqueRows.map((rowIndex) => filteredData[rowIndex]);
      const values = ads.flatMap((ad) =>
        allMetrics.map((metric: Metric) => ({
>>>>>>> main
          adId: ad.id,
          adName: ad.name,
          metricId: metric.id,
          metricName: metric.name,
          value: metric.id === "name" ? ad.name : ad[metric.id as keyof Ad],
        }))
      );
<<<<<<< HEAD
      
      onSelectionChange({
        type: "row",
        adId: ads[0].id,
        adName: ads.map(ad => ad.name).join(", "),
        values,
      });
    } else {
      const selections = selectedCells.map(cell => {
=======
      const selection = {
        type: "row" as const,
        adId: ads[0]?.id,
        adName: ads.map((ad) => ad.name).join(", "),
        values,
      };
      // console.log('[AdTable] Calling onSelectionChange with (rows):', selection);
      onSelectionChange(selection);
    } else {
      const selections = selectedCells.map((cell) => {
>>>>>>> main
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
<<<<<<< HEAD
      
      onSelectionChange({
        type: "cell",
        ...selections[0],
        additionalSelections: selections.slice(1),
      });
    }
  };

  const handleAnalyzeClick = () => {
    updateSelectionRange();
    setShowAnalyzeButton(false);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="border-b p-4">
        <div className="flex items-start gap-4">
          <div className="w-[300px]">
            <TableFilters data={data} onFiltersChange={handleFiltersChange} />
          </div>
          <div className="flex-1">
            <MetricsSelector
              activeMetrics={activeMetrics}
              availableMetrics={OPTIONAL_METRICS}
              onToggle={handleMetricToggle}
            />
          </div>
        </div>
      </div>
      
      <div className="relative flex-1 overflow-hidden">
        <div 
          ref={tableContainerRef}
          className="h-full overflow-auto"
          onScroll={handleScroll}
          style={{ width: `${tableWidth}px` }}
        >
          <Table>
            <TableHeader>
              <TableRow className="border-b bg-muted/50">
                <TableHead className="sticky left-0 top-0 z-20 w-12 bg-muted/50 p-0">
                  <div className="flex h-full w-full items-center justify-center border-r border-border">
                    #
                  </div>
                </TableHead>
                
                <TableHead
                  className="sticky left-12 top-0 z-20 w-64 cursor-pointer bg-muted/50 p-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted/80"
                  onClick={(e) => handleHeaderClick(0, e)}
                >
                  <span>Ad</span>
                </TableHead>
                
                {activeMetrics.map((metric, index) => (
                  <TableHead
                    key={metric.id}
                    className={cn(
                      "sticky top-0 cursor-pointer whitespace-nowrap p-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted/80",
                      isNumericMetric(metric.id) ? "text-center" : ""
                    )}
                    style={{ width: "150px" }}
                    onClick={(e) => handleHeaderClick(index + 1, e)}
                  >
                    <span>{metric.name}</span>
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
                  <TableCell
                    className="sticky left-0 z-10 cursor-pointer bg-muted/50 p-0 text-center font-medium text-muted-foreground group-hover:bg-muted/50"
                    onClick={(e) => handleRowHeaderClick(rowIndex, e)}
                  >
                    <div className="flex h-full w-full items-center justify-center border-r border-border">
                      {rowIndex + 1}
                    </div>
                  </TableCell>
                  
                  <TableCell
                    className={cn(
                      "sticky left-12 z-10 h-16 bg-background p-2 group-hover:bg-muted/50",
                      isCellSelected(rowIndex, 0) ? "bg-primary/10" : ""
                    )}
                    onClick={(e) => handleCellClick(rowIndex, 0, e)}
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
                      {formatValue(ad[metric.id as keyof Ad], metric.id)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div
          ref={scrollbarRef}
          className="absolute bottom-0 left-0 h-2 w-full bg-muted/50 cursor-pointer"
          onClick={handleTrackClick}
        >
          <div
            ref={thumbRef}
            className="absolute h-full w-32 bg-muted-foreground/50 rounded hover:bg-muted-foreground/70 active:bg-muted-foreground/90 transition-colors"
            style={{
              transform: `translateX(${scrollLeft}px)`,
              cursor: 'grab',
            }}
            onMouseDown={handleThumbMouseDown}
          />
        </div>
      </div>

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
  );
}

function formatValue(value: any, metricId: string): string {
  if (value === undefined || value === null) return "--";
  
  if (metricId === "spend" || metricId === "cpa" || metricId === "costPerResult") {
    return `$${Number(value).toFixed(2)}`;
  } else if (metricId === "ctr" || metricId === "roas") {
    return `${Number(value).toFixed(2)}%`;
  } else {
    return value.toLocaleString();
  }
}
=======
      const selection = {
        type: "cell" as const,
        ...selections[0],
        additionalSelections: selections.length > 1 ? selections.slice(1) : undefined,
      };
      // console.log('[AdTable] Calling onSelectionChange with (cells):', selection);
      onSelectionChange(selection);
    }
  }, [selectedCells, selectionMode, activeMetrics, filteredData, onSelectionChange]);

  // --- Cell selection checker (must be top-level) ---
  const isCellSelected = useCallback(
    (rowIndex: number, colIndex: number): boolean => {
      return selectedCells.some(
        (cell) => cell.row === rowIndex && cell.col === colIndex
      );
    },
    [selectedCells]
  );

  const formatValue = useCallback((value: number, metricId: string) => {
    // // console.log('[AdTable] formatValue:', value, metricId);
    switch (metricId) {
      case "spend":
      case "amount_spent":
        return `$${Number(value).toFixed(2)}`;
      case "impressions":
      case "clicks":
        return `${Number(value).toLocaleString()}`;
      case "ctr":
        return `${(Number(value) * 100).toFixed(2)}%`;
      default:
        return String(value);
    }
  }, []);

  // DEBUG: About to render
  // // console.log('[AdTable] About to render', { filteredData, data, showDebug });
  if (filteredData.length === 0) {
    // // console.log('[AdTable] No ads to display in table body!');
  }

  return (
    <div className="flex flex-col h-full min-h-0 flex-1">
      {/* Analyze Selected button above metrics/filter bar, aligned right */}

      {filteredData.length > 0 && aiPanelOpen && (
        <AIPanel
          isOpen={aiPanelOpen}
          onOpenChange={setAIPanelOpen}
          selectedRange={getSelectionSummary(selectionMode as SelectionMode, selectedCells, activeMetrics, filteredData)}
          adsData={filteredData}
        />
      )}
      <div className="border-b p-4 sticky top-0 z-30 bg-white">
        <AdTableFilters
          data={data}
          activeMetrics={activeMetrics}
          onFiltersChange={handleFiltersChange}
          onMetricToggle={handleMetricToggle}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-auto w-full">
        <Table>
          <AdTableHeader
            activeMetrics={activeMetrics}
            filteredData={filteredData}
            data={data}
            onHeaderClick={handleHeaderClick}
          />
          <TableBody>
            {filteredData.length === 0 && (
              <TableRow>
                <TableCell colSpan={activeMetrics.length + 2} className="text-center text-red-600">
                  No ads to display. See console for debug info.
                </TableCell>
              </TableRow>
            )}
            {filteredData.map((ad, rowIndex) => {
              // // console.log('[AdTable] Rendering ad row:', ad, rowIndex);
              return (
                <React.Fragment key={ad.id || rowIndex}>
                  <AdTableRow
                    ad={ad}
                    rowIndex={rowIndex}
                    activeMetrics={activeMetrics}
                    isCellSelected={isCellSelected}
                    handleRowHeaderClick={handleRowHeaderClick}
                    handleCellClick={handleCellClick}
                    formatValue={formatValue}
                  />
                  {showDebug && (
                    <TableRow className="bg-yellow-50">
                      <TableCell colSpan={activeMetrics.length + 2} className="p-0">
                        <AdTableDebugCell ad={ad} />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
export default AdTable;
>>>>>>> main
