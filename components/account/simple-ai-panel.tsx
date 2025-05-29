"use client";

import React, { memo } from "react";
import {
  Sparkles,
  BarChart2,
  Table as TableIcon,
  MessageSquare,
  X,
} from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ad, SelectedRange } from "@/lib/types";
import { Button } from "@/components/ui/button";

// Import components directly
import ChartTab from "./chart-tab";
import SelectionSummary from "./ai-panel/SelectionSummary";
import SummarizeTab from "./ai-panel/SummarizeTab";

interface SimpleAIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRange: SelectedRange | null;
  adsData: Ad[];
}

// Wrap SummarizeTab in memo to prevent unnecessary re-renders
const MemoizedSummarizeTab = memo(SummarizeTab);
const MemoizedChartTab = memo(ChartTab);

// Simple AI Panel component that doesn't use Radix UI Sheet
const SimpleAIPanel = ({
  isOpen,
  onClose,
  selectedRange,
  adsData,
}: SimpleAIPanelProps) => {
  const [activeAction, setActiveAction] = React.useState("summarize");
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);

  // If not open or no selection, don't render anything
  if (!isOpen || !selectedRange) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose}>
      <div 
        className="fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-lg overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
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

        <div className="p-4">
          <SelectionSummary
            selectedRange={selectedRange}
            isDetailsOpen={isDetailsOpen}
            onToggleDetails={() => setIsDetailsOpen(!isDetailsOpen)}
            onAnalyze={() => {/* No-op */}}
          />
        </div>

        <Separator />

        <Tabs
          defaultValue={activeAction}
          className="flex-1"
          onValueChange={setActiveAction}
        >
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

          <div className="flex-1 overflow-y-auto p-4">
            <TabsContent value="summarize" className="mt-0">
              <MemoizedSummarizeTab
                selectedRange={selectedRange}
                adsData={adsData}
              />
            </TabsContent>

            <TabsContent value="chart" className="mt-0">
              <MemoizedChartTab selectedRange={selectedRange} />
            </TabsContent>

            <TabsContent value="table" className="mt-0">
              <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                <TableIcon className="mb-2 h-8 w-8 text-muted-foreground/70" />
                <p>Table view coming soon</p>
              </div>
            </TabsContent>
            <TabsContent value="ask" className="mt-0">
              <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground/70" />
                <p>AI chat coming soon</p>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default SimpleAIPanel;
