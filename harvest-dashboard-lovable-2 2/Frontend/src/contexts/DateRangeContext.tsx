import { createContext, useContext, useState, type ReactNode } from "react";

export type DateRange = {
  fromDate: string | null;
  toDate: string | null;
};

type DateRangeContextValue = {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
};

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRange] = useState<DateRange>({ fromDate: null, toDate: null });
  return (
    <DateRangeContext.Provider value={{ dateRange, setDateRange }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRangeContext() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRangeContext must be used within DateRangeProvider");
  return ctx;
}
