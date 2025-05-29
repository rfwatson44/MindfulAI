"use client";

import React, { useState, memo } from "react";
import { X } from "lucide-react";
import { SelectedRange, Ad } from "@/lib/types";
import { Button } from "@/components/ui/button";

// Import AI panel components
import SummarizeTab from "./ai-panel/SummarizeTab";
import TableTab from "./ai-panel/TableTab";
import AskTab from "./ai-panel/AskTab";
import ChartTab from "./chart-tab";
import SelectionSummary from "./ai-panel/SelectionSummary";

// Memoize components to prevent unnecessary re-renders
const MemoizedSummarizeTab = memo(SummarizeTab);
const MemoizedTableTab = memo(TableTab);
const MemoizedAskTab = memo(AskTab);
const MemoizedChartTab = memo(ChartTab);
const MemoizedSelectionSummary = memo(SelectionSummary);

export interface BasicAIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRange: SelectedRange | null;
  adsData: Ad[];
}

// Basic AI Panel implementation with full functionality from all original components
export default function BasicAIPanel({
  isOpen,
  onClose,
  selectedRange,
  adsData,
}: BasicAIPanelProps) {
  const [activeTab, setActiveTab] = useState("summarize");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  if (!isOpen || !selectedRange) return null;

  // Format a value based on metric type
  const formatValue = (value: any, metricId: string | undefined): string => {
    if (value === undefined || value === null) return "--";

    // Check if the metric is related to spend or cost
    const isMonetary =
      metricId?.toLowerCase().includes("cost") ||
      metricId?.toLowerCase().includes("spend");

    // Format percentages (xx.xx%)
    if (metricId === "ctr" || metricId === "roas") {
      let numValue = parseFloat(String(value).replace('%', ''));
      if (!isNaN(numValue)) {
        if (numValue >= 0 && numValue < 1) {
          numValue = numValue * 100;
        }
        return `${numValue.toFixed(2)}%`;
      }
      return "0.00%";
    }

    // Format monetary values
    if (isMonetary) {
      const formattedValue = Number(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `$${formattedValue}`;
    }

    // Format regular numbers
    return Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
  };

  // Get selection summary text
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

  // No longer need a placeholder chart function as we're using the proper ChartTab component

  // Icons
  const icons = {
    sparkles: "✨",
    chart: "📊",
    table: "📋",
    message: "💬",
    close: "✕",
    chevronUp: "⌃",
    chevronDown: "⌄"
  };

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
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-4">
            {/* Use memoized SelectionSummary component to prevent unnecessary re-renders */}
            <MemoizedSelectionSummary
              selectedRange={selectedRange}
              isDetailsOpen={isDetailsOpen}
              onToggleDetails={() => setIsDetailsOpen(!isDetailsOpen)}
              onAnalyze={() => {}}
            />
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
            
            {activeTab === "chart" && (
              <MemoizedChartTab 
                selectedRange={selectedRange}
              />
            )}
            
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
