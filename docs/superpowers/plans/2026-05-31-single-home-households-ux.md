# Single-Home Households UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the Households route so one-household users get a direct `My Home` workspace, while multi-household users get a `Homes` list model without introducing an active-household selector.

**Architecture:** Keep `HouseholdsPage` as the route component and branch rendering by `households.length`. Reorganize the existing household editor into a reusable single-home workspace with Overview/Floors/Rooms tabs, a read-only 2D house preview in Overview, a small `More` menu for one-home rare actions, and a list-level multi-home state for two or more homes.

**Tech Stack:** React, TypeScript, Vite, Vitest, React Testing Library, existing CSS in `web/src/App.css`.

---

## File Structure

- Modify `web/src/pages/HouseholdsPage.tsx`
  - Keep the route-level data branching in `HouseholdsPage`.
  - Add `SingleHomeWorkspace` for the one-household `My Home` state.
  - Add `HomesListWorkspace` for the multi-household `Homes` state.
  - Reuse the current profile, floor, and room editing logic by moving it into a shared `HouseholdWorkspace` component.
  - Add a read-only `HousePreview` component for Overview.
- Modify `web/src/App.css`
  - Add scoped styles for `my-home-*`, `homes-list-*`, and the read-only house preview.
  - Keep styles shallow and avoid cards inside cards.
- Modify `web/src/App.test.tsx`
  - Add tests for the one-household `My Home` state.
  - Add tests for the `More` menu and add-home action.
  - Add tests for the multi-household `Homes` state.
  - Update existing Households tests that currently expect the old `Households` dashboard and `Manage` button.
- Reference only: `docs/superpowers/specs/2026-05-31-single-home-households-ux-design.md`
- Reference only: `docs/households-single-home-ux-options.html`

## Existing Behavior To Preserve

- `onAddHousehold("New household")` is still the add-home action.
- Profile save still calls `PUT /api/households/:id/profile`.
- Floor changes still call `PUT /api/households/:id/structure`.
- Room add/edit/remove still persists through the same structure save flow.
- No app-wide active household endpoint or selector should be added.

---

### Task 1: Add Tests For The Single-Home Information Architecture

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add a single-home rendering test**

Add this test near the existing Households page tests:

```tsx
it("renders one household as a My Home workspace without aggregate dashboard framing", async () => {
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
  expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tab", { name: "Floors" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Rooms" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Home floor preview" })).toBeTruthy();
  expect(screen.getByText("Main floor")).toBeTruthy();
  expect(screen.getByText("1 room")).toBeTruthy();

  expect(screen.queryByRole("heading", { name: "Households", level: 1 })).toBeNull();
  expect(screen.queryByText("Property dashboard")).toBeNull();
  expect(screen.queryByText("Household overview")).toBeNull();
  expect(screen.queryByRole("button", { name: "Add household" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Manage" })).toBeNull();
});
```

- [ ] **Step 2: Add an Overview/Floors/Rooms separation test**

Add this test after the previous one:

```tsx
it("keeps the house preview in Overview and out of Floors and Rooms", async () => {
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
        rooms: []
      }
    ]
  });

  renderAt("/households");

  expect(await screen.findByRole("region", { name: "Home floor preview" })).toBeTruthy();

  fireEvent.click(screen.getByRole("tab", { name: "Floors" }));
  expect(screen.queryByRole("region", { name: "Home floor preview" })).toBeNull();
  expect(screen.getByLabelText("Select Main floor")).toBeTruthy();

  fireEvent.click(screen.getByRole("tab", { name: "Rooms" }));
  expect(screen.queryByRole("region", { name: "Home floor preview" })).toBeNull();
  expect(screen.getByRole("button", { name: "Add room" })).toBeTruthy();
});
```

- [ ] **Step 3: Add a More menu test**

Add this test near the one-home tests:

```tsx
it("keeps add another home in a low-emphasis More menu for one household", async () => {
  const fetchMock = mockHouseholdsPageFetches({
    householdId: "household-1",
    floors: []
  });

  renderAt("/households");

  expect(await screen.findByRole("heading", { name: "My Home", level: 1 })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Add household" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "More home actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Add another home" }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "New household" })
      })
    );
  });
});
```

- [ ] **Step 4: Run the new focused tests and verify they fail**

Run:

```powershell
npm.cmd run test -w web -- --runInBand
```

Expected: the new tests fail because the app still renders the old `Households` page, the old `Manage` button, and no `More home actions` menu.

- [ ] **Step 5: Commit the failing tests if working in a dedicated branch**

```powershell
git add web/src/App.test.tsx
git commit -m "test: cover single-home households UX"
```

If this work is happening in the current dirty UI-refinement branch, do not commit unrelated existing changes.

---

### Task 2: Implement The One-Home `My Home` Workspace

**Files:**
- Modify: `web/src/pages/HouseholdsPage.tsx`

- [ ] **Step 1: Add local view/menu types**

Near the existing `ManageTab` type, replace it with:

```tsx
type HomeWorkspaceView = "overview" | "floors" | "rooms";
```

- [ ] **Step 2: Replace the route-level rendering branch**

In `HouseholdsPage`, keep `isAddingHousehold` and `handleAddHousehold`, then replace the returned loaded content with this branching shape:

```tsx
if (isLoading) {
  return (
    <div className="households-page operational-page">
      <div className="empty-state">Loading households...</div>
    </div>
  );
}

if (households.length === 0) {
  return (
    <div className="households-page operational-page">
      <section className="placeholder-page first-home-empty-state">
        <p className="eyebrow">Home setup</p>
        <h1>Set up your home</h1>
        <p className="lede">Create a home model so Cleanly can understand floors, rooms, surfaces, and cleaning coverage.</p>
        <button disabled={isAddingHousehold} onClick={handleAddHousehold} type="button">
          Add household
        </button>
      </section>
    </div>
  );
}

if (households.length === 1) {
  return (
    <div className="households-page operational-page my-home-page">
      <SingleHomeWorkspace
        household={households[0]}
        isAddingHousehold={isAddingHousehold}
        onAddHousehold={handleAddHousehold}
        onReload={onReload}
      />
    </div>
  );
}

return (
  <div className="households-page operational-page homes-page">
    <HomesListWorkspace
      households={householdSummaries}
      isAddingHousehold={isAddingHousehold}
      onAddHousehold={handleAddHousehold}
      onReload={onReload}
    />
  </div>
);
```

Keep the existing `householdSummaries`, `totalFloors`, `totalRooms`, `healthyProfiles`, and `coverageLabel` constants only until Task 4 removes the unused aggregate dashboard variables. After this task, TypeScript will identify unused values.

- [ ] **Step 3: Add `SingleHomeWorkspace`**

Place this component above the current `HouseholdEditor` function:

```tsx
function SingleHomeWorkspace({
  household,
  isAddingHousehold,
  onAddHousehold,
  onReload
}: {
  household: HouseholdAppData;
  isAddingHousehold: boolean;
  onAddHousehold: () => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <header className="my-home-header">
        <div>
          <h1>My Home</h1>
          <p className="lede">Manage floors, rooms, surfaces, pet impact, and cleaning coverage.</p>
        </div>
        <div className="my-home-header-actions">
          <button
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            className="secondary-action my-home-more-button"
            onClick={() => setIsMenuOpen((current) => !current)}
            type="button"
          >
            More
          </button>
          {isMenuOpen ? (
            <div className="my-home-menu" role="menu">
              <button role="menuitem" type="button">
                Rename home
              </button>
              <button disabled={isAddingHousehold} onClick={onAddHousehold} role="menuitem" type="button">
                Add another home
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <HouseholdWorkspace household={household} onReload={onReload} />
    </>
  );
}
```

Before running tests, change the `More` button accessible name to match the test:

```tsx
aria-label="More home actions"
```

- [ ] **Step 4: Convert `HouseholdEditor` into `HouseholdWorkspace`**

Rename:

```tsx
function HouseholdEditor({ household, onReload }: { household: HouseholdAppData; onReload: () => Promise<void> }) {
```

to:

```tsx
function HouseholdWorkspace({ household, onReload }: { household: HouseholdAppData; onReload: () => Promise<void> }) {
```

Inside it, replace:

```tsx
const [isManaging, setIsManaging] = useState(false);
const [manageTab, setManageTab] = useState<ManageTab>("overview");
```

with:

```tsx
const [workspaceView, setWorkspaceView] = useState<HomeWorkspaceView>("overview");
```

Remove `handleToggleManage`. Keep the reset behavior by adding:

```tsx
function handleSelectWorkspaceView(nextView: HomeWorkspaceView) {
  setWorkspaceView(nextView);
  if (nextView !== "floors") setIsEditingSurfaces(false);
  if (nextView !== "rooms") setEditingRoom(undefined);
  setPendingRemoveFloorId(undefined);
}
```

- [ ] **Step 5: Replace the workspace JSX shell**

Replace the old outer return that renders `household-instance panel household-editor-shell`, the `Manage` button, and conditional `isManaging` content with this structure:

```tsx
return (
  <section className="household-workspace" aria-label={`${household.name} home workspace`}>
    <div className="home-workspace-tabs" role="tablist" aria-label={`${household.name} home views`}>
      <button
        aria-selected={workspaceView === "overview"}
        onClick={() => handleSelectWorkspaceView("overview")}
        role="tab"
        type="button"
      >
        Overview
      </button>
      <button
        aria-selected={workspaceView === "floors"}
        onClick={() => handleSelectWorkspaceView("floors")}
        role="tab"
        type="button"
      >
        Floors
      </button>
      <button
        aria-selected={workspaceView === "rooms"}
        onClick={() => handleSelectWorkspaceView("rooms")}
        role="tab"
        type="button"
      >
        Rooms
      </button>
    </div>

    {saveError ? <div className="empty-state" role="status">{saveError}</div> : null}
    {profileError ? <div className="empty-state" role="status">{profileError}</div> : null}

    {workspaceView === "overview" && selectedFloor ? (
      <section className="household-overview" aria-label={`${household.name} overview`}>
        <HousePreview floors={floors} />
        <div className="overview-stat-grid">
          <div>
            <span>Selected floor</span>
            <strong>{selectedFloor.name}</strong>
          </div>
          <div>
            <span>Rooms</span>
            <strong>{floors.reduce((total, floor) => total + floor.rooms.length, 0)}</strong>
          </div>
          <div>
            <span>Surfaces</span>
            <strong>{selectedFloor.flooring.length > 0 ? selectedFloor.flooring.join(", ") : "None set"}</strong>
          </div>
        </div>
        {/* keep the existing household profile form here */}
      </section>
    ) : null}

    {workspaceView === "floors" && selectedFloor ? (
      <section className="household-editor" aria-label="Household floor editor">
        {renderFloorSelector(true)}
        {/* keep the existing floor detail form here */}
      </section>
    ) : null}

    {workspaceView === "rooms" && selectedFloor ? (
      <section className="household-editor" aria-label="Household room editor">
        {renderFloorSelector(false)}
        {renderRoomsPanel()}
      </section>
    ) : null}
  </section>
);
```

Move the existing profile form markup from the old Overview block into the marked location. Move the existing floor detail form from the old Floors block into the marked location.

- [ ] **Step 6: Add `HousePreview`**

Place this component above `HouseholdWorkspace`:

```tsx
function HousePreview({ floors }: { floors: HouseholdFloor[] }) {
  if (floors.length === 0) {
    return (
      <section className="home-floor-preview" aria-label="Home floor preview">
        <div className="home-preview-empty">No floors modeled yet.</div>
      </section>
    );
  }

  return (
    <section className="home-floor-preview" aria-label="Home floor preview">
      <div className="home-preview-elevation" aria-hidden="true">
        <div className="home-preview-roof" />
        {floors.map((floor) => (
          <div className={`home-preview-floor home-preview-floor-${floor.levelType}`} key={floor.id}>
            {floor.name}
          </div>
        ))}
      </div>
      <div className="home-preview-floor-list">
        {floors.map((floor) => (
          <div className="home-preview-floor-row" key={floor.id}>
            <strong>{floor.name}</strong>
            <span>
              {floor.rooms.length} room{floor.rooms.length === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Run focused tests**

Run:

```powershell
npm.cmd run test -w web -- --runInBand
```

Expected: new one-home tests pass or fail only on class/style-independent assertions. Existing Households tests that rely on `Manage` may fail and are addressed in Task 3.

- [ ] **Step 8: Commit one-home workspace implementation if working in a dedicated branch**

```powershell
git add web/src/pages/HouseholdsPage.tsx web/src/App.test.tsx
git commit -m "feat: add single-home households workspace"
```

---

### Task 3: Update Existing Households Tests For The New Workspace

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Update the helper that opens the workspace**

Replace:

```tsx
async function manageHomeHousehold() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Manage" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Manage" }));
}
```

with:

```tsx
async function manageHomeHousehold() {
  await waitFor(() => expect(screen.getByRole("heading", { name: "My Home", level: 1 })).toBeTruthy());
}
```

This keeps existing tests readable while reflecting that the workspace is open by default.

- [ ] **Step 2: Update the first-household add test expectations**

In `adds the first household from the no-households state`, replace:

```tsx
expect(screen.getByRole("heading", { name: "New household" })).toBeTruthy();
expect(screen.getByRole("button", { name: "Manage" })).toBeTruthy();
```

with:

```tsx
expect(screen.getByRole("heading", { name: "My Home", level: 1 })).toBeTruthy();
expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy();
```

- [ ] **Step 3: Update the compact floor selector test**

In `renders a compact floor selector and selects the main floor by default`, replace the first `waitFor` block with:

```tsx
await waitFor(() => {
  expect(screen.getByRole("heading", { name: "My Home", level: 1 })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Home floor preview" })).toBeTruthy();
  expect(screen.queryByLabelText("Select Main floor")).toBeNull();
});
```

Remove:

```tsx
fireEvent.click(screen.getByRole("button", { name: "Manage" }));
```

Keep the later click into `Floors`.

- [ ] **Step 4: Replace property-dashboard test with a one-home overview test**

Rename `renders Households as a property dashboard` to:

```tsx
it("renders the one-home overview with profile form and floor preview", async () => {
```

Update assertions so they check:

```tsx
expect(await screen.findByRole("heading", { name: "My Home", level: 1 })).toBeTruthy();
expect(screen.getByRole("region", { name: "Home floor preview" })).toBeTruthy();
expect(screen.getByLabelText("Household name")).toBeTruthy();
expect(screen.getByLabelText("Home type")).toBeTruthy();
expect(screen.queryByText("Property dashboard")).toBeNull();
```

- [ ] **Step 5: Run Households-focused tests**

Run:

```powershell
npm.cmd run test -w web -- --runInBand
```

Expected: Households tests pass except for multi-home expectations, which Task 4 adds.

- [ ] **Step 6: Commit test updates if working in a dedicated branch**

```powershell
git add web/src/App.test.tsx
git commit -m "test: update households workspace expectations"
```

---

### Task 4: Implement The Multi-Home `Homes` List State

**Files:**
- Modify: `web/src/pages/HouseholdsPage.tsx`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add a multi-home test**

Add this test near `renders all households without an active household selector`:

```tsx
it("renders multiple households as a Homes list with a list-level add action", async () => {
  const secondHousehold = {
    ...createHouseholdAppData({
      structure: {
        householdId: "household-2",
        floors: [
          {
            id: "floor-cabin-main",
            householdId: "household-2",
            name: "Main floor",
            levelType: "main",
            flooring: [],
            petImpact: "none",
            robotVacuumCoverage: "none",
            robotMopCoverage: "none",
            rooms: []
          }
        ]
      }
    }),
    id: "household-2",
    name: "Cabin"
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url === "http://localhost:3001/api/me" && method === "GET") {
      return { ok: true, json: async () => ({ id: "app-user-1", clerkUserId: "test-user-a" }) };
    }

    if (url === "http://localhost:3001/api/households" && method === "GET") {
      return { ok: true, json: async () => [createHouseholdAppData(), secondHousehold] };
    }

    if (url === "http://localhost:3001/api/households" && method === "POST") {
      return { ok: true, json: async () => ({ id: "household-new", name: "New household" }) };
    }

    throw new Error(`Unhandled fetch ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  renderAt("/households");

  expect(await screen.findByRole("heading", { name: "Homes", level: 1 })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add another home" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Home summary" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Cabin summary" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "My Home", level: 1 })).toBeNull();
  expect(screen.queryByText(/active household/i)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Add another home" }));
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/households",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "New household" })
      })
    );
  });
});
```

- [ ] **Step 2: Add `HomesListWorkspace`**

Place this component above `SingleHomeWorkspace`:

```tsx
function HomesListWorkspace({
  households,
  isAddingHousehold,
  onAddHousehold,
  onReload
}: {
  households: Array<{ household: HouseholdAppData; rooms: number; setupQuality: string }>;
  isAddingHousehold: boolean;
  onAddHousehold: () => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [expandedHouseholdId, setExpandedHouseholdId] = useState<string>(households[0]?.household.id ?? "");
  const expanded = households.find(({ household }) => household.id === expandedHouseholdId)?.household;

  return (
    <>
      <header className="page-command-header homes-list-header">
        <div>
          <h1>Homes</h1>
          <p className="lede">Manage each home's floors, rooms, surfaces, and cleaning coverage.</p>
        </div>
        <button disabled={isAddingHousehold} onClick={onAddHousehold} type="button">
          Add another home
        </button>
      </header>

      <section className="homes-list" aria-label="Homes">
        {households.map(({ household, rooms, setupQuality }) => (
          <article className="homes-list-card" aria-label={`${household.name} summary`} key={household.id}>
            <div>
              <h2>{household.name}</h2>
              <p>{setupQuality}</p>
              <span>
                {household.structure.floors.length} floor{household.structure.floors.length === 1 ? "" : "s"} / {rooms} room{rooms === 1 ? "" : "s"}
              </span>
            </div>
            <button onClick={() => setExpandedHouseholdId(household.id)} type="button">
              Manage {household.name}
            </button>
          </article>
        ))}
      </section>

      {expanded ? <HouseholdWorkspace household={expanded} onReload={onReload} /> : null}
    </>
  );
}
```

- [ ] **Step 3: Update the older multi-home test**

In `renders all households without an active household selector`, replace labels:

```tsx
expect(screen.getByLabelText("Home floor editor")).toBeTruthy();
expect(screen.getByLabelText("Cabin floor editor")).toBeTruthy();
```

with:

```tsx
expect(screen.getByRole("region", { name: "Home summary" })).toBeTruthy();
expect(screen.getByRole("region", { name: "Cabin summary" })).toBeTruthy();
```

Keep:

```tsx
expect(screen.queryByText(/active household/i)).toBeNull();
expect(fetchMock.mock.calls.some(([url]) => url === "http://localhost:3001/api/me/active-household")).toBe(false);
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm.cmd run test -w web -- --runInBand
```

Expected: tests pass or fail only on styling-independent naming mismatches. Fix accessible names before moving on.

- [ ] **Step 5: Commit multi-home state if working in a dedicated branch**

```powershell
git add web/src/pages/HouseholdsPage.tsx web/src/App.test.tsx
git commit -m "feat: add homes list escalation state"
```

---

### Task 5: Remove Old Dashboard Variables And Polish Households CSS

**Files:**
- Modify: `web/src/pages/HouseholdsPage.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Remove unused aggregate variables**

In `HouseholdsPage`, remove these variables if TypeScript reports them unused:

```tsx
const totalFloors = householdSummaries.reduce((total, { household }) => total + household.structure.floors.length, 0);
const totalRooms = householdSummaries.reduce((total, { rooms }) => total + rooms, 0);
const healthyProfiles = householdSummaries.filter(({ setupQuality }) => setupQuality === "Profile healthy").length;
const coverageLabel = households.length > 0
  ? `${healthyProfiles} of ${households.length} profile${households.length === 1 ? "" : "s"} healthy`
  : "Add a household to begin";
```

- [ ] **Step 2: Add CSS for the new page shell**

Add these styles near the existing Households styles in `web/src/App.css`:

```css
.my-home-page,
.homes-page {
  align-content: start;
}

.my-home-header,
.homes-list-header {
  align-items: start;
  display: flex;
  gap: 18px;
  justify-content: space-between;
}

.my-home-header h1,
.homes-list-header h1 {
  color: var(--color-primary-strong);
  font-size: 2.75rem;
  line-height: 1;
  margin: 0 0 10px;
}

.my-home-header-actions {
  position: relative;
}

.my-home-more-button {
  background: transparent;
  border-color: transparent;
  color: var(--color-primary-strong);
  padding-inline: 8px;
}

.my-home-menu {
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 18px 38px rgba(15, 76, 102, 0.14);
  display: grid;
  min-width: 180px;
  padding: 6px;
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 4;
}

.my-home-menu button {
  background: transparent;
  color: #24352e;
  justify-content: start;
  padding: 10px 12px;
  text-align: left;
}

.my-home-menu button:hover {
  background: var(--color-primary-soft);
  color: var(--color-primary-strong);
}

.household-workspace {
  display: grid;
  gap: 18px;
}

.home-workspace-tabs {
  align-items: center;
  background: var(--color-primary-muted);
  border-radius: 999px;
  display: inline-flex;
  gap: 6px;
  justify-self: start;
  padding: 6px;
}

.home-workspace-tabs button {
  background: transparent;
  border-color: transparent;
  color: #24352e;
  padding: 9px 14px;
}

.home-workspace-tabs button[aria-selected="true"] {
  background: var(--color-primary);
  color: #fff;
}

.home-floor-preview {
  align-items: center;
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(150px, 0.42fr) minmax(0, 1fr);
}

.home-preview-elevation {
  display: grid;
  justify-items: center;
}

.home-preview-roof {
  border-bottom: 38px solid var(--color-primary-strong);
  border-left: 70px solid transparent;
  border-right: 70px solid transparent;
  height: 0;
  width: 0;
}

.home-preview-floor {
  align-items: center;
  background: var(--color-surface-elevated);
  border: 2px solid var(--color-primary-strong);
  border-top: 0;
  color: var(--color-primary-strong);
  display: flex;
  font-weight: 850;
  height: 44px;
  justify-content: center;
  width: 140px;
}

.home-preview-floor-main {
  background: var(--color-primary-soft);
}

.home-preview-floor-basement {
  background: var(--color-surface-muted);
}

.home-preview-floor-list {
  display: grid;
  gap: 0;
}

.home-preview-floor-row {
  align-items: center;
  border-top: 1px solid var(--color-border);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 12px 0;
}

.home-preview-floor-row:first-child {
  border-top: 0;
}

.home-preview-floor-row strong {
  color: #24352e;
}

.home-preview-floor-row span,
.home-preview-empty {
  color: #5e625b;
}

.homes-list {
  display: grid;
  gap: 12px;
}

.homes-list-card {
  align-items: center;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  display: flex;
  gap: 18px;
  justify-content: space-between;
  padding: 16px;
}

.homes-list-card h2,
.homes-list-card p {
  margin: 0;
}

.homes-list-card span {
  color: #5e625b;
  display: block;
  margin-top: 6px;
}
```

- [ ] **Step 3: Add responsive CSS**

Inside the existing `@media (max-width: 680px)` block, add:

```css
.my-home-header,
.homes-list-header,
.homes-list-card,
.home-floor-preview {
  display: grid;
  grid-template-columns: 1fr;
}

.my-home-header h1,
.homes-list-header h1 {
  font-size: 2.35rem;
}

.home-workspace-tabs {
  overflow-x: auto;
  max-width: 100%;
}

.my-home-menu {
  left: 0;
  right: auto;
}
```

- [ ] **Step 4: Run build for unused variables and type errors**

Run:

```powershell
npm.cmd run build -w web
```

Expected: TypeScript build passes. If it fails on unused variables, remove the reported unused variables/imports in `HouseholdsPage.tsx`.

- [ ] **Step 5: Run tests**

Run:

```powershell
npm.cmd run test -w web -- --runInBand
```

Expected: all tests pass.

- [ ] **Step 6: Commit CSS and cleanup if working in a dedicated branch**

```powershell
git add web/src/pages/HouseholdsPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "style: polish single-home households layout"
```

---

### Task 6: Final Verification And Documentation Update

**Files:**
- Modify: `docs/superpowers/specs/2026-05-31-single-home-households-ux-design.md` only if implementation reveals a design correction.
- Modify: `docs/households-single-home-ux-options.html` only if the comparison no longer matches the implemented direction.

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm.cmd run build -w web
npm.cmd run test -w web
```

Expected:

- Build exits `0`.
- Vitest exits `0`.
- Test count may change, but all tests pass.

- [ ] **Step 2: Manual browser check**

Start the app using the repo's normal dev command:

```powershell
npm.cmd run dev -w web
```

Open the Households route in the in-app browser at the dev server URL, usually:

```text
http://localhost:5173/households
```

Check:

- One household shows `My Home`.
- Overview shows the house preview.
- `More` opens a menu containing `Add another home`.
- Floors shows the floor editor and no Overview preview.
- Rooms shows the room editor and no Overview preview.
- Multiple households show `Homes` and list-level `Add another home`.

- [ ] **Step 3: Inspect git diff**

Run:

```powershell
git diff -- web/src/pages/HouseholdsPage.tsx web/src/App.css web/src/App.test.tsx
```

Expected:

- No accidental backend/API contract changes.
- No active-household selector or endpoint usage.
- No unrelated UI changes outside Households selectors.

- [ ] **Step 4: Final commit if working in a dedicated branch**

```powershell
git add web/src/pages/HouseholdsPage.tsx web/src/App.css web/src/App.test.tsx docs/superpowers/specs/2026-05-31-single-home-households-ux-design.md docs/households-single-home-ux-options.html
git commit -m "feat: redesign households for single-home users"
```

If prior tasks already committed all implementation and docs, skip this final commit and keep the working tree clean.

---

## Self-Review

- Spec coverage: the plan covers one-home `My Home`, Overview/Floors/Rooms separation, read-only house preview, `More` menu add-home action, multi-home `Homes` list escalation, zero-household setup, tests, and no active-household selector.
- Placeholder scan: the plan contains concrete file paths, test snippets, component snippets, CSS snippets, commands, and expected outcomes.
- Type consistency: `HomeWorkspaceView`, `SingleHomeWorkspace`, `HomesListWorkspace`, `HouseholdWorkspace`, and `HousePreview` are introduced before use.
