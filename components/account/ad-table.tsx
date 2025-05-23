"use client";

import React, {
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { AdTableHeader } from "@/components/account/ad-table-header";
import { getSelectionSummary, SelectionMode } from "./selection-logic";
import { AdTableFilters } from "@/components/account/ad-table-filters";
import { AdTableDebugCell } from "./ad-table-debug";
import AdTableRow from "./ad-table-row";
import { Ad, Metric, SelectedRange } from "@/lib/types";
import { DEFAULT_METRICS, OPTIONAL_METRICS } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import AdDetailsModal from "./AdDetailsModal";
import { AIPanel } from "./ai-panel";

interface AdTableProps {
  data: Ad[];
  onSelectionChange: (selection: SelectedRange | null) => void;
}

export function AdImageCell({
  thumbnailUrl,
  alt,
}: {
  thumbnailUrl?: string;
  alt: string;
}) {
  const [imgSrc, setImgSrc] = React.useState<string>("/fallback-thumbnail.png");
  const [isLoaded, setIsLoaded] = React.useState(false);
  const hasValidThumbnail =
    thumbnailUrl &&
    typeof thumbnailUrl === "string" &&
    thumbnailUrl.trim() !== "";

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
      className={`h-full w-full object-cover transition-opacity duration-500 ${
        !isPlaceholder && isLoaded ? "opacity-100" : "opacity-0"
      }`}
      style={{ background: "#f3f3f3" }}
      onLoad={() => {
        if (!isPlaceholder) setIsLoaded(true);
      }}
    />
  );
}

interface AdTablePropsWithAnalyze extends AdTableProps {
  showAnalyzeButton?: boolean;
  setShowAnalyzeButton?: (show: boolean) => void;
  aiPanelOpen?: boolean;
  setAIPanelOpen?: (open: boolean) => void;
}

export function AdTable({
  data,
  onSelectionChange,
  showDebug = false,
  showAnalyzeButton: showAnalyzeButtonProp,
  setShowAnalyzeButton: setShowAnalyzeButtonProp,
  aiPanelOpen: aiPanelOpenProp,
  setAIPanelOpen: setAIPanelOpenProp,
}: AdTablePropsWithAnalyze & { showDebug?: boolean }) {
  // Comment out debug logs that may cause performance issues
  // console.log("[AdTable] Rendered. data.length:", data.length);

  // Use memoized refs to prevent recreation on every render
  const safeData = useMemo(() => data || [], [data]);

  // DEBUG: Component mount/unmount - leave one log to debug mount cycle
  React.useEffect(() => {
    // console.log('[AdTable] MOUNT');
    return () => {
      // console.log('[AdTable] UNMOUNT');
    };
  }, []);

  // Comment out debug logs
  // console.log('[AdTable] PROPS', { data, onSelectionChange, showDebug });

  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [activeMetrics, setActiveMetrics] = useState<Metric[]>(DEFAULT_METRICS);

  // Use memo to prevent recreation of filteredData
  const [filteredDataState, setFilteredDataState] = useState<Ad[]>(safeData);
  const filteredData = useMemo(() => filteredDataState, [filteredDataState]);

  React.useEffect(() => {
    setFilteredDataState(safeData);
  }, [safeData]);

  const [selectedCells, setSelectedCells] = useState<
    Array<{ row: number; col: number }>
  >([]);
  const [showAnalyzeButtonLocal, setShowAnalyzeButtonLocal] = useState(false);
  const [aiPanelOpenLocal, setAIPanelOpenLocal] = useState(false);
  const showAnalyzeButton =
    typeof showAnalyzeButtonProp === "boolean"
      ? showAnalyzeButtonProp
      : showAnalyzeButtonLocal;
  const setShowAnalyzeButton =
    setShowAnalyzeButtonProp || setShowAnalyzeButtonLocal;
  const aiPanelOpen =
    typeof aiPanelOpenProp === "boolean" ? aiPanelOpenProp : aiPanelOpenLocal;
  const setAIPanelOpen = setAIPanelOpenProp || setAIPanelOpenLocal;
  const [selectionMode, setSelectionMode] = useState<
    "none" | "cells" | "rows" | "columns"
  >("none");
  const [tableWidth, setTableWidth] = useState<number>(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollStartLeft, setScrollStartLeft] = useState(0);

  const handleOpenAdModal = (ad: Ad) => setSelectedAd(ad);
  const handleCloseAdModal = () => setSelectedAd(null);

  // DEBUG: Log incoming data
  useEffect(() => {
    // console.log('[AdTable] MOUNT data prop:', data);
    if (!data || data.length === 0) {
      // console.warn('[AdTable] WARNING: data prop is empty or undefined!');
    }
  }, [data]);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTableWidth = () => {
      const containerWidth = window.innerWidth - 288; // Sidebar width
      setTableWidth(Math.max(containerWidth - 48, 800)); // Min width 800px
    };

    updateTableWidth();
    window.addEventListener("resize", updateTableWidth);

    return () => {
      window.removeEventListener("resize", updateTableWidth);
    };
  }, []);

  const handleScroll = () => {
    if (
      !tableContainerRef.current ||
      !scrollbarRef.current ||
      !thumbRef.current
    )
      return;

    const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current;
    const scrollRatio = scrollLeft / (scrollWidth - clientWidth);
    const scrollbarWidth = scrollbarRef.current.clientWidth;
    const thumbWidth = thumbRef.current.clientWidth;
    const maxScroll = scrollbarWidth - thumbWidth;
    setScrollLeft(scrollRatio * maxScroll);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (
        !isDragging ||
        !tableContainerRef.current ||
        !scrollbarRef.current ||
        !thumbRef.current
      )
        return;

      const scrollbarWidth = scrollbarRef.current.clientWidth;
      const thumbWidth = thumbRef.current.clientWidth;
      const maxScroll = scrollbarWidth - thumbWidth;
      const delta = e.clientX - startX;
      const newScrollLeft = Math.max(
        0,
        Math.min(scrollStartLeft + delta, maxScroll)
      );

      const scrollRatio = newScrollLeft / maxScroll;
      const maxTableScroll =
        tableContainerRef.current.scrollWidth -
        tableContainerRef.current.clientWidth;
      tableContainerRef.current.scrollLeft = scrollRatio * maxTableScroll;
      setScrollLeft(newScrollLeft);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, startX, scrollStartLeft]);

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.clientX);
    setScrollStartLeft(scrollLeft);
  };

  const handleTrackClick = (e: React.MouseEvent) => {
    if (
      !tableContainerRef.current ||
      !scrollbarRef.current ||
      !thumbRef.current
    )
      return;

    const rect = scrollbarRef.current.getBoundingClientRect();
    const clickPosition = e.clientX - rect.left;
    const scrollbarWidth = scrollbarRef.current.clientWidth;
    const thumbWidth = thumbRef.current.clientWidth;
    const maxScroll = scrollbarWidth - thumbWidth;
    const scrollRatio = clickPosition / scrollbarWidth;

    const maxTableScroll =
      tableContainerRef.current.scrollWidth -
      tableContainerRef.current.clientWidth;
    tableContainerRef.current.scrollLeft = scrollRatio * maxTableScroll;
  };

  const handleMetricToggle = (metric: Metric) => {
    if (activeMetrics.some((m) => m.id === metric.id)) {
      setActiveMetrics(activeMetrics.filter((m) => m.id !== metric.id));
    } else {
      setActiveMetrics([...activeMetrics, metric]);
    }
  };

  const handleFiltersChange = (filtered: Ad[]) => {
    setSelectedCells([]);
    setSelectionMode("none");
    if (setShowAnalyzeButton) {
      setShowAnalyzeButton(false);
    }
    if (onSelectionChange) {
      onSelectionChange(null);
    }
    setFilteredDataState(filtered);
  };

  const handleCellClick = (
    rowIndex: number,
    colIndex: number,
    event: React.MouseEvent
  ) => {
    event.preventDefault();

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
        } else {
          setSelectedCells([...selectedCells, ...columnCells]);
        }
      }
    } else {
      setSelectionMode("columns");
      setSelectedCells(columnCells);
    }
  };

  const handleRowHeaderClick = (rowIndex: number, event: React.MouseEvent) => {
    const rowCells = Array.from(
      { length: activeMetrics.length + 1 },
      (_, i) => ({ row: rowIndex, col: i })
    );

    if (event.metaKey || event.ctrlKey) {
      if (selectionMode === "none" || selectionMode === "rows") {
        setSelectionMode("rows");
        const isRowSelected = selectedCells.some(
          (cell) => cell.row === rowIndex
        );
        if (isRowSelected) {
          setSelectedCells(
            selectedCells.filter((cell) => cell.row !== rowIndex)
          );
        } else {
          setSelectedCells([...selectedCells, ...rowCells]);
        }
      }
    } else {
      setSelectionMode("rows");
      setSelectedCells(rowCells);
    }
  };

  useEffect(() => {
    // No-op
  }, [
    selectedCells.length,
    showAnalyzeButtonProp,
    showAnalyzeButtonLocal,
    aiPanelOpenProp,
    aiPanelOpenLocal,
  ]);

  // Extract unique rows and columns from selected cells
  const uniqueCols = useMemo(() => {
    const colSet = new Set<number>();
    selectedCells.forEach((cell) => colSet.add(cell.col));
    return Array.from(colSet);
  }, [selectedCells]);

  const uniqueRows = useMemo(() => {
    const rowSet = new Set<number>();
    selectedCells.forEach((cell) => rowSet.add(cell.row));
    return Array.from(rowSet);
  }, [selectedCells]);

  // Combine all available metrics
  const allMetrics = useMemo(
    () => [{ id: "name", name: "Ad Name" }, ...activeMetrics],
    [activeMetrics]
  );

  useEffect(() => {
    // Skip if no selection or no onSelectionChange handler
    if (selectedCells.length === 0 || !onSelectionChange) {
      if (typeof setShowAnalyzeButton === "function") {
        setShowAnalyzeButton(false);
      }
      return;
    }

    // Show the analyze button if there are selections
    if (typeof setShowAnalyzeButton === "function") {
      setShowAnalyzeButton(selectedCells.length > 0);
    }

    // This will be our selection result
    let selection: SelectedRange | null = null;

    try {
      if (selectionMode === "columns" && uniqueCols.length > 0) {
        const metrics = uniqueCols.map((colIndex) => allMetrics[colIndex]);
        if (!metrics[0]) return; // Guard against invalid metrics

        const values = metrics.flatMap((metric: Metric) =>
          filteredData.map((ad) => ({
            adId: ad.id || "",
            adName: ad.name || "",
            metricId: metric.id,
            metricName: metric.name,
            value: metric.id === "name" ? ad.name : ad[metric.id as keyof Ad],
          }))
        );

        selection = {
          type: "column",
          metricId: metrics[0]?.id,
          metricName: metrics.map((m: Metric) => m.name).join(", "),
          values,
        };
      } else if (selectionMode === "rows" && uniqueRows.length > 0) {
        const ads = uniqueRows
          .map((rowIndex) => filteredData[rowIndex])
          .filter(Boolean);
        if (!ads.length || !ads[0]) return; // Guard against invalid ads

        const values = ads.flatMap((ad) =>
          allMetrics.map((metric: Metric) => ({
            adId: ad.id || "",
            adName: ad.name || "",
            metricId: metric.id,
            metricName: metric.name,
            value: metric.id === "name" ? ad.name : ad[metric.id as keyof Ad],
          }))
        );

        selection = {
          type: "row",
          adId: ads[0]?.id || "",
          adName: ads.map((ad) => ad.name || "").join(", "),
          values,
        };
      } else if (selectedCells.length > 0) {
        const selections = selectedCells
          .map((cell) => {
            // Guard against out-of-bounds access
            if (
              cell.row >= filteredData.length ||
              cell.col >= allMetrics.length
            )
              return null;

            const ad = filteredData[cell.row];
            const metric = allMetrics[cell.col];

            if (!ad || !metric) return null;

            return {
              adId: ad.id || "",
              adName: ad.name || "",
              metricId: metric.id,
              metricName: metric.name,
              value: metric.id === "name" ? ad.name : ad[metric.id as keyof Ad],
            };
          })
          .filter(
            (
              item
            ): item is {
              adId: string;
              adName: string;
              metricId: string;
              metricName: string;
              value: any;
            } => item !== null
          );

        if (selections.length === 0) return; // No valid selections

        selection = {
          type: "cell",
          ...selections[0]!,
          additionalSelections:
            selections.length > 1 ? selections.slice(1) : undefined,
        };
      }

      // Only call onSelectionChange if we have a valid selection
      if (selection) {
        onSelectionChange(selection);
      }
    } catch (error) {
      console.error("Error in selection logic:", error);
      // Reset selection state on error
      setSelectedCells([]);
      setSelectionMode("none");
      if (typeof setShowAnalyzeButton === "function") {
        setShowAnalyzeButton(false);
      }
      onSelectionChange(null);
    }
  }, [
    selectedCells,
    selectionMode,
    uniqueCols,
    uniqueRows,
    allMetrics,
    filteredData,
    setShowAnalyzeButton,
    onSelectionChange,
  ]);

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
          selectedRange={getSelectionSummary(
            selectionMode as SelectionMode,
            selectedCells,
            activeMetrics,
            filteredData
          )}
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
                <TableCell
                  colSpan={activeMetrics.length + 2}
                  className="text-center text-red-600"
                >
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
                      <TableCell
                        colSpan={activeMetrics.length + 2}
                        className="p-0"
                      >
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
