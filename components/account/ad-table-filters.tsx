import React from "react";
import { TableFilters } from "@/components/account/table-filters";
import { MetricsSelector } from "@/components/account/metrics-selector";
import { Metric, Ad } from "@/lib/types";
import { OPTIONAL_METRICS } from "@/lib/mock-data";

interface AdTableFiltersProps {
  data: Ad[];
  activeMetrics: Metric[];
  onFiltersChange: (filtered: Ad[]) => void;
  onMetricToggle: (metric: Metric) => void;
}

export const AdTableFilters: React.FC<AdTableFiltersProps> = ({
  data,
  activeMetrics,
  onFiltersChange,
  onMetricToggle,
}) => (
  <div className="flex items-center gap-2">
    <TableFilters data={data} onFiltersChange={onFiltersChange} />
    <MetricsSelector
      activeMetrics={activeMetrics}
      availableMetrics={OPTIONAL_METRICS}
      onToggle={onMetricToggle}
    />
  </div>
);
