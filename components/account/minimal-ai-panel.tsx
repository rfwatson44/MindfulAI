"use client";

import React, { useState, useCallback, memo } from "react";
import { SelectedRange, Ad } from "@/lib/types";

// Import AI panel components
import SummarizeTab from "./ai-panel/SummarizeTab";
import TableTab from "./ai-panel/TableTab";
import AskTab from "./ai-panel/AskTab";

// Import icons (using simple emoji fallbacks to avoid dependency issues)
const icons = {
  sparkles: "✨",
  chart: "📊",
  table: "📋",
  message: "💬",
  close: "✕",
  chevronUp: "⌃",
  chevronDown: "⌄"
};

// Memoize components to prevent unnecessary re-renders
const MemoizedSummarizeTab = memo(SummarizeTab);
const MemoizedTableTab = memo(TableTab);
const MemoizedAskTab = memo(AskTab);

interface MinimalAIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRange: SelectedRange | null;
  adsData: Ad[];
}

// Enhanced but dependency-free AI Panel
export default function MinimalAIPanel({
  isOpen,
  onClose,
  selectedRange,
  adsData,
}: MinimalAIPanelProps) {
  const [activeTab, setActiveTab] = useState("summarize");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  if (!isOpen || !selectedRange) return null;

  // Copied directly from SummarizeTab.tsx to maintain exact functionality
  const formatValue = (value: any, metricId: string | undefined): string => {
    if (value === undefined || value === null) return "--";

    // Check if the metric is related to spend or cost
    const isMonetary =
      metricId?.toLowerCase().includes("spent") ||
      metricId?.toLowerCase().includes("cost");

    // Format percentages (xx.xx%) - Special handling for CTR
    if (metricId === "ctr" || metricId === "roas") {
      // Handle CTR values by parsing as number and ensuring proper formatting
      let numValue = parseFloat(String(value).replace('%', ''));
      
      // Debug the CTR value formatting
      console.debug(`[AIPanel] Formatting CTR value: ${value} (type: ${typeof value}), parsed as: ${numValue}`);
      
      // Handle different formats of CTR (decimal or percentage)
      if (!isNaN(numValue)) {
        // If it's in decimal format (0-1), convert to percentage
        if (numValue >= 0 && numValue < 1) {
          numValue = numValue * 100;
        }
        return `${numValue.toFixed(2)}%`;
      }
      return '0.00%'; // Return default if parsing fails
    }

    // Format numbers with 2 decimal places for averages
    if (metricId?.toLowerCase().includes("average")) {
      const formattedValue = Number(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return isMonetary ? `$${formattedValue}` : formattedValue;
    }

    // Format regular numbers
    const formattedValue = isMonetary
      ? Number(value).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });

    return isMonetary ? `$${formattedValue}` : formattedValue;
  };

  // We no longer need column statistics calculation as it's handled by SummarizeTab component
  
  // Get selection summary text - from SelectionSummary.tsx
  const getSelectionSummary = (selection: SelectedRange): string => {
    switch (selection.type) {
      case "cell": {
        const totalSelections = 1 + (typeof (selection as any).additionalSelections !== 'undefined' ? (selection as any).additionalSelections.length : 0);
        return `${totalSelections} cell${totalSelections > 1 ? "s" : ""} selected`;
      }
      case "row": {
        const rowCount = selection.adName.split(", ").length;
        return `${rowCount} row${rowCount > 1 ? "s" : ""} selected`;
      }
      case "column": {
        const columnCount = selection.metricName.split(", ").length;
        return `${columnCount} column${columnCount > 1 ? "s" : ""} selected`;
      }
      default:
        return "Selection";
    }
  };
  
  // Get column distribution from SummarizeTab.tsx
  const getColumnDistribution = (selection: any): string => {
    const values = selection.values
      .map((v: any) => Number(v.value))
      .filter((v: number) => !isNaN(v));
    if (!values.length) return "No numeric data available";

    const sum = values.reduce((a: number, b: number) => a + b, 0);
    const percentages = values.map(
      (v: number) => ((v / sum) * 100).toFixed(1) + "%"
    );
    return percentages.join(" / ");
  };

  // Render selection summary - based on SelectionSummary.tsx
  const renderSelectionSummary = () => {
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
          <button
            className="rounded-full w-8 h-8 flex items-center justify-center hover:bg-gray-100"
            onClick={() => setIsDetailsOpen(!isDetailsOpen)}
            aria-label={isDetailsOpen ? "Hide details" : "Show details"}
          >
            {isDetailsOpen ? icons.chevronUp : icons.chevronDown}
          </button>
        </div>
        {isDetailsOpen && (
          <div className="mt-2 text-sm text-gray-500">
            {selectedRange.type === "cell" && (
              <>
                <div>
                  <b>{(selectedRange as any).metricName}:</b> {formatValue((selectedRange as any).value, (selectedRange as any).metricId)}
                </div>
              </>
            )}
            {selectedRange.type === "row" && (
              <>
                <div><b>Row metrics:</b></div>
                <ul className="ml-4 list-disc">
                  {(selectedRange as any).values?.map((v: any, i: number) => (
                    <li key={i}>{v.metricName}: {formatValue(v.value, v.metricId)}</li>
                  ))}
                </ul>
              </>
            )}
            {selectedRange.type === "column" && (
              <>
                <div><b>Column metrics:</b></div>
                <ul className="ml-4 list-disc">
                  {(selectedRange as any).values?.slice(0, 5).map((v: any, i: number) => (
                    <li key={i}>{v.adName}: {formatValue(v.value, v.metricId)}</li>
                  ))}
                  {(selectedRange as any).values?.length > 5 && <li>... and {(selectedRange as any).values.length - 5} more</li>}
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
  };

  // We no longer need these components as they're now imported from the original files

  // We no longer need the column analysis rendering function as we're using SummarizeTab component directly
  
  // Render the chart tab
  const renderChartTab = () => {
    return (
      <div className="flex h-48 items-center justify-center text-gray-500">
        <div className="text-center">
          {icons.chart} <span className="block mt-2">Chart view coming soon</span>
        </div>
      </div>
    );
  };
  
  // We no longer need cell analysis rendering as it's handled by SummarizeTab component

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/30" 
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="relative w-full max-w-2xl h-screen bg-white shadow-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-primary">{icons.sparkles}</span>
            <span className="text-lg font-semibold">AI Analysis</span>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            {icons.close}
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-4">
            {renderSelectionSummary()}
          </div>
          
          <div className="border-b">
            <div className="mx-4 my-2 grid grid-cols-4 gap-1 bg-gray-100 p-1 rounded-md">
              <button 
                onClick={() => setActiveTab("summarize")} 
                className={`py-2 px-4 rounded-md text-sm font-medium flex items-center justify-center gap-1 ${activeTab === "summarize" ? "bg-white shadow-sm" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <span>{icons.sparkles}</span> Summarize
              </button>
              <button 
                onClick={() => setActiveTab("chart")} 
                className={`py-2 px-4 rounded-md text-sm font-medium flex items-center justify-center gap-1 ${activeTab === "chart" ? "bg-white shadow-sm" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <span>{icons.chart}</span> Chart
              </button>
              <button 
                onClick={() => setActiveTab("table")} 
                className={`py-2 px-4 rounded-md text-sm font-medium flex items-center justify-center gap-1 ${activeTab === "table" ? "bg-white shadow-sm" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <span>{icons.table}</span> Table
              </button>
              <button 
                onClick={() => setActiveTab("ask")} 
                className={`py-2 px-4 rounded-md text-sm font-medium flex items-center justify-center gap-1 ${activeTab === "ask" ? "bg-white shadow-sm" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <span>{icons.message}</span> Ask
              </button>
            </div>
          </div>
          
          <div className="p-6">
            {activeTab === "summarize" && (
              <MemoizedSummarizeTab 
                selectedRange={selectedRange} 
                adsData={adsData} 
              />
            )}
            
            {activeTab === "chart" && renderChartTab()}
            
            {activeTab === "table" && (
              <MemoizedTableTab 
                selectedRange={selectedRange} 
                adsData={adsData} 
              />
            )}
            
            {activeTab === "ask" && (
              <MemoizedAskTab 
                selectedRange={selectedRange} 
                adsData={adsData} 
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
