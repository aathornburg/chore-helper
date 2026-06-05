import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";

export type CalendarDateRange = {
  startOn: string;
  endOn: string;
};

export type CalendarDateRangePreset = "visible" | "this_week" | "next_2_weeks" | "this_month" | "custom";

export function createVisibleRange(startOn: string, endOn: string): CalendarDateRange {
  return { startOn, endOn };
}

export function createPresetRange(
  preset: CalendarDateRangePreset,
  visibleRange: CalendarDateRange,
  today = new Date()
): CalendarDateRange {
  if (preset === "visible" || preset === "custom") return visibleRange;
  if (preset === "this_week") {
    return {
      startOn: format(startOfWeek(today, { weekStartsOn: 0 }), "yyyy-MM-dd"),
      endOn: format(endOfWeek(today, { weekStartsOn: 0 }), "yyyy-MM-dd")
    };
  }
  if (preset === "next_2_weeks") {
    return {
      startOn: format(today, "yyyy-MM-dd"),
      endOn: format(addDays(today, 13), "yyyy-MM-dd")
    };
  }
  return {
    startOn: format(startOfMonth(today), "yyyy-MM-dd"),
    endOn: format(endOfMonth(today), "yyyy-MM-dd")
  };
}

export function dateFromInputValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isDateInRange(dateOn: string, range: CalendarDateRange) {
  return dateOn >= range.startOn && dateOn <= range.endOn;
}
