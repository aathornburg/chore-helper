import { useEffect, useRef, useState } from "react";
import { DayPicker } from "@daypicker/react";
import type { DateRange } from "@daypicker/react";
import "@daypicker/react/style.css";
import { format } from "date-fns";
import type { CalendarDateRange, CalendarDateRangePreset } from "./dateRange";
import { createPresetRange } from "./dateRange";

type DateRangePickerProps = {
  idPrefix: string;
  label: string;
  preset: CalendarDateRangePreset;
  range: CalendarDateRange;
  visibleRange: CalendarDateRange;
  variant?: "standalone" | "panel";
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
  variant = "standalone",
  onPresetChange,
  onRangeChange
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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
    setDraftRange(undefined);
    triggerRef.current?.focus();
  }

  function togglePopover() {
    setDraftRange(undefined);
    setIsOpen((current) => !current);
  }

  function choosePreset(nextPreset: CalendarDateRangePreset) {
    if (nextPreset === "custom") {
      onPresetChange(nextPreset, range);
      setDraftRange(undefined);
      setIsOpen(true);
      return;
    }
    onPresetChange(nextPreset, createPresetRange(nextPreset, visibleRange));
    setIsOpen(false);
  }

  function handleRangeSelect(nextRange: DateRange | undefined) {
    if (!nextRange?.from) return;
    const isCompletingDraftRange = Boolean(draftRange?.from && nextRange.to);
    setDraftRange(nextRange);
    onRangeChange({
      startOn: format(nextRange.from, "yyyy-MM-dd"),
      endOn: format(nextRange.to ?? nextRange.from, "yyyy-MM-dd")
    });
    if (isCompletingDraftRange) closePopover();
  }

  return (
    <section className={`date-range-picker${variant === "panel" ? " is-panel" : ""}`} aria-labelledby={`${idPrefix}-heading`}>
      {variant === "standalone" ? (
        <>
          <div className="date-range-picker-heading">
            <h4 id={`${idPrefix}-heading`}>{label}</h4>
            <span>{range.startOn} to {range.endOn}</span>
          </div>
          <button
            aria-controls={`${idPrefix}-popover`}
            aria-expanded={isOpen}
            className="date-range-trigger"
            onClick={togglePopover}
            ref={triggerRef}
            type="button"
          >
            {range.startOn} to {range.endOn}
          </button>
        </>
      ) : (
        <h4 className="sr-only" id={`${idPrefix}-heading`}>{label}</h4>
      )}
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
          className={variant === "panel" ? "date-range-calendar-panel" : "date-range-popover"}
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
          <DayPicker mode="range" onSelect={handleRangeSelect} selected={draftRange} />
        </div>
      ) : null}
    </section>
  );
}
