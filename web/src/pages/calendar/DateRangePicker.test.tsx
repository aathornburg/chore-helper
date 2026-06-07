import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateRangePicker } from "./DateRangePicker";

describe("DateRangePicker", () => {
  it("keeps the custom calendar open after choosing a start date", () => {
    const onPresetChange = vi.fn();
    const onRangeChange = vi.fn();

    render(
      <DateRangePicker
        idPrefix="export-test"
        label="Export date range"
        onPresetChange={onPresetChange}
        onRangeChange={onRangeChange}
        preset="visible"
        range={{ startOn: "2026-06-01", endOn: "2026-06-30" }}
        visibleRange={{ startOn: "2026-06-01", endOn: "2026-06-30" }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    const calendar = screen.getByRole("dialog", { name: "Export date range calendar" });

    fireEvent.click(within(calendar).getByRole("button", { name: /Wednesday, June 10/i }));

    expect(screen.getByRole("dialog", { name: "Export date range calendar" })).toBeTruthy();
    expect(onRangeChange).toHaveBeenLastCalledWith({ startOn: "2026-06-10", endOn: "2026-06-10" });

    fireEvent.click(within(calendar).getByRole("button", { name: /Monday, June 15/i }));

    expect(screen.queryByRole("dialog", { name: "Export date range calendar" })).toBeNull();
    expect(onRangeChange).toHaveBeenLastCalledWith({ startOn: "2026-06-10", endOn: "2026-06-15" });
  });
});
