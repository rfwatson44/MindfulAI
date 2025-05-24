"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function DateRangePicker() {
  // Prevent excessive logging
  // console.log("[DateRangePicker] Render");

  // Use stable reference for the initial date value
  const initialDateRef = React.useRef<DateRange>({
    from: new Date(2024, 0, 20),
    to: new Date(),
  });

  const [date, setDate] = React.useState<DateRange | undefined>(
    initialDateRef.current
  );
  const [isOpen, setIsOpen] = React.useState(false);

  // Handle selecting a date range
  const handleSelect = React.useCallback(
    (range: DateRange | undefined) => {
      // Only update state if the range actually changes
      if (
        !date?.from !== !range?.from || // from exists in one but not the other
        !date?.to !== !range?.to || // to exists in one but not the other
        (date?.from &&
          range?.from &&
          date.from.getTime() !== range.from.getTime()) ||
        (date?.to && range?.to && date.to.getTime() !== range.to.getTime())
      ) {
        setDate(range);
      }
    },
    [date]
  );

  // Stabilize defaultMonth to prevent re-renders
  const defaultMonth = React.useMemo(() => date?.from || new Date(), []);

  return (
    <div className="grid gap-2">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal sm:w-[300px]"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={defaultMonth}
            selected={date}
            onSelect={handleSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
