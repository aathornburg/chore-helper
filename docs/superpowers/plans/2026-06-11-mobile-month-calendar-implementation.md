# Mobile Month Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved mobile Month calendar: compact date grid, selected-day agenda, and mobile-only scroll-to-agenda behavior.

**Architecture:** Keep the change local to `CalendarPage` and its stylesheet. Render the existing desktop month grid unchanged for desktop, and add a mobile month surface that shares the same date buckets and item renderers. Track selected mobile month date in component state and scroll the agenda ref only after explicit mobile date selection.

**Tech Stack:** React, TypeScript, CSS media queries, Vitest, Testing Library.

---

### Task 1: Mobile Month Selection State And Tests

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/CalendarPage.tsx`

- [x] **Step 1: Write failing mobile Month tests**

Add tests near the existing month view tests in `web/src/App.test.tsx`:

```ts
function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

it("renders mobile Month as date buttons with a selected-day agenda", async () => {
  await withMay2026CalendarClock(async () => {
    setViewportWidth(390);
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderAt("/calendar");

    const mobileMonth = await screen.findByRole("grid", { name: "May 2026 mobile month calendar" });
    expect(within(mobileMonth).getByRole("button", { name: /Select Friday, May 29, 1 item/ })).toBeTruthy();
    expect(within(mobileMonth).queryByRole("button", { name: "View Clean bathrooms" })).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();

    const agenda = screen.getByRole("region", { name: "Selected day agenda" });
    expect(within(agenda).getByRole("heading", { name: "Saturday, May 30" })).toBeTruthy();
    expect(within(agenda).getByRole("button", { name: "View Clean bathrooms" })).toBeTruthy();
    expect(within(agenda).getByRole("button", { name: "View Pet cats" })).toBeTruthy();

    fireEvent.click(within(mobileMonth).getByRole("button", { name: /Select Friday, May 29, 1 item/ }));
    expect(within(agenda).getByRole("heading", { name: "Friday, May 29" })).toBeTruthy();
    expect(within(agenda).getByRole("button", { name: "View Clean bathrooms" })).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });
});
```

Add a second test:

```ts
it("opens detail modals from the mobile Month selected-day agenda", async () => {
  await withMay2026CalendarClock(async () => {
    setViewportWidth(390);
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    const agenda = await screen.findByRole("region", { name: "Selected day agenda" });
    fireEvent.click(within(agenda).getByRole("button", { name: "View Clean bathrooms" }));

    const dialog = await screen.findByRole("dialog", { name: "Chore details" });
    expect(within(dialog).getByRole("heading", { name: "Clean bathrooms" })).toBeTruthy();
  });
});
```

- [x] **Step 2: Run red tests**

Run:

```bash
npm.cmd test -- App.test.tsx -t "mobile Month"
```

Expected: FAIL because the mobile month grid and selected-day agenda do not exist.

- [x] **Step 3: Add mobile viewport state**

In `web/src/pages/CalendarPage.tsx`, add:

```ts
const mobileMonthBreakpoint = 700;
```

Inside `CalendarPage`, add state and effects:

```ts
const [isMobileMonthViewport, setIsMobileMonthViewport] = useState(() =>
  typeof window !== "undefined" ? window.innerWidth <= mobileMonthBreakpoint : false
);
const [selectedMobileMonthDateKey, setSelectedMobileMonthDateKey] = useState<string>();
const mobileMonthAgendaRef = useRef<HTMLElement>(null);

useEffect(() => {
  function syncMobileMonthViewport() {
    setIsMobileMonthViewport(window.innerWidth <= mobileMonthBreakpoint);
  }
  syncMobileMonthViewport();
  window.addEventListener("resize", syncMobileMonthViewport);
  return () => window.removeEventListener("resize", syncMobileMonthViewport);
}, []);
```

Add a selected date effect after `monthDates` is defined:

```ts
useEffect(() => {
  if (calendarScale !== "month") return;
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const visibleToday = monthDates.some((date) => dateKey(date) === todayKey);
  const firstFocusedMonthDate = monthDates.find((date) => format(date, "yyyy-MM") === format(focusDate, "yyyy-MM"));
  setSelectedMobileMonthDateKey(visibleToday ? todayKey : firstFocusedMonthDate ? dateKey(firstFocusedMonthDate) : dateKey(monthDates[0]));
}, [calendarScale, focusDate, monthDates]);
```

Do not scroll from this effect; it only chooses the default selected date.

### Task 2: Mobile Month Renderer

**Files:**
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [x] **Step 1: Implement shared day item helper**

In `CalendarPage`, add a helper near `renderMonthCalendar`:

```ts
function monthItemsForDate(date: Date) {
  const key = dateKey(date);
  const occurrencesForDay = occurrenceDateBuckets.get(key) ?? [];
  const cleanlyEventsForDay = cleanlyEventDateBuckets.get(key) ?? [];
  const completedOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status === "completed");
  const activeOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status !== "completed");
  return {
    cleanlyEventsForDay,
    orderedOccurrences: [...activeOccurrences, ...completedOccurrences],
    hasAllCompleted: occurrencesForDay.length > 0 && activeOccurrences.length === 0,
    itemCount: cleanlyEventsForDay.length + occurrencesForDay.length
  };
}
```

Replace duplicate month day calculations in `renderMonthCalendar` with this helper.

- [x] **Step 2: Implement mobile day selection**

Add:

```ts
function selectMobileMonthDate(nextDateKey: string) {
  setSelectedMobileMonthDateKey(nextDateKey);
  if (isMobileMonthViewport) {
    window.requestAnimationFrame(() => {
      mobileMonthAgendaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}
```

- [x] **Step 3: Render compact mobile grid and agenda**

Add `renderMobileMonthCalendar(monthWeeks, rangeLabel)`:

```tsx
function renderMobileMonthCalendar(monthWeeks: Date[][], rangeLabel: string) {
  const selectedKey = selectedMobileMonthDateKey ?? dateKey(monthDates[0]);
  const selectedDate = monthDates.find((date) => dateKey(date) === selectedKey) ?? monthDates[0];
  const selectedItems = monthItemsForDate(selectedDate);
  return (
    <section className="calendar-mobile-month-panel" aria-label="Mobile month calendar">
      <div className="calendar-mobile-month-grid" role="grid" aria-label={`${rangeLabel} mobile month calendar`}>
        <div className="calendar-mobile-month-week calendar-mobile-month-week-header" role="row">
          {weekdays.map((weekday) => <div className="calendar-weekday-header" key={weekday.value} role="columnheader">{weekday.label}</div>)}
        </div>
        {monthWeeks.map((weekDatesInMonth) => (
          <div className="calendar-mobile-month-week" key={`mobile-${dateKey(weekDatesInMonth[0])}`} role="row">
            {weekDatesInMonth.map((date) => {
              const key = dateKey(date);
              const isSelected = key === selectedKey;
              const isCurrentMonth = format(date, "yyyy-MM") === format(focusDate, "yyyy-MM");
              const isToday = key === format(new Date(), "yyyy-MM-dd");
              const items = monthItemsForDate(date);
              const itemSummary = `${items.itemCount} item${items.itemCount === 1 ? "" : "s"}`;
              return (
                <div className={`calendar-mobile-day-cell ${isCurrentMonth ? "" : "is-outside-month"} ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""}`} key={key} role="gridcell">
                  <button
                    aria-label={`Select ${longDateLabel(date)}, ${itemSummary}`}
                    aria-selected={isSelected}
                    onClick={() => selectMobileMonthDate(key)}
                    type="button"
                  >
                    <span>{format(date, "d")}</span>
                    {items.itemCount ? <small>{items.itemCount}</small> : null}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <section className="calendar-mobile-day-agenda" ref={mobileMonthAgendaRef} aria-label="Selected day agenda">
        <div className="agenda-header">
          <div>
            <p className="eyebrow">Selected day</p>
            <h2>{longDateLabel(selectedDate)}</h2>
          </div>
          <span>{selectedItems.itemCount} item{selectedItems.itemCount === 1 ? "" : "s"}</span>
        </div>
        <div className="calendar-mobile-day-agenda-list">
          {selectedItems.itemCount === 0 ? <p className="empty-state">No work scheduled for this day.</p> : null}
          {selectedItems.cleanlyEventsForDay.map((event) => renderCleanlyCalendarEvent(event, false))}
          {selectedItems.orderedOccurrences.map((occurrence) => renderOccurrenceCompact(occurrence, selectedDate, "summary"))}
        </div>
      </section>
    </section>
  );
}
```

Update `renderMonthCalendar` to render both surfaces:

```tsx
<section className="calendar-month-panel">
  <div className="calendar-desktop-month-surface">...</div>
  {renderMobileMonthCalendar(monthWeeks, rangeLabel)}
</section>
```

- [x] **Step 4: Add responsive CSS**

In `web/src/App.css`, add mobile month classes:

```css
.calendar-mobile-month-panel {
  display: none;
}

.calendar-desktop-month-surface {
  display: block;
}

@media (max-width: 700px) {
  .calendar-desktop-month-surface {
    display: none;
  }

  .calendar-mobile-month-panel {
    display: grid;
    gap: 12px;
  }

  .calendar-mobile-month-grid {
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .calendar-mobile-month-week {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
  }

  .calendar-mobile-day-cell {
    border-bottom: 1px solid var(--color-border-soft);
    border-right: 1px solid var(--color-border-soft);
    min-width: 0;
  }

  .calendar-mobile-day-cell:nth-child(7n) {
    border-right: 0;
  }

  .calendar-mobile-day-cell button {
    align-items: center;
    background: transparent;
    border: 0;
    color: #24352e;
    display: grid;
    gap: 3px;
    justify-items: center;
    min-height: 42px;
    padding: 5px 2px;
    width: 100%;
  }

  .calendar-mobile-day-cell.is-outside-month button {
    color: #8b9690;
  }

  .calendar-mobile-day-cell.is-today button {
    box-shadow: inset 0 0 0 2px var(--color-primary);
  }

  .calendar-mobile-day-cell.is-selected button {
    background: var(--color-primary);
    color: #fff;
  }

  .calendar-mobile-day-cell small {
    background: currentColor;
    border-radius: 999px;
    height: 5px;
    overflow: hidden;
    text-indent: -999px;
    width: 5px;
  }

  .calendar-mobile-day-agenda {
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    display: grid;
  }

  .calendar-mobile-day-agenda .agenda-header {
    border-bottom: 1px solid var(--color-border-soft);
    padding: 12px;
  }

  .calendar-mobile-day-agenda-list {
    display: grid;
    gap: 8px;
    padding: 12px;
  }
}
```

- [x] **Step 5: Run mobile tests green**

Run:

```bash
npm.cmd test -- App.test.tsx -t "mobile Month"
```

Expected: PASS.

### Task 3: Empty State, Desktop Guard, And Verification

**Files:**
- Modify: `web/src/App.test.tsx`
- Verify: `web/src/pages/CalendarPage.tsx`
- Verify: `web/src/App.css`

- [x] **Step 1: Add empty-state and desktop guard tests**

Add:

```ts
it("shows an empty selected-day agenda in mobile Month", async () => {
  await withMay2026CalendarClock(async () => {
    setViewportWidth(390);
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    const mobileMonth = await screen.findByRole("grid", { name: "May 2026 mobile month calendar" });
    fireEvent.click(within(mobileMonth).getByRole("button", { name: /Select Monday, May 4, 0 items/ }));

    const agenda = screen.getByRole("region", { name: "Selected day agenda" });
    expect(within(agenda).getByRole("heading", { name: "Monday, May 4" })).toBeTruthy();
    expect(within(agenda).getByText("No work scheduled for this day.")).toBeTruthy();
  });
});
```

Update the existing desktop Month test to assert the desktop surface still exposes inline cards:

```ts
expect(monthGrid.closest(".calendar-desktop-month-surface")).not.toBeNull();
expect(within(friday).getByRole("button", { name: "View Clean bathrooms" })).toBeTruthy();
```

- [x] **Step 2: Run red for new empty-state test if needed**

Run:

```bash
npm.cmd test -- App.test.tsx -t "empty selected-day agenda|desktop Month"
```

Expected before implementation: empty-state test FAILS if Task 2 has not yet implemented it; PASS if already covered.

- [x] **Step 3: Run full affected test file**

Run:

```bash
npm.cmd test -- App.test.tsx
```

Expected: all tests pass.

- [x] **Step 4: Run build**

Run:

```bash
npm.cmd run build
```

Expected: TypeScript and Vite build pass. Existing large chunk warning is acceptable.

- [x] **Step 5: Commit**

Run:

```bash
git add web/src/App.test.tsx web/src/pages/CalendarPage.tsx web/src/App.css docs/superpowers/plans/2026-06-11-mobile-month-calendar-implementation.md
git commit -m "Add mobile month calendar agenda"
```
