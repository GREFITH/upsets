import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import type { DateRange as DayPickerRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDateRangeContext } from "@/contexts/DateRangeContext";
import { useDateRange, useSyncHistory } from "@/hooks/usePageData";
import { cn } from "@/lib/utils";

export function DateRangePicker() {
  const { dateRange, setDateRange } = useDateRangeContext();
  const { data: available } = useDateRange();
  const { data: syncHistory = [] } = useSyncHistory();
  const lastSync = syncHistory.find((r) => r.status === "success");
  const [open, setOpen] = useState(false);

  const minDate = available?.minDate ? parseISO(available.minDate) : undefined;
  const maxDate = available?.maxDate ? parseISO(available.maxDate) : undefined;

  const selected: DayPickerRange | undefined =
    dateRange.fromDate || dateRange.toDate
      ? {
          from: dateRange.fromDate ? parseISO(dateRange.fromDate) : undefined,
          to: dateRange.toDate ? parseISO(dateRange.toDate) : undefined,
        }
      : undefined;

  function handleSelect(range: DayPickerRange | undefined) {
    setDateRange({
      fromDate: range?.from ? format(range.from, "yyyy-MM-dd") : null,
      toDate: range?.to ? format(range.to, "yyyy-MM-dd") : null,
    });
    if (range?.from && range?.to) setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    setDateRange({ fromDate: null, toDate: null });
  }

  const hasFilter = Boolean(dateRange.fromDate || dateRange.toDate);

  const label = (() => {
    if (dateRange.fromDate && dateRange.toDate)
      return `${format(parseISO(dateRange.fromDate), "MMM d, yyyy")} – ${format(parseISO(dateRange.toDate), "MMM d, yyyy")}`;
    if (dateRange.fromDate) return `From ${format(parseISO(dateRange.fromDate), "MMM d, yyyy")}`;
    if (dateRange.toDate) return `Up to ${format(parseISO(dateRange.toDate), "MMM d, yyyy")}`;
    return "Filter by date";
  })();

  const primaryMinDate = available?.primaryMinDate ?? null;
  const minDateIso = available?.minDate ?? null;
  const maxDateIso = available?.maxDate ?? null;
  const showSparseNote =
    Boolean(primaryMinDate && minDateIso && maxDateIso && primaryMinDate !== minDateIso);

  return (
    <div className="flex items-center gap-2">
      {lastSync?.fromDate && lastSync?.throughDate && (
        <span className="text-xs text-muted-foreground hidden sm:block">
          Data: {format(parseISO(lastSync.fromDate), "MMM d, yyyy")} – {format(parseISO(lastSync.throughDate), "MMM d, yyyy")}
        </span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={hasFilter ? "default" : "outline"}
            size="sm"
            className={cn("gap-1.5 text-xs h-8", hasFilter && "pr-1")}
          >
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span>{label}</span>
            {hasFilter && (
              <span
                role="button"
                onClick={handleClear}
                className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-sm hover:bg-primary-foreground/20 transition-colors"
                aria-label="Clear date filter"
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="px-3 pt-3 pb-1 max-w-[280px]">
            <p className="text-xs font-medium text-foreground">Select date range</p>
            {primaryMinDate && maxDateIso && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                <span className="font-medium text-foreground">Most data:</span>{" "}
                {format(parseISO(primaryMinDate), "MMM d, yyyy")} – {format(parseISO(maxDateIso), "MMM d, yyyy")}
              </p>
            )}
            {showSparseNote && minDateIso && (
              <p className="text-xs text-muted-foreground/85 mt-1 leading-relaxed">
                Older entries from {format(parseISO(minDateIso), "MMM d, yyyy")} (sparse).
              </p>
            )}
          </div>
          <Calendar
            mode="range"
            selected={selected}
            onSelect={handleSelect}
            numberOfMonths={2}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            defaultMonth={selected?.from ?? new Date()}
          />
          {hasFilter && (
            <div className="border-t px-3 py-2 flex justify-between items-center">
              <span className="text-xs text-muted-foreground">{label}</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDateRange({ fromDate: null, toDate: null }); setOpen(false); }}>
                Clear
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
