# Chores UX Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the Chores page so it is a focused chore CRUD and review-state workspace with accurate empty states, no duplicated recommendations panel, and better visual polish.

**Architecture:** Keep this slice frontend-only. `web/src/pages/ChoresPage.tsx` remains the owner of chore loading, filtering, selected-chore editing, and review flow state; `web/src/App.css` owns the visual cleanup. Tests in `web/src/App.test.tsx` should describe the refined Chores behavior and protect against old setup/review-queue copy returning.

**Tech Stack:** React 19, TypeScript, Vite, Testing Library, Vitest, CSS.

---

## File Structure

- Modify `web/src/pages/ChoresPage.tsx`: remove stale derived metrics, add explicit empty-filter messaging, add a normal add-chore entry point, remove bottom recommendations panel, tighten visible copy, and keep recommendations only in selected chore detail/review flow.
- Modify `web/src/App.css`: fix secondary button hover contrast, add any small layout styles for the add-chore entry point and empty filter state, remove or leave unused metric/recommendations styles only if touched.
- Modify `web/src/App.test.tsx`: update Chores expectations to match the cleanup and add focused tests for pluralization, empty filters, removed metric cards, and removed bottom recommendations panel.

No backend files should change in this plan.

---

## Task 1: Lock In Cleanup Expectations With Tests

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Update the Chores workspace test to reject old noise**

In `web/src/App.test.tsx`, find the test named:

```ts
it("renders Chores as a chore workspace instead of a setup accordion", async () => {
```

Replace the assertions immediately after the test's `await waitFor` block with:

```ts
    expect(screen.getAllByText("Clean bathrooms").length).toBeGreaterThan(0);
    expect(screen.getByText("1 chore has not been reviewed yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start review flow" })).toBeTruthy();
    expect(screen.queryByText("Tracked chores")).toBeNull();
    expect(screen.queryByText("Duration concerns")).toBeNull();
    expect(screen.queryByText("Pending recommendations")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Recommendations" })).toBeNull();
    expect(screen.queryByText("Household Context")).toBeNull();
```

Keep the two existing `fetchMock` call assertions that follow.

- [ ] **Step 2: Replace the old empty Chores test with filter-specific empty-state coverage**

Find the test named:

```ts
it("shows an empty Chores list with manual chore entry", async () => {
```

Replace the whole test with:

```ts
  it("shows filter-specific empty Chores states without the add-chore form", async () => {
    mockSuccessfulSetupFetches()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "chore-1",
          householdId: "household-1",
          title: "Clean bathrooms",
          cadence: "weekly",
          estimatedMinutes: 5,
          source: "manual"
        })
      })
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
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Chore list" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Recommendation pending" }));

    expect(screen.getByText("No chores have pending recommendations.")).toBeTruthy();
    expect(screen.queryByText("Add one existing chore manually to start the review queue.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add chore to queue" })).toBeNull();
    expect(screen.queryByLabelText("Chore title")).toBeNull();
  });
```

- [ ] **Step 3: Update the Google Calendar source test so it uses the normal add-chore entry point**

Find the test named:

```ts
it("keeps Google Calendar unavailable as an active Chores manual chore source", async () => {
```

Replace the actions after `fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));` with:

```ts
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Chore list" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add chore" }));

    const sourceSelect = screen.getByLabelText("Source");

    expect(getOptionLabels(sourceSelect)).toEqual(["Manual"]);
    expect((sourceSelect as HTMLSelectElement).value).toBe("manual");
```

Remove the old wait for `Add one existing chore manually to start the review queue.`

- [ ] **Step 4: Update archive empty-state expectation**

Find this assertion in the `archives and restores chores in Chores` test:

```ts
      expect(screen.getByText("No active chores in the review queue.")).toBeTruthy();
```

Replace it with:

```ts
      expect(screen.getByText("No active chores yet. Add a chore to start building the household routine.")).toBeTruthy();
```

- [ ] **Step 5: Add a recommendation-location regression test**

Add this test before `it("keeps the Chores recommendation submit flow working", async () => {`:

```ts
  it("shows chore recommendations in selected detail without a bottom recommendations panel", async () => {
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
        json: async () => [
          {
            id: "recommendation-1",
            householdId: "household-1",
            affectedChoreId: "chore-1",
            title: "Review duration for Clean bathrooms",
            rationale: "Too short.",
            confidence: "high",
            status: "pending",
            decision: "pending"
          }
        ]
      });
    renderAt("/setup");

    await completeSetupWithChore();
    fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));

    await waitFor(() => {
      expect(screen.getAllByText("Review duration for Clean bathrooms").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Too short.")).toBeTruthy();
    expect(screen.getByText("Confidence: high")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Recommendations" })).toBeNull();
  });
```

- [ ] **Step 6: Run the web tests to verify failures**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: FAIL. The expected failures should include old empty-state copy, missing `Add chore` button, or the bottom `Recommendations` heading still rendering.

- [ ] **Step 7: Keep the failing test changes for the implementation task**

Do not commit yet. These failing tests are intentionally paired with Task 2 so the next commit contains passing tests and implementation together.

---

## Task 2: Clean Up Chores Page State, Copy, and Empty States

**Files:**
- Modify: `web/src/pages/ChoresPage.tsx`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Remove stale metric derivations and add helper functions**

In `web/src/pages/ChoresPage.tsx`, delete these unused values:

```ts
  const pendingRecommendations = recommendations.filter(
    (recommendation) => recommendation.status === "pending" || !recommendation.status
  );
  const durationConcerns = useMemo(
    () => chores.filter((chore) => getQueueSignal(chore) === "Duration concern").length,
    [chores]
  );
```

Add these helpers below `formatReviewState`:

```ts
function formatUnreviewedSummary(count: number) {
  return count === 1
    ? "1 chore has not been reviewed yet"
    : `${count} chores have not been reviewed yet`;
}

function getEmptyChoreMessage(activeTab: ChoreStatusTab) {
  if (activeTab === "unreviewed") {
    return "No unreviewed chores. New or changed chores will appear here before review.";
  }
  if (activeTab === "recommendation-pending") {
    return "No chores have pending recommendations.";
  }
  if (activeTab === "reviewed") {
    return "No reviewed chores yet. Applied recommendations will move chores here.";
  }
  if (activeTab === "archived") {
    return "No archived chores yet.";
  }

  return "No active chores yet. Add a chore to start building the household routine.";
}
```

- [ ] **Step 2: Add explicit add-chore form state**

In `ChoresPage`, after:

```ts
  const [reviewRecommendations, setReviewRecommendations] = useState<Recommendation[]>([]);
```

add:

```ts
  const [addFormOpen, setAddFormOpen] = useState(false);
```

- [ ] **Step 3: Reset add-chore form after creation**

In `handleAddChore`, after:

```ts
    setSelectedChoreId(created.id);
```

add:

```ts
    setChoreTitle("");
    setChoreCadence("");
    setEstimatedMinutes("");
    setAddFormOpen(false);
    setActiveTab("all-active");
```

- [ ] **Step 4: Update loading/error language**

In `loadQueue`, replace:

```ts
      setStatus("Loading review queue...");
```

with:

```ts
      setStatus("Loading chores...");
```

In the `catch` block, replace:

```ts
          setStatus("Could not load the review queue.");
```

with:

```ts
          setStatus("Could not load chores.");
```

Update `renderStatus` so it handles the new string:

```ts
function renderStatus(status: string) {
  if (status !== "Could not load chores.") return status;

  return (
    <>
      <span>Could not load </span>
      <span>chores.</span>
    </>
  );
}
```

- [ ] **Step 5: Update section copy and unreviewed count rendering**

In the Chores section heading, replace:

```tsx
              <p>Existing chores, review state, and manual CRUD controls.</p>
```

with:

```tsx
              <p>Manage active and archived chores, review state, and recommendation decisions.</p>
```

Replace:

```tsx
              <strong>{unreviewedCount} chore{unreviewedCount !== 1 ? "s have" : " has"} not been reviewed yet</strong>
```

with:

```tsx
              <strong>{formatUnreviewedSummary(unreviewedCount)}</strong>
```

- [ ] **Step 6: Add the normal add-chore entry point below the filter tabs**

Immediately after the closing `</div>` for the `status-tabs` container, add:

```tsx
        <div className="chore-list-actions">
          <button className="secondary-action" onClick={() => setAddFormOpen((isOpen) => !isOpen)} type="button">
            {addFormOpen ? "Cancel add chore" : "Add chore"}
          </button>
        </div>

        {addFormOpen ? (
          <form className="manual-chore-form compact-chore-form" onSubmit={handleAddChore}>
            <div className="field-grid">
              <label>
                Chore title
                <input
                  placeholder="Clean bathrooms"
                  required
                  value={choreTitle}
                  onChange={(event) => setChoreTitle(event.target.value)}
                />
              </label>
              <label>
                Cadence
                <input
                  placeholder="weekly"
                  required
                  value={choreCadence}
                  onChange={(event) => setChoreCadence(event.target.value)}
                />
              </label>
              <label>
                Estimated minutes
                <input
                  min="1"
                  placeholder="5"
                  required
                  type="number"
                  value={estimatedMinutes}
                  onChange={(event) => setEstimatedMinutes(event.target.value)}
                />
              </label>
              <label>
                Source
                <select value={choreSource} onChange={() => undefined}>
                  <option value="manual">Manual</option>
                </select>
              </label>
            </div>
            <button type="submit">Save chore</button>
          </form>
        ) : null}
```

- [ ] **Step 7: Replace empty-state fallback with message only**

Replace the whole true branch of the `visibleChores.length === 0 ?` conditional. It currently starts with:

```tsx
            <div className="plan-empty-grid">
              <div className="empty-state">
                {recommendationsStale ? "No active chores in the review queue." : "Add one existing chore manually to start the review queue."}
              </div>
            </div>
```

with:

```tsx
            <div className="empty-state">
              {getEmptyChoreMessage(activeTab)}
            </div>
```

Do not leave the old add-chore form in this branch.

- [ ] **Step 8: Update selected chore empty recommendation copy**

Replace:

```tsx
                      <div className="empty-state">
                        Run review to see rationale and confidence for this chore.
                      </div>
```

with:

```tsx
                      <div className="empty-state">
                        No recommendation for this chore yet.
                      </div>
```

- [ ] **Step 9: Remove the bottom recommendations panel**

Delete the whole conditional block at the end of `ChoresPage` that starts with:

```tsx
      {recommendations.length > 0 ? (
        <section className="dashboard-section recommendations-section" aria-labelledby="recommendations-heading">
```

The return should close the main `<div className="plan-review">` immediately after the Chore list section.

- [ ] **Step 10: Remove commented metric and header dead code**

Delete these commented blocks from `ChoresPage`:

```tsx
          {/* <p className="section-summary">{formatBaselineSummary(baseline)}</p> */}
```

```tsx
        {/* <div className="header-action"> */}
          {/* <p className="status" role="status">{formatBaselineSummary(baseline)}</p> */}
          {/* <button onClick={handleReview} type="button">Review my chore plan</button> */}
        {/* </div> */}
```

Delete the commented metric grid block that starts with:

```tsx
        {/* <div className="metric-grid">
```

- [ ] **Step 11: Run web tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: PASS for Chores cleanup tests. If failures mention old loading text, update test expectations from `Loading review queue...` to `Loading chores...`.

- [ ] **Step 12: Commit Chores component cleanup**

```bash
git add web/src/pages/ChoresPage.tsx web/src/App.test.tsx
git commit -m "Clean up Chores page content"
```

---

## Task 3: Polish Chores Styling

**Files:**
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add secondary hover contrast and add-form spacing CSS**

In `web/src/App.css`, find:

```css
.secondary-action {
  background: #f4f0e9;
  border: 1px solid #d8cabd;
  color: #2f694d;
}
```

Add this immediately after it:

```css
.secondary-action:hover {
  background: #e8f0e4;
  border-color: #b8d1af;
  color: #24352e;
}
```

Add this near the Chores page styles, after `.status-tabs button[aria-selected="true"]`:

```css
.chore-list-actions {
  display: flex;
  justify-content: flex-start;
}

.compact-chore-form {
  box-shadow: none;
}
```

- [ ] **Step 2: Remove now-unused recommendations-section style**

Delete this block if no other component uses it:

```css
.recommendations-section {
  background: #fffdf9;
}
```

- [ ] **Step 3: Run web tests and typecheck**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
npm.cmd run typecheck -w web
```

Expected: PASS.

- [ ] **Step 4: Commit style polish**

```bash
git add web/src/App.css
git commit -m "Polish Chores page styling"
```

---

## Task 4: Full Verification and Browser Review

**Files:**
- Inspect: `web/src/pages/ChoresPage.tsx`
- Inspect: `web/src/App.css`
- Inspect: `web/src/App.test.tsx`

- [ ] **Step 1: Run full web verification**

Run:

```bash
npm.cmd run test -w web
npm.cmd run typecheck -w web
npm.cmd run build -w web
```

Expected: all commands PASS.

- [ ] **Step 2: Run server verification only if frontend changes touched shared/backend contracts**

If implementation changed `shared/src/types.ts`, `server/`, or API payload shapes, run:

```bash
npm.cmd run test -w server
npm.cmd run typecheck -w server
```

Expected: all commands PASS. If implementation stayed frontend-only, skip this step and mention it in the final summary.

- [ ] **Step 3: Inspect Chores page in browser**

Start dev servers if needed:

```bash
npm.cmd run dev -w server
npm.cmd run dev -w web
```

Open:

```text
http://127.0.0.1:5173/chores
```

Verify visually:

- `Start review flow` hover has readable contrast.
- `1 chore has not been reviewed yet` renders as one phrase when there is one unreviewed chore.
- Filter empty states show only the relevant message.
- The add-chore form appears only after clicking `Add chore`.
- The bottom `Recommendations` section is gone.
- Recommendation content still appears inside the selected chore detail when a matching recommendation exists.

- [ ] **Step 4: Commit any browser-review fixes**

If Step 3 required fixes:

```bash
git add web/src/pages/ChoresPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Refine Chores UX cleanup"
```

If Step 3 required no fixes, do not create an empty commit.

---

## Spec Coverage Checklist

- Chores stays primary workspace: Task 2 updates content in `ChoresPage` without routing into Household work.
- Remove setup/Plan/review-queue framing: Task 2 updates loading/error/copy and removes old fallback copy.
- Filter empty states: Task 1 adds tests; Task 2 implements messages and removes fallback form.
- Recommendations only in selected detail/review flow: Task 1 adds regression test; Task 2 removes bottom panel.
- Secondary button hover contrast: Task 3 adds `.secondary-action:hover`.
- Singular/plural copy: Task 1 updates expectation; Task 2 adds `formatUnreviewedSummary`.
- Metric cards absent: Task 1 asserts absence; Task 2 removes commented dead code.
- Household redesign deferred: no implementation tasks touch Setup/Household routing.
