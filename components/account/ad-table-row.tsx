import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { AdTableDebugCell } from "./ad-table-debug";
import AdImageCell from "./ad-image-cell";
import AdInfo from "./ad-info"; // New popup for ad preview/info
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Metric, Ad } from "@/lib/types";

interface AdTableRowProps {
  ad: Ad;
  rowIndex: number;
  activeMetrics: Metric[];
  isCellSelected: (rowIndex: number, colIndex: number) => boolean;
  handleRowHeaderClick: (rowIndex: number, e: React.MouseEvent) => void;
  handleCellClick: (rowIndex: number, colIndex: number, e: React.MouseEvent) => void;
  formatValue: (value: any, metricId: string) => string;
}

const AdTableRow: React.FC<AdTableRowProps> = ({
  ad,
  rowIndex,
  activeMetrics,
  isCellSelected,
  handleRowHeaderClick,
  handleCellClick,
  formatValue,
}) => {
  const [showAdInfo, setShowAdInfo] = useState(false);
  // Extract conversions value once for this row (mobile_app_install preferred)
  let conversionsDisplayValue: number | string = '--';
  if (ad.conversions && typeof ad.conversions === 'object' && 'mobile_app_install' in ad.conversions) {
    const raw = ad.conversions.mobile_app_install;
    if (typeof raw === 'string' && raw.trim() !== '') {
      conversionsDisplayValue = parseFloat(raw);
    } else if (typeof raw === 'number') {
      conversionsDisplayValue = raw;
    }
  } else if (typeof ad.conversions === 'number') {
    conversionsDisplayValue = ad.conversions;
  } else if (typeof ad.conversions === 'string' && (ad.conversions as string).trim() !== '') {
    conversionsDisplayValue = Number(ad.conversions);
  }
  // Defensive: If still an object (should never happen), fallback to '--'
  if (typeof conversionsDisplayValue === 'object') {
    conversionsDisplayValue = '--';
  }

  return (
    <TableRow key={ad.id || rowIndex} className="group hover:bg-muted/50">
      <TableCell
        className="sticky left-0 z-10 cursor-pointer bg-muted/50 p-0 text-center font-medium text-muted-foreground group-hover:bg-muted/50 w-12 min-w-[48px] max-w-[48px]"
        onClick={(e) => handleRowHeaderClick(rowIndex, e)}
      >
        <div className="flex h-full w-full items-center justify-center border-r border-border">
          {rowIndex + 1}
        </div>
      </TableCell>
      <TableCell className={cn("z-10 h-16 bg-background p-2 group-hover:bg-muted/50 flex items-center w-[200px] max-w-[200px] min-w-[200px]")}> 
        {/* Ad Preview Button */}
        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded border border-border bg-muted flex items-center justify-center mr-1">
          <button
            className="h-full w-full flex items-center justify-center focus:outline-none"
            onClick={() => setShowAdInfo(true)}
            aria-label={`View ad info for ${ad.name}`}
            type="button"
            tabIndex={0}
            style={{ background: 'none', border: 'none', padding: 0 }}
          >
            <AdImageCell thumbnailUrl={ad.thumbnail_url} alt={ad.name} />
          </button>
        </div>
        <span className="font-medium text-sm max-w-[152px] whitespace-nowrap overflow-hidden" title={ad.name}>
          {ad.name.length > 30 ? ad.name.slice(0, 30) + '…' : ad.name}
        </span>
        {/* Ad Info Popup */}
        {typeof window !== 'undefined' && showAdInfo && (
          <AdInfo ad={ad} onClose={() => setShowAdInfo(false)} />
        )}
      
</TableCell>
      {activeMetrics.map((metric, colIndex) => {
        let value;
        switch (metric.id) {
          case "spend":
          case "amount_spent":
            value = typeof ad.spend === 'number' ? formatValue(ad.spend, "amount_spent") : '--';
            break;
          case "impressions":
            value = typeof ad.impressions === 'number' ? formatValue(ad.impressions, "impressions") : '--';
            break;
          case "clicks":
            value = typeof ad.clicks === 'number' ? formatValue(ad.clicks, "clicks") : '--';
            break;
          case "ctr":
            value = ad.impressions && ad.impressions !== 0
              ? `${((ad.clicks / ad.impressions) * 100).toFixed(2)}%`
              : "--";
            break;
          case "conversions":
            value = (typeof conversionsDisplayValue === 'number' && !isNaN(conversionsDisplayValue) && conversionsDisplayValue !== 0)
              ? conversionsDisplayValue
              : '--';
            break;
          case "cost_per_conversion": {
            const amountSpent = typeof ad.spend === 'number' ? ad.spend : Number(ad.spend);
            if (
              conversionsDisplayValue === '--' ||
              typeof conversionsDisplayValue !== 'number' || isNaN(conversionsDisplayValue) || conversionsDisplayValue === 0 ||
              typeof amountSpent !== 'number' || isNaN(amountSpent) || amountSpent === 0
            ) {
              value = '--';
            } else {
              const rawCPC = amountSpent / conversionsDisplayValue;
              value = rawCPC.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            break;
          }
          default:
            const rawMetricValue = ad[metric.id as keyof Ad];
            value = (rawMetricValue === undefined || rawMetricValue === null)
              ? '--'
              : formatValue(rawMetricValue, metric.id);
            break;
        }
        return (
          <TableCell
            key={metric.id}
            className={cn('text-center', isCellSelected(rowIndex, colIndex) && 'bg-accent')}
            onClick={(e) => handleCellClick(rowIndex, colIndex, e)}
          >
            {value}
          </TableCell>
        );
      })}
    </TableRow>
  );
};

export default AdTableRow;
