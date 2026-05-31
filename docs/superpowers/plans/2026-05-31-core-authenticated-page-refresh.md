# Core Authenticated Page Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Today dashboard design language to Calendar, Households, and Family, and refresh Optimize into a stronger assistant workspace.

**Architecture:** Keep the existing React page components and API calls. Add a small CSS token layer in `App.css`, update page markup section-by-section, and lock behavior with Testing Library tests before visual implementation. Calendar behavior remains Calendar-owned; Households, Family, and Optimize keep their current data flows while receiving new page structures and class names.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, existing local SVG icons in `web/src/components/AppIcons.tsx`, existing CSS in `web/src/App.css`.

---

## File Structure

- Modify `web/src/App.css`: define blue-teal primary visual tokens, reuse the Today shell system, add refreshed Calendar/Households/Family/Optimize layout styles, and keep green completion styles.
- Modify `web/src/App.test.tsx`: add behavior and structure tests for full month Calendar rendering, completed chore ordering, page refresh landmarks, and Optimize assistant-workspace content.
- Modify `web/src/pages/CalendarPage.tsx`: refresh header/control layout, preserve full month/week/day/list behavior, and make completed chore indicators smaller and height-neutral.
- Modify `web/src/pages/HouseholdsPage.tsx`: add operational summary sections around existing household/floor/room management.
- Modify `web/src/pages/FamilyPage.tsx`: add collaboration summary sections around existing member/invite management.
- Modify `web/src/pages/OptimizePage.tsx`: restructure as prompt-first assistant workspace while retaining recommendations and chat flows.
- Keep `web/public/core-refresh-mockups/`: committed visual reference pages for Calendar, Households, Family, and Optimize.

## Task 1: Lock Calendar Month And Completion Behavior

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify later: `web/src/pages/CalendarPage.tsx`
- Modify later: `web/src/App.css`

- [ ] **Step 1: Add a full-month Calendar test**

Add this test near the existing Calendar month/week/day tests in `web/src/App.test.tsx`:

```tsx
it("keeps Calendar month view as a full month grid after the visual refresh", async () => {
  vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
  renderAt("/calendar");

  expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Calendar" }));
  fireEvent.click(screen.getByRole("button", { name: "Month" }));

  const monthGrid = screen.getByRole("grid", { name: /month calendar/i });
  const dayCells = within(monthGrid).getAllByRole("gridcell");

  expect(dayCells.length).toBeGreaterThanOrEqual(35);
  expect(within(monthGrid).getByText("1")).toBeTruthy();
  expect(within(monthGrid).getByText("31")).toBeTruthy();
});
```

- [ ] **Step 2: Add a completed-at-bottom test**

Add this test near the Calendar completion tests:

```tsx
it("renders completed Calendar chores after incomplete chores in each day group", async () => {
  vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
  renderAt("/calendar");

  expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
  const dayCell = await screen.findByRole("gridcell", { name: /Sat, May 30/i });
  const rows = within(dayCell).getAllByRole("button", { name: /View / });

  const firstCompletedIndex = rows.findIndex((row) => row.classList.contains("is-completed"));
  const lastOpenIndex = rows.findLastIndex((row) => !row.classList.contains("is-completed"));

  expect(firstCompletedIndex).toBeGreaterThan(lastOpenIndex);
});
```

- [ ] **Step 3: Add a height-neutral completed row assertion**

Add this test to protect against large completed check icons:

```tsx
it("uses the compact completed status marker class for completed Calendar rows", async () => {
  vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
  renderAt("/calendar");

  const completedButton = await screen.findByRole("button", { name: /View Pet cats/i });
  expect(completedButton.classList.contains("is-completed")).toBe(true);
  expect(completedButton.querySelector(".calendar-status-icon")).toBeTruthy();
});
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx -t "Calendar"
```

Expected: at least one failure if the current month grid has no `grid`/`gridcell` semantics or completed rows lack `.calendar-status-icon`.

## Task 2: Add Shared Visual Tokens And Completion Marker Styles

**Files:**
- Modify: `web/src/App.css`

- [ ] **Step 1: Add CSS custom properties near the top of `App.css`**

Add or update the root token block:

```css
:root {
  --color-primary: #155e75;
  --color-primary-strong: #0f4c66;
  --color-primary-soft: #e4f1f6;
  --color-done: #5f9d6d;
  --color-done-strong: #2f694d;
  --color-surface: #fffdf8;
  --color-surface-muted: #f5f2eb;
  --color-border: #e4dacd;
}
```

- [ ] **Step 2: Shift primary app chrome from green to blue-teal**

Update primary-action selectors to use `--color-primary` and `--color-primary-strong`, including:

```css
.workspace-nav .is-primary-nav-action,
.calendar-view-toggle button[aria-pressed="true"],
.section-action,
button:not(.link-button) {
  background: var(--color-primary);
}

.workspace-nav a[aria-current="page"],
.workspace-nav a:hover {
  border-bottom-color: var(--color-primary);
  color: var(--color-primary);
}
```

Keep completion selectors green:

```css
.today-chore-row.is-completed .today-chore-status,
.calendar-event.is-completed .calendar-status-icon,
.calendar-chore-row.is-completed .calendar-status-icon {
  background: var(--color-done);
}
```

- [ ] **Step 3: Add compact status icon styles**

Add:

```css
.calendar-status-icon,
.today-chore-status {
  align-items: center;
  border-radius: 999px;
  display: inline-flex;
  flex: 0 0 20px;
  font-size: 0.68rem;
  font-weight: 950;
  height: 20px;
  justify-content: center;
  width: 20px;
}

.calendar-event-compact .calendar-status-icon {
  flex-basis: 16px;
  font-size: 0.62rem;
  height: 16px;
  width: 16px;
}
```

- [ ] **Step 4: Run CSS-sensitive smoke checks**

Run:

```bash
npm.cmd run build -w web
```

Expected: PASS.

## Task 3: Refresh Calendar Layout Without Losing Calendar Power

**Files:**
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add grid semantics to month view**

In `CalendarPage.tsx`, make the month grid container and cells accessible:

```tsx
<div className="calendar-month-grid" role="grid" aria-label={`${rangeLabel} month calendar`}>
  {monthDates.map((date) => (
    <article
      aria-label={format(date, "EEE, MMM d")}
      className={...}
      key={format(date, "yyyy-MM-dd")}
      role="gridcell"
    >
      ...
    </article>
  ))}
</div>
```

- [ ] **Step 2: Preserve full month date generation**

Keep the month renderer based on the full month interval plus outside-month leading/trailing dates. Do not replace it with the visible week. If the current renderer only uses `eachDayOfInterval({ start: startOfMonth(...), end: endOfMonth(...) })`, extend it to render a complete Sunday-start grid:

```tsx
const monthStart = startOfWeek(startOfMonth(anchorDate), { weekStartsOn: 0 });
const monthEnd = endOfWeek(endOfMonth(anchorDate), { weekStartsOn: 0 });
const monthDates = eachDayOfInterval({ start: monthStart, end: monthEnd });
```

- [ ] **Step 3: Ensure completed chores sort after open chores everywhere**

Use the existing pattern where possible:

```tsx
const completedOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status === "completed");
const activeOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status !== "completed");
const orderedOccurrences = [...activeOccurrences, ...completedOccurrences];
```

Apply this order to:
- Month day cells.
- Week flexible row.
- Week timed slots.
- Day flexible row.
- Day timed slots.
- List/agenda rows.

- [ ] **Step 4: Render compact completed status icons**

In `renderOccurrenceCompact` and the list row renderer, replace any large completed-only affordance with:

```tsx
{occurrence.status === "completed" ? (
  <span className="calendar-status-icon" aria-hidden="true">✓</span>
) : null}
```

For planned chores, keep the existing complete action button if present. The compact check icon is only the status marker for already-completed chores.

- [ ] **Step 5: Apply the Today shell visual language**

Update Calendar markup toward:

```tsx
<div className="calendar-page operational-page">
  <header className="page-command-header">
    <div>
      <h1>Calendar</h1>
      <div className="command-metrics">...</div>
    </div>
    <button type="button">Add chore</button>
  </header>
  ...
</div>
```

Keep the existing `Calendar`, `List`, `Month`, `Week`, `Day`, filter, and Google Calendar setup controls.

- [ ] **Step 6: Run Calendar tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx -t "Calendar"
```

Expected: PASS.

- [ ] **Step 7: Commit Calendar refresh**

Run:

```bash
git add web/src/pages/CalendarPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Refresh Calendar workspace styling"
```

## Task 4: Refresh Households Into A Property Dashboard

**Files:**
- Modify: `web/src/pages/HouseholdsPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add Households structure tests**

Add:

```tsx
it("renders Households as a property dashboard", async () => {
  mockHouseholdsPageFetches();
  renderAt("/households");

  expect(await screen.findByRole("heading", { name: "Households", level: 1 })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Household overview" })).toBeTruthy();
  expect(screen.getByText(/setup quality/i)).toBeTruthy();
  expect(screen.getByText(/floors/i)).toBeTruthy();
});
```

- [ ] **Step 2: Add dashboard summary helpers**

In `HouseholdsPage.tsx`, add small helpers above `HouseholdsPage`:

```tsx
function roomCount(household: HouseholdAppData) {
  return household.structure.floors.reduce((total, floor) => total + floor.rooms.length, 0);
}

function setupQualityLabel(household: HouseholdAppData) {
  const floors = household.structure.floors.length;
  const rooms = roomCount(household);
  if (floors > 0 && rooms > 0) return "Profile healthy";
  if (floors > 0) return "Rooms need detail";
  return "Setup needed";
}
```

- [ ] **Step 3: Replace the hero with operational page header and summary region**

Use:

```tsx
<header className="page-command-header">
  <div>
    <p className="eyebrow">Home model</p>
    <h1>Households</h1>
    <p className="lede">Manage floors, rooms, surfaces, pet impact, and cleaning coverage.</p>
  </div>
  <button disabled={isAddingHousehold} onClick={handleAddHousehold} type="button">
    Add household
  </button>
</header>

<section className="dashboard-section property-overview" aria-label="Household overview">
  ...
</section>
```

Keep the existing `HouseholdEditor` and all save/edit behavior.

- [ ] **Step 4: Style property dashboard sections**

Add CSS for:

```css
.operational-page,
.property-overview,
.household-editor-shell,
.household-health-grid {
  ...
}
```

Follow the mockup: concise metric tiles, floor selector still prominent, no nested decorative cards.

- [ ] **Step 5: Run Households tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx -t "Households"
```

Expected: PASS.

- [ ] **Step 6: Commit Households refresh**

Run:

```bash
git add web/src/pages/HouseholdsPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Refresh Households dashboard styling"
```

## Task 5: Refresh Family Into A Collaboration Hub

**Files:**
- Modify: `web/src/pages/FamilyPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add Family structure tests**

Add:

```tsx
it("renders Family as a collaboration hub", async () => {
  const fetchMock = mockFamilyPageFetches();
  vi.stubGlobal("fetch", fetchMock);
  renderAt("/family");

  expect(await screen.findByRole("heading", { name: "Family" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Household collaboration" })).toBeTruthy();
  expect(screen.getByText(/members/i)).toBeTruthy();
  expect(screen.getByText(/pending invitations/i)).toBeTruthy();
});
```

- [ ] **Step 2: Add page-level collaboration summary**

In `FamilyPage.tsx`, replace the large hero with:

```tsx
<header className="page-command-header">
  <div>
    <p className="eyebrow">Collaboration</p>
    <h1>Family</h1>
    <p className="lede">Invite household members and coordinate shared chore ownership.</p>
  </div>
</header>
```

Wrap the household list:

```tsx
<section className="family-collaboration-shell" aria-label="Household collaboration">
  <div className="family-household-list">...</div>
</section>
```

- [ ] **Step 3: Update `FamilyHouseholdPanel` presentation**

Keep existing forms and owner permission behavior, but organize panel content into:
- Member cards.
- Pending invitation rows.
- Owner-only invite controls.
- Role/remove actions in compact row controls.

Use existing data:

```tsx
const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");
```

- [ ] **Step 4: Add Family CSS**

Add styles for:

```css
.family-collaboration-shell,
.family-member-grid,
.family-member-card,
.family-invite-row {
  ...
}
```

Use blue-teal for actions, green only for successful/done state markers.

- [ ] **Step 5: Run Family tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx -t "Family"
```

Expected: PASS.

- [ ] **Step 6: Commit Family refresh**

Run:

```bash
git add web/src/pages/FamilyPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Refresh Family collaboration styling"
```

## Task 6: Refresh Optimize As The Assistant Workspace

**Files:**
- Modify: `web/src/pages/OptimizePage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add Optimize assistant workspace tests**

Add:

```tsx
it("renders Optimize as a prompt-first assistant workspace", async () => {
  restoreHouseholdInStorage();
  mockRestoredHouseholdFetches();
  renderAt("/optimize");

  await waitFor(() => expect(screen.getByRole("heading", { name: "Optimize" })).toBeTruthy());
  expect(screen.getByRole("region", { name: "Assistant workspace" })).toBeTruthy();
  expect(screen.getByText(/What should we improve/i)).toBeTruthy();
  expect(screen.getByText(/Ready to review/i)).toBeTruthy();
});
```

- [ ] **Step 2: Add assistant-first page header**

In `OptimizePage.tsx`, replace the current compact hero with:

```tsx
<header className="optimize-command-panel" aria-label="Assistant workspace">
  <div>
    <p className="eyebrow">Optimize</p>
    <h1>What should we improve around the house?</h1>
    <p className="lede">
      Ask Cleanly to inspect chores, timing, workload, and household gaps before approving changes.
    </p>
  </div>
</header>
```

- [ ] **Step 3: Restructure each household Optimize panel**

Keep existing `mode`, `reviewStep`, selected chores, recommendations, chat messages, and API calls. Reframe the markup into:
- Assistant prompt panel.
- Ready-to-review recommendations.
- Household signals/context.
- Existing recommendations/chat controls.

Use existing data:

```tsx
const appliedRecommendations = existingRecommendations.filter((recommendation) => recommendation.decision === "applied");
const pendingRecommendations = existingRecommendations.filter((recommendation) => recommendation.decision !== "applied");
```

- [ ] **Step 4: Preserve the existing recommendation flow**

Verify these still work:
- Generate recommendations.
- Select chores.
- Accept/reject recommendations.
- Apply decisions.
- Ask assistant chat prompts.
- Keep chat messages visible on failure.

- [ ] **Step 5: Add Optimize CSS**

Add:

```css
.optimize-command-panel,
.optimize-assistant-layout,
.assistant-prompt-panel,
.recommendation-review-queue,
.household-signal-grid {
  ...
}
```

Use deep blue-teal for the assistant panel, not green. Green remains only for applied/completed success markers.

- [ ] **Step 6: Run Optimize tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx -t "Optimize"
```

Expected: PASS.

- [ ] **Step 7: Commit Optimize refresh**

Run:

```bash
git add web/src/pages/OptimizePage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Refresh Optimize assistant workspace"
```

## Task 7: Browser Review And Responsive Polish

**Files:**
- Modify as needed: `web/src/App.css`
- Modify as needed: page files touched above

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm.cmd run test -w web
npm.cmd run build -w web
```

Expected: both PASS.

- [ ] **Step 2: Start or reuse the dev server**

Run if needed:

```bash
npm.cmd run dev -w web
```

Expected: Vite serves the app at `http://localhost:5173/`.

- [ ] **Step 3: Review desktop pages**

Open and inspect:
- `http://localhost:5173/calendar`
- `http://localhost:5173/households`
- `http://localhost:5173/family`
- `http://localhost:5173/optimize`

Check:
- Header width matches page content width.
- Blue-teal primary actions are consistent.
- Green only denotes completed/applied/success states.
- Calendar month view shows a full month.
- Completed chores appear below incomplete chores.

- [ ] **Step 4: Review mobile by resizing the browser window**

Resize the same browser window to a narrow mobile width. Check:
- Top navigation remains usable.
- Primary actions fit without text overlap.
- Calendar controls remain reachable.
- Month view does not collapse into a misleading single-week-only display.
- Completed chore rows are not taller than incomplete rows.
- Households and Family stack primary content before secondary panels.
- Optimize prompt panel appears before review queue and signals.

- [ ] **Step 5: Final polish commit**

If responsive-only adjustments were needed, commit them:

```bash
git add web/src/App.css web/src/pages/CalendarPage.tsx web/src/pages/HouseholdsPage.tsx web/src/pages/FamilyPage.tsx web/src/pages/OptimizePage.tsx web/src/App.test.tsx
git commit -m "Polish core page refresh responsiveness"
```

## Self-Review Notes

- Spec coverage: Calendar, Households, Family, Optimize, desktop/mobile behavior, blue-teal primary color, green completion color, full month rendering, and completed-at-bottom ordering are covered.
- Placeholder scan: no unresolved placeholder language remains.
- Type consistency: plan uses existing page component names and existing shared domain types.
