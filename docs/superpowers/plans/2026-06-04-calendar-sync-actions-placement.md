# Calendar Sync Actions Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move active calendar sync work from Settings to Calendar by adding an Import events modal and an Export selection mode.

**Architecture:** Settings remains the durable preferences surface. Calendar owns sync work state, loads sync preferences/calendars/policies, opens a focused import review dialog, and enters a temporary export selection mode where the Calendar itself is the selection surface. Backend APIs remain unchanged in this slice.

**Tech Stack:** React 19, TypeScript, Vite, Vitest/Testing Library, date-fns/date-fns-tz, `@daypicker/react` for range picking, existing Clenella API helpers and shared types.

---

## References

- Design spec: `docs/superpowers/specs/2026-06-04-calendar-sync-actions-placement-design.md`
- Placement visual: `docs/calendar-sync-placement-options.html`
- Export selection visual: `docs/export-selection-mode-concept.html`
- React DayPicker range mode: https://daypicker.dev/selections/range-mode

## File Map

- Create `web/src/pages/calendar/dateRange.ts`
  - Date range type, presets, range membership helper.
- Create `web/src/pages/calendar/DateRangePicker.tsx`
  - Shared DayPicker range popover for import and export.
- Create `web/src/pages/calendar/CalendarImportModal.tsx`
  - Import first-run/setup states, source calendar, date range, candidate selection, batch type toggle, submit.
- Create `web/src/pages/calendar/CalendarExportPanel.tsx`
  - Export destination/range/content controls, batch select helper, live summary, export actions.
- Modify `web/src/pages/SettingsPage.tsx`
  - Remove active import review from Settings.
- Modify `web/src/pages/CalendarPage.tsx`
  - Move sync actions into Calendar header, load sync context, wire import modal, wire export mode.
- Modify `web/src/App.css`
  - Calendar sync action styling, modal/sheet styling, DayPicker styling, export mode styling.
- Modify `web/src/App.test.tsx`
  - Settings, Calendar import, and Calendar export regression coverage.
- Modify `web/package.json` and `package-lock.json`
  - Add `@daypicker/react`.

---

### Task 1: Shared Date Range Picker

**Files:**
- Modify: `web/package.json`
- Modify: `package-lock.json`
- Create: `web/src/pages/calendar/dateRange.ts`
- Create: `web/src/pages/calendar/DateRangePicker.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Install DayPicker**

Run:

```powershell
npm.cmd install @daypicker/react -w web
```

Expected: `@daypicker/react` is added to `web/package.json`; `package-lock.json` changes.

- [ ] **Step 2: Add date range utilities**

Create `web/src/pages/calendar/dateRange.ts`:

```ts
import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";

export type CalendarDateRange = {
  startOn: string;
  endOn: string;
};

export type CalendarDateRangePreset = "visible" | "this_week" | "next_2_weeks" | "this_month" | "custom";

export function createVisibleRange(startOn: string, endOn: string): CalendarDateRange {
  return { startOn, endOn };
}

export function createPresetRange(preset: CalendarDateRangePreset, visibleRange: CalendarDateRange, today = new Date()): CalendarDateRange {
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
```

- [ ] **Step 3: Add shared range picker component**

Create `web/src/pages/calendar/DateRangePicker.tsx`:

```tsx
import { useState } from "react";
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

export function DateRangePicker({ idPrefix, label, preset, range, visibleRange, onPresetChange, onRangeChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedRange: DateRange = {
    from: dateFromInputValue(range.startOn),
    to: dateFromInputValue(range.endOn)
  };

  function choosePreset(nextPreset: CalendarDateRangePreset) {
    onPresetChange(nextPreset, createPresetRange(nextPreset, visibleRange));
  }

  function handleRangeSelect(nextRange: DateRange | undefined) {
    if (!nextRange?.from) return;
    onRangeChange({
      startOn: format(nextRange.from, "yyyy-MM-dd"),
      endOn: format(nextRange.to ?? nextRange.from, "yyyy-MM-dd")
    });
    if (nextRange.to) setIsOpen(false);
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
        <div className="date-range-popover" id={`${idPrefix}-popover`} role="dialog" aria-label={`${label} calendar`}>
          <p className="section-help">Choose a start date, then choose an end date.</p>
          <DayPicker mode="range" onSelect={handleRangeSelect} selected={selectedRange} />
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Add picker styles**

Add to `web/src/App.css` near form/calendar styles:

```css
.date-range-picker {
  display: grid;
  gap: 10px;
  position: relative;
}

.date-range-trigger {
  justify-content: space-between;
  text-align: left;
  width: 100%;
}

.date-range-presets {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.date-range-presets button[aria-pressed="true"] {
  background: var(--color-primary);
  color: var(--color-surface-elevated);
}

.date-range-popover {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: -6px 6px 0 rgba(21, 94, 117, 0.16);
  left: 0;
  margin-top: 8px;
  padding: 12px;
  position: absolute;
  top: 100%;
  z-index: 45;
}

.date-range-picker .rdp-root {
  --rdp-accent-color: var(--color-primary);
  --rdp-accent-background-color: var(--color-primary-soft);
  margin: 0;
}

.date-range-picker .rdp-day_button {
  border-radius: 4px;
  font: inherit;
}

@media (max-width: 720px) {
  .date-range-popover {
    inset: auto 0 0 0;
    max-height: 78vh;
    overflow: auto;
    position: fixed;
  }
}
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm.cmd run typecheck -w web
```

Expected: PASS.

Commit:

```powershell
git add web/package.json package-lock.json web/src/pages/calendar/dateRange.ts web/src/pages/calendar/DateRangePicker.tsx web/src/App.css
git commit -m "feat: add calendar date range controls"
```

---

### Task 2: Settings Keeps Preferences Only

**Files:**
- Modify: `web/src/pages/SettingsPage.tsx`
- Modify: `web/src/App.css`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Update Settings test first**

In `web/src/App.test.tsx`, update `shows the calendar sync governance shell in Settings`.

Replace the existing click/review assertions:

```tsx
fireEvent.click(screen.getByRole("button", { name: "Review events to share" }));
expect(await screen.findByText("Connect Google Calendar before reviewing events.")).toBeTruthy();
```

with:

```tsx
expect(screen.queryByRole("button", { name: "Review events to share" })).toBeNull();
expect(screen.queryByText("Connect Google Calendar before reviewing events.")).toBeNull();
expect(screen.getByText(/When you are ready to import or export events, use Calendar/i)).toBeTruthy();
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "Settings"
```

Expected: FAIL because Settings still renders active import review.

- [ ] **Step 3: Remove active import state from SettingsPage**

In `web/src/pages/SettingsPage.tsx`, remove:

```ts
CalendarImportCandidate,
listCalendarImportCandidates,
submitCalendarImportEvents,
const [isReviewingImports, setIsReviewingImports] = useState(false);
const [importCandidates, setImportCandidates] = useState<CalendarImportCandidate[]>([]);
const [selectedImportCandidateIds, setSelectedImportCandidateIds] = useState<string[]>([]);
```

Remove these functions from `SettingsPage`:

```ts
handleReviewEventsToShare
toggleImportCandidate
updateImportCandidateType
handleSubmitEventsToCleanly
```

Remove the entire `calendar-review-panel` render block.

- [ ] **Step 4: Replace Settings action with copy**

Replace the `Review events to share` button with:

```tsx
<p className="sync-setting-note">
  When you are ready to import or export events, use Calendar.
</p>
```

Add CSS:

```css
.sync-setting-note {
  align-self: end;
  color: var(--color-text-muted);
  font-size: 0.94rem;
  font-weight: 750;
  margin: 0;
  text-align: right;
}
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "Settings"
```

Expected: PASS.

Commit:

```powershell
git add web/src/pages/SettingsPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "refactor: keep calendar import work off settings"
```

---

### Task 3: Calendar Header Actions and Sync Context

**Files:**
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add Calendar action test**

Add this test near the Calendar tests in `web/src/App.test.tsx`:

```tsx
it("shows Calendar sync actions beside Add chore", async () => {
  await withMay2026CalendarClock(async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: "Calendar" }));

    expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import events" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add chore" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Google Calendar setup" })).toBeNull();
  });
});
```

Update `mockCalendarWorkspaceFetches` to handle these new Calendar calls:

```ts
if (url.endsWith("/api/me/calendar/connections") && method === "GET") return { ok: true, json: async () => [] };
if (url.endsWith("/api/me/calendar/external-calendars") && method === "GET") return { ok: true, json: async () => [] };
if (url.endsWith("/api/me/calendar/preferences?householdId=household-1") && method === "GET") {
  return {
    ok: true,
    json: async () => ({
      householdId: "household-1",
      defaultDetailLevel: "busy_only",
      selectedSourceCalendarIds: [],
      exportMode: "off",
      exportContentMode: "chores"
    })
  };
}
if (url.endsWith("/api/households/household-1/calendar/import-policies") && method === "GET") {
  return {
    ok: true,
    json: async () => [{
      householdId: "household-1",
      memberId: "app-user-1",
      memberName: "Alex Owner",
      memberEmail: "owner@example.com",
      importQueueMode: "manual",
      importContentMode: "both"
    }]
  };
}
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "shows Calendar sync actions"
```

Expected: FAIL because the Calendar header does not yet have the new sync actions.

- [ ] **Step 3: Load sync context in CalendarPage**

In `CalendarPage.tsx`, add shared types to the existing type import:

```ts
CalendarConnectionSummary,
CalendarImportCandidate,
CalendarImportPolicy,
CalendarPreferences,
ExternalCalendarSummary,
```

Add API imports:

```ts
getCalendarPreferences,
listCalendarConnections,
listCalendarImportCandidates,
listCalendarImportPolicies,
listExternalCalendars,
submitCalendarImportEvents,
```

Add state:

```ts
const [connections, setConnections] = useState<CalendarConnectionSummary[]>([]);
const [externalCalendars, setExternalCalendars] = useState<ExternalCalendarSummary[]>([]);
const [calendarPreferences, setCalendarPreferences] = useState<CalendarPreferences>();
const [importPolicies, setImportPolicies] = useState<CalendarImportPolicy[]>([]);
const [isImportModalOpen, setIsImportModalOpen] = useState(false);
const [isExportMode, setIsExportMode] = useState(false);
```

Add effect after member loading:

```tsx
useEffect(() => {
  if (!selectedHousehold) return;
  let cancelled = false;
  void Promise.all([
    listCalendarConnections(),
    listExternalCalendars(),
    getCalendarPreferences(selectedHousehold.id),
    listCalendarImportPolicies(selectedHousehold.id).catch(() => [])
  ]).then(([loadedConnections, loadedCalendars, loadedPreferences, loadedPolicies]) => {
    if (cancelled) return;
    setConnections(loadedConnections);
    setExternalCalendars(loadedCalendars);
    setCalendarPreferences(loadedPreferences);
    setImportPolicies(loadedPolicies);
  }).catch(() => {
    if (!cancelled) setCalendarSyncStatus("Could not load calendar sync settings.");
  });
  return () => {
    cancelled = true;
  };
}, [selectedHousehold?.id]);
```

- [ ] **Step 4: Move sync actions into Calendar header**

Replace the single `Add chore` button in `page-command-header` with:

```tsx
<div className="calendar-header-actions">
  <button className="secondary-action" onClick={() => setIsImportModalOpen(true)} type="button">
    Import events
  </button>
  <button className="secondary-action" onClick={() => setIsExportMode(true)} type="button">
    Export
  </button>
  <button onClick={openCreateEditor} type="button">Add chore</button>
</div>
```

Remove the existing `calendar-integration-strip` section.

Add CSS:

```css
.calendar-header-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "shows Calendar sync actions"
```

Expected: PASS.

Commit:

```powershell
git add web/src/pages/CalendarPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "feat: move calendar sync actions to calendar header"
```

---

### Task 4: Calendar Import Modal

**Files:**
- Create: `web/src/pages/calendar/CalendarImportModal.tsx`
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add import modal tests**

Add this test in `web/src/App.test.tsx`:

```tsx
it("opens Import events on Calendar with setup guidance and no selected candidates", async () => {
  await withMay2026CalendarClock(async () => {
    const fetchMock = mockCalendarWorkspaceFetches();
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: "Calendar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Import events" }));

    expect(await screen.findByRole("dialog", { name: "Import calendar events" })).toBeTruthy();
    expect(screen.getByText(/You're connected. Choose which Google Calendar events Clenella can use./i)).toBeTruthy();
    expect(screen.getByLabelText("From calendar")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Import date range presets" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send selected to Clenella" })).toHaveAttribute("disabled");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/me/calendar/import-candidates?householdId=household-1",
      expect.anything()
    );
  });
});
```

Add the endpoint mocks to `mockCalendarWorkspaceFetches`:

```ts
if (url.endsWith("/api/me/calendar/import-candidates?householdId=household-1") && method === "GET") {
  return { ok: true, json: async () => [] };
}
if (url.endsWith("/api/me/calendar/import-queue") && method === "POST") {
  return { ok: true, json: async () => ({ status: "queued_for_review", items: [] }) };
}
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "Import events"
```

Expected: FAIL because the modal component does not exist.

- [ ] **Step 3: Create CalendarImportModal**

Create `web/src/pages/calendar/CalendarImportModal.tsx` with these required props and behaviors:

```tsx
type CalendarImportModalProps = {
  connections: CalendarConnectionSummary[];
  candidates: CalendarImportCandidate[];
  externalCalendars: ExternalCalendarSummary[];
  isLoading: boolean;
  policy?: CalendarImportPolicy;
  preferences?: CalendarPreferences;
  range: CalendarDateRange;
  selectedSourceCalendarId?: string;
  visibleRange: CalendarDateRange;
  onClose: () => void;
  onLoadCandidates: () => void;
  onRangeChange: (range: CalendarDateRange) => void;
  onSourceCalendarChange: (calendarId: string) => void;
  onSubmit: (events: CalendarImportCandidate[]) => void;
};
```

Implementation requirements:

- Render `role="dialog"` with accessible name `Import calendar events`.
- Call `onLoadCandidates` once when opened.
- Render first-run copy: `You're connected. Choose which Google Calendar events Clenella can use.`
- Render `From calendar` select using `externalCalendars`.
- Render `DateRangePicker` with `label="Import date range"`.
- Render privacy summary from `preferences.defaultDetailLevel`.
- Render batch type toggle with `Commitments` and `Chores`.
- Render candidate checkboxes; none selected by default.
- Apply batch type to selected candidates unless a row override is set.
- Disable `Send selected to Clenella` when no candidates are selected, connection is missing, source calendar is missing, or policy is `off`.

- [ ] **Step 4: Wire import modal in CalendarPage**

Add import state:

```ts
const [importCandidates, setImportCandidates] = useState<CalendarImportCandidate[]>([]);
const [importCandidatesLoading, setImportCandidatesLoading] = useState(false);
const [importRange, setImportRange] = useState<CalendarDateRange>(() => createVisibleRange(format(new Date(), "yyyy-MM-dd"), format(new Date(), "yyyy-MM-dd")));
const [selectedImportSourceCalendarId, setSelectedImportSourceCalendarId] = useState<string>();
```

Add `visibleDateRange`:

```ts
const activeCalendarRange = workspaceView === "list" ? listRange(timeZone) : rangeForView(focusDate, calendarScale, timeZone);
const visibleDateRange = createVisibleRange(activeCalendarRange.startOn, activeCalendarRange.endOn);
```

Add handlers:

```ts
function openImportModal() {
  setImportRange(visibleDateRange);
  setSelectedImportSourceCalendarId(calendarPreferences?.selectedSourceCalendarIds[0]);
  setIsImportModalOpen(true);
}

function loadImportCandidates() {
  if (!selectedHousehold) return;
  setImportCandidatesLoading(true);
  void listCalendarImportCandidates(selectedHousehold.id)
    .then(setImportCandidates)
    .catch(() => setCalendarSyncStatus("Could not load calendar events to review."))
    .finally(() => setImportCandidatesLoading(false));
}

function submitImportEvents(events: CalendarImportCandidate[]) {
  if (!selectedHousehold) return;
  void submitCalendarImportEvents(selectedHousehold.id, events)
    .then((result) => {
      setCalendarSyncStatus(result.status === "auto_ready" ? "Selected events were added to Clenella." : "Selected events were sent to the owner queue.");
      setIsImportModalOpen(false);
      setImportCandidates([]);
    })
    .catch(() => setCalendarSyncStatus("Could not send selected events to Clenella."));
}
```

Change the header `Import events` button to call `openImportModal`.

Render `CalendarImportModal` when `isImportModalOpen` is true.

- [ ] **Step 5: Add import modal styles**

Add CSS classes:

```css
.sync-dialog-backdrop {
  align-items: center;
  background: rgba(7, 47, 64, 0.22);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 24px;
  position: fixed;
  z-index: 40;
}

.sync-dialog {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: -8px 8px 0 rgba(21, 94, 117, 0.2);
  display: grid;
  gap: 16px;
  max-height: min(820px, calc(100vh - 48px));
  overflow: auto;
  padding: 22px;
  width: min(760px, calc(100vw - 48px));
}

.sync-first-run,
.sync-blocked-state,
.sync-privacy-summary {
  background: var(--color-primary-soft);
  border-left: 4px solid var(--color-primary);
  margin: 0;
  padding: 12px;
}

.sync-session-controls,
.sync-batch-toggle,
.sync-dialog-actions {
  display: grid;
  gap: 12px;
}

@media (max-width: 720px) {
  .sync-dialog-backdrop {
    align-items: flex-end;
    padding: 0;
  }

  .sync-dialog {
    max-height: 92vh;
    width: 100%;
  }
}
```

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "Import events"
```

Expected: PASS.

Commit:

```powershell
git add web/src/pages/calendar/CalendarImportModal.tsx web/src/pages/CalendarPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "feat: add calendar import modal"
```

---

### Task 5: Export Selection Mode

**Files:**
- Create: `web/src/pages/calendar/CalendarExportPanel.tsx`
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add export mode test**

At the top of `web/src/App.test.tsx`, include `CleanlyCalendarEvent` in the shared type import:

```ts
CleanlyCalendarEvent,
```

Add this test:

```tsx
it("starts export mode with no selected events and supports selecting eligible range events", async () => {
  await withMay2026CalendarClock(async () => {
    vi.stubGlobal("fetch", mockCalendarWorkspaceFetches({ cleanlyCalendarEvents: [{
      id: "cleanly-event-1",
      householdId: "household-1",
      title: "Kitchen reset",
      type: "chore",
      startsAt: "2026-05-28T14:00:00.000Z",
      endsAt: "2026-05-28T14:30:00.000Z",
      source: "cleanly",
      status: "active"
    }, {
      id: "cleanly-event-2",
      householdId: "household-1",
      title: "Practice",
      type: "commitment",
      startsAt: "2026-05-29T21:30:00.000Z",
      endsAt: "2026-05-29T22:30:00.000Z",
      source: "google",
      status: "active"
    }] }));
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: "Calendar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Export" }));

    expect(await screen.findByRole("region", { name: "Exporting Clenella events" })).toBeTruthy();
    expect(screen.getByText(/0 selected/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export selected" })).toHaveAttribute("disabled");

    fireEvent.click(screen.getByRole("button", { name: /Select 2 eligible events/i }));
    expect(screen.getByText(/2 selected/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Deselect Kitchen reset/i }));
    expect(screen.getByText(/1 selected/i)).toBeTruthy();
  });
});
```

Update `mockCalendarWorkspaceFetches` signature:

```ts
function mockCalendarWorkspaceFetches({
  frequency = "weekly",
  importQueueMode = "manual",
  cleanlyCalendarEvents = []
}: {
  frequency?: "daily" | "weekly" | "monthly" | "yearly";
  importQueueMode?: "off" | "manual" | "auto";
  cleanlyCalendarEvents?: CleanlyCalendarEvent[];
} = {}) {
```

Return `cleanlyCalendarEvents` from the `/calendar/events?` branch.

- [ ] **Step 2: Run failing test**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "export mode"
```

Expected: FAIL because export selection mode is not implemented.

- [ ] **Step 3: Create CalendarExportPanel**

Create `web/src/pages/calendar/CalendarExportPanel.tsx` with these props:

```tsx
type CalendarExportPanelProps = {
  eligibleEvents: CleanlyCalendarEvent[];
  externalCalendars: ExternalCalendarSummary[];
  preferences?: CalendarPreferences;
  range: CalendarDateRange;
  rangePreset: CalendarDateRangePreset;
  selectedEventIds: string[];
  visibleRange: CalendarDateRange;
  onCancel: () => void;
  onClearSelection: () => void;
  onExport: () => void;
  onRangeChange: (range: CalendarDateRange) => void;
  onRangePresetChange: (preset: CalendarDateRangePreset, range: CalendarDateRange) => void;
  onSelectEligible: () => void;
};
```

Implementation requirements:

- Render `<aside className="calendar-export-panel" aria-label="Exporting Clenella events">`.
- Show `From Clenella`, `To calendar`, and `DateRangePicker`.
- Disable export if no destination calendar is configured.
- Render helper button text as `Select ${eligibleEvents.length} eligible event(s)`.
- Render summary text including selected count, chore count, commitment count, and destination.
- Render `Export selected`, `Clear selection`, and `Cancel export`.

- [ ] **Step 4: Wire export mode in CalendarPage**

Add state:

```ts
const [exportRange, setExportRange] = useState<CalendarDateRange>(() => createVisibleRange(format(new Date(), "yyyy-MM-dd"), format(new Date(), "yyyy-MM-dd")));
const [exportRangePreset, setExportRangePreset] = useState<CalendarDateRangePreset>("visible");
const [selectedExportEventIds, setSelectedExportEventIds] = useState<string[]>([]);
```

Add eligible-event derivation:

```ts
const eligibleExportEvents = cleanlyCalendarEvents.filter((event) => {
  const eventDate = formatInTimeZone(event.startsAt, timeZone, "yyyy-MM-dd");
  const contentMode = calendarPreferences?.exportContentMode ?? "chores";
  const contentAllowed = contentMode === "both" || event.type === contentMode.slice(0, -1);
  return event.status === "active" && isDateInRange(eventDate, exportRange) && contentAllowed;
});
```

Add handlers:

```ts
function startExportMode() {
  setExportRange(visibleDateRange);
  setExportRangePreset("visible");
  setSelectedExportEventIds([]);
  setIsExportMode(true);
}

function exitExportMode() {
  setIsExportMode(false);
  setSelectedExportEventIds([]);
}

function toggleExportEvent(eventId: string) {
  if (!isExportMode) return;
  setSelectedExportEventIds((current) =>
    current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId]
  );
}

function selectEligibleExportEvents() {
  setSelectedExportEventIds(eligibleExportEvents.map((event) => event.id));
}

function handleExportSelectedEvents() {
  if (!selectedHousehold) return;
  void exportCleanlyCalendarEvents(selectedHousehold.id, selectedExportEventIds)
    .then((result) => {
      setCalendarSyncStatus(`${result.exported} calendar event${result.exported === 1 ? "" : "s"} exported.`);
      exitExportMode();
    })
    .catch(() => setCalendarSyncStatus("Could not export calendar events. Choose an export destination in Settings first."));
}
```

Change `Export` button to call `startExportMode`.

- [ ] **Step 5: Make Clenella calendar event cards selectable**

In `renderCleanlyCalendarEvent`, when `isExportMode` is true, return a button:

```tsx
if (isExportMode) {
  const isSelectedForExport = selectedExportEventIds.includes(event.id);
  const isEligibleForExport = eligibleExportEvents.some((eligibleEvent) => eligibleEvent.id === event.id);
  return (
    <button
      aria-pressed={isSelectedForExport}
      aria-label={`${isSelectedForExport ? "Deselect" : "Select"} ${event.title}`}
      className={`calendar-work-item is-${event.type} is-export-selectable ${isSelectedForExport ? "is-selected-for-export" : ""} ${!isEligibleForExport ? "is-export-muted" : ""}`}
      disabled={!isEligibleForExport}
      key={event.id}
      onClick={() => toggleExportEvent(event.id)}
      type="button"
    >
      <strong>{event.title}</strong>
      {!compact ? <span>{formatInTimeZone(event.startsAt, timeZone, "h:mm a")}</span> : null}
    </button>
  );
}
```

- [ ] **Step 6: Render export banner and panel**

After `renderCalendarImportQueue()`:

```tsx
{isExportMode ? (
  <section className="calendar-export-mode-banner" role="status">
    <span>Export mode: choose a range, select eligible events, then export to your calendar.</span>
    <button className="section-action" onClick={exitExportMode} type="button">Exit export mode</button>
  </section>
) : null}
```

Render `CalendarExportPanel` inside the calendar workspace panel when `isExportMode` is true. Pass all props listed in Step 3.

- [ ] **Step 7: Add export mode styles**

Add:

```css
.calendar-export-mode-banner {
  align-items: center;
  background: #fff8dc;
  border: 1px solid #ead386;
  color: #665000;
  display: flex;
  font-weight: 850;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 12px 14px;
}

.calendar-export-layout {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1fr) 360px;
}

.calendar-export-panel {
  align-self: start;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: -6px 6px 0 rgba(21, 94, 117, 0.16);
  position: sticky;
  top: 18px;
}

.calendar-export-panel-body,
.calendar-export-actions {
  display: grid;
  gap: 12px;
}

.calendar-export-summary {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.calendar-work-item.is-export-selectable {
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.calendar-work-item.is-selected-for-export {
  outline: 3px solid rgba(21, 94, 117, 0.26);
  outline-offset: 2px;
}

.calendar-work-item.is-export-muted {
  opacity: 0.45;
}

@media (max-width: 900px) {
  .calendar-export-layout {
    display: block;
  }

  .calendar-export-panel {
    bottom: 0;
    left: 0;
    max-height: 72vh;
    overflow: auto;
    position: fixed;
    right: 0;
    top: auto;
    z-index: 35;
  }
}
```

- [ ] **Step 8: Verify and commit**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "export mode"
```

Expected: PASS.

Commit:

```powershell
git add web/src/pages/calendar/CalendarExportPanel.tsx web/src/pages/CalendarPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "feat: add calendar export selection mode"
```

---

### Task 6: Regression and Browser Verification

**Files:**
- Verify: `web/src/App.css`
- Verify: `web/src/pages/CalendarPage.tsx`
- Verify: `web/src/pages/calendar/CalendarImportModal.tsx`
- Verify: `web/src/pages/calendar/CalendarExportPanel.tsx`
- Verify: `web/src/pages/calendar/DateRangePicker.tsx`

- [ ] **Step 1: Run focused regression tests**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "Calendar|Settings"
```

Expected: PASS.

- [ ] **Step 2: Run web build**

Run:

```powershell
npm.cmd run build -w web
```

Expected: PASS.

- [ ] **Step 3: Browser verification**

Open the local app Calendar page with browser-use or the in-app browser:

```powershell
& $env:USERPROFILE\.local\bin\browser-use.exe open http://127.0.0.1:5174/calendar
```

If Vite is on another port, use the active Vite port.

Verify:

- Calendar header shows `Import events`, `Export`, `Add chore`.
- Settings no longer shows `Review events to share`.
- `Import events` opens `Import calendar events`.
- Import date range opens a calendar range picker.
- `Export` enters `Exporting Clenella events` mode.
- Export starts with `0 selected`.
- Batch select chooses eligible events when available.
- Individual calendar event cards can be deselected.
- `Exit export mode` returns to normal Calendar.

- [ ] **Step 4: Mobile verification**

At a mobile viewport:

- Import dialog behaves as a sheet or near-full-screen dialog.
- Date range picker is usable without horizontal scroll.
- Export panel behaves as a bottom sheet.
- Event cards remain tappable in export mode.

- [ ] **Step 5: Final polish commit if needed**

If browser verification required CSS or markup changes:

```powershell
git add web/src/App.css web/src/pages/CalendarPage.tsx web/src/pages/calendar
git commit -m "style: polish calendar sync action flows"
```

If no changes were required, do not create an empty commit.

---

## Final Verification Commands

```powershell
npm.cmd run test -w web -- App.test.tsx -t "Calendar|Settings"
npm.cmd run build -w web
```

## Implementation Notes

- Keep backend routes unchanged. If server-side date range filtering or source calendar filtering is required, create a separate backend plan.
- Do not reintroduce `Review events to share` in Settings.
- Export starts with nothing selected.
- Import candidates start with nothing selected.
- The richer DayPicker popover satisfies the intended start-date then end-date interaction.
