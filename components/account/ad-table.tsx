"use client";

import { useState, useMemo, useEffect, useRef } from "react";
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
  const [selectionMode, setSelectionMode] = useState<'none' | 'cells' | 'rows' | 'columns'>('none');
  const [tableWidth, setTableWidth] = useState<number>(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollStartLeft, setScrollStartLeft] = useState(0);
  const [thumbWidth, setThumbWidth] = useState(100);
  const [lastScrollTime, setLastScrollTime] = useState(0);
  const [scrollVelocity, setScrollVelocity] = useState(0);
  
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const scrollAnimationRef = useRef<number>();

  useEffect(() => {
    const updateTableWidth = () => {
      const containerWidth = window.innerWidth - 288; // 288px is sidebar width
      setTableWidth(Math.max(containerWidth - 48, 800)); // Minimum width of 800px
    };

    updateTableWidth();
    window.addEventListener('resize', updateTableWidth);
    
    return () => {
      window.addEventListener('resize', updateTableWidth);
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (tableContainerRef.current && scrollbarRef.current) {
      const { scrollWidth, clientWidth } = tableContainerRef.current;
      const scrollbarWidth = scrollbarRef.current.clientWidth;
      const ratio = clientWidth / scrollWidth;
      const newThumbWidth = Math.max(40, Math.floor(scrollbarWidth * ratio));
      setThumbWidth(newThumbWidth);
    }
  }, [activeMetrics, filteredData]);

  const handleScroll = (e?: WheelEvent) => {
    if (!tableContainerRef.current || !scrollbarRef.current) return;

    if (e) {
      const now = Date.now();
      const timeDelta = now - lastScrollTime;
      const sensitivity = 2.5; // Increased sensitivity for smoother scrolling
      
      // Calculate scroll velocity with decay
      const newVelocity = (Math.abs(e.deltaX) / timeDelta) * sensitivity;
      const smoothedVelocity = scrollVelocity * 0.8 + newVelocity * 0.2;
      setScrollVelocity(smoothedVelocity);
      setLastScrollTime(now);

      // Apply momentum scrolling
      const momentum = smoothedVelocity * (e.deltaX > 0 ? 1 : -1);
      const targetScroll = tableContainerRef.current.scrollLeft + momentum;
      
      // Smooth scroll animation
      const animate = () => {
        if (!tableContainerRef.current) return;
        
        const currentScroll = tableContainerRef.current.scrollLeft;
        const diff = targetScroll - currentScroll;
        const delta = diff * 0.15;
        
        if (Math.abs(delta) > 0.5) {
          tableContainerRef.current.scrollLeft += delta;
          scrollAnimationRef.current = requestAnimationFrame(animate);
        }
      };
      
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current);
      }
      scrollAnimationRef.current = requestAnimationFrame(animate);
    }

    const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current;
    const scrollRatio = scrollLeft / (scrollWidth - clientWidth);
    const scrollbarWidth = scrollbarRef.current.clientWidth;
    const maxScroll = scrollbarWidth - thumbWidth;
    
    setScrollLeft(scrollRatio * maxScroll);
  };

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5) {
        e.preventDefault();
        handleScroll(e);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [scrollVelocity, lastScrollTime]);

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setStartX(e.clientX);
    setScrollStartLeft(scrollLeft);
  };

  const handleTrackClick = (e: React.MouseEvent) => {
    if (!tableContainerRef.current || !scrollbarRef.current || e.target === thumbRef.current) return;
    
    const scrollbarRect = scrollbarRef.current.getBoundingClientRect();
    const clickPosition = e.clientX - scrollbarRect.left;
    const scrollbarWidth = scrollbarRect.width;
    const halfThumbWidth = thumbWidth / 2;
    
    const targetScrollLeft = Math.max(0, Math.min(clickPosition - halfThumbWidth, scrollbarWidth - thumbWidth));
    const scrollRatio = targetScrollLeft / (scrollbarWidth - thumbWidth);
    
    if (tableContainerRef.current) {
      const maxTableScroll = tableContainerRef.current.scrollWidth - tableContainerRef.current.clientWidth;
      tableContainerRef.current.scrollLeft = scrollRatio * maxTableScroll;
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !tableContainerRef.current || !scrollbarRef.current) return;

      const scrollbarRect = scrollbarRef.current.getBoundingClientRect();
      const scrollbarWidth = scrollbarRect.width;
      const maxScroll = scrollbarWidth - thumbWidth;
      const delta = e.clientX - startX;
      const newScrollLeft = Math.max(0, Math.min(scrollStartLeft + delta, maxScroll));
      
      if (tableContainerRef.current) {
        const scrollRatio = newScrollLeft / maxScroll;
        const maxTableScroll = tableContainerRef.current.scrollWidth - tableContainerRef.current.clientWidth;
        tableContainerRef.current.scrollLeft = scrollRatio * maxTableScroll;
      }
      
      setScrollLeft(newScrollLeft);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, startX, scrollStartLeft, thumbWidth]);

  useMemo(() => {
    setFilteredData(data);
  }, [data]);

  const isNumericMetric = (metricId: string): boolean => {
    return metricId !== "name";
  };

  const isCellSelected = (rowIndex: number, colIndex: number): boolean => {
    return selectedCells.some(cell => cell.row === rowIndex && cell.col === colIndex);
  };

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
        } else {
          setSelectedCells([...selectedCells, ...columnCells]);
        }
      }
    } else {
      setSelectionMode('columns');
      setSelectedCells(columnCells);
    }
    setShowAnalyzeButton(true);
  };

  const handleRowHeaderClick = (rowIndex: number, event: React.MouseEvent) => {
    const rowCells = Array.from(
      { length: activeMetrics.length + 1 },
      (_, i) => ({ row: rowIndex, col: i })
    );

    if (event.metaKey || event.ctrlKey) {
      if (selectionMode === 'none' || selectionMode === 'rows') {
        setSelectionMode('rows');
        const isRowSelected = selectedCells.some(cell => cell.row === rowIndex);
        if (isRowSelected) {
          setSelectedCells(selectedCells.filter(cell => cell.row !== rowIndex));
        } else {
          setSelectedCells([...selectedCells, ...rowCells]);
        }
      }
    } else {
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
    } else if (selectionMode === 'rows') {
      const ads = uniqueRows.map(rowIndex => filteredData[rowIndex]);
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
          className="overflow-x-auto scrollbar-none"
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
          className="absolute bottom-0 left-0 h-2 w-full bg-muted/50"
          onClick={handleTrackClick}
        >
          <div
            ref={thumbRef}
            className="absolute h-full bg-muted-foreground/50 rounded hover:bg-muted-foreground/70 active:bg-muted-foreground/90 transition-all cursor-grab active:cursor-grabbing"
            style={{
              width: `${thumbWidth}px`,
              transform: `translateX(${scrollLeft}px)`,
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