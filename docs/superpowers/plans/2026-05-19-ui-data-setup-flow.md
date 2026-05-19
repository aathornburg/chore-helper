# UI Data Setup Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish roadmap step 1 by making the MVP 1 setup flow, Today state, and Plan review handoff feel like one persisted product workflow.

**Architecture:** Keep the existing React context provider as the pre-auth household state boundary and keep all data access behind the existing frontend API helpers. Implement the remaining setup-flow polish in narrow UI slices: provider restore state, guided setup affordances, Today completion state, Plan review state, and demo/future-content isolation. No backend schema changes are required.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Express/Prisma APIs already exposed through `web/src/api.ts`.

---

## File Structure

- Modify `web/src/state/HouseholdSetupProvider.tsx`: expose restore/loading/error state, keep setup completion derived from persisted baseline plus chore count, remove tutorial comments that do not belong in product code.
- Modify `web/src/types.ts`: add setup lifecycle fields to `HouseholdSetupState`.
- Modify `web/src/pages/TodayDashboard.tsx`: show clear loading, incomplete, in-progress, and complete setup states using real setup data.
- Modify `web/src/pages/SetupPage.tsx`: tighten guided step behavior, disable invalid step jumps, show saved context and existing chore progress, and keep Google Calendar explicitly upcoming.
- Modify `web/src/PlanReview.tsx`: make missing setup, loading, empty queue, and recommendation states intentional and persisted-data-driven.
- Modify `web/src/App.tsx`: keep primary MVP 1 navigation focused on Today, Setup, Plan, and Settings.
- Modify `web/src/App.css`: adjust setup/progress/review styles without introducing a new visual system.
- Modify `web/src/App.test.tsx`: add and update end-to-end component tests for loading, setup progress, step guarding, Plan handoff, and recommendation review.
- Verify with `npm.cmd run test -w web`, `npm.cmd run typecheck -w web`, and `npm.cmd run build -w web` from the repository root.

---

### Task 1: Household Setup Lifecycle State

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/state/HouseholdSetupProvider.tsx`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing lifecycle tests**

Add these tests inside `describe("App", () => { ... })` in `web/src/App.test.tsx`:

```tsx
it("shows a setup restore loading state before saved household data loads", async () => {
  window.localStorage.setItem("chore-helper:household-id", "household-1");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "household-1",
        name: "Home",
        baseline: {
          homeType: "house",
          rooms: ["kitchen"],
          flooring: ["tile"],
          hasPets: false,
          hasOutdoorSpace: false,
          notes: "Restoring."
        }
      })
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => []
    })
  );

  renderAt("/today");

  expect(screen.getByText("Loading household setup...")).toBeTruthy();
  await waitFor(() => {
    expect(screen.getByText("Finish setup by adding an existing chore.")).toBeTruthy();
  });
});

it("shows a recoverable setup restore error when saved household data cannot load", async () => {
  window.localStorage.setItem("chore-helper:household-id", "missing-household");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false }));

  renderAt("/today");

  await waitFor(() => {
    expect(screen.getByText("We could not restore your saved household. Start setup again.")).toBeTruthy();
  });
  expect(window.localStorage.getItem("chore-helper:household-id")).toBeNull();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: FAIL because `Loading household setup...` and the restore error text are not rendered yet.

- [ ] **Step 3: Add lifecycle fields to setup state**

In `web/src/types.ts`, change `HouseholdSetupState` to:

```ts
export type HouseholdSetupState = {
  householdId?: string;
  householdName: string;
  baseline?: HouseholdBaseline;
  choreCount: number;
  setupComplete: boolean;
  isRestoring: boolean;
  restoreError?: string;
};
```

In `web/src/state/HouseholdSetupProvider.tsx`, update `initialHouseholdSetup`:

```ts
const initialHouseholdSetup: HouseholdSetupState = {
  householdName: "Home",
  choreCount: 0,
  setupComplete: false,
  isRestoring: Boolean(window.localStorage.getItem(householdStorageKey))
};
```

- [ ] **Step 4: Update restore success and failure state**

In `restoreHousehold`, set `isRestoring: false` and clear `restoreError` on success:

```ts
setHouseholdSetup({
  householdId: household.id,
  householdName: household.name,
  baseline: household.baseline,
  choreCount: chores.length,
  setupComplete: isSetupComplete(household.baseline, chores.length),
  isRestoring: false,
  restoreError: undefined
});
```

In the `catch` block, remove the saved household id and set a recoverable state:

```ts
window.localStorage.removeItem(householdStorageKey);
if (!cancelled) {
  setHouseholdSetup({
    ...initialHouseholdSetup,
    isRestoring: false,
    restoreError: "We could not restore your saved household. Start setup again."
  });
}
```

In `saveHouseholdContext`, preserve lifecycle fields:

```ts
setHouseholdSetup((currentSetup) => ({
  householdId: household.id,
  householdName: savedHousehold.name || household.name || values.householdName,
  baseline: savedHousehold.baseline ?? baseline,
  choreCount: currentSetup.choreCount,
  setupComplete: isSetupComplete(savedHousehold.baseline ?? baseline, currentSetup.choreCount),
  isRestoring: false,
  restoreError: undefined
}));
```

- [ ] **Step 5: Remove tutorial comments from provider**

Delete the `// Angular comparisons` comment blocks from `web/src/state/HouseholdSetupProvider.tsx`. Keep any product-relevant comments if they explain non-obvious cancellation or localStorage behavior.

- [ ] **Step 6: Render loading and restore error on Today**

At the top of `TodayDashboard` in `web/src/pages/TodayDashboard.tsx`, before the setup-complete branch, add:

```tsx
if (householdSetup.isRestoring) {
  return (
    <div className="dashboard-page first-time-dashboard">
      <header className="workspace-hero first-time-hero">
        <div>
          <p className="eyebrow">Household setup</p>
          <h1>Today</h1>
          <p className="lede">Loading household setup...</p>
          <p className="supporting-copy">
            Chore Helper is checking your saved household before showing the next setup step.
          </p>
        </div>
      </header>
    </div>
  );
}
```

In the incomplete setup branch, render `householdSetup.restoreError` before the supporting copy:

```tsx
{householdSetup.restoreError ? (
  <p className="section-summary">{householdSetup.restoreError}</p>
) : null}
```

- [ ] **Step 7: Run focused tests to verify they pass**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: PASS with all `App.test.tsx` tests passing.

- [ ] **Step 8: Commit**

```bash
git add web/src/types.ts web/src/state/HouseholdSetupProvider.tsx web/src/pages/TodayDashboard.tsx web/src/App.test.tsx
git commit -m "Add setup restore lifecycle state"
```

---

### Task 2: Guided Setup Step Guarding and Progress

**Files:**
- Modify: `web/src/pages/SetupPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing setup guarding tests**

Add these tests to `web/src/App.test.tsx`:

```tsx
it("prevents jumping to existing chores before household context is saved", () => {
  renderAt("/setup");

  fireEvent.click(screen.getByRole("button", { name: /Existing Chores/ }));

  expect(screen.getByText("Step 1 of 4")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("Save household context before adding chores.");
});

it("prevents review handoff until at least one existing chore is saved", async () => {
  mockSuccessfulSetupFetches();
  renderAt("/setup");

  await saveSetup();
  fireEvent.click(screen.getByRole("button", { name: /Review Handoff/ }));

  expect(screen.getByText("Step 2 of 4")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("Add at least one existing chore before review.");
});

it("shows setup progress after household context is saved", async () => {
  mockSuccessfulSetupFetches();
  renderAt("/setup");

  await saveSetup();

  expect(screen.getByText("Household context saved")).toBeTruthy();
  expect(screen.getByText("No existing chores saved yet")).toBeTruthy();
});
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: FAIL because setup step buttons currently allow jumping directly to later steps and progress copy is not rendered.

- [ ] **Step 3: Add setup step guard helper**

In `web/src/pages/SetupPage.tsx`, add this helper inside the component before `handleContextSubmit`:

```tsx
function handleStepSelect(step: SetupStep) {
  if (step === "context") {
    setActiveStep(step);
    return;
  }

  if (!householdSetup.baseline) {
    setStatus("Save household context before adding chores.");
    setActiveStep("context");
    return;
  }

  if (step === "review" && householdSetup.choreCount === 0) {
    setStatus("Add at least one existing chore before review.");
    setActiveStep("chores");
    return;
  }

  setActiveStep(step);
}
```

Change setup step buttons from `onClick={() => setActiveStep(step.id)}` to:

```tsx
onClick={() => handleStepSelect(step.id)}
```

- [ ] **Step 4: Add setup progress panel**

In `SetupPage`, after the setup stepper section and before the active step content, add:

```tsx
<section className="panel setup-progress-panel" aria-label="Setup readiness">
  <article>
    <span>{householdSetup.baseline ? "Saved" : "Next"}</span>
    <strong>Household context {householdSetup.baseline ? "saved" : "needed"}</strong>
  </article>
  <article>
    <span>{householdSetup.choreCount > 0 ? "Saved" : "Next"}</span>
    <strong>
      {householdSetup.choreCount > 0
        ? `${householdSetup.choreCount} existing chore${householdSetup.choreCount === 1 ? "" : "s"} saved`
        : "No existing chores saved yet"}
    </strong>
  </article>
  <article>
    <span>{householdSetup.setupComplete ? "Ready" : "Locked"}</span>
    <strong>{householdSetup.setupComplete ? "Review handoff ready" : "Review unlocks after one chore"}</strong>
  </article>
</section>
```

- [ ] **Step 5: Style setup progress without changing the visual system**

Add to `web/src/App.css` near setup styles:

```css
.setup-progress-panel {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.setup-progress-panel article {
  background: #fffefa;
  border: 1px solid #eaded1;
  border-radius: 12px;
  display: grid;
  gap: 8px;
  padding: 14px;
}

.setup-progress-panel span {
  color: #9a4f3f;
  font-size: 0.78rem;
  font-weight: 850;
  text-transform: uppercase;
}

.setup-progress-panel strong {
  color: #24352e;
}
```

Add `.setup-progress-panel` to the mobile one-column media query:

```css
.setup-progress-panel,
```

- [ ] **Step 6: Run focused tests to verify they pass**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: PASS with all `App.test.tsx` tests passing.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/SetupPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Guard setup steps and show progress"
```

---

### Task 3: Today Setup Completion and Handoff Polish

**Files:**
- Modify: `web/src/pages/TodayDashboard.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing Today handoff tests**

Add this test to `web/src/App.test.tsx`:

```tsx
it("shows the Plan handoff as the primary action after setup completes", async () => {
  mockSuccessfulSetupAndChoreFetches();
  renderAt("/setup");

  await completeSetupWithChore();
  fireEvent.click(screen.getByRole("link", { name: "Today" }));

  expect(screen.getByRole("button", { name: "Review existing chores" })).toBeTruthy();
  expect(screen.getByText("Next best action")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Review the current chore plan" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Set up household" })).toBeNull();
});
```

If this test already passes, keep it as regression coverage and continue.

- [ ] **Step 2: Run focused tests**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: PASS if current behavior already satisfies the handoff regression; otherwise FAIL on missing copy or action.

- [ ] **Step 3: Tighten complete Today copy**

In the setup-complete branch of `TodayDashboard`, replace the setup-focus panel body with:

```tsx
<p>
  Open Plan to review cadence, duration, and coverage signals for the chores already saved.
  Recommendations remain manual until you accept them in a later milestone.
</p>
```

Keep the primary header button as:

```tsx
<button onClick={() => onNavigate("/plan")} type="button">Review existing chores</button>
```

- [ ] **Step 4: Tighten incomplete Today action label**

In the incomplete setup branch, change the hero button to use the current setup state:

```tsx
<button onClick={() => onNavigate("/setup")} type="button">
  {householdSetup.baseline ? "Continue setup" : "Set up household"}
</button>
```

This keeps the existing first-time test passing and makes in-progress setup less confusing.

- [ ] **Step 5: Run focused tests**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: PASS with all `App.test.tsx` tests passing.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/TodayDashboard.tsx web/src/App.test.tsx
git commit -m "Polish Today setup handoff"
```

---

### Task 4: Plan Review Loading, Empty, and Error States

**Files:**
- Modify: `web/src/PlanReview.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing Plan state tests**

Add these tests to `web/src/App.test.tsx`:

```tsx
it("shows a Plan loading state while the review queue loads", async () => {
  mockSuccessfulSetupAndChoreFetches()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: "chore-1",
          householdId: "household-1",
          title: "Clean bathrooms",
          cadence: "weekly",
          estimatedMinutes: 5,
          source: "manual"
        }
      ]
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });
  renderAt("/setup");

  await completeSetupWithChore();
  fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));

  expect(screen.getByText("Loading review queue...")).toBeTruthy();
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Review Queue" })).toBeTruthy();
  });
});

it("shows a Plan load error when persisted chores cannot load", async () => {
  mockSuccessfulSetupAndChoreFetches()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true, json: async () => [] });
  renderAt("/setup");

  await completeSetupWithChore();
  fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));

  await waitFor(() => {
    expect(screen.getByText("Could not load the review queue.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run focused tests**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: The loading test may already pass because status text exists in the header. The error test should pass only if status text is rendered after a load failure.

- [ ] **Step 3: Make Plan status accessible and intentional**

In `PlanReview`, add lifecycle state:

```tsx
const [queueState, setQueueState] = useState<"idle" | "loading" | "ready" | "error">("idle");
```

In `loadQueue`, set:

```tsx
setQueueState("loading");
setStatus("Loading review queue...");
```

On success:

```tsx
setQueueState("ready");
setStatus("Manual acceptance only");
```

On catch:

```tsx
setQueueState("error");
setStatus("Could not load the review queue.");
```

Change the header status paragraph to:

```tsx
<p className="status" role="status">{status}</p>
```

If `queueState === "error"`, keep the metrics section visible but render this before the queue content:

```tsx
{queueState === "error" ? (
  <div className="empty-state">Could not load the review queue.</div>
) : null}
```

Wrap the existing empty/non-empty queue rendering so it only runs when `queueState !== "error"`.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: PASS with all `App.test.tsx` tests passing.

- [ ] **Step 5: Commit**

```bash
git add web/src/PlanReview.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Clarify Plan review queue states"
```

---

### Task 5: Final MVP 1 Verification and Demo Isolation Check

**Files:**
- Inspect: `web/src/App.tsx`
- Inspect: `web/src/pages/TodayDashboard.tsx`
- Inspect: `web/src/pages/SetupPage.tsx`
- Inspect: `web/src/PlanReview.tsx`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add final spec coverage tests**

Add this test to `web/src/App.test.tsx` if no equivalent assertion already exists:

```tsx
it("keeps Family out of MVP 1 primary navigation", () => {
  renderAt("/today");

  expect(screen.getByRole("link", { name: "Today" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Setup" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Plan" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Family" })).toBeNull();
});
```

The current `renders compact top app navigation` test already covers this requirement. If that test is still present with the same assertions, do not add a duplicate; record this item as covered by the existing test.

- [ ] **Step 2: Search for core demo dashboard content**

Run: `rg "Week view|Current chores|People|Family|demo" web/src`

Expected: Any hits are either tests asserting old demo content is absent, a non-primary route not linked in MVP 1 nav, or future/demo-only copy that is not shown in Today/Setup/Plan core flow.

- [ ] **Step 3: Remove or isolate core-flow demo content if search finds product-surface leaks**

If `rg` shows demo-feeling content in `TodayDashboard`, `SetupPage`, or `PlanReview`, remove it from the core flow or rewrite it as real state-driven copy. For example, remove hard-coded dashboard sections titled `Week view` or `Current chores` from Today if they reappear.

- [ ] **Step 4: Run full verification**

Run these commands from the repo root:

```bash
npm.cmd run test -w web
npm.cmd run typecheck -w web
npm.cmd run build -w web
```

Expected:

```text
Test Files  1 passed (1)
Tests       all passed
```

`typecheck` exits 0.

`build` exits 0 and emits the Vite production build.

- [ ] **Step 5: Commit final cleanup if there are changes**

```bash
git status --short
git add web/src/App.tsx web/src/pages/TodayDashboard.tsx web/src/pages/SetupPage.tsx web/src/PlanReview.tsx web/src/App.test.tsx web/src/App.css
git commit -m "Finish MVP setup flow integration"
```

Skip the commit if `git status --short` shows no changes after verification.

---

## Spec Coverage Checklist

- Today routes incomplete users to Setup: covered by existing tests and Task 3.
- Setup renders guided steps in order: covered by existing tests and Task 2.
- Saving household context alone does not complete setup: covered by existing tests and Task 1 lifecycle preservation.
- Adding one existing chore completes setup: covered by existing tests and Task 3 handoff regression.
- Google Calendar appears as an upcoming disabled import option: covered by existing tests and Task 2 guarded navigation.
- Completed setup routes users toward Plan review: covered by existing tests and Task 3.
- Family is not shown as a primary MVP 1 nav item: covered by existing tests and Task 5.
- Plan loads persisted chores and generates recommendations: covered by existing tests and Task 4 state coverage.
- Empty, loading, saved, and review states feel intentional: implemented across Tasks 1 through 4.
- Demo data is removed or isolated from real app state: verified in Task 5.
