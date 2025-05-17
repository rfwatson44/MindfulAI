"use client";

import { useState } from "react";
import { X, Sparkles, BarChart2, Table as TableIcon, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ad, SelectedRange } from "@/lib/types";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface AIPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  selectedRange: SelectedRange | null;
  adsData: Ad[];
}

export function AIPanel({ 
  isOpen, 
  onToggle, 
  selectedRange,
  adsData 
}: AIPanelProps) {
  const [activeAction, setActiveAction] = useState("summarize");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  return (
    <Sheet open={isOpen} onOpenChange={onToggle}>
      <SheetContent 
        className="fixed top-0 right-0 h-screen max-h-screen w-full max-w-2xl border-l p-0 sm:max-w-4xl bg-background z-50"
        side="right"
      >
        <div className="overflow-y-auto h-full w-full bg-white border-4 border-blue-400">
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">AI Analysis</h3>
            </div>
          </div>
          
          <div className="p-4">
            <SelectionSummary 
              selectedRange={selectedRange} 
              isDetailsOpen={isDetailsOpen}
              onToggleDetails={() => setIsDetailsOpen(!isDetailsOpen)}
            />
          </div>
          
          <Separator />
          
          <Tabs defaultValue={activeAction} className="flex-1" onValueChange={setActiveAction}>
            <div className="border-b">
              <TabsList className="mx-4 my-2 grid w-auto grid-cols-4">
                <TabsTrigger value="summarize">
                  <Sparkles className="mr-2 h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">Summarize</span>
                </TabsTrigger>
                <TabsTrigger value="chart">
                  <BarChart2 className="mr-2 h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">Chart</span>
                </TabsTrigger>
                <TabsTrigger value="table">
                  <TableIcon className="mr-2 h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">Table</span>
                </TabsTrigger>
                <TabsTrigger value="ask">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">Ask</span>
                </TabsTrigger>
              </TabsList>
            </div>
            
            <div className="flex-1 overflow-y-auto max-h-[calc(100vh-64px)]">
              <div className="p-4">
                <TabsContent value="summarize" className="mt-0">
                  <SummarizeTab selectedRange={selectedRange} adsData={adsData} />
                </TabsContent>
                
                <TabsContent value="chart" className="mt-0">
                  <ChartTab key={JSON.stringify(selectedRange)} selectedRange={selectedRange} />
                </TabsContent>
                
                <TabsContent value="table" className="mt-0">
                  <TableTab selectedRange={selectedRange} />
                </TabsContent>
                
                <TabsContent value="ask" className="mt-0">
                  <AskTab />
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

import ChartTab from "./chart-tab";
import SummarizeTab from "./ai-panel/SummarizeTab";
import TableTab from "./ai-panel/TableTab";
import AskTab from "./ai-panel/AskTab";
import SelectionSummary from "./ai-panel/SelectionSummary";

// Helper functions
function formatValue(value: any, metricId: string | undefined): string {
  if (value === undefined || value === null) return "--";
  
  if (metricId === "spend" || metricId === "cpa" || metricId === "costPerResult") {
    return `$${Number(value).toFixed(2)}`;
  } else if (metricId === "ctr" || metricId === "roas") {
    return `${Number(value).toFixed(2)}%`;
  } else {
    return String(value).includes(".") ? Number(value).toFixed(2) : Number(value).toLocaleString();
  }
}

function getPerformanceText(selection: SelectedRange, adsData: Ad[]): string {
  if (selection.type !== "cell" || !adsData.length) return "comparable";
  
  try {
    const metricId = selection.metricId;
    const value = Number(selection.value);
    
    if (isNaN(value)) return "not directly comparable";
    
    // Get values for this metric from all ads
    const allValues = adsData
      .map(ad => Number(ad[metricId as keyof Ad]))
      .filter(v => !isNaN(v));
    
    if (!allValues.length) return "the only available data point";
    
    // Find where this value ranks
    const sorted = [...allValues].sort((a, b) => b - a);
    const rank = sorted.indexOf(value) + 1;
    const percentile = Math.round((rank / allValues.length) * 100);
    
    // Metrics where higher is better
    const higherIsBetter = !["cpa", "costPerResult"].includes(metricId);
    
    if (percentile <= 25) {
      return higherIsBetter ? 
        "in the top 25% (performing very well)" : 
        "in the bottom 25% (performing very well)";
    } else if (percentile <= 50) {
      return higherIsBetter ? 
        "above average" : 
        "below average (which is good)";
    } else if (percentile <= 75) {
      return higherIsBetter ? 
        "below average" : 
        "above average (which is not ideal)";
    } else {
      return higherIsBetter ? 
        "in the bottom 25% (underperforming)" : 
        "in the top 25% (underperforming)";
    }
  } catch (error) {
    return "difficult to compare";
  }
}

function getRowRecommendation(selection: SelectedRange): string {
  if (selection.type !== "row") return "analyzing more data";
  
  const ctr = selection.values.find(v => v.metricId === "ctr")?.value;
  const conversions = selection.values.find(v => v.metricId === "conversions")?.value;
  const spend = selection.values.find(v => v.metricId === "spend")?.value;
  
  if (!ctr || !conversions || !spend) return "collecting more data for a complete analysis";
  
  const numCTR = Number(ctr);
  const numConversions = Number(conversions);
  const numSpend = Number(spend);
  
  if (numCTR < 1.5) {
    return "improving the creative or targeting to increase click-through rate";
  } else if (numConversions < 5 && numSpend > 100) {
    return "reviewing the landing page experience to improve conversion rate";
  } else if (numCTR > 2.5 && numConversions > 10) {
    return "increasing budget to scale this successful ad";
  } else {
    return "maintaining the current strategy while testing new variations";
  }
}

function getColumnDistribution(selection: SelectedRange): string {
  if (selection.type !== "column") return "Select a column to see distribution.";
  
  const values = selection.values
    .map(v => Number(v.value) || 0)
    .filter(v => !isNaN(v));
  
  if (!values.length) return "No valid numeric data available.";
  
  const total = values.reduce((a, b) => a + b, 0);
  const avg = total / values.length;
  const metricName = selection.metricName.toLowerCase();
  
  // Count values in different ranges
  const belowAvg = values.filter(v => v < avg * 0.75).length;
  const nearAvg = values.filter(v => v >= avg * 0.75 && v <= avg * 1.25).length;
  const aboveAvg = values.filter(v => v > avg * 1.25).length;
  
  const belowPct = Math.round((belowAvg / values.length) * 100);
  const nearPct = Math.round((nearAvg / values.length) * 100);
  const abovePct = Math.round((aboveAvg / values.length) * 100);
  
  return `${abovePct}% of ads have above-average ${metricName}, ${nearPct}% are near average, and ${belowPct}% are below average.`;
}