# Calendar Mobile Week Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Calendar feel calendar-first across desktop and mobile by simplifying the header, compacting mobile actions, adding household identity to event surfaces, unifying modal shells, and replacing the mobile Week time grid with a readable week strip plus selected-day agenda.

**Architecture:** Keep the work inside the existing Calendar page rather than introducing a route or broad data-model refactor. Add small helper functions inside `CalendarPage.tsx` for household labels and mobile selected-day data, then reuse existing event renderers and modal focus/backdrop behavior. CSS changes stay in `web/src/App.css`, with tests in `web/src/App.test.tsx`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, date-fns/date-fns-tz, existing Clenella CSS.

---

## File Structure

- Modify `web/src/pages/CalendarPage.tsx`: remove header metrics, move mobile actions into one menu, add household label helpers, render household labels on event rows/cards/details, add mobile Week strip/agenda rendering, and normalize modal shell classes.
- Modify `web/src/App.css`: remove or stop relying on header metrics styles, add compact mobile header/action-menu rules, add household label styles, add mobile Week strip/agenda styles, and unify modal sizing/inset behavior.
- Modify `web/src/App.test.tsx`: add red/green tests for header cleanup, mobile action menu, household labels, modal cohesion, and mobile Week behavior.
- Do not modify API clients or server endpoints in this plan. All-households calendar loading remains out of scope.

## Task 1: Remove Calendar H1 Support Metrics

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Write the failing header cleanup test**

In `web/src/App.test.tsx`, update `uses Calendar as the only chore planning destination` to assert the header no longer has the status summary. Add these assertions after the `Calendar` heading assertion:

```tsx
expect(screen.queryByLabelText("Calendar status summary")).toBeNull();
const pageHeader = document.querySelector(".page-command-header");
expect(pageHeader).not.toBeNull();
expect(within(pageHeader as HTMLElement).queryByText("Home")).toBeNull();
expect(within(pageHeader as HTMLElement).queryByText(/open$/)).toBeNull();
expect(within(pageHeader as HTMLElement).queryByText(/completed$/)).toBeNull();
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: FAIL in `uses Calendar as the only chore planning destination` because `.command-metrics` still renders `Home`, period, `open`, and `completed`.

- [ ] **Step 3: Remove the header metrics markup**

In `web/src/pages/CalendarPage.tsx`, replace the Calendar header title block:

```tsx
<div>
  <h1>Calendar</h1>
  <div className="command-metrics" aria-label="Calendar status summary">
    <span>{selectedHousehold?.name ?? "No household"}</span>
    <span>{periodLabel}</span>
    <span>{visibleOccurrences.filter((occurrence) => occurrence.status !== "completed").length} open</span>
    <span>{visibleOccurrences.filter((occurrence) => occurrence.status === "completed").length} completed</span>
  </div>
</div>
```

with:

```tsx
<div>
  <h1>Calendar</h1>
</div>
```

- [ ] **Step 4: Remove unused header metric CSS**

In `web/src/App.css`, delete:

```css
.command-metrics {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
}

.command-metrics span {
  color: #11231b;
  font-size: 0.96rem;
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: PASS for the updated header cleanup test and no regressions.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/CalendarPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Simplify calendar page header"
```

## Task 2: Compact Mobile Calendar Actions Into One Menu

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Write the failing mobile action menu test**

Add this test near the existing calendar workspace tests in `web/src/App.test.tsx`:

```tsx
it("uses one compact calendar actions trigger on mobile", async () => {
  setViewportWidth(390);
  vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
  renderAt("/calendar");

  expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Calendar actions" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Add event" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Import events" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Export events" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Calendar actions" }));

  expect(screen.getByRole("button", { name: "Add event" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Import events" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Export events" })).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: FAIL because mobile still renders the visible top-level `Add event` button.

- [ ] **Step 3: Move Add event inside the menu for mobile only**

In `web/src/pages/CalendarPage.tsx`, replace the current non-export header actions block with a conditional visible add button and a shared menu item:

```tsx
{!isExportMode ? (
  <div className="calendar-header-actions" aria-label="Calendar header actions">
    {!isMobileMonthViewport ? (
      <button onClick={(event) => openCreateEditor(event.currentTarget)} type="button">Add event</button>
    ) : null}
    <div
      className="calendar-actions-menu"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        setIsCalendarActionsOpen(false);
        calendarActionsButtonRef.current?.focus();
      }}
    >
      <button
        ref={calendarActionsButtonRef}
        aria-controls="calendar-actions-menu"
        aria-expanded={isCalendarActionsOpen}
        aria-haspopup="true"
        className="section-action calendar-actions-menu-trigger"
        onClick={() => setIsCalendarActionsOpen((isOpen) => !isOpen)}
        type="button"
      >
        Calendar actions
      </button>
      {isCalendarActionsOpen ? (
        <div className="calendar-actions-popover" id="calendar-actions-menu" role="region" aria-label="Calendar actions menu">
          {isMobileMonthViewport ? (
            <button onClick={(event) => openCreateEditor(event.currentTarget)} type="button">Add event</button>
          ) : null}
          <button onClick={openImportModal} type="button">Import events</button>
          <button onClick={startExportMode} type="button">Export events</button>
        </div>
      ) : null}
    </div>
  </div>
) : null}
```

Keep desktop behavior unchanged: desktop still shows visible `Add event` plus `Calendar actions`.

- [ ] **Step 4: Update mobile header CSS**

In `web/src/App.css`, update the `@media (max-width: 720px)` `.calendar-header-actions` block to keep one compact trigger aligned right:

```css
.calendar-header-actions {
  align-items: center;
  display: flex;
  justify-content: flex-end;
  width: 100%;
}

.calendar-actions-menu-trigger {
  min-height: 40px;
  width: auto;
}
```

Do not include `.calendar-header-actions > button` width rules on mobile, because the top-level Add event button is no longer present there.

- [ ] **Step 5: Run tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: PASS for mobile action menu and existing desktop action tests.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/CalendarPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Compact mobile calendar actions"
```

## Task 3: Add Household Identity To Event Cards And Details

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Write failing tests for household labels**

Add this test near the calendar card/detail tests in `web/src/App.test.tsx`:

```tsx
it("shows household identity on calendar event rows and detail modals", async () => {
  await withMay2026CalendarClock(async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({
      calendarConnected: true,
      cleanlyCalendarEvents: [{
        id: "cleanly-event-1",
        householdId: "household-1",
        createdByUserId: "app-user-1",
        type: "commitment",
        title: "Soccer practice",
        privacyTitle: "Soccer practice",
        detailLevel: "full_details",
        startsAt: "2026-05-29T21:00:00.000Z",
        endsAt: "2026-05-29T22:00:00.000Z",
        timezone: "America/New_York",
        source: "google",
        status: "active"
      }]
    }));
    renderAt("/calendar");

    const friday = await screen.findByRole("gridcell", { name: "Friday, May 29" });
    const choreCard = within(friday).getByRole("button", { name: "View Clean bathrooms" });
    expect(within(choreCard).getByText("Home")).toBeTruthy();
    const calendarCard = within(friday).getByRole("button", { name: "View Soccer practice" });
    expect(within(calendarCard).getByText("Home")).toBeTruthy();

    fireEvent.click(choreCard);
    const choreDialog = await screen.findByRole("dialog", { name: "Chore details" });
    expect(within(choreDialog).getByText("Household")).toBeTruthy();
    expect(within(choreDialog).getByText("Home")).toBeTruthy();
    fireEvent.click(within(choreDialog).getByRole("button", { name: "Close" }));

    fireEvent.click(calendarCard);
    const eventDialog = await screen.findByRole("dialog", { name: "Calendar event details" });
    expect(within(eventDialog).getByText("Household")).toBeTruthy();
    expect(within(eventDialog).getByText("Home")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: FAIL because event rows and detail modals do not show `Household`.

- [ ] **Step 3: Add household label helpers**

In `web/src/pages/CalendarPage.tsx`, add these helpers near `memberDisplayName`:

```tsx
function householdLabel(householdId?: string) {
  if (!householdId) return selectedHousehold?.name ?? "Household";
  return households.find((household) => household.id === householdId)?.name ?? selectedHousehold?.name ?? "Household";
}

function renderHouseholdLabel(householdId?: string) {
  return <span className="calendar-household-label">{householdLabel(householdId)}</span>;
}
```

- [ ] **Step 4: Render household label on chore cards and rows**

In `renderOccurrenceCompact`, `renderMonthOccurrence`, and `renderAgendaOccurrence`, add the household label under the title/detail inside `.calendar-chore-main`:

```tsx
{renderHouseholdLabel(occurrence.householdId)}
```

Place it after the title for month/compact cards and after the date line for agenda rows.

- [ ] **Step 5: Render household label on imported calendar event cards**

In `renderCleanlyCalendarEvent`, add the label inside `.calendar-chore-main` after the title and optional time line:

```tsx
{renderHouseholdLabel(event.householdId)}
```

- [ ] **Step 6: Add Household metadata to modals**

In `renderChoreViewDetailSections`, add this as the first item in `.chore-detail-meta-grid`:

```tsx
<div>
  <span>Household</span>
  <strong>{householdLabel(selectedOccurrence.householdId)}</strong>
</div>
```

In the calendar event detail modal metadata grid, add this before `When`:

```tsx
<div>
  <span>Household</span>
  <strong>{householdLabel(selectedCleanlyCalendarEvent.householdId)}</strong>
</div>
```

- [ ] **Step 7: Style the household label**

In `web/src/App.css`, add near the calendar chore row styles:

```css
.calendar-household-label {
  color: #5a6a70;
  display: block;
  font-size: 0.72rem;
  font-weight: 750;
  line-height: 1.2;
  margin-top: 2px;
}
```

- [ ] **Step 8: Run tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: PASS for household identity tests and no regressions.

- [ ] **Step 9: Commit**

```bash
git add web/src/pages/CalendarPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Show household identity on calendar events"
```

## Task 4: Unify Calendar Modal Shell Behavior

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Write failing modal cohesion test**

Add this test near existing mobile modal tests in `web/src/App.test.tsx`:

```tsx
it("uses a cohesive centered modal shell for add and import event modals on mobile", async () => {
  setViewportWidth(390);
  vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
  renderAt("/calendar");

  await screen.findByRole("heading", { name: "Calendar" });
  fireEvent.click(screen.getByRole("button", { name: "Calendar actions" }));
  fireEvent.click(screen.getByRole("button", { name: "Add event" }));

  const addModal = await screen.findByRole("dialog", { name: "New chore" });
  expect(addModal.classList.contains("calendar-modal-shell")).toBe(true);
  expect(document.querySelector(".chore-editor-backdrop")?.classList.contains("calendar-modal-backdrop")).toBe(true);
  fireEvent.click(within(addModal).getByRole("button", { name: "Cancel" }));

  fireEvent.click(screen.getByRole("button", { name: "Calendar actions" }));
  fireEvent.click(screen.getByRole("button", { name: "Import events" }));

  const importModal = await screen.findByRole("dialog", { name: "Import calendar events" });
  expect(importModal.classList.contains("calendar-modal-shell")).toBe(true);
  expect(importModal.classList.contains("calendar-sync-modal")).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: FAIL because modal shell classes are not shared yet.

- [ ] **Step 3: Add shared modal classes in markup**

In `web/src/pages/CalendarPage.tsx`:

For `renderCalendarSyncModal`, change the backdrop class to:

```tsx
className="chore-editor-backdrop calendar-modal-backdrop calendar-sync-backdrop"
```

and modal class to:

```tsx
className="chore-editor-modal calendar-modal-shell calendar-sync-modal"
```

For add/edit/view chore modal backdrop, change the class expression to include shared classes:

```tsx
className={`chore-editor-backdrop calendar-modal-backdrop ${editorMode === "view" ? "is-detail-view is-centered-detail-view" : ""}`}
```

and modal class to:

```tsx
className={`chore-editor-modal calendar-modal-shell ${editorMode === "view" ? "is-detail-view" : ""}`}
```

For calendar event detail backdrop and modal, add the same shared classes:

```tsx
className="chore-editor-backdrop calendar-modal-backdrop is-detail-view is-centered-detail-view"
```

```tsx
className="chore-editor-modal calendar-modal-shell calendar-event-detail-modal is-detail-view"
```

- [ ] **Step 4: Normalize modal shell CSS**

In `web/src/App.css`, add:

```css
.calendar-modal-backdrop {
  align-items: center;
  overflow: auto;
  padding: 24px;
  place-items: center;
}

.calendar-modal-shell {
  max-height: calc(100vh - 48px);
  overflow: auto;
  width: min(880px, calc(100vw - 48px));
}

.calendar-modal-shell.calendar-event-detail-modal {
  max-width: 720px;
}
```

Then adjust `.calendar-sync-backdrop` so it does not override to `align-items: start` or `place-items: start center`. Keep its background and z-index only:

```css
.calendar-sync-backdrop {
  background: rgba(20, 45, 51, 0.28);
  z-index: 35;
}
```

Adjust `.calendar-sync-modal` so it does not set `max-height: none` and uses the shared width unless needed:

```css
.calendar-sync-modal {
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  box-shadow: -8px 8px 0 rgba(19, 106, 129, 0.16), 0 24px 70px rgba(18, 40, 44, 0.2);
  display: grid;
  gap: 18px;
  max-width: 880px;
  padding: 22px;
  position: relative;
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: PASS for modal cohesion tests.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/CalendarPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Unify calendar modal shells"
```

## Task 5: Add Mobile Week State And Day Selection

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/CalendarPage.tsx`

- [ ] **Step 1: Write failing mobile Week render test**

Add this test near the mobile month tests:

```tsx
it("renders mobile Week as a week strip with selected-day agenda", async () => {
  await withMay2026CalendarClock(async () => {
    setViewportWidth(390);
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Week" }));

    expect(await screen.findByRole("group", { name: "Week days" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Selected week day agenda" })).toBeTruthy();
    expect(screen.queryByRole("grid", { name: /Week of/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: FAIL because mobile Week still renders `renderCalendarColumns`.

- [ ] **Step 3: Add mobile week selected date state**

In `web/src/pages/CalendarPage.tsx`, add state and ref near the mobile month state:

```tsx
const [selectedMobileWeekDateKey, setSelectedMobileWeekDateKey] = useState<string>();
const mobileWeekAgendaRef = useRef<HTMLElement>(null);
```

- [ ] **Step 4: Add default selected mobile week effect**

Below the existing mobile month selected-date effect, add:

```tsx
useEffect(() => {
  if (calendarScale !== "week" || weekDates.length === 0) return;

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const visibleToday = weekDates.some((date) => dateKey(date) === todayKey);
  setSelectedMobileWeekDateKey(visibleToday ? todayKey : dateKey(weekDates[0]));
}, [calendarScale, focusDate, weekDates]);
```

- [ ] **Step 5: Add selection handler**

Near `selectMobileMonthDate`, add:

```tsx
function selectMobileWeekDate(nextDateKey: string) {
  setSelectedMobileWeekDateKey(nextDateKey);
  if (!isMobileMonthViewport) return;
  window.setTimeout(() => {
    mobileWeekAgendaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 0);
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: still FAIL because rendering has not been added yet, but TypeScript should compile within Vitest.

Do not commit yet; Task 6 adds rendering.

## Task 6: Render Mobile Week Strip And Selected-Day Agenda

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Add selected-day behavior test**

Add this test after the mobile Week render test:

```tsx
it("updates the mobile Week selected-day agenda when a day is selected", async () => {
  await withMay2026CalendarClock(async () => {
    setViewportWidth(390);
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Week" }));
    const weekDays = await screen.findByRole("group", { name: "Week days" });
    fireEvent.click(within(weekDays).getByRole("button", { name: /Select Friday, May 29/ }));

    const agenda = screen.getByRole("region", { name: "Selected week day agenda" });
    expect(within(agenda).getByRole("heading", { name: "Friday, May 29" })).toBeTruthy();
    expect(within(agenda).getByRole("button", { name: "View Clean bathrooms" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Add `renderMobileWeekCalendar`**

In `web/src/pages/CalendarPage.tsx`, add this function near `renderMobileMonthCalendar`:

```tsx
function renderMobileWeekCalendar() {
  const selectedKey = selectedMobileWeekDateKey ?? dateKey(weekDates[0]);
  const selectedDate = weekDates.find((date) => dateKey(date) === selectedKey) ?? weekDates[0];
  const selectedBucket = dayBuckets.get(selectedKey);
  const selectedEvents = cleanlyEventDateBuckets.get(selectedKey) ?? [];
  const selectedOccurrences = selectedBucket ? selectedBucket.orderedOccurrences : [];

  return (
    <section className="calendar-mobile-week" aria-label="Mobile week calendar">
      <div className="calendar-mobile-week-strip" role="group" aria-label="Week days">
        {weekDates.map((date) => {
          const key = dateKey(date);
          const bucket = dayBuckets.get(key);
          const itemCount = (bucket?.itemCount ?? 0);
          const isSelected = key === selectedKey;
          const isToday = key === format(new Date(), "yyyy-MM-dd");
          return (
            <button
              aria-label={`Select ${longDateLabel(date)}, ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
              aria-pressed={isSelected}
              className={`calendar-mobile-week-day ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""}`}
              key={key}
              onClick={() => selectMobileWeekDate(key)}
              type="button"
            >
              <span>{format(date, "EEE")}</span>
              <strong>{format(date, "d")}</strong>
              <em>{itemCount}</em>
            </button>
          );
        })}
      </div>

      <section className="calendar-mobile-selected-agenda calendar-mobile-week-agenda" aria-label="Selected week day agenda" ref={mobileWeekAgendaRef}>
        <div className="agenda-header">
          <div>
            <p className="eyebrow">Selected day</p>
            <h2>{longDateLabel(selectedDate)}</h2>
          </div>
          <span className="agenda-count">{selectedOccurrences.length + selectedEvents.length} items</span>
        </div>
        {selectedOccurrences.length === 0 && selectedEvents.length === 0 ? (
          <p className="empty-state">No events scheduled for this day.</p>
        ) : null}
        {selectedOccurrences.length > 0 ? (
          <section className="calendar-list-day">
            <h3>Anytime</h3>
            <div className="calendar-list-day-items">
              {selectedOccurrences
                .filter((occurrence) => occurrence.planningMode === "flexible")
                .map((occurrence) => renderAgendaOccurrence(occurrence, selectedDate))}
            </div>
          </section>
        ) : null}
        <div className="calendar-list-day-items">
          {selectedOccurrences
            .filter((occurrence) => occurrence.planningMode !== "flexible")
            .map((occurrence) => renderAgendaOccurrence(occurrence, selectedDate))}
          {selectedEvents.map((event) => renderCleanlyCalendarEvent(event, false))}
        </div>
      </section>
    </section>
  );
}
```

- [ ] **Step 3: Use mobile Week renderer**

In the calendar render switch, replace:

```tsx
calendarScale === "week" ? (
  renderCalendarColumns(weekDates, `Week of ${format(weekDates[0], "MMM d, yyyy")}`, "title")
) : (
```

with:

```tsx
calendarScale === "week" ? (
  isMobileMonthViewport
    ? renderMobileWeekCalendar()
    : renderCalendarColumns(weekDates, `Week of ${format(weekDates[0], "MMM d, yyyy")}`, "title")
) : (
```

- [ ] **Step 4: Add mobile Week styles**

In `web/src/App.css`, add near mobile month styles:

```css
.calendar-mobile-week {
  display: grid;
  gap: 12px;
}

.calendar-mobile-week-strip {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.calendar-mobile-week-day {
  align-items: center;
  background: #f8fcfd;
  border: 1px solid var(--color-border);
  color: #183541;
  display: grid;
  gap: 2px;
  min-height: 62px;
  padding: 6px 4px;
  text-align: center;
}

.calendar-mobile-week-day span,
.calendar-mobile-week-day em {
  font-size: 0.68rem;
  font-style: normal;
  font-weight: 750;
}

.calendar-mobile-week-day strong {
  font-size: 1rem;
}

.calendar-mobile-week-day.is-selected {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.calendar-mobile-week-day.is-today:not(.is-selected) {
  box-shadow: inset 0 0 0 2px rgba(21, 105, 126, 0.22);
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: PASS for mobile Week render and selection tests.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/CalendarPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Add mobile week agenda view"
```

## Task 7: Verify Empty State, Modal Opening, And Scroll Behavior

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/CalendarPage.tsx` if tests reveal gaps.

- [ ] **Step 1: Add empty-state and detail-opening tests**

Add this test near the mobile Week tests:

```tsx
it("shows mobile Week empty state and opens detail modals from agenda rows", async () => {
  await withMay2026CalendarClock(async () => {
    setViewportWidth(390);
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Week" }));
    const weekDays = await screen.findByRole("group", { name: "Week days" });

    fireEvent.click(within(weekDays).getByRole("button", { name: /Select Saturday, May 30/ }));
    expect(screen.getByText("No events scheduled for this day.")).toBeTruthy();

    fireEvent.click(within(weekDays).getByRole("button", { name: /Select Friday, May 29/ }));
    const agenda = screen.getByRole("region", { name: "Selected week day agenda" });
    fireEvent.click(within(agenda).getByRole("button", { name: "View Clean bathrooms" }));

    expect(await screen.findByRole("dialog", { name: "Chore details" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Add scroll behavior test**

Add this test:

```tsx
it("scrolls the mobile Week agenda into view only after selecting a day", async () => {
  await withMay2026CalendarClock(async () => {
    setViewportWidth(390);
    const scrollIntoView = stubScrollIntoView();
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    renderAt("/calendar");

    fireEvent.click(await screen.findByRole("button", { name: "Week" }));
    expect(scrollIntoView).not.toHaveBeenCalled();

    const weekDays = await screen.findByRole("group", { name: "Week days" });
    fireEvent.click(within(weekDays).getByRole("button", { name: /Select Friday, May 29/ }));

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" }));
  });
});
```

- [ ] **Step 3: Run tests to verify current implementation**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: PASS. If empty-state tests fail because the mock data has work on Saturday, select a different day in the rendered week that has no mock work. If scroll test fails because the timeout has not flushed, wrap the expectation in `await waitFor(...)` as shown above.

- [ ] **Step 4: Fix only verified gaps**

If the agenda renders empty group headings, update `renderMobileWeekCalendar` to only render the `Anytime` section when at least one flexible occurrence exists:

```tsx
const flexibleOccurrences = selectedOccurrences.filter((occurrence) => occurrence.planningMode === "flexible");
const timedOccurrences = selectedOccurrences.filter((occurrence) => occurrence.planningMode !== "flexible");
```

Then render `flexibleOccurrences` and `timedOccurrences` instead of filtering inline.

- [ ] **Step 5: Run tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/CalendarPage.tsx web/src/App.test.tsx
git commit -m "Verify mobile week agenda interactions"
```

## Task 8: Final Verification

**Files:**
- No planned edits.

- [ ] **Step 1: Run focused web tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run:

```bash
npm.cmd run build -w web
```

Expected: TypeScript build and Vite build succeed. The existing large chunk warning is acceptable if no new build errors appear.

- [ ] **Step 3: Run git diff check**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 4: Manual browser verification**

Open `http://localhost:5173/calendar` in the authenticated app session. Verify:

- Desktop Calendar header shows only `Calendar` and compact actions, no status row.
- Desktop Month, Week, Day, and List event rows show household labels.
- Mobile width shows a single `Calendar actions` trigger with `Add event`, `Import events`, and `Export events`.
- Mobile Week shows a seven-day strip and selected-day agenda instead of the time grid.
- Selecting a day updates the agenda and scrolls it into view.
- Add event and import event modals share centered/inset behavior.

- [ ] **Step 5: Final commit if verification caused edits**

If Step 4 required fixes, commit them:

```bash
git add web/src/pages/CalendarPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Polish calendar mobile cleanup"
```

If Step 4 required no fixes, do not create an empty commit.

