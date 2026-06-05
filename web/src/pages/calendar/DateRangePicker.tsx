import { useEffect, useRef, useState } from "react";
import { DayPicker } from "@daypicker/react";
import type { DateRange } from "@daypicker/react";
import "@daypicker/react/style.css";
import { format } from "date-fns";
import type { CalendarDateRange, CalendarDateRangePreset } from "./dateRange";
import { createPresetRange, dateFromInputValue } from "./dateRange";

type DateRangePickerProps = {
  idPrefix: string;
  label: string;
  preset: CalendarDateRangePreset;
  range: CalendarDateRange;
  visibleRange: CalendarDateRange;
  onPresetChange: (preset: CalendarDateRangePreset, range: CalendarDateRange) => void;
  onRangeChange: (range: CalendarDateRange) => void;
};

const presets: Array<{ value: CalendarDateRangePreset; label: string }> = [
  { value: "visible", label: "Visible range" },
  { value: "this_week", label: "This week" },
  { value: "next_2_weeks", label: "Next 2 weeks" },
  { value: "this_month", label: "This month" },
  { value: "custom", label: "Custom" }
];

export function DateRangePicker({
  idPrefix,
  label,
  preset,
  range,
  visibleRange,
  onPresetChange,
  onRangeChange
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const selectedRange: DateRange = {
    from: dateFromInputValue(range.startOn),
    to: dateFromInputValue(range.endOn)
  };

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setIsOpen(false);
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [isOpen]);

  function closePopover() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function choosePreset(nextPreset: CalendarDateRangePreset) {
    if (nextPreset === "custom") {
      onPresetChange(nextPreset, range);
      setIsOpen(true);
      return;
    }
    onPresetChange(nextPreset, createPresetRange(nextPreset, visibleRange));
  }

  function handleRangeSelect(nextRange: DateRange | undefined) {
    if (!nextRange?.from) return;
    onRangeChange({
      startOn: format(nextRange.from, "yyyy-MM-dd"),
      endOn: format(nextRange.to ?? nextRange.from, "yyyy-MM-dd")
    });
    if (nextRange.to) closePopover();
  }

  return (
    <section className="date-range-picker" aria-labelledby={`${idPrefix}-heading`}>
      <div className="date-range-picker-heading">
        <h4 id={`${idPrefix}-heading`}>{label}</h4>
        <span>{range.startOn} to {range.endOn}</span>
      </div>
      <button
        aria-controls={`${idPrefix}-popover`}
        aria-expanded={isOpen}
        className="date-range-trigger"
        onClick={() => setIsOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        {range.startOn} to {range.endOn}
      </button>
      <div className="date-range-presets" role="group" aria-label={`${label} presets`}>
        {presets.map((item) => (
          <button aria-pressed={preset === item.value} key={item.value} onClick={() => choosePreset(item.value)} type="button">
            {item.label}
          </button>
        ))}
      </div>
      {isOpen ? (
        <div
          aria-label={`${label} calendar`}
          className="date-range-popover"
          id={`${idPrefix}-popover`}
          onKeyDown={(event) => {
            if (event.key === "Escape") closePopover();
          }}
          ref={popoverRef}
          role="dialog"
        >
          <div className="date-range-popover-heading">
            <p className="section-help">Choose a start date, then choose an end date.</p>
            <button className="section-action" onClick={closePopover} ref={closeButtonRef} type="button">Close</button>
          </div>
          <DayPicker mode="range" onSelect={handleRangeSelect} selected={selectedRange} />
        </div>
      ) : null}
    </section>
  );
}
