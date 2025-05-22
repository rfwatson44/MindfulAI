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
<<<<<<< HEAD
=======
  console.log('[DateRangePicker] Render');
>>>>>>> main
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: new Date(2024, 0, 20),
    to: new Date(),
  });

<<<<<<< HEAD
=======
  React.useEffect(() => {
    console.log('[DateRangePicker] State changed:', date);
  }, [date]);

  // Memoize defaultMonth so it doesn't change every render
  const defaultMonth = React.useMemo(() => date?.from, [date?.from]);

  // Prevent setDate from causing unnecessary re-renders
  // Memoize handleSelect so it only changes when date.from or date.to change
  const handleSelect = React.useCallback(
    (range: DateRange | undefined) => {
      // Only update if the range actually changes
      if (
        (!date?.from && range?.from) ||
        (!date?.to && range?.to) ||
        (date?.from && range?.from && date.from.getTime() !== range.from.getTime()) ||
        (date?.to && range?.to && date.to.getTime() !== range.to.getTime())
      ) {
        console.log('[DateRangePicker] handleSelect: updating date', range);
        setDate(range);
      }
    },
    [date?.from, date?.to]
  );

>>>>>>> main
  return (
    <div className="grid gap-2">
      <Popover>
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
<<<<<<< HEAD
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={setDate}
            numberOfMonths={2}
          />
=======
          {/* <Calendar
            initialFocus
            mode="range"
            // defaultMonth={defaultMonth} // TEMP: Commented out to test infinite render loop
            selected={date}
            onSelect={handleSelect}
            numberOfMonths={2}
          /> */}
          <div>Calendar Placeholder</div>
>>>>>>> main
        </PopoverContent>
      </Popover>
    </div>
  );
}