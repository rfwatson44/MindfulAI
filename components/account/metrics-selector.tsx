import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Metric } from "@/lib/types";

interface MetricsSelectorProps {
  activeMetrics: Metric[];
  availableMetrics: Metric[];
  onToggle: (metric: Metric) => void;
}

export function MetricsSelector({
  activeMetrics,
  availableMetrics,
  onToggle,
}: MetricsSelectorProps) {
  const availableToAdd = availableMetrics.filter(
    (metric) => !activeMetrics.some((m) => m.id === metric.id)
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {activeMetrics.map((metric) => (
          <Badge
            key={metric.id}
            variant="secondary"
            className="flex items-center gap-1 px-2 py-1"
          >
            {metric.name}
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0 hover:bg-transparent hover:text-destructive"
              onClick={() => onToggle(metric)}
            >
              <X className="h-3 w-3" />
              <span className="sr-only">Remove {metric.name}</span>
            </Button>
          </Badge>
        ))}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1">
              <Plus className="h-4 w-4" />
              <span>Add Metric</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Add metric column</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableToAdd.length > 0 ? (
              availableToAdd.map((metric) => (
                <DropdownMenuItem
                  key={metric.id}
                  onClick={() => onToggle(metric)}
                >
                  {metric.name}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled>All metrics added</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}