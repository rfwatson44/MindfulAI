"use client";

import { useState } from "react";
import { X, Sparkles, BarChart2, Table as TableIcon, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
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

// Component to show selection summary
function SelectionSummary({ 
  selectedRange,
  isDetailsOpen,
  onToggleDetails
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

  const getSelectionSummary = () => {
    switch (selectedRange.type) {
      case "cell":
        const totalSelections = 1 + (selectedRange.additionalSelections?.length || 0);
        return `${totalSelections} cell${totalSelections > 1 ? 's' : ''} selected`;
      case "row":
        const rowCount = selectedRange.values.length / (selectedRange.values[0]?.metricId === "name" ? selectedRange.values.length : 1);
        return `${rowCount} row${rowCount > 1 ? 's' : ''} selected`;
      case "column":
        const columnCount = selectedRange.values.length / (selectedRange.values[0]?.adId ? selectedRange.values.length : 1);
        return `${columnCount} column${columnCount > 1 ? 's' : ''} selected`;
      default:
        return "Selection";
    }
  };

  return (
    <Collapsible open={isDetailsOpen} onOpenChange={onToggleDetails}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-muted-foreground">
            {getSelectionSummary()}
          </h4>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              {isDetailsOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="space-y-2">
          {selectedRange.type === "cell" && (
            <div className="space-y-2">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm">
                  <span className="font-medium">Ad:</span> {selectedRange.adName}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Metric:</span> {selectedRange.metricName}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Value:</span>{" "}
                  {formatValue(selectedRange.value, selectedRange.metricId)}
                </p>
              </div>
              
              {selectedRange.additionalSelections?.map((selection, index) => (
                <div key={index} className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-sm">
                    <span className="font-medium">Ad:</span> {selection.adName}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Metric:</span> {selection.metricName}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Value:</span>{" "}
                    {formatValue(selection.value, selection.metricId)}
                  </p>
                </div>
              ))}
            </div>
          )}
          
          {selectedRange.type === "row" && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 text-sm font-medium">{selectedRange.adName}</p>
              <div className="grid gap-2">
                {selectedRange.values.map((value, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{value.metricName}:</span>
                    <span>{formatValue(value.value, value.metricId)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {selectedRange.type === "column" && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 text-sm font-medium">{selectedRange.metricName}</p>
              <div className="grid gap-2">
                {selectedRange.values.map((value, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{value.adName}:</span>
                    <span>{formatValue(value.value, value.metricId)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// Tabs content
function SummarizeTab({ 
  selectedRange, 
  adsData 
}: { 
  selectedRange: SelectedRange | null;
  adsData: Ad[];
}) {
  if (!selectedRange) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
        <Sparkles className="mb-2 h-8 w-8 text-muted-foreground/70" />
        <p>Select data to generate a summary</p>
      </div>
    );
  }

  // Generate summary based on selection type
  let summaryContent;
  
  switch (selectedRange.type) {
    case "cell":
      const totalSelections = 1 + (selectedRange.additionalSelections?.length || 0);
      summaryContent = (
        <div className="space-y-4">
          <p>
            {totalSelections === 1 ? (
              `The ${selectedRange.metricName.toLowerCase()} for "${selectedRange.adName}" is ${formatValue(selectedRange.value, selectedRange.metricId)}.`
            ) : (
              `${totalSelections} cells selected across different ads and metrics.`
            )}
          </p>
          
          <div className="rounded-md bg-muted p-4">
            <h4 className="mb-2 font-medium">Insights</h4>
            <p className="text-sm">
              {totalSelections === 1 ? (
                `This ${selectedRange.metricId === "spend" ? "spend amount" : selectedRange.metricName.toLowerCase()} is ${getPerformanceText(selectedRange, adsData)} compared to other ads in this account.`
              ) : (
                "Multiple cells selected. Use the Table view to see detailed comparisons."
              )}
            </p>
          </div>
        </div>
      );
      break;
    
    case "row":
      // Find key metrics for the ad
      const adCTR = selectedRange.values.find(v => v.metricId === "ctr")?.value;
      const adSpend = selectedRange.values.find(v => v.metricId === "spend")?.value;
      const adConversions = selectedRange.values.find(v => v.metricId === "conversions")?.value;
      
      summaryContent = (
        <div className="space-y-4">
          <p>
            Ad "{selectedRange.adName}" performance summary:
          </p>
          
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md bg-muted p-3">
              <div className="text-xs text-muted-foreground">Spend</div>
              <div className="text-xl font-semibold">{formatValue(adSpend, "spend")}</div>
            </div>
            <div className="rounded-md bg-muted p-3">
              <div className="text-xs text-muted-foreground">CTR</div>
              <div className="text-xl font-semibold">{formatValue(adCTR, "ctr")}</div>
            </div>
            <div className="rounded-md bg-muted p-3">
              <div className="text-xs text-muted-foreground">Conversions</div>
              <div className="text-xl font-semibold">{formatValue(adConversions, "conversions")}</div>
            </div>
            <div className="rounded-md bg-muted p-3">
              <div className="text-xs text-muted-foreground">CPA</div>
              <div className="text-xl font-semibold">{formatValue(adSpend && adConversions ? Number(adSpend) / Number(adConversions) : null, "cpa")}</div>
            </div>
          </div>
          
          <div className="rounded-md bg-primary/10 p-4">
            <h4 className="mb-2 font-medium">AI Recommendation</h4>
            <p className="text-sm">
              Based on the ad performance, consider {getRowRecommendation(selectedRange)}.
            </p>
          </div>
        </div>
      );
      break;
    
    case "column":
      const values = selectedRange.values.map(v => Number(v.value) || 0).filter(v => !isNaN(v));
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const max = values.length ? Math.max(...values) : 0;
      const min = values.length ? Math.min(...values) : 0;
      
      summaryContent = (
        <div className="space-y-4">
          <p>
            Summary for {selectedRange.metricName}:
          </p>
          
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md bg-muted p-3">
              <div className="text-xs text-muted-foreground">Average</div>
              <div className="text-xl font-semibold">{formatValue(avg, selectedRange.metricId)}</div>
            </div>
            <div className="rounded-md bg-muted p-3">
              <div className="text-xs text-muted-foreground">Highest</div>
              <div className="text-xl font-semibold">{formatValue(max, selectedRange.metricId)}</div>
            </div>
            <div className="rounded-md bg-muted p-3">
              <div className="text-xs text-muted-foreground">Lowest</div>
              <div className="text-xl font-semibold">{formatValue(min, selectedRange.metricId)}</div>
            </div>
          </div>
          
          <div className="rounded-md bg-primary/10 p-4">
            <h4 className="mb-2 font-medium">Distribution</h4>
            <p className="text-sm">
              {getColumnDistribution(selectedRange)}
            </p>
          </div>
        </div>
      );
      break;
    
    default:
      summaryContent = <p>Select cells, rows, or columns to see insights.</p>;
  }

  return <div className="space-y-4">{summaryContent}</div>;
}

import ChartTab from "./chart-tab";

function TableTab({ selectedRange }: { selectedRange: SelectedRange | null }) {
  if (!selectedRange) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
        <TableIcon className="mb-2 h-8 w-8 text-muted-foreground/70" />
        <p>Select data to generate a table</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">
        {selectedRange.type === "column" ? 
          `Table for ${selectedRange.metricName} values across all ads` : 
          selectedRange.type === "row" ? 
          `Table for "${selectedRange.adName}" with all metrics` :
          "Detailed information about selected cells"}
      </p>
      
      <div className="overflow-hidden rounded-lg border">
        <div className="bg-muted/50 p-2 text-sm font-medium">
          {selectedRange.type === "column" ? selectedRange.metricName : 
           selectedRange.type === "row" ? selectedRange.adName : 
           "Selected Cells"}
        </div>
        <div className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b text-sm">
                <th className="p-2 text-left font-medium">
                  {selectedRange.type === "column" ? "Ad" : 
                   selectedRange.type === "row" ? "Metric" : 
                   "Ad / Metric"}
                </th>
                <th className="p-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {selectedRange.type === "cell" ? (
                <>
                  <tr>
                    <td className="border-t p-2 text-sm">
                      {selectedRange.adName} / {selectedRange.metricName}
                    </td>
                    <td className="border-t p-2 text-right text-sm">
                      {formatValue(selectedRange.value, selectedRange.metricId)}
                    </td>
                  </tr>
                  {selectedRange.additionalSelections?.map((selection, index) => (
                    <tr key={index}>
                      <td className="border-t p-2 text-sm">
                        {selection.adName} / {selection.metricName}
                      </td>
                      <td className="border-t p-2 text-right text-sm">
                        {formatValue(selection.value, selection.metricId)}
                      </td>
                    </tr>
                  ))}
                </>
              ) : (
                selectedRange.values.map((item, i) => (
                  <tr key={i}>
                    <td className="border-t p-2 text-sm">
                      {selectedRange.type === "column" ? item.adName : item.metricName}
                    </td>
                    <td className="border-t p-2 text-right text-sm">
                      {formatValue(item.value, item.metricId)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <Button className="w-full">
        <TableIcon className="mr-2 h-4 w-4" />
        Export Table
      </Button>
    </div>
  );
}

function AskTab() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto rounded-lg border bg-muted/30 p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-sm">
              Hello! I can help analyze your selected ad data. Ask me anything about your Facebook ads.
            </p>
          </div>
        </div>
        
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8 text-muted-foreground/70" />
          <p>Ask questions about your selected data</p>
          <div className="mt-4 grid w-full gap-2">
            <Button variant="outline" size="sm" className="text-xs">
              What's the best performing ad?
            </Button>
            <Button variant="outline" size="sm" className="text-xs">
              How can I improve my conversion rate?
            </Button>
            <Button variant="outline" size="sm" className="text-xs">
              Compare performance by campaign
            </Button>
          </div>
        </div>
      </div>
      
      <div className="mt-4 flex items-center gap-2">
        <Input placeholder="Ask about your ad data..." />
        <Button size="icon">
          <Sparkles className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

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