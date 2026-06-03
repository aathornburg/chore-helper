# My Home Setup Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the single-home `My Home` workspace into the selected Home setup studio experience while preserving existing household profile, floor, room, and persistence behavior.

**Architecture:** Keep `HouseholdsPage` as the route component and keep existing single-home/multi-home branching. Inside `HouseholdWorkspace`, introduce a reusable studio house model and update Overview/Floors/Rooms panels so they share a larger visual model, quieter actions, and room annotation rows.

**Tech Stack:** React, TypeScript, Vite, Vitest, React Testing Library, existing CSS in `web/src/App.css`.

---

## File Structure

- Modify `web/src/pages/HouseholdsPage.tsx`
  - Add a studio house model renderer for Overview/Floors/Rooms.
  - Replace the compact floor selector calls with the richer studio model.
  - Update room rendering from shadowed cards to flat room annotation rows.
  - Keep existing save handlers and data transformations.
- Modify `web/src/App.css`
  - Add `home-studio-*`, `studio-house-*`, and `room-annotation-*` styles.
  - Remove room cards from shared section-shadow styling.
  - Add minimum height and responsive behavior for the studio workspace.
- Modify `web/src/App.test.tsx`
  - Add tests for the studio model, Overview floor click behavior, quieter room action hierarchy, and preserved room save behavior.
- Reference only: `docs/superpowers/specs/2026-06-02-my-home-setup-studio-design.md`
- Reference only: `docs/my-home-fresh-concepts.html`

## Existing Behavior To Preserve

- Single household still renders the `My Home` route state.
- Multiple households still render the `Homes` list state.
- `onAddHousehold("New household")` still adds another home.
- Profile save still calls `saveHouseholdProfile`.
- Floor and room changes still call `saveHouseholdStructure`.
- Existing tab roles and labels remain accessible.

---

### Task 1: Add Tests For Studio Structure

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add a test for the studio model in My Home**

Add this test near the existing My Home/Households tests:

```tsx
it("renders the single-home workspace as a home setup studio", async () => {
  mockHouseholdsPageFetches({
    householdId: "household-1",
    floors: [
      {
        id: "floor-main",
        householdId: "household-1",
        name: "Main floor",
        levelType: "main",
        flooring: ["hardwood"],
        petImpact: "medium",
        robotVacuumCoverage: "most",
        robotMopCoverage: "partial",
        rooms: [
          {
            id: "room-living",
            floorId: "floor-main",
            name: "Living room",
            flooring: ["hardwood"],
            petImpact: "inherit",
            robotVacuumCoverage: "inherit",
            robotMopCoverage: "inherit"
          }
        ]
      }
    ]
  });

  renderAt("/households");

  expect(await screen.findByRole("heading", { name: "My Home", level: 1 })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Home setup studio" })).toBeTruthy();
  expect(screen.getByRole("group", { name: "Home model" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "View Main floor details, 1 room" })).toBeTruthy();
  expect(screen.getByText("Setup path")).toBeTruthy();
  expect(screen.getByText("Build the house in three passes")).toBeTruthy();
});
```

- [ ] **Step 2: Add a test for Overview floor navigation**

Add this test after the studio structure test:

```tsx
it("opens the Floors view when a floor is selected from the Overview studio model", async () => {
  mockHouseholdsPageFetches({
    householdId: "household-1",
    floors: [
      {
        id: "floor-main",
        householdId: "household-1",
        name: "Main floor",
        levelType: "main",
        flooring: ["tile"],
        petImpact: "medium",
        robotVacuumCoverage: "none",
        robotMopCoverage: "none",
        rooms: []
      },
      {
        id: "floor-upstairs",
        householdId: "household-1",
        name: "Floor 2",
        levelType: "upstairs",
        flooring: ["carpet"],
        petImpact: "low",
        robotVacuumCoverage: "none",
        robotMopCoverage: "none",
        rooms: []
      }
    ]
  });

  renderAt("/households");

  fireEvent.click(await screen.findByRole("button", { name: "View Floor 2 details, 0 rooms" }));

  expect(screen.getByRole("tab", { name: "Floors" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("button", { name: "Select Floor 2, 0 rooms" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("heading", { name: "Floor 2" })).toBeTruthy();
});
```

- [ ] **Step 3: Add a test for quiet room actions**

Add this test near the room management tests:

```tsx
it("renders rooms as annotations with quiet add and edit actions", async () => {
  mockHouseholdsPageFetches({
    householdId: "household-1",
    floors: [
      {
        id: "floor-main",
        householdId: "household-1",
        name: "Main floor",
        levelType: "main",
        flooring: ["tile"],
        petImpact: "medium",
        robotVacuumCoverage: "none",
        robotMopCoverage: "none",
        rooms: [
          {
            id: "room-kitchen",
            floorId: "floor-main",
            name: "Kitchen",
            flooring: ["tile"],
            petImpact: "high",
            robotVacuumCoverage: "inherit",
            robotMopCoverage: "inherit"
          }
        ]
      }
    ]
  });

  renderAt("/households");
  fireEvent.click(await screen.findByRole("tab", { name: "Rooms" }));

  const addRoom = screen.getByRole("button", { name: "Add room to Main floor" });
  expect(addRoom.classList.contains("quiet-link")).toBe(true);

  const room = screen.getByRole("article", { name: "Kitchen room annotation" });
  expect(room.classList.contains("room-annotation")).toBe(true);
  expect(room.classList.contains("room-card")).toBe(false);
  expect(within(room).getByRole("button", { name: "Edit Kitchen" }).classList.contains("quiet-link")).toBe(true);
  expect(within(room).queryByRole("button", { name: "Remove Kitchen" })).toBeNull();
});
```

- [ ] **Step 4: Run the focused tests and verify they fail**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "home setup studio|Overview studio|room annotations"
```

Expected: tests fail because `Home setup studio`, the new button labels, and `room-annotation` classes do not exist yet.

---

### Task 2: Add Studio House Model Markup

**Files:**
- Modify: `web/src/pages/HouseholdsPage.tsx`

- [ ] **Step 1: Add a room count label helper**

Near `roomCount`, add:

```tsx
function floorRoomCountLabel(floor: HouseholdFloor) {
  const count = floor.rooms.length;
  return `${count} room${count === 1 ? "" : "s"}`;
}
```

- [ ] **Step 2: Add a studio model renderer inside `HouseholdWorkspace`**

Inside `HouseholdWorkspace`, replace `renderFloorSelector` with a new `renderStudioHouseModel` helper:

```tsx
  function renderStudioHouseModel({
    mode,
    showActions = false
  }: {
    mode: "overview" | "select";
    showActions?: boolean;
  }) {
    if (!selectedFloor) return null;

    return (
      <aside className="home-studio-model-panel">
        <div className="home-studio-model-heading">
          <p className="eyebrow">Home model</p>
          <strong>{floors.length} floor{floors.length === 1 ? "" : "s"}</strong>
        </div>
        <div className="studio-house" aria-label="Home model" role="group">
          <div className="studio-house-roof" aria-hidden="true" />
          <div className="studio-house-body">
            {floors.map((floor) => {
              const selected = selectedFloor.id === floor.id;
              const roomLabel = floorRoomCountLabel(floor);
              const buttonLabel = mode === "overview"
                ? `View ${floor.name} details, ${roomLabel}`
                : `Select ${floor.name}, ${roomLabel}`;
              return (
                <button
                  aria-label={buttonLabel}
                  aria-pressed={mode === "select" ? selected : undefined}
                  className={`studio-house-floor ${selected ? "is-active" : ""} studio-house-floor-${floor.levelType}`}
                  disabled={isSaving}
                  key={floor.id}
                  onClick={() => (mode === "overview" ? handleOpenFloorFromOverview(floor.id) : handleSelectFloor(floor.id))}
                  type="button"
                >
                  <span>
                    <strong>{floor.name}</strong>
                    <small>{roomLabel}</small>
                  </span>
                  <span className="studio-house-windows" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {showActions ? (
          <div className="home-studio-model-actions">
            <button className="secondary-action" disabled={isSaving} onClick={handleAddFloor} type="button">Add floor</button>
            {!floors.some((floor) => floor.levelType === "basement") ? (
              <button className="secondary-action" disabled={isSaving} onClick={handleAddBasement} type="button">Add basement</button>
            ) : null}
          </div>
        ) : null}
      </aside>
    );
  }
```

- [ ] **Step 3: Keep old selector temporarily if needed**

If other code still calls `renderFloorSelector`, leave it in place until Task 3 replaces all call sites. Do not delete it until TypeScript confirms no references remain.

- [ ] **Step 4: Run TypeScript build to catch syntax errors**

Run:

```powershell
npm.cmd run build -w web
```

Expected: build may fail if old references still exist; continue to Task 3 before treating that as a blocker.

---

### Task 3: Reframe Overview, Floors, And Rooms Into Studio Layouts

**Files:**
- Modify: `web/src/pages/HouseholdsPage.tsx`

- [ ] **Step 1: Label the workspace as the home setup studio**

Change the `HouseholdWorkspace` root section from:

```tsx
<section className="household-workspace" aria-label={`${household.name} home workspace`}>
```

to:

```tsx
<section className="household-workspace" aria-label="Home setup studio">
```

- [ ] **Step 2: Add studio wrapper classes to the tab panels**

For each tab panel section with `className="household-editor"`, change to:

```tsx
className="household-editor home-studio-workspace"
```

- [ ] **Step 3: Update Overview model call**

In the Overview panel, replace:

```tsx
{renderFloorSelector(false, handleOpenFloorFromOverview, false)}
```

with:

```tsx
{renderStudioHouseModel({ mode: "overview" })}
```

- [ ] **Step 4: Update Floors model call**

In the Floors panel, replace:

```tsx
{renderFloorSelector(!isEditingFloor)}
```

with:

```tsx
{renderStudioHouseModel({ mode: "select", showActions: !isEditingFloor })}
```

- [ ] **Step 5: Update Rooms model call**

In the Rooms panel, replace:

```tsx
{renderFloorSelector(false)}
```

with:

```tsx
{renderStudioHouseModel({ mode: "select" })}
```

- [ ] **Step 6: Update Overview copy to match the studio direction**

In the Overview right panel, keep the existing `Home details` content but add a small setup path block before the summary grid:

```tsx
<section className="home-setup-path" aria-label="Home setup path">
  <p className="eyebrow">Setup path</p>
  <h3>Build the house in three passes</h3>
  <div className="home-setup-steps">
    <span><strong>Floors</strong> Name each level.</span>
    <span><strong>Rooms</strong> Add spaces.</span>
    <span><strong>Surfaces</strong> Tell Cleanly what matters.</span>
  </div>
</section>
```

Place it inside the non-editing `home-profile-summary` before `home-summary-grid`.

- [ ] **Step 7: Remove unused old selector helper**

After replacing all calls, delete `renderFloorSelector` if it is no longer referenced.

- [ ] **Step 8: Run build**

Run:

```powershell
npm.cmd run build -w web
```

Expected: TypeScript passes.

---

### Task 4: Convert Rooms From Cards To Annotations

**Files:**
- Modify: `web/src/pages/HouseholdsPage.tsx`

- [ ] **Step 1: Downgrade Add room**

In `renderRoomsPanel`, replace the Add room button:

```tsx
<button
  disabled={isSaving}
  onClick={() => setEditingRoom(createRoom(selectedFloor.id))}
  type="button"
>
  Add room
</button>
```

with:

```tsx
<button
  className="quiet-link"
  disabled={isSaving}
  onClick={() => setEditingRoom(createRoom(selectedFloor.id))}
  type="button"
>
  Add room to {selectedFloor.name}
</button>
```

- [ ] **Step 2: Replace room card markup**

In `renderRoomsPanel`, replace each `article className="room-card"` block with:

```tsx
<article className="room-annotation" aria-label={`${room.name} room annotation`} key={room.id}>
  <div>
    <strong>{room.name}</strong>
    <span>{room.flooring.length > 0 ? room.flooring.join(", ") : "Inherits floor surfaces"}</span>
  </div>
  <span className="room-annotation-meta">Pet impact: {room.petImpact}</span>
  <span className="room-annotation-meta">Vacuum: {room.robotVacuumCoverage}</span>
  <span className="room-annotation-meta">Mop: {room.robotMopCoverage}</span>
  <button className="quiet-link" disabled={isSaving} onClick={() => setEditingRoom(room)} type="button">Edit {room.name}</button>
</article>
```

- [ ] **Step 3: Move remove action into the room editor**

Inside the `editingRoom` form actions, replace:

```tsx
<div className="form-actions">
  <button disabled={isSaving} type="submit">Save room</button>
  <button disabled={isSaving} onClick={() => setEditingRoom(undefined)} type="button">Cancel</button>
</div>
```

with:

```tsx
<div className="room-editor-actions">
  <button className="danger-link" disabled={isSaving || !selectedFloor.rooms.some((room) => room.id === editingRoom.id)} onClick={() => handleRemoveRoom(editingRoom.id)} type="button">
    Remove room
  </button>
  <div className="form-actions">
    <button disabled={isSaving} type="submit">Save room</button>
    <button className="secondary-action" disabled={isSaving} onClick={() => setEditingRoom(undefined)} type="button">Cancel</button>
  </div>
</div>
```

- [ ] **Step 4: Preserve new-room behavior**

Confirm the `Remove room` button is disabled for a brand-new unsaved room because the room ID is not present in `selectedFloor.rooms`.

- [ ] **Step 5: Run focused room tests**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "room"
```

Expected: existing room add/edit tests pass after updating any expected button name from `Add room` to `Add room to Main floor` where needed.

---

### Task 5: Add Studio CSS

**Files:**
- Modify: `web/src/App.css`

- [ ] **Step 1: Remove room cards from the shared shadow selector**

In the `.workspace-shell :is(...)` selector, remove:

```css
.room-card,
.room-card-section
```

Keep `.floor-detail-panel` and `.floor-selector-panel` in the shared section styling.

- [ ] **Step 2: Add studio workspace layout styles**

Add near the existing household styles:

```css
.home-studio-workspace {
  align-items: stretch;
  grid-template-columns: minmax(280px, 0.42fr) minmax(0, 1fr);
  min-height: clamp(560px, 62vh, 780px);
}

.home-studio-model-panel {
  align-content: start;
  background:
    radial-gradient(circle at 50% 18%, rgba(246, 201, 87, 0.18), transparent 13rem),
    linear-gradient(180deg, #fbfeff 0%, #eef8fa 100%);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-section-offset);
  display: grid;
  gap: 16px;
  padding: 18px;
}

.home-studio-model-heading {
  align-items: start;
  display: flex;
  justify-content: space-between;
}

.home-studio-model-heading strong {
  color: var(--color-primary-strong);
}
```

- [ ] **Step 3: Add richer house model styles**

Add:

```css
.studio-house {
  filter: drop-shadow(0 24px 34px rgba(7, 47, 64, 0.16));
  justify-self: center;
  width: min(260px, 100%);
}

.studio-house-roof {
  background: linear-gradient(135deg, var(--color-primary-strong) 0%, var(--color-primary) 72%);
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  height: 84px;
  position: relative;
}

.studio-house-roof::after {
  background: rgba(255, 255, 255, 0.2);
  content: "";
  height: 64px;
  left: 50%;
  position: absolute;
  top: 16px;
  transform: skewX(-28deg);
  width: 46px;
}

.studio-house-body {
  background: linear-gradient(180deg, #ffffff 0%, #edf8fa 100%);
  border: 3px solid var(--color-primary-strong);
  border-top: 0;
}

.studio-house-floor {
  align-items: center;
  background: transparent;
  border: 0;
  border-top: 3px solid var(--color-primary-strong);
  border-radius: 0;
  color: var(--color-primary-strong);
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
  min-height: 72px;
  padding: 13px 16px;
  text-align: left;
  width: 100%;
}

.studio-house-floor:first-child {
  border-top: 0;
}

.studio-house-floor:hover,
.studio-house-floor.is-active {
  background: linear-gradient(90deg, rgba(42, 165, 180, 0.18), transparent), #fbfeff;
  color: var(--color-primary-strong);
}

.studio-house-floor strong,
.studio-house-floor small {
  display: block;
}

.studio-house-floor small {
  color: #667085;
  font-size: 0.82rem;
  margin-top: 3px;
}

.studio-house-windows {
  display: grid;
  gap: 5px;
  grid-template-columns: repeat(2, 10px);
}

.studio-house-windows i {
  background: var(--color-primary-muted);
  border: 1px solid #9fcfd8;
  height: 10px;
  width: 10px;
}
```

- [ ] **Step 4: Add setup path and room annotation styles**

Add:

```css
.home-setup-path {
  background: #f4fbfc;
  border: 1px solid var(--color-border);
  display: grid;
  gap: 12px;
  padding: 14px;
}

.home-setup-path h3 {
  color: var(--color-primary-strong);
  margin: 0;
}

.home-setup-steps {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.home-setup-steps span {
  border-left: 4px solid var(--color-primary);
  color: #36515d;
  display: grid;
  gap: 3px;
  padding-left: 10px;
}

.home-setup-steps strong {
  color: var(--color-primary-strong);
}

.room-annotation {
  align-items: center;
  background: #fbfeff;
  border: 1px solid var(--color-border);
  border-left: 5px solid var(--color-primary);
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr) auto auto auto auto;
  padding: 12px;
}

.room-annotation strong,
.room-annotation span {
  display: block;
}

.room-annotation span {
  color: #667085;
  font-size: 0.84rem;
  margin-top: 2px;
}

.room-annotation-meta {
  background: var(--color-surface-muted);
  color: var(--color-primary-strong) !important;
  font-weight: 800;
  padding: 5px 7px;
  white-space: nowrap;
}

.quiet-link {
  background: transparent;
  border: 0;
  border-radius: 0;
  color: var(--color-primary-strong);
  font: inherit;
  font-weight: 850;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 4px;
}

.quiet-link:hover {
  background: transparent;
  color: #24352e;
}

.room-editor-actions {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}
```

- [ ] **Step 5: Add responsive styles**

Inside the existing mobile media query, add:

```css
.home-studio-workspace,
.home-setup-steps,
.room-annotation {
  grid-template-columns: 1fr;
}

.room-editor-actions {
  align-items: stretch;
  display: grid;
}
```

- [ ] **Step 6: Run build**

Run:

```powershell
npm.cmd run build -w web
```

Expected: build passes.

---

### Task 6: Update Tests And Verify Behavior

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Update existing room tests for the new Add room label**

Where tests use:

```tsx
screen.getByRole("button", { name: "Add room" })
```

replace with:

```tsx
screen.getByRole("button", { name: "Add room to Main floor" })
```

or the selected floor's expected name.

- [ ] **Step 2: Update remove-room tests to open edit first**

If an existing test clicks `Remove Kitchen` directly from a room card, update it to:

```tsx
fireEvent.click(screen.getByRole("button", { name: "Edit Kitchen" }));
fireEvent.click(screen.getByRole("button", { name: "Remove room" }));
```

- [ ] **Step 3: Run the focused Households tests**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "Households|My Home|room|floor|home setup studio"
```

Expected: all selected tests pass.

- [ ] **Step 4: Run production build**

Run:

```powershell
npm.cmd run build -w web
```

Expected: TypeScript and Vite build pass.

---

### Task 7: Visual Verification

**Files:**
- No code changes unless issues are found.

- [ ] **Step 1: Open My Home in the browser**

Run the dev server if it is not already running:

```powershell
npm.cmd run dev -w web
```

Open:

```text
http://127.0.0.1:5173/households
```

- [ ] **Step 2: Verify Overview**

Confirm:

- The large studio house model is visible.
- The setup path appears in the right panel.
- The page uses more than half the viewport height on desktop.
- `Edit home details` is visually quiet.

- [ ] **Step 3: Verify Floors**

Confirm:

- The same house model remains visible.
- Selected floor state is clear.
- `Edit floor`, `Add floor`, and `Add basement` do not all read as competing primary buttons.
- Surface editing remains usable.

- [ ] **Step 4: Verify Rooms**

Confirm:

- Room rows are flat annotations, not shadowed cards.
- `Add room to <floor>` is quiet.
- `Edit <room>` is quiet.
- `Remove room` appears in the edit state and reads as a danger link.

- [ ] **Step 5: Verify narrow layout**

Use a narrow browser viewport and confirm:

- The house model stacks above the work panel.
- Room annotations do not overflow.
- Buttons and text do not overlap.

---

## Self-Review

- Spec coverage: Tasks cover studio model, Overview/Floors/Rooms behavior, quiet room actions, room shadow removal, tests, build, and browser verification.
- Placeholder scan: No unresolved markers or unbounded "add tests" instructions remain.
- Type consistency: All referenced helpers and class names are introduced before use.
