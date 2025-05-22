import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
<<<<<<< HEAD
=======

/**
 * Safely parses conversion data from ads, handling both object and JSON string input.
 * Returns a Record<string, unknown> or null if parsing fails.
 */
export function parseConversions(input: unknown): Record<string, unknown> | null {
  if (!input) return null;
  if (typeof input === 'object' && input !== null) return input as Record<string, unknown>;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Formats values based on the metric type, handling monetary values, percentages, and regular numbers.
 * Ensures proper display in the UI.
 */
export function formatValue(value: any, metricId: string | undefined): string {
  if (value === undefined || value === null) return "--";

  // Check if the metric is related to spend or cost
  const isMonetary = (metricId?.toLowerCase().includes("spent") || metricId?.toLowerCase().includes("cost"));

  // Format percentages (xx.xx%)
  if (metricId === "ctr" || metricId === "roas") {
    return `${Number(value).toFixed(2)}%`;
  }

  // Format numbers with 2 decimal places for averages
  if (metricId?.toLowerCase().includes("average")) {
    const formattedValue = Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return isMonetary ? `$${formattedValue}` : formattedValue;
  }

  // Format regular numbers
  const formattedValue = isMonetary 
    ? Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });

  return isMonetary ? `$${formattedValue}` : formattedValue;
}
>>>>>>> main
