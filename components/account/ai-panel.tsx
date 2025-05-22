"use client";

import { useState } from "react";
import {
  X,
  Sparkles,
  BarChart2,
  Table as TableIcon,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
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

// Import components directly
import ChartTab from "./chart-tab";
import SelectionSummary from "./ai-panel/SelectionSummary";
import SummarizeTab from "./ai-panel/SummarizeTab";

interface AIPanelProps {
  isOpen: boolean;
  selectedRange: SelectedRange | null;
  adsData: Ad[];
}

import { SheetTitle } from "@/components/ui/sheet";

export function AIPanel({
  isOpen,
  onOpenChange,
  selectedRange,
  adsData,
}: AIPanelProps & { onOpenChange: (open: boolean) => void }) {
  const [activeAction, setActiveAction] = useState("summarize");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="fixed top-0 right-0 h-screen max-h-screen w-full max-w-2xl border-l p-0 sm:max-w-4xl bg-background z-50"
        side="right"

      >
        {/* <SheetTitle>AI Analysis</SheetTitle> */}
        <div className="overflow-y-auto h-full w-full bg-white">
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-lg font-semibold">AI Analysis</span>
            </div>
          </div>

          <div className="p-4">
            <SelectionSummary
              selectedRange={selectedRange}
              isDetailsOpen={isDetailsOpen}
              onToggleDetails={() => setIsDetailsOpen(!isDetailsOpen)}
              onAnalyze={() => {
                if (selectedRange) {
                  // Replace this with actual analysis logic as needed
                  // console.log('Analyze Selected clicked:', selectedRange);
                }
              }}
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

            <div className="flex-1 overflow-y-auto max-h-[calc(100vh-64px)]">
              <div className="p-4">
                <TabsContent value="summarize" className="mt-0">
                  <SummarizeTab
                    selectedRange={selectedRange}
                    adsData={adsData}
                  />
                </TabsContent>

                <TabsContent value="chart" className="mt-0">
                  <ChartTab selectedRange={selectedRange} />
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
            </div>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
