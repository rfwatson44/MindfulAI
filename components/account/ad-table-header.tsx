import React from "react";
import { TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Metric, Ad } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AdTableHeaderProps {
  activeMetrics: Metric[];
  filteredData: Ad[];
  data: Ad[];
  onHeaderClick: (colIndex: number, event: React.MouseEvent) => void;
}

export const AdTableHeader: React.FC<AdTableHeaderProps> = ({
  activeMetrics,
  filteredData,
  data,
  onHeaderClick,
}) => (
  <TableHeader>
    <TableRow className="border-b">
      <TableHead className="sticky top-0 z-20 bg-muted w-12 p-0">
        <div className="flex h-full w-full items-center justify-center border-r border-border">#</div>
      </TableHead>
      <TableHead className="sticky top-0 z-20 bg-muted p-3 w-[200px] max-w-[200px] min-w-[200px]"></TableHead>
      {activeMetrics.map((metric, index) => (
        <TableHead
          key={metric.id || index}
          className={cn(
            "sticky top-0 z-20 bg-muted cursor-pointer whitespace-nowrap p-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted text-center"
          )}
          style={{ width: "150px" }}
          onClick={(e) => onHeaderClick(index, e)}
        >
          <span>
            {metric.id === "conversions" && (data[0]?.accountId === "Zleaguegg" || filteredData[0]?.accountId === "Zleaguegg")
              ? "App Installs"
              : metric.name}
          </span>
        </TableHead>
      ))}

    </TableRow>
  </TableHeader>
);
