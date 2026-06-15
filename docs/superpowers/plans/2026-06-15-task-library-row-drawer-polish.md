# Task Library Row Drawer Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the Tasks page so Task library rows match the approved clickable-row design and use a drawer for task details, edit, archive, and restore actions.

**Architecture:** Keep the work scoped to the existing Tasks page. `TasksPage.tsx` will own row selection and drawer state; `App.css` will style the clickable row, mobile/desktop separator fade, and drawer. Existing API functions stay unchanged because CRUD and archive/restore already exist.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, existing shared `Task` domain types.

---

## File Structure

- Modify: `web/src/pages/TasksPage.tsx`
  - Add selected-task drawer state.
  - Replace per-row `Edit` / `Archive` buttons with a clickable article/button row that opens the drawer.
  - Keep `Add task` as the only library-header creation action.
  - Move edit, archive, and restore controls into the drawer.
  - Keep the existing add/edit form modal for now, but open it from the drawer for existing tasks.
- Modify: `web/src/App.css`
  - Update `.chore-library-row`, `.chore-library-main`, `.chore-library-row-footer`, `.chore-library-meta`, and related selectors to match the approved mockup.
  - Add `.task-library-drawer-*` selectors for the drawer.
  - Add mobile-specific earlier fade for `.chore-library-row-footer::before`.
- Modify: `web/src/App.test.tsx`
  - Update existing Task library CRUD expectations.
  - Add tests for opening a row drawer, moving actions into the drawer, and view-only users not seeing mutation actions.

No database migration is required for this UI-only change.

---

### Task 1: Add Drawer State And Helpers

**Files:**
- Modify: `web/src/pages/TasksPage.tsx`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add a failing test for opening task details from the row**

Add this test near the existing Tasks page tests in `web/src/App.test.tsx`:

```tsx
it("opens Task library details from the full task row", async () => {
  renderAt("/tasks");

  const taskLibrary = await screen.findByRole("region", { name: "Task library" });
  const taskRow = within(taskLibrary).getByRole("button", { name: /Open Test chore details/i });

  fireEvent.click(taskRow);

  const drawer = await screen.findByRole("dialog", { name: "Test chore details" });
  expect(within(drawer).getByRole("heading", { name: "Test chore" })).toBeTruthy();
  expect(within(drawer).getByText("Chore")).toBeTruthy();
  expect(within(drawer).getByText("Manual")).toBeTruthy();
  expect(within(drawer).getByText("No instructions yet.")).toBeTruthy();
});
```

- [ ] **Step 2: Run the single failing test**

Run:

```bash
npm.cmd --prefix web test -- App.test.tsx -t "opens Task library details from the full task row"
```

Expected: FAIL because the row is not currently a `button` and no details drawer exists.

- [ ] **Step 3: Add selected drawer state and close helper**

In `web/src/pages/TasksPage.tsx`, add this state near the existing modal state:

```tsx
const [selectedTask, setSelectedTask] = useState<Task>();
```

Add this helper near the other handlers:

```tsx
function closeTaskDrawer() {
  setSelectedTask(undefined);
}
```

- [ ] **Step 4: Add a drawer renderer**

Add this function inside `TasksPage`, before `renderTaskLibrary()`:

```tsx
function renderTaskDrawer() {
  if (!selectedTask) return null;

  const tags = Array.isArray(selectedTask.tags) && selectedTask.tags.length > 0
    ? selectedTask.tags
    : ["Untagged"];
  const canMutateSelectedTask = canManageTaskLibrary;
  const isArchived = Boolean(selectedTask.archivedAt);

  return (
    <div className="modal-backdrop task-library-drawer-backdrop" role="presentation" onMouseDown={closeTaskDrawer}>
      <aside
        aria-label={`${selectedTask.title} details`}
        aria-modal="true"
        className={`task-library-drawer is-${selectedTask.type}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="task-library-drawer-header">
          <div>
            <p className="eyebrow">Task details</p>
            <h3>{selectedTask.title}</h3>
          </div>
          <button aria-label="Close task details" className="modal-close-button" type="button" onClick={closeTaskDrawer}>X</button>
        </div>

        <div className="task-library-drawer-meta" aria-label="Task metadata">
          <span className={`task-type-badge is-${selectedTask.type}`}>{taskTypeLabel(selectedTask.type)}</span>
          <span className="task-source-pill">{taskSourceLabel(selectedTask.source)}</span>
          {tags.map((tag) => (
            <span className="task-tag-pill" key={tag}>{tag}</span>
          ))}
        </div>

        <section className="task-library-drawer-section">
          <h4>Instructions</h4>
          <p>{selectedTask.instructions?.trim() || "No instructions yet."}</p>
        </section>

        <div className="task-library-drawer-actions">
          {canMutateSelectedTask && !isArchived ? (
            <>
              <button className="secondary-action" type="button" onClick={() => setEditingTask(selectedTask)}>Edit task</button>
              <button className="link-button chore-library-link-action" type="button" onClick={() => setArchiveCandidate(selectedTask)}>Archive task</button>
            </>
          ) : null}
          {canMutateSelectedTask && isArchived ? (
            <button className="secondary-action" type="button" onClick={() => restoreLibraryTask(selectedTask)}>Restore task</button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 5: Render the drawer**

In the returned JSX, after the existing `TaskLibraryModal` block and before the archive confirmation block, render:

```tsx
{renderTaskDrawer()}
```

- [ ] **Step 6: Run the test and verify it still fails for row access**

Run:

```bash
npm.cmd --prefix web test -- App.test.tsx -t "opens Task library details from the full task row"
```

Expected: FAIL because rows still do not call `setSelectedTask(task)`.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/TasksPage.tsx web/src/App.test.tsx
git commit -m "test: cover task library detail drawer"
```

---

### Task 2: Make Task Rows Clickable

**Files:**
- Modify: `web/src/pages/TasksPage.tsx`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Replace the row body markup**

In `renderTaskLibrary()`, replace the current `visibleTasks.map((task) => (...))` article with this markup:

```tsx
{visibleTasks.map((task) => {
  const tags = Array.isArray(task.tags) && task.tags.length > 0 ? task.tags : ["Untagged"];
  return (
    <article
      aria-label={`Open ${task.title} details`}
      className={`chore-library-row task-library-row is-${task.type}`}
      key={task.id}
      onClick={() => setSelectedTask(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setSelectedTask(task);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="chore-library-main">
        <strong>{task.title}</strong>
        <span>{taskTypeLabel(task.type)}</span>
      </div>
      <div className="chore-library-row-footer">
        <div className="chore-library-meta">
          <span className="task-source-pill">
            <span className="task-source-mark" aria-hidden="true">{task.source === "google-calendar" ? "G" : "M"}</span>
            {taskSourceLabel(task.source)}
          </span>
          <span className={`task-type-badge is-${task.type}`}>{taskTypeLabel(task.type)}</span>
          {tags.map((tag) => (
            <span className="task-tag-pill" key={tag}>{tag}</span>
          ))}
        </div>
      </div>
      <span className="task-library-row-chevron" aria-hidden="true">&gt;</span>
    </article>
  );
})}
```

- [ ] **Step 2: Remove old row action expectations**

In `web/src/App.test.tsx`, update the existing test named `shows Task library CRUD controls to members with manage access` so it no longer expects inline Archive buttons:

```tsx
it("shows Task library CRUD controls to members with manage access", async () => {
  mockCurrentUserId = "owner-user";
  renderAt("/tasks");

  const taskLibrary = await screen.findByRole("region", { name: "Task library" });
  expect(within(taskLibrary).getByRole("button", { name: "Add task" })).toBeTruthy();

  fireEvent.click(within(taskLibrary).getByRole("button", { name: /Open Test chore details/i }));

  const drawer = await screen.findByRole("dialog", { name: "Test chore details" });
  expect(within(drawer).getByRole("button", { name: "Edit task" })).toBeTruthy();
  expect(within(drawer).getByRole("button", { name: "Archive task" })).toBeTruthy();
});
```

- [ ] **Step 3: Update view-only expectations**

Update the existing test named `keeps Task library mutation controls unavailable to view-only members`:

```tsx
it("keeps Task library mutation controls unavailable to view-only members", async () => {
  mockCurrentUserId = "member-user";
  renderAt("/tasks");

  const taskLibrary = await screen.findByRole("region", { name: "Task library" });
  expect(within(taskLibrary).getByText("Your household owner controls who can manage the Task library.")).toBeTruthy();
  expect(within(taskLibrary).queryByRole("button", { name: "Add task" })).toBeNull();

  fireEvent.click(within(taskLibrary).getByRole("button", { name: /Open Test chore details/i }));

  const drawer = await screen.findByRole("dialog", { name: "Test chore details" });
  expect(within(drawer).queryByRole("button", { name: "Edit task" })).toBeNull();
  expect(within(drawer).queryByRole("button", { name: "Archive task" })).toBeNull();
});
```

- [ ] **Step 4: Run the focused Tasks tests**

Run:

```bash
npm.cmd --prefix web test -- App.test.tsx -t "Task library"
```

Expected: PASS for Task library tests, or only failures that identify stale inline-button expectations.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/TasksPage.tsx web/src/App.test.tsx
git commit -m "feat: open task library rows into details drawer"
```

---

### Task 3: Move Edit, Archive, And Restore Through The Drawer

**Files:**
- Modify: `web/src/pages/TasksPage.tsx`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add a failing archive-through-drawer test**

Add this test near the other Tasks page CRUD tests:

```tsx
it("archives a Task library item from the details drawer", async () => {
  mockCurrentUserId = "owner-user";
  renderAt("/tasks");

  const taskLibrary = await screen.findByRole("region", { name: "Task library" });
  fireEvent.click(within(taskLibrary).getByRole("button", { name: /Open Test chore details/i }));

  const drawer = await screen.findByRole("dialog", { name: "Test chore details" });
  fireEvent.click(within(drawer).getByRole("button", { name: "Archive task" }));

  const confirmation = await screen.findByRole("dialog", { name: "Archive task" });
  fireEvent.click(within(confirmation).getByRole("button", { name: "Archive task" }));

  expect(await screen.findByText("Task archived.")).toBeTruthy();
});
```

- [ ] **Step 2: Close the drawer when edit starts**

In `renderTaskDrawer()`, change the edit button handler to close the drawer after opening the edit modal:

```tsx
<button
  className="secondary-action"
  type="button"
  onClick={() => {
    setEditingTask(selectedTask);
    closeTaskDrawer();
  }}
>
  Edit task
</button>
```

- [ ] **Step 3: Close the drawer when archive starts**

In `renderTaskDrawer()`, change the archive button handler:

```tsx
<button
  className="link-button chore-library-link-action"
  type="button"
  onClick={() => {
    setArchiveCandidate(selectedTask);
    closeTaskDrawer();
  }}
>
  Archive task
</button>
```

- [ ] **Step 4: Close the drawer after restore**

In `restoreLibraryTask`, add `setSelectedTask(undefined);` inside the success handler after moving the restored task:

```tsx
setSelectedTask(undefined);
setStatusMessage("Task restored.");
```

- [ ] **Step 5: Run the drawer action tests**

Run:

```bash
npm.cmd --prefix web test -- App.test.tsx -t "details drawer|archives a Task library item"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/TasksPage.tsx web/src/App.test.tsx
git commit -m "feat: manage task library items from drawer"
```

---

### Task 4: Style The Approved Row Design

**Files:**
- Modify: `web/src/App.css`
- Test: visual browser check

- [ ] **Step 1: Replace the row and footer CSS**

In `web/src/App.css`, replace the existing `.chore-library-row`, `.chore-library-main`, `.chore-library-row-footer`, `.chore-library-meta`, `.chore-library-actions`, and `.chore-library-link-action` block with:

```css
.chore-library-list {
  display: grid;
  gap: 10px;
}

.chore-library-row {
  background: #fbfeff;
  border: 1px solid var(--color-border);
  border-left: 5px solid var(--color-primary);
  cursor: pointer;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr);
  min-height: 104px;
  padding: 14px 54px 14px 16px;
  position: relative;
  text-align: left;
  transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.chore-library-row.is-commitment {
  border-left-color: #d7a947;
}

.chore-library-row:hover,
.chore-library-row:focus-visible {
  background: #fff;
  border-color: #9fcbd6;
  box-shadow: -4px 4px 0 rgba(19, 106, 129, 0.11);
  outline: 0;
}

.chore-library-row strong,
.chore-library-row span {
  display: block;
}

.chore-library-row strong {
  color: #102f3b;
}

.chore-library-row span {
  color: #52646d;
  font-size: 0.9rem;
  font-weight: 760;
}

.chore-library-main {
  display: grid;
  gap: 3px;
}

.chore-library-row-footer {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding-top: 10px;
  position: relative;
}

.chore-library-row-footer::before {
  background: linear-gradient(90deg, #d8e9ee 0%, #d8e9ee 68%, rgba(216, 233, 238, 0) 100%);
  content: "";
  height: 1px;
  left: 0;
  position: absolute;
  right: -20px;
  top: 0;
}

.chore-library-meta {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.task-source-pill,
.task-tag-pill {
  background: #fff;
  border: 1px solid #d5e8ee;
  color: #48606a;
  font-size: 0.78rem;
  font-weight: 850;
  padding: 4px 7px;
}

.task-source-pill {
  align-items: center;
  color: var(--color-primary-strong);
  display: inline-flex;
  gap: 6px;
}

.task-source-mark {
  align-items: center;
  background: #eaf8fb;
  border: 1px solid #d5e8ee;
  color: var(--color-primary-strong);
  display: inline-grid;
  font-size: 0.74rem;
  font-weight: 900;
  height: 20px;
  justify-items: center;
  width: 20px;
}

.task-library-row-chevron {
  align-items: center;
  color: var(--color-primary-strong);
  display: inline-grid;
  font-size: 1.28rem;
  font-weight: 900;
  inset-block: 0;
  justify-items: center;
  position: absolute;
  right: 16px;
  width: 24px;
}

.task-library-row-chevron::before {
  background: linear-gradient(180deg, rgba(19, 106, 129, 0), rgba(19, 106, 129, 0.18), rgba(19, 106, 129, 0));
  content: "";
  height: calc(100% - 20px);
  left: -12px;
  position: absolute;
  top: 10px;
  width: 1px;
}
```

- [ ] **Step 2: Keep the existing task type badge CSS**

Do not remove:

```css
.task-type-badge { ... }
.task-type-badge.is-commitment { ... }
.task-type-badge.is-chore { ... }
```

If those selectors were inside the replaced block, reinsert them immediately after `.chore-library-meta`.

- [ ] **Step 3: Add mobile row refinements**

Inside the existing mobile media block near the `.chore-library-*` responsive rules, add:

```css
.chore-library-row {
  min-height: 112px;
  padding: 12px 44px 12px 12px;
}

.chore-library-row-footer::before {
  background: linear-gradient(90deg, #d8e9ee 0%, #d8e9ee 48%, rgba(216, 233, 238, 0) 100%);
  right: -10px;
}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 5: Visually verify**

Open `/tasks` in the in-app browser at desktop width and mobile width. Confirm:

- Desktop and mobile rows show source/type/tags grouped on the left.
- No `...` or inline Archive button appears on the row.
- The `>` is vertically centered.
- The divider fades before the arrow, and fades earlier on mobile.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.css
git commit -m "style: polish task library clickable rows"
```

---

### Task 5: Style The Details Drawer

**Files:**
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add drawer CSS**

Add this block near the existing modal CSS in `web/src/App.css`:

```css
.task-library-drawer-backdrop {
  align-items: stretch;
  justify-content: flex-end;
}

.task-library-drawer {
  align-content: start;
  background: #fbfeff;
  border-left: 1px solid var(--color-border);
  box-shadow: -18px 0 42px rgba(9, 52, 68, 0.18);
  display: grid;
  gap: 18px;
  max-width: min(440px, calc(100vw - 28px));
  min-height: 100vh;
  padding: 24px;
  width: 440px;
}

.task-library-drawer.is-commitment {
  border-top: 5px solid #d7a947;
}

.task-library-drawer.is-chore {
  border-top: 5px solid var(--color-primary);
}

.task-library-drawer-header {
  align-items: start;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.task-library-drawer-header h3 {
  color: #102f3b;
  font-size: 1.65rem;
  line-height: 1.08;
  margin: 0;
}

.task-library-drawer-meta {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.task-library-drawer-section {
  border-top: 1px solid #d8e9ee;
  display: grid;
  gap: 8px;
  padding-top: 14px;
}

.task-library-drawer-section h4 {
  color: #102f3b;
  font-size: 0.9rem;
  margin: 0;
}

.task-library-drawer-section p {
  color: #405860;
  margin: 0;
  white-space: pre-wrap;
}

.task-library-drawer-actions {
  align-items: center;
  border-top: 1px solid #d8e9ee;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 16px;
}
```

- [ ] **Step 2: Add mobile drawer CSS**

Inside the existing mobile media block, add:

```css
.task-library-drawer-backdrop {
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.task-library-drawer {
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-section-offset);
  max-height: calc(100vh - 32px);
  min-height: 0;
  overflow: auto;
  padding: 18px;
  width: min(100%, 360px);
}
```

- [ ] **Step 3: Run focused drawer tests**

Run:

```bash
npm.cmd --prefix web test -- App.test.tsx -t "details drawer|Task library"
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/App.css
git commit -m "style: add task library details drawer"
```

---

### Task 6: Final Verification

**Files:**
- Modify if failures reveal necessary fixes:
  - `web/src/pages/TasksPage.tsx`
  - `web/src/App.css`
  - `web/src/App.test.tsx`

- [ ] **Step 1: Run full frontend tests**

Run:

```bash
npm.cmd --prefix web test
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 4: Browser verify `/tasks`**

Use the running dev server and in-app browser. Confirm:

- The desktop Tasks page uses the settings-style sidebar selector.
- The mobile Tasks page uses the mobile section selector.
- Task library rows match `file:///C:/devl/git/chore-helper/.superpowers/brainstorm/tasks-library-polish-session/content/task-library-final-click-row.html`.
- Clicking a row opens the drawer.
- Escape/click outside behavior is not worse than the existing modal baseline; clicking backdrop closes the drawer.
- Add task still opens the form.
- Edit task opens the form from the drawer.
- Archive task opens confirmation from the drawer.
- View-only users can still open the drawer but do not see edit/archive/restore controls.

- [ ] **Step 5: Commit any verification fixes**

If Step 4 finds fixes:

```bash
git add web/src/pages/TasksPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "fix: refine task library drawer interactions"
```

If Step 4 finds no fixes, do not create an empty commit.

---

## Self-Review

- Spec coverage: The plan covers the approved clickable row, left-side source/type/tag metadata, no overflow button, centered chevron, faded separator with mobile earlier fade, and drawer as the edit/archive/detail surface.
- Placeholder scan: No TODO/TBD placeholders remain.
- Type consistency: The plan uses existing `Task`, `Task["type"]`, `Task["source"]`, `setEditingTask`, `archiveCandidate`, `restoreLibraryTask`, and `canManageTaskLibrary` names from `TasksPage.tsx`.
- Scope: This is UI-only and does not require Prisma migrations or API changes.
