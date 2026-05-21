# Chores Row Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Chores page from a split list/detail layout into a list-first page where clicking a chore expands inline edit/archive controls, while making `Add chore` visually distinct from the filter tabs.

**Architecture:** Keep the work inside the existing `ChoresPage` component and `App.test.tsx` test suite. Reuse the current API calls and edit form state, but rename the selected-row concept to an expanded-row concept so no edit form renders on page load. Replace the two-column CSS with row-oriented styles and a toolbar that separates filters from the primary add action.

**Tech Stack:** React 19, TypeScript, Testing Library/Vitest, existing CSS in `web/src/App.css`, existing API helpers in `web/src/api`.

---

## File Structure

- Modify `web/src/App.test.tsx`
  - Owns integration-style user behavior tests for the Chores page.
  - Existing helper functions such as `completeSetupWithChore`, `mockSuccessfulSetupFetches`, and `mockSuccessfulSetupAndChoreFetches` should be reused.
- Modify `web/src/pages/ChoresPage.tsx`
  - Owns Chores page state, row rendering, add form, inline edit form, review flow, and archived restore behavior.
  - Keep the existing React-to-Angular explanatory comments where they still apply, and add one concise comment if renaming selected state to expanded state needs explanation.
- Modify `web/src/App.css`
  - Owns Chores page visual layout.
  - Replace split-panel layout rules with row-list and inline-expanded-row rules.

Do not create new components for this slice unless the existing file becomes materially harder to read during implementation. The current request is a layout and state refactor inside one page.

---

### Task 1: Lock Row Editing Behavior With Tests

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Update the workspace smoke test for list-first behavior and the Pending label**

In the test named `renders Chores as a chore workspace instead of a setup accordion`, replace the tab/detail expectations after the `Chore list` wait with this shape:

```ts
    expect(screen.getAllByText("Clean bathrooms").length).toBeGreaterThan(0);
    expect(screen.getByText("1 chore has not been reviewed yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start review flow" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Pending" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Recommendation pending" })).toBeNull();
    expect(screen.queryByLabelText("Selected chore title")).toBeNull();
    expect(screen.queryByLabelText("Selected chore cadence")).toBeNull();
    expect(screen.queryByText("Tracked chores")).toBeNull();
    expect(screen.queryByText("Duration concerns")).toBeNull();
    expect(screen.queryByText("Pending recommendations")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Recommendations" })).toBeNull();
    expect(screen.queryByText("Household Context")).toBeNull();
```

Keep the existing `fetchMock` call assertions in that test.

- [ ] **Step 2: Update the empty-state filter test to use the Pending label**

In `shows filter-specific empty Chores states without the add-chore form`, change:

```ts
    fireEvent.click(screen.getByRole("tab", { name: "Recommendation pending" }));
```

to:

```ts
    fireEvent.click(screen.getByRole("tab", { name: "Pending" }));
```

Keep these assertions:

```ts
    expect(screen.getByText("No chores have pending recommendations.")).toBeTruthy();
    expect(screen.queryByText("Add one existing chore manually to start the review queue.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add chore to queue" })).toBeNull();
    expect(screen.queryByLabelText("Chore title")).toBeNull();
```

- [ ] **Step 3: Add a test for opening and cancelling an inline edit row**

Add this test after the Google Calendar source test and before the save/edit test:

```ts
  it("opens active chore editing inline only after clicking a chore row", async () => {
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
          },
          {
            id: "chore-2",
            householdId: "household-1",
            title: "Vacuum bedrooms",
            cadence: "weekly",
            estimatedMinutes: 20,
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
      expect(screen.getByRole("button", { name: "Clean bathrooms weekly / 5 min / manual" })).toBeTruthy();
    });

    expect(screen.queryByLabelText("Selected chore title")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clean bathrooms weekly / 5 min / manual" }));

    expect(screen.getByLabelText("Selected chore title")).toBeTruthy();
    expect(screen.getByLabelText("Selected chore cadence")).toBeTruthy();
    expect(screen.getByLabelText("Selected chore estimated minutes")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Selected chore title"), {
      target: { value: "Clean guest bathroom" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));

    expect(screen.queryByLabelText("Selected chore title")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clean bathrooms weekly / 5 min / manual" }));
    expect(getFieldValue("Selected chore title")).toBe("Clean bathrooms");
  });
```

This test uses the row button accessible name generated from its visible title and metadata. If the implementation adds a visually hidden action label, update the test to the final accessible name, but keep the behavior assertions identical.

- [ ] **Step 4: Add a test for only one expanded row**

Add this test after the inline cancel test:

```ts
  it("keeps only one Chores row expanded at a time", async () => {
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
          },
          {
            id: "chore-2",
            householdId: "household-1",
            title: "Vacuum bedrooms",
            cadence: "weekly",
            estimatedMinutes: 20,
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
      expect(screen.getByRole("button", { name: "Clean bathrooms weekly / 5 min / manual" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Clean bathrooms weekly / 5 min / manual" }));
    expect(getFieldValue("Selected chore title")).toBe("Clean bathrooms");

    fireEvent.click(screen.getByRole("button", { name: "Vacuum bedrooms weekly / 20 min / manual" }));
    expect(getFieldValue("Selected chore title")).toBe("Vacuum bedrooms");
    expect(screen.getAllByLabelText("Selected chore title").length).toBe(1);
  });
```

- [ ] **Step 5: Update the save/edit test to open the row and expect collapse after save**

In `edits the selected Chores chore and shows stale recommendation status`, add this click before changing fields:

```ts
    fireEvent.click(screen.getByRole("button", { name: "Clean bathrooms weekly / 5 min / manual" }));
```

After the existing wait for `Clean main bathroom`, add:

```ts
    expect(screen.queryByLabelText("Selected chore title")).toBeNull();
```

Keep the `fetchMock` PUT assertion unchanged.

- [ ] **Step 6: Update the archive/restore test to open the row before archiving**

In `archives and restores chores in Chores`, add this click before clicking `Archive chore`:

```ts
    fireEvent.click(screen.getByRole("button", { name: "Clean bathrooms weekly / 5 min / manual" }));
```

Keep the existing archived-tab restore assertions.

- [ ] **Step 7: Update the recommendation detail test to expand the row**

In `shows chore recommendations in selected detail without a bottom recommendations panel`, after clicking `Review existing chores`, wait for and click the chore row:

```ts
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Clean bathrooms weekly / 5 min / manual" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Clean bathrooms weekly / 5 min / manual" }));
```

Then keep these expectations:

```ts
    await waitFor(() => {
      expect(screen.getAllByText("Review duration for Clean bathrooms").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Too short.")).toBeTruthy();
    expect(screen.getByText("Confidence: high")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Recommendations" })).toBeNull();
```

- [ ] **Step 8: Run focused tests and verify RED**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: FAIL. The failures should include missing `Pending`, edit fields visible too early, row click not expanding inline, or the old right-side detail behavior. If this command passes, the tests are not asserting the intended behavior and must be corrected before implementation.

- [ ] **Step 9: Do not commit**

Leave the failing test changes uncommitted for Task 2.

---

### Task 2: Refactor ChoresPage to Inline Row Editing

**Files:**
- Modify: `web/src/pages/ChoresPage.tsx`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Rename the pending tab label**

Change the `ChoreStatusTabs` entry:

```ts
  { key: "recommendation-pending", label: "Recommendation pending" },
```

to:

```ts
  { key: "recommendation-pending", label: "Pending" },
```

Leave `formatReviewState` as `Recommendation pending`; row state labels can be more descriptive than compact tabs.

- [ ] **Step 2: Replace selected state with expanded state**

Change:

```ts
  const [selectedChoreId, setSelectedChoreId] = useState<string>();
```

to:

```ts
  const [expandedChoreId, setExpandedChoreId] = useState<string>();
```

Replace:

```ts
  const selectedChore = chores.find((chore) => chore.id === selectedChoreId) ?? chores[0];
  const selectedRecommendation = findRecommendationForChore(selectedChore, recommendations);
```

with:

```ts
  const expandedChore = chores.find((chore) => chore.id === expandedChoreId);
  const expandedRecommendation = findRecommendationForChore(expandedChore, recommendations);
```

Add this concise comment above `expandedChore`:

```ts
  // Like an Angular accordion item keyed by id, only the expanded row owns the edit form.
```

- [ ] **Step 3: Stop selecting a chore during load and create**

In the load effect, delete:

```ts
        setSelectedChoreId(nextChores[0]?.id);
```

In `handleAddChore`, replace:

```ts
    setSelectedChoreId(created.id);
```

with:

```ts
    setExpandedChoreId(undefined);
```

This keeps new chores visible but not automatically opened into edit mode.

- [ ] **Step 4: Sync edit fields only when a row is expanded**

Replace the effect:

```ts
  useEffect(() => {
    if (!selectedChore) return;

    // Similar to Angular ngOnChanges for an @Input, this copies the selected chore
    // into local edit fields so typing can be cancelled or saved explicitly.
    setEditTitle(selectedChore.title);
    setEditCadence(selectedChore.cadence);
    setEditEstimatedMinutes(String(selectedChore.estimatedMinutes));
  }, [selectedChore]);
```

with:

```ts
  useEffect(() => {
    if (!expandedChore) return;

    // Similar to Angular ngOnChanges for an @Input, this copies the expanded chore
    // into local edit fields so typing can be cancelled or saved explicitly.
    setEditTitle(expandedChore.title);
    setEditCadence(expandedChore.cadence);
    setEditEstimatedMinutes(String(expandedChore.estimatedMinutes));
  }, [expandedChore]);
```

- [ ] **Step 5: Add row expand and cancel handlers**

Add these functions after `handleStartReviewFlow`:

```ts
  function handleExpandChore(chore: Chore) {
    setExpandedChoreId((currentId) => (currentId === chore.id ? undefined : chore.id));
  }

  function handleCancelEdit() {
    setExpandedChoreId(undefined);
  }
```

- [ ] **Step 6: Update save and archive handlers to use the expanded chore**

In `handleSaveSelectedChore`, replace all `selectedChore` references with `expandedChore`:

```ts
    if (!householdId || !expandedChore) return;
```

and:

```ts
    const updated = await updateChore(householdId, expandedChore.id, {
```

After `setRecommendations([]);`, add:

```ts
    setExpandedChoreId(undefined);
```

In `handleArchiveSelectedChore`, replace:

```ts
    if (!householdId || !selectedChore) return;
```

with:

```ts
    if (!householdId || !expandedChore) return;
```

Replace:

```ts
    const archived = await archiveChore(householdId, selectedChore.id);
```

with:

```ts
    const archived = await archiveChore(householdId, expandedChore.id);
```

Replace:

```ts
    setSelectedChoreId(undefined);
```

with:

```ts
    setExpandedChoreId(undefined);
```

In `handleRestoreChore`, replace:

```ts
    setSelectedChoreId(restored.id);
```

with:

```ts
    setExpandedChoreId(undefined);
```

- [ ] **Step 7: Replace the split grid/detail JSX with inline rows**

Replace the `visibleChores.length === 0 ? ... : (...)` ready-state branch with this structure:

```tsx
          visibleChores.length === 0 ? (
            <div className="empty-state">
              {getEmptyChoreMessage(activeTab)}
            </div>
          ) : (
            <div className="queue-list chore-row-list" aria-label="Existing chores">
              {visibleChores.map((chore) => {
                const reviewState = getChoreReviewState(chore, recommendations);
                const isExpanded = expandedChoreId === chore.id;

                if (activeTab === "archived") {
                  return (
                    <article className="queue-card chore-row" key={chore.id}>
                      <div className="chore-row-summary">
                        <span>Archived</span>
                        <strong>{chore.title}</strong>
                        <small>{chore.cadence} / {chore.estimatedMinutes} min / {chore.source}</small>
                      </div>
                      <button type="button" onClick={() => handleRestoreChore(chore.id)}>
                        Restore {chore.title}
                      </button>
                    </article>
                  );
                }

                return (
                  <article className={`queue-card chore-row chore-card-${reviewState}`} key={chore.id}>
                    <button
                      aria-expanded={isExpanded}
                      className="chore-row-summary"
                      onClick={() => handleExpandChore(chore)}
                      type="button"
                    >
                      <span>{formatReviewState(reviewState)}</span>
                      <strong>{chore.title}</strong>
                      <small>{chore.cadence} / {chore.estimatedMinutes} min / {chore.source}</small>
                    </button>

                    {isExpanded ? (
                      <div className="chore-row-editor">
                        <p className="eyebrow">{getQueueSignal(chore)}</p>
                        <form className="manual-chore-form inline-chore-form" onSubmit={handleSaveSelectedChore}>
                          <div className="field-grid">
                            <label>
                              Selected chore title
                              <input
                                required
                                value={editTitle}
                                onChange={(event) => setEditTitle(event.target.value)}
                              />
                            </label>
                            <label>
                              Selected chore cadence
                              <input
                                required
                                value={editCadence}
                                onChange={(event) => setEditCadence(event.target.value)}
                              />
                            </label>
                            <label>
                              Selected chore estimated minutes
                              <input
                                min="1"
                                required
                                type="number"
                                value={editEstimatedMinutes}
                                onChange={(event) => setEditEstimatedMinutes(event.target.value)}
                              />
                            </label>
                            <label>
                              Selected chore source
                              <select value="manual" onChange={() => undefined}>
                                <option value="manual">Manual</option>
                              </select>
                            </label>
                          </div>
                          <div className="form-actions">
                            <button type="submit">Save chore changes</button>
                            <button onClick={handleArchiveSelectedChore} type="button">Archive chore</button>
                            <button className="secondary-action" onClick={handleCancelEdit} type="button">Cancel edit</button>
                          </div>
                        </form>
                        {expandedRecommendation ? (
                          <article className="recommendation inline-recommendation">
                            <div>
                              <span className="recommendation-type">Recommendation</span>
                              <h3>{expandedRecommendation.title}</h3>
                              <p>{expandedRecommendation.rationale}</p>
                            </div>
                            <span className="confidence">Confidence: {expandedRecommendation.confidence}</span>
                          </article>
                        ) : (
                          <div className="empty-state">
                            No recommendation for this chore yet.
                          </div>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )
```

This removes the `plan-review-grid` and `detail-panel` usage from Chores row rendering.

- [ ] **Step 8: Verify no stale identifiers remain**

Run:

```bash
rg -n "selectedChore|setSelectedChoreId|detail-panel|Recommendation pending" web/src/pages/ChoresPage.tsx web/src/App.test.tsx
```

Expected:
- No `selectedChore` or `setSelectedChoreId`.
- No `detail-panel` in `ChoresPage.tsx`.
- `Recommendation pending` may remain only in `formatReviewState` if tests do not assert against it as a tab label.

- [ ] **Step 9: Run focused tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```bash
git add web/src/pages/ChoresPage.tsx web/src/App.test.tsx
git commit -m "Refactor Chores into inline row editing"
```

---

### Task 3: Polish Row-First Chores Styling

**Files:**
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add a structural CSS assertion test for Add chore separation**

In the workspace smoke test, after verifying the `Pending` tab, add:

```ts
    const filters = screen.getByRole("tablist", { name: "Chore status filters" });
    const addChoreButton = screen.getByRole("button", { name: "Add chore" });
    expect(filters.contains(addChoreButton)).toBe(false);
```

This guards against accidentally putting `Add chore` back inside the tab group.

- [ ] **Step 2: Run focused tests and verify they still pass**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: PASS. This is a regression guard over the current DOM structure, so it should pass before CSS changes.

- [ ] **Step 3: Replace the filter/add layout styles**

In `web/src/App.css`, replace:

```css
.status-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
```

with:

```css
.chore-list-toolbar {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}

.status-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
```

Update `.chore-list-actions` from:

```css
.chore-list-actions {
  display: flex;
  justify-content: flex-start;
}
```

to:

```css
.chore-list-actions {
  display: flex;
  justify-content: flex-end;
}

.add-chore-action {
  background: #2f694d;
  border-color: #2f694d;
  color: white;
}

.add-chore-action:hover {
  background: #24352e;
  border-color: #24352e;
  color: white;
}
```

Then update the JSX `Add chore` button class in `ChoresPage.tsx` from:

```tsx
<button className="secondary-action" onClick={() => setAddFormOpen((isOpen) => !isOpen)} type="button">
```

to:

```tsx
<button className="add-chore-action" onClick={() => setAddFormOpen((isOpen) => !isOpen)} type="button">
```

- [ ] **Step 4: Wrap filters and add action in the toolbar**

In `ChoresPage.tsx`, wrap the current status tabs and add action with:

```tsx
        <div className="chore-list-toolbar">
          <div className="status-tabs" role="tablist" aria-label="Chore status filters">
            {ChoreStatusTabs.map(({ key, label }) => (
              <button
                aria-selected={activeTab === key}
                key={key}
                onClick={() => {
                  setActiveTab(key as ChoreStatusTab);
                  if (key === "archived" && !archivedLoaded) void handleLoadArchivedChores();
                }}
                role="tab"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="chore-list-actions">
            <button className="add-chore-action" onClick={() => setAddFormOpen((isOpen) => !isOpen)} type="button">
              {addFormOpen ? "Cancel add chore" : "Add chore"}
            </button>
          </div>
        </div>
```

- [ ] **Step 5: Replace split-grid/detail CSS with row editor CSS**

Remove Chores-only reliance on these selectors:

```css
.plan-review-grid,
.plan-empty-grid {
  align-items: start;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.1fr);
}

.detail-panel {
  background: #fffefa;
  border: 1px solid #eaded1;
  border-radius: 16px;
  display: grid;
  gap: 16px;
  min-height: 260px;
  padding: 22px;
}

.detail-panel h3 {
  color: #24352e;
  font-size: 1.45rem;
  margin: 0;
}

.detail-panel > p {
  color: #5e625b;
  line-height: 1.5;
  margin: 0;
}

.detail-panel .manual-chore-form {
  background: transparent;
  border: 0;
  border-radius: 0;
  gap: 16px;
  padding: 0;
}
```

Add these row styles near `.queue-list` and `.queue-card`:

```css
.chore-row-list {
  grid-template-columns: 1fr;
}

.chore-row {
  gap: 0;
  padding: 0;
}

.chore-row-summary {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 8px;
  justify-items: start;
  padding: 16px;
  text-align: left;
  width: 100%;
}

.chore-row-summary:hover,
.chore-row-summary[aria-expanded="true"] {
  background: #eef6ea;
}

.chore-row-editor {
  border-top: 1px solid #eaded1;
  display: grid;
  gap: 16px;
  padding: 18px;
}

.inline-chore-form {
  background: transparent;
  border: 0;
  border-radius: 0;
  gap: 16px;
  padding: 0;
}

.inline-recommendation {
  background: white;
}
```

- [ ] **Step 6: Update mobile CSS**

In the existing mobile media block that sets several grids to `grid-template-columns: 1fr`, remove `.archived-chores .queue-list` if the selector is now unused, and add:

```css
  .chore-list-toolbar {
    align-items: stretch;
    display: grid;
  }

  .chore-list-actions,
  .chore-list-actions button {
    width: 100%;
  }
```

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
npm.cmd run typecheck -w web
```

Expected: both PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add web/src/App.css web/src/pages/ChoresPage.tsx web/src/App.test.tsx
git commit -m "Polish Chores row editing layout"
```

---

### Task 4: Full Verification and Browser Review

**Files:**
- No planned source changes.
- Modify only if verification finds a real defect.

- [ ] **Step 1: Run full web verification**

Run:

```bash
npm.cmd run test -w web
npm.cmd run typecheck -w web
npm.cmd run build -w web
```

Expected: all PASS.

- [ ] **Step 2: Start or reuse the Vite dev server**

Check whether Vite is already running:

```powershell
Test-NetConnection 127.0.0.1 -Port 5173
```

If `TcpTestSucceeded` is `False`, start it:

```powershell
Start-Process npm.cmd -ArgumentList @('run','dev','-w','web','--','--host','127.0.0.1') -WindowStyle Hidden
```

- [ ] **Step 3: Browser review the Chores page**

Open:

```text
http://127.0.0.1:5173/chores
```

Verify:

- Filters are grouped on the left and `Add chore` is separate on the right at desktop width.
- The visible tab label is `Pending`, not `Recommendation pending`.
- No `Selected chore title`, `Selected chore cadence`, or `Selected chore estimated minutes` fields are visible on initial load.
- Clicking `Clean bathrooms` expands that row inline.
- Clicking `Vacuum bedrooms` collapses the first row and expands the second row.
- `Cancel edit` collapses the expanded row.
- `Add chore` opens the add form below the toolbar and above the list.
- `Archived` tab shows archived rows or `No archived chores yet.` without active edit fields.
- At a narrow viewport, toolbar content stacks without text overlap.

- [ ] **Step 4: Fix any browser defects with tests first**

If browser review finds a defect, add or update a test in `web/src/App.test.tsx` first, run it to verify it fails, then patch `ChoresPage.tsx` or `App.css`, and rerun:

```bash
npm.cmd run test -w web -- App.test.tsx
npm.cmd run typecheck -w web
```

Commit fixes with:

```bash
git add web/src/App.test.tsx web/src/pages/ChoresPage.tsx web/src/App.css
git commit -m "Fix Chores row editing browser review issues"
```

- [ ] **Step 5: Final status**

Run:

```bash
git status --short --branch
```

Expected: clean worktree with the branch ahead by the new implementation commits only.

---

## Self-Review Notes

- Spec coverage: The plan covers `Pending` tab wording, separated `Add chore`, no edit form on load, inline row expansion, one expanded row, cancel/save/archive collapse behavior, archived restore behavior, empty states, tests, and browser review.
- Placeholder scan: No `TBD`, `TODO`, or open-ended "handle later" steps are intentionally left.
- Type consistency: The plan consistently uses `expandedChoreId`, `expandedChore`, `expandedRecommendation`, `handleExpandChore`, and `handleCancelEdit` after the state rename.
