# Home Navigation + Today Operating Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revamp authenticated navigation and Today into an operational chore dashboard, add optional post-completion feedback, move Google Calendar setup to Calendar, and start the core authenticated UI refresh.

**Architecture:** Keep the current React/Vite + Express API structure. Today will load one seven-day occurrence range per household, merge results client-side by default, and reuse existing occurrence completion APIs plus one new check-in update endpoint. The first UI refresh pass should be shared CSS and page-level layout polish rather than a wholesale component-system rewrite.

**Tech Stack:** React, TypeScript, Vite, Express, Zod, Prisma/in-memory store abstractions, Vitest, Testing Library, existing CSS.

---

## File Structure

- Modify `web/src/App.tsx`: reorder nav, add an emphasized Optimize nav class, keep `/` routing to Today.
- Modify `web/src/pages/TodayDashboard.tsx`: replace household-summary-only page with the calendar-strip operating dashboard.
- Modify `web/src/pages/CalendarPage.tsx`: add Google Calendar setup/import CTA that navigates to `/settings#calendar`.
- Modify `web/src/api.ts`: add `updateCompletionCheckIn`.
- Modify `server/src/routes/households.ts`: add `PUT /api/households/:householdId/occurrences/:occurrenceId/check-in`.
- Modify `server/src/repositories/inMemoryStore.ts` and `server/src/repositories/prismaStore.ts`: reuse existing `recordCompletionCheckIn` behavior for post-completion updates.
- Modify `web/src/App.css`: authenticated nav emphasis, Today dashboard layout, toast/modal, and core authenticated page visual refresh.
- Modify `web/src/App.test.tsx`: nav, Today, Calendar CTA, and UI behavior tests.
- Modify server tests, likely `server/test/schedules.test.ts`: check-in update endpoint coverage.

---

## Task 1: Header Navigation Emphasis

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing nav tests**

Add/replace assertions in the existing primary navigation test:

```ts
const nav = screen.getByRole("navigation", { name: "Primary" });
const links = within(nav).getAllByRole("link");
expect(links.map((link) => link.textContent)).toEqual(["Optimize", "Today", "Calendar", "Households", "Family", "Settings"]);
expect(within(nav).getByRole("link", { name: "Optimize" }).classList.contains("is-primary-nav-action")).toBe(true);
```

Keep the existing signed-in root test and add:

```ts
renderAt("/");
await waitFor(() => expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy());
expect(window.location.pathname).toBe("/");
```

- [ ] **Step 2: Run the failing web test**

Run: `npm.cmd test -- src/App.test.tsx`

Expected: FAIL because Optimize is not first and has no emphasis class.

- [ ] **Step 3: Implement nav order and class**

In `AppShell`, change nav items to:

```ts
const navItems = [
  { label: "Optimize", path: "/optimize", emphasis: true },
  { label: "Today", path: "/today" },
  { label: "Calendar", path: "/calendar" },
  { label: "Households", path: "/households" },
  { label: "Family", path: "/family" },
  { label: "Settings", path: "/settings" }
];
```

Add class composition on each anchor:

```tsx
className={item.emphasis ? "is-primary-nav-action" : undefined}
```

Add CSS:

```css
.workspace-nav .is-primary-nav-action {
  background: #2f694d;
  color: #fff;
  box-shadow: 0 0 0 3px #d7e4d5;
}

.workspace-nav .is-primary-nav-action[aria-current="page"] {
  background: #24543d;
  color: #fff;
}
```

- [ ] **Step 4: Verify**

Run: `npm.cmd test -- src/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/App.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Emphasize Optimize in navigation"
```

---

## Task 2: Backend Check-In Update Endpoint

**Files:**
- Modify: `server/src/routes/households.ts`
- Test: `server/test/schedules.test.ts`
- No shared type change required; reuse `CompletionCheckInInput`.

- [ ] **Step 1: Write failing server test**

Add a test that completes an occurrence, then updates check-in details:

```ts
const complete = await request(app)
  .post(`/api/households/${householdId}/occurrences/${occurrenceId}/complete`)
  .set(authHeaderForAssignedUser)
  .send({});
expect(complete.status).toBe(200);

const update = await request(app)
  .put(`/api/households/${householdId}/occurrences/${occurrenceId}/check-in`)
  .set(authHeaderForAssignedUser)
  .send({ completedOnTime: false, durationAccurate: false, rebaseFutureOccurrences: false });

expect(update.status).toBe(200);
expect(update.body.completedOnTime).toBe(false);
expect(update.body.durationAccurate).toBe(false);
expect(update.body.rebaseFutureOccurrences).toBe(false);
```

Also add a 403 assertion for another household member/user:

```ts
const forbidden = await request(app)
  .put(`/api/households/${householdId}/occurrences/${occurrenceId}/check-in`)
  .set(authHeaderForDifferentUser)
  .send({ completedOnTime: false });
expect(forbidden.status).toBe(403);
```

- [ ] **Step 2: Run failing server tests**

Run: `npm.cmd test -w server -- schedules.test.ts`

Expected: FAIL with route not found.

- [ ] **Step 3: Implement endpoint**

Add this route after the completion route:

```ts
router.put("/:householdId/occurrences/:occurrenceId/check-in", async (req, res) => {
  const access = await requireHouseholdAccess(req, res);
  if (!access) return;

  const parsed = completionCheckInSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid completion payload" });

  const occurrence = await store.getOccurrence(access.household.id, req.params.occurrenceId);
  if (!occurrence) return res.status(404).json({ error: "Occurrence not found" });
  if (occurrence.status !== "completed" || !occurrence.completedAt || !occurrence.completedByUserId) {
    return res.status(409).json({ error: "Occurrence is not completed" });
  }
  if (occurrence.completedByUserId !== access.user.id) {
    return res.status(403).json({ error: "Only the completing member can update this check-in" });
  }

  const checkIn = normalizeCompletionCheckIn(parsed.data);
  const saved = await store.recordCompletionCheckIn({
    householdId: access.household.id,
    occurrenceId: occurrence.id,
    completedByUserId: access.user.id,
    completedAt: occurrence.completedAt,
    ...checkIn
  });

  return res.status(200).json(saved);
});
```

- [ ] **Step 4: Verify server tests**

Run: `npm.cmd test -w server -- schedules.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/households.ts server/test/schedules.test.ts
git commit -m "Add completion check-in update endpoint"
```

---

## Task 3: Today Dashboard Data Loading And API Client

**Files:**
- Modify: `web/src/api.ts`
- Modify: `web/src/pages/TodayDashboard.tsx`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing Today data tests**

Add a Today test with two households. Mock:

- `/api/me`
- `/api/households`
- `/api/households/:id/members`
- `/api/households/:id/occurrences?...`

Assert:

```ts
expect(await screen.findByRole("heading", { name: "Today" })).toBeTruthy();
expect(screen.getByRole("region", { name: "Seven day chore strip" })).toBeTruthy();
expect(screen.getByRole("region", { name: "Selected day chores" })).toBeTruthy();
expect(screen.getByRole("button", { name: "Merged" }).getAttribute("aria-pressed")).toBe("true");
expect(screen.getByRole("button", { name: "By household" })).toBeTruthy();
expect(screen.getByText("Home")).toBeTruthy();
expect(screen.getByText("Cabin")).toBeTruthy();
expect(screen.getByText("Upcoming next 7 days")).toBeTruthy();
```

Assert each household occurrence endpoint receives a 7-day range starting on the mocked current date.

- [ ] **Step 2: Run failing test**

Run: `npm.cmd test -- src/App.test.tsx`

Expected: FAIL because Today does not fetch occurrences/members or render dashboard widgets.

- [ ] **Step 3: Add API client for check-in updates**

In `web/src/api.ts`:

```ts
export async function updateCompletionCheckIn(
  householdId: string,
  occurrenceId: string,
  checkIn: CompletionCheckInInput
): Promise<ChoreCompletionCheckIn> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/occurrences/${occurrenceId}/check-in`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkIn)
    }
  );

  if (!response.ok) throw new Error("Failed to update completion check-in");
  return response.json();
}
```

Also import `ChoreCompletionCheckIn` at the top.

- [ ] **Step 4: Implement Today data model**

In `TodayDashboard.tsx`, import:

```ts
import { addDays, format, isSameDay, parseISO, startOfDay } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { ChoreOccurrence, CompletionCheckInInput, HouseholdMemberSummary } from "@chore-helper/shared";
import { completeOccurrence, getCurrentUser, listHouseholdMembers, listOccurrences, updateCompletionCheckIn } from "../api";
```

Add local state:

```ts
type TodayViewMode = "merged" | "grouped";
type TodayStatus = "idle" | "loading" | "ready" | "error";
type TodayOccurrenceRow = {
  occurrence: ChoreOccurrence;
  household: HouseholdAppData;
  title: string;
  assigneeLabel: string;
};

const [selectedDateKey, setSelectedDateKey] = useState(() => format(new Date(), "yyyy-MM-dd"));
const [viewMode, setViewMode] = useState<TodayViewMode>("merged");
const [currentUserId, setCurrentUserId] = useState<string>();
const [membersByHousehold, setMembersByHousehold] = useState<Record<string, HouseholdMemberSummary[]>>({});
const [occurrencesByHousehold, setOccurrencesByHousehold] = useState<Record<string, ChoreOccurrence[]>>({});
const [todayStatus, setTodayStatus] = useState<TodayStatus>("idle");
const [toast, setToast] = useState<{ occurrenceId: string; title: string }>();
const [checkInTarget, setCheckInTarget] = useState<TodayOccurrenceRow>();
const [checkInDraft, setCheckInDraft] = useState<Required<Pick<CompletionCheckInInput, "completedOnTime" | "durationAccurate" | "rebaseFutureOccurrences">>>({
  completedOnTime: true,
  durationAccurate: true,
  rebaseFutureOccurrences: false
});
```

Load data when households are available:

```ts
useEffect(() => {
  if (!households.length) return;
  let cancelled = false;
  const start = startOfDay(new Date());
  const end = addDays(start, 6);

  async function loadTodayData() {
    setTodayStatus("loading");
    try {
      const user = await getCurrentUser();
      const entries = await Promise.all(households.map(async (household) => {
        const range = {
          startAt: fromZonedTime(format(start, "yyyy-MM-dd'T'00:00:00"), household.timeZone).toISOString(),
          endAt: fromZonedTime(format(end, "yyyy-MM-dd'T'23:59:59"), household.timeZone).toISOString(),
          startOn: format(start, "yyyy-MM-dd"),
          endOn: format(end, "yyyy-MM-dd")
        };
        const [members, occurrences] = await Promise.all([
          listHouseholdMembers(household.id),
          listOccurrences(household.id, range)
        ]);
        return [household.id, { members, occurrences }] as const;
      }));
      if (cancelled) return;
      setCurrentUserId(user.id);
      setMembersByHousehold(Object.fromEntries(entries.map(([id, data]) => [id, data.members])));
      setOccurrencesByHousehold(Object.fromEntries(entries.map(([id, data]) => [id, data.occurrences])));
      setTodayStatus("ready");
    } catch {
      if (!cancelled) setTodayStatus("error");
    }
  }

  void loadTodayData();
  return () => {
    cancelled = true;
  };
}, [households]);
```

- [ ] **Step 5: Verify**

Run: `npm.cmd test -- src/App.test.tsx`

Expected: existing dashboard tests may still fail until render is implemented in Task 4; no type errors from `api.ts`.

- [ ] **Step 6: Commit**

```bash
git add web/src/api.ts web/src/pages/TodayDashboard.tsx web/src/App.test.tsx
git commit -m "Load Today dashboard occurrence data"
```

---

## Task 4: Today Dashboard Rendering

**Files:**
- Modify: `web/src/pages/TodayDashboard.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Extend failing render tests**

Add assertions for:

```ts
expect(screen.getByRole("button", { name: "Saturday May 30 3 due" })).toBeTruthy();
expect(screen.getByText("To do")).toBeTruthy();
expect(screen.getByText("Done")).toBeTruthy();
expect(screen.getByText("Skipped")).toBeTruthy();
expect(screen.getByRole("button", { name: "Complete Clean bathrooms" })).toBeTruthy();
expect(screen.getByText("Improve future suggestions")).toBeTruthy();
```

For grouped mode:

```ts
fireEvent.click(screen.getByRole("button", { name: "By household" }));
expect(screen.getByRole("region", { name: "Home chores" })).toBeTruthy();
expect(screen.getByRole("region", { name: "Cabin chores" })).toBeTruthy();
```

- [ ] **Step 2: Run failing tests**

Run: `npm.cmd test -- src/App.test.tsx`

Expected: FAIL because widgets are not rendered yet.

- [ ] **Step 3: Implement helpers**

Add focused helper functions in `TodayDashboard.tsx`:

```ts
function occurrenceDateKey(occurrence: ChoreOccurrence, timeZone: string) {
  return occurrence.plannedStartAt
    ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "yyyy-MM-dd")
    : occurrence.eligibleStartOn;
}

function choreTitle(household: HouseholdAppData, occurrence: ChoreOccurrence) {
  return household.chores.find((chore) => chore.id === occurrence.choreId)?.title ?? "Scheduled chore";
}

function assigneeLabel(members: HouseholdMemberSummary[], userId: string) {
  const member = members.find((item) => item.userId === userId || item.clerkUserId === userId);
  return member?.displayName ?? member?.primaryEmail ?? "Unassigned";
}

function durationLabel(occurrence: ChoreOccurrence) {
  return `${occurrence.estimatedMinutes} min`;
}

function timeLabel(occurrence: ChoreOccurrence, timeZone: string) {
  return occurrence.plannedStartAt ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "h:mm a") : "Anytime";
}
```

- [ ] **Step 4: Render the dashboard**

Replace the non-empty-household summary-first layout with:

- compact hero stats: completed count, due count, skipped count, estimated remaining minutes for selected date.
- `<section aria-label="Seven day chore strip">` with seven buttons.
- `<section aria-label="Selected day chores">` with `Merged / By household` toggle.
- status groups in order: planned, completed, skipped.
- `<section aria-label="Upcoming chores">`.
- `<section aria-label="Household summary">`.

Rows must include:

- household chip if `households.length > 1`.
- assignee label.
- time/duration.
- quick complete button only if `occurrence.status === "planned" && occurrence.assignedUserId === currentUserId`.
- completed checkmark and `Improve future suggestions` action for completed rows.
- skipped muted styling for skipped rows.

- [ ] **Step 5: Add mobile-friendly CSS**

Add CSS classes:

```css
.today-dashboard-grid { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.5fr) minmax(300px, 0.8fr); }
.today-date-strip { display: grid; gap: 8px; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.today-chore-row { align-items: center; display: grid; gap: 10px; grid-template-columns: auto minmax(0, 1fr) auto; min-height: 52px; }
.today-chore-row.is-completed { color: #2f694d; }
.today-chore-row.is-skipped { color: #687167; }
.today-chore-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.today-toast { bottom: 18px; position: fixed; right: 18px; z-index: 20; }

@media (max-width: 760px) {
  .today-dashboard-grid { grid-template-columns: 1fr; }
  .today-date-strip { grid-template-columns: repeat(5, minmax(72px, 1fr)); overflow-x: auto; }
  .today-chore-row { grid-template-columns: auto minmax(0, 1fr); }
  .today-toast { bottom: 12px; left: 12px; right: 12px; }
}
```

Adjust exact values during visual verification, but keep the same structural behavior.

- [ ] **Step 6: Verify**

Run: `npm.cmd test -- src/App.test.tsx`

Expected: PASS for Today rendering tests.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/TodayDashboard.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Build Today operating dashboard"
```

---

## Task 5: Today Fast Completion, Toast, And Feedback Sheet

**Files:**
- Modify: `web/src/pages/TodayDashboard.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Add a test:

```ts
fireEvent.click(await screen.findByRole("button", { name: "Complete Clean bathrooms" }));
await waitFor(() => expect(screen.getByText("Clean bathrooms marked done")).toBeTruthy());
expect(screen.getByRole("button", { name: "Add details" })).toBeTruthy();
expect(screen.getByRole("button", { name: "Improve future suggestions for Clean bathrooms" })).toBeTruthy();
expect(fetchMock).toHaveBeenCalledWith(
  "http://localhost:3001/api/households/household-1/occurrences/occurrence-flexible/complete",
  expect.objectContaining({ method: "POST" })
);
```

Add a feedback-save assertion:

```ts
fireEvent.click(screen.getByRole("button", { name: "Improve future suggestions for Clean bathrooms" }));
fireEvent.click(screen.getByLabelText("It happened later than planned"));
fireEvent.click(screen.getByRole("button", { name: "Save details" }));
await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
  "http://localhost:3001/api/households/household-1/occurrences/occurrence-flexible/check-in",
  expect.objectContaining({ method: "PUT" })
));
```

- [ ] **Step 2: Run failing tests**

Run: `npm.cmd test -- src/App.test.tsx`

Expected: FAIL because completion and feedback controls are not wired yet.

- [ ] **Step 3: Implement fast completion**

Add handler:

```ts
async function completeFromToday(row: TodayOccurrenceRow) {
  const completed = await completeOccurrence(row.household.id, row.occurrence.id);
  setOccurrencesByHousehold((current) => ({
    ...current,
    [row.household.id]: (current[row.household.id] ?? []).map((occurrence) =>
      occurrence.id === completed.id ? completed : occurrence
    )
  }));
  setToast({ occurrenceId: completed.id, title: row.title });
}
```

- [ ] **Step 4: Implement feedback sheet**

Render a modal/sheet when `checkInTarget` is set:

```tsx
<div className="chore-editor-backdrop" role="presentation">
  <section className="chore-editor-modal" aria-label="Improve future suggestions">
    <h2>Improve future suggestions</h2>
    <label>
      <input
        checked={!checkInDraft.completedOnTime}
        onChange={(event) => setCheckInDraft({ ...checkInDraft, completedOnTime: !event.target.checked })}
        type="checkbox"
      />
      It happened later than planned
    </label>
    <label>
      <input
        checked={!checkInDraft.durationAccurate}
        onChange={(event) => setCheckInDraft({ ...checkInDraft, durationAccurate: !event.target.checked })}
        type="checkbox"
      />
      The time estimate was off
    </label>
    <label>
      <input
        checked={checkInDraft.rebaseFutureOccurrences}
        onChange={(event) => setCheckInDraft({ ...checkInDraft, rebaseFutureOccurrences: event.target.checked })}
        type="checkbox"
      />
      Base future occurrences on this completion date
    </label>
    <button onClick={() => void saveCheckInDetails()} type="button">Save details</button>
    <button className="section-action" onClick={() => setCheckInTarget(undefined)} type="button">Cancel</button>
  </section>
</div>
```

Add handler:

```ts
async function saveCheckInDetails() {
  if (!checkInTarget) return;
  await updateCompletionCheckIn(checkInTarget.household.id, checkInTarget.occurrence.id, checkInDraft);
  setCheckInTarget(undefined);
}
```

- [ ] **Step 5: Verify**

Run: `npm.cmd test -- src/App.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/TodayDashboard.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Add Today quick completion feedback"
```

---

## Task 6: Move Google Calendar CTA To Calendar

**Files:**
- Modify: `web/src/pages/TodayDashboard.tsx`
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing tests**

Today:

```ts
renderAt("/today");
await screen.findByRole("heading", { name: "Today" });
expect(screen.queryByRole("heading", { name: "Google Calendar" })).toBeNull();
```

Calendar:

```ts
renderAt("/calendar");
expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
expect(screen.getByRole("region", { name: "Google Calendar setup" })).toBeTruthy();
fireEvent.click(screen.getByRole("button", { name: "Set up Google Calendar" }));
expect(window.location.pathname).toBe("/settings");
expect(window.location.hash).toBe("#calendar");
```

- [ ] **Step 2: Run failing tests**

Run: `npm.cmd test -- src/App.test.tsx`

Expected: FAIL because CTA is still on Today and Calendar cannot navigate.

- [ ] **Step 3: Pass navigation into Calendar**

Update `CalendarPage` props:

```ts
type CalendarPageProps = {
  households: HouseholdAppData[];
  isLoading: boolean;
  onNavigate: Navigate;
};
```

In `App.tsx`, render:

```tsx
<CalendarPage households={households} isLoading={isLoading} onNavigate={navigate} />
```

- [ ] **Step 4: Move CTA**

Remove the `integration-callout` section from `TodayDashboard`.

Add a compact Calendar panel near the Calendar hero or control panel:

```tsx
<section className="calendar-integration-strip" aria-label="Google Calendar setup">
  <div>
    <p className="eyebrow">Calendar integration</p>
    <h2>Google Calendar</h2>
    <p>Connect Google Calendar to import routines and review approved schedule changes.</p>
  </div>
  <button className="secondary-action" onClick={() => onNavigate("/settings#calendar")} type="button">
    Set up Google Calendar
  </button>
</section>
```

- [ ] **Step 5: Verify**

Run: `npm.cmd test -- src/App.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/TodayDashboard.tsx web/src/pages/CalendarPage.tsx web/src/App.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Move calendar integration CTA to Calendar"
```

---

## Task 7: Core Authenticated UI Refresh Pass

**Files:**
- Modify: `web/src/App.css`
- Modify page files only where markup is needed for shared classes.
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Lock no-regression smoke tests**

Ensure existing route tests cover:

```ts
expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy();
expect(screen.getByRole("heading", { name: "Calendar" })).toBeTruthy();
expect(screen.getByRole("heading", { name: "Optimize" })).toBeTruthy();
expect(screen.getByRole("heading", { name: "Households" })).toBeTruthy();
expect(screen.getByRole("heading", { name: "Family" })).toBeTruthy();
expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
```

- [ ] **Step 2: Apply shared CSS direction**

Refresh authenticated surfaces with:

- compact page heroes.
- consistent panel borders/backgrounds.
- row-based operational cards.
- restrained green action emphasis.
- mobile stacking rules for panels and nav.

Do not convert to Tailwind in this milestone; that remains roadmap tech debt.

- [ ] **Step 3: Browser verification**

Start dev server if needed:

```bash
npm.cmd run web:dev
```

Use Browser/browser-use to verify:

- `/today` desktop and mobile.
- `/calendar` desktop and mobile.
- `/optimize`, `/households`, `/family`, `/settings` at desktop width.
- No overlapping text in nav, rows, toast, modal/sheet, or cards.

- [ ] **Step 4: Full verification**

Run:

```bash
npm.cmd test -- src/App.test.tsx
npm.cmd run web:build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/App.css web/src/App.test.tsx web/src/pages
git commit -m "Refresh authenticated app UI"
```

---

## Task 8: Final Review And Push

**Files:**
- None expected unless verification reveals issues.

- [ ] **Step 1: Check status**

Run:

```bash
git status --short
```

Expected: clean working tree.

- [ ] **Step 2: Run final commands**

Run:

```bash
npm.cmd test -- src/App.test.tsx
npm.cmd test -w server -- schedules.test.ts
npm.cmd run web:build
```

Expected: PASS.

- [ ] **Step 3: Push**

```bash
git push origin main
```

Expected: branch pushed successfully.

---

## Self-Review

- Spec coverage: Header emphasis, Today operating dashboard, completion feedback, Google Calendar CTA move, and core app visual refresh are each covered by tasks.
- Type consistency: Uses existing `ChoreOccurrence`, `CompletionCheckInInput`, `ChoreCompletionCheckIn`, `HouseholdAppData`, and `HouseholdMemberSummary`.
- Scope boundary: Google Calendar OAuth/import is not implemented; this milestone only relocates the setup CTA.
- Implementation order: backend endpoint lands before frontend feedback save; Today data lands before rendering and interactions; UI refresh happens after behavior is stable.
