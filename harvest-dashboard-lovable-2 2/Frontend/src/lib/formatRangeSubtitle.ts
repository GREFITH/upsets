import { format, parseISO } from "date-fns";

import type { DateRange } from "@/contexts/DateRangeContext";

/** Last successful sync's date window — used as the default subtitle when no user filter is active. */
export type SyncDateRange = {
  fromDate: string | null;
  throughDate: string | null;
};

/**
 * Human-readable analytics window for dashboard subtitles and headers.
 * Explicit user filter wins; otherwise shows the last successful sync's date range.
 */
export function formatRangeSubtitle(
  filter: DateRange,
  syncRange: SyncDateRange | undefined,
): string {
  const fmt = (iso: string) => format(parseISO(iso), "MMM d, yyyy");
  if (filter.fromDate && filter.toDate) return `${fmt(filter.fromDate)} – ${fmt(filter.toDate)}`;
  if (filter.fromDate) return `From ${fmt(filter.fromDate)}`;
  if (filter.toDate) return `Up to ${fmt(filter.toDate)}`;
  if (syncRange?.fromDate && syncRange?.throughDate) {
    return `${fmt(syncRange.fromDate)} – ${fmt(syncRange.throughDate)}`;
  }
  return "—";
}
