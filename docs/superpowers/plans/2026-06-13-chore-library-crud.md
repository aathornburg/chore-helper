# Chore Library CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Settings **Chore library** with per-person manage permissions, definition-only chore creation, edit/archive/restore flows, and archive-safe server authorization.

**Architecture:** Add a small household-member permission field for Chore library access, following the existing calendar import policy mental model but storing the permission on household membership because it is a household capability. Server routes remain authoritative for create/update/archive/restore authorization. The frontend exposes the permission in Family settings and renders Chore library CRUD controls based on the current user's permission.

**Tech Stack:** TypeScript, React, Express, Prisma, Vitest, Testing Library, shared workspace package.

---

## File Structure

- Modify `shared/src/types.ts`
  - Add `ChoreLibraryPermission`.
  - Add `choreLibraryPermission` to `HouseholdMemberSummary`.
  - Add `CreateChoreInput` for definition-only chore creation.
- Modify `server/prisma/schema.prisma`
  - Add `choreLibraryPermission String @default("view")` to `HouseholdMember`.
- Modify `server/src/repositories/inMemoryStore.ts`
  - Store default member permission.
  - Add store methods for updating permissions and creating definition-only chores.
  - Ensure archive prevents future active work.
- Modify `server/src/repositories/prismaStore.ts`
  - Persist member permission.
  - Add matching store methods.
  - Ensure archive prevents future active work.
- Modify `server/src/routes/households.ts`
  - Add owner-only permission update route.
  - Add create definition-only chore route behavior.
  - Gate create/update/archive/restore by owner or `manage`.
- Modify `web/src/api.ts`
  - Add `createChore`.
  - Add `updateChoreLibraryPermission`.
  - Adjust exported types as needed.
- Modify `web/src/pages/SettingsPage.tsx`
  - Rename the tab to `Chore library`.
  - Load archived chores and schedules when needed.
  - Add search/source/status filters.
  - Add add/edit/archive/restore UI.
  - Rename Family import controls to Family permissions and add Chore library permission select.
- Modify `web/src/App.css`
  - Add Chore library table/card/modal styles using existing settings patterns.
- Test `server/test/households.test.ts`
  - Backend permissions and definition-only CRUD.
- Test `web/src/App.test.tsx`
  - Settings labels, permissions, and Chore library CRUD states.

---

### Task 1: Shared Types and Store Contract

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `server/src/repositories/inMemoryStore.ts`

- [ ] **Step 1: Add shared permission and definition-only input types**

In `shared/src/types.ts`, add the permission type near the other household/member types:

```ts
export type ChoreLibraryPermission = "view" | "manage";
```

Update `HouseholdMemberSummary` so it includes the new permission:

```ts
export type HouseholdMemberSummary = {
  userId: string;
  role: "owner" | "member";
  displayName?: string;
  primaryEmail?: string;
  choreLibraryPermission: ChoreLibraryPermission;
};
```

Add a definition-only chore input beside `ChoreDefinitionInput`:

```ts
export type CreateChoreInput = ChoreDefinitionInput;
```

- [ ] **Step 2: Update server store imports and contract**

In `server/src/repositories/inMemoryStore.ts`, add `ChoreLibraryPermission` and `CreateChoreInput` to the shared imports.

Add this type near `HouseholdMemberMutationResult`:

```ts
export type ChoreLibraryPermissionUpdate = {
  choreLibraryPermission: ChoreLibraryPermission;
};
```

Add these methods to `HouseholdStore`:

```ts
  updateChoreLibraryPermission(
    householdId: string,
    userId: string,
    update: ChoreLibraryPermissionUpdate
  ): StoreResult<HouseholdMemberSummary | undefined>;
  createChore(householdId: string, chore: CreateChoreInput): StoreResult<Chore>;
```

- [ ] **Step 3: Run shared/server typecheck to verify expected failures**

Run:

```bash
npm run typecheck -w server
```

Expected: FAIL because `createInMemoryStore` and `createPrismaStore` do not implement the new store methods yet, and member mapping does not provide `choreLibraryPermission`.

- [ ] **Step 4: Commit**

```bash
git add shared/src/types.ts server/src/repositories/inMemoryStore.ts
git commit -m "Add chore library shared contract"
```

---

### Task 2: Backend Persistence and Authorization

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Modify: `server/src/routes/households.ts`
- Test: `server/test/households.test.ts`

- [ ] **Step 1: Write backend permission tests**

Add tests to `server/test/households.test.ts` near existing chore update/archive tests:

```ts
it("defaults new household members to view-only chore library access", async () => {
  const owner = auth(app, "owner");
  const household = await owner.post("/api/households").send({ name: "Library Home" }).expect(201);
  const invitation = await owner
    .post(`/api/households/${household.body.id}/invitations`)
    .send({ recipientEmail: "member@example.com", role: "member" })
    .expect(201);

  await auth(app, "member")
    .post(`/api/invitations/${invitation.body.token}/accept`)
    .expect(200);

  const members = await owner.get(`/api/households/${household.body.id}/members`).expect(200);

  expect(members.body).toEqual(expect.arrayContaining([
    expect.objectContaining({
      primaryEmail: "member@example.com",
      choreLibraryPermission: "view"
    })
  ]));
});

it("lets owners grant chore library management to individual members", async () => {
  const context = await createHouseholdWithMember();

  const updated = await auth(app, "owner")
    .patch(`/api/households/${context.householdId}/members/${context.memberId}/chore-library-permission`)
    .send({ choreLibraryPermission: "manage" })
    .expect(200);

  expect(updated.body).toEqual(expect.objectContaining({
    userId: context.memberId,
    choreLibraryPermission: "manage"
  }));
});

it("allows manage members to create, update, archive, and restore library chores", async () => {
  const context = await createHouseholdWithMember();
  await auth(app, "owner")
    .patch(`/api/households/${context.householdId}/members/${context.memberId}/chore-library-permission`)
    .send({ choreLibraryPermission: "manage" })
    .expect(200);

  const created = await auth(app, "member")
    .post(`/api/households/${context.householdId}/chores`)
    .send({ chore: { title: "Wipe counters", source: "manual", instructions: "Use spray.", tags: ["kitchen"] } })
    .expect(201);

  expect(created.body.title).toBe("Wipe counters");

  const updated = await auth(app, "member")
    .put(`/api/households/${context.householdId}/chores/${created.body.id}`)
    .send({ title: "Wipe kitchen counters", source: "manual", instructions: "Use spray.", tags: ["kitchen"] })
    .expect(200);

  expect(updated.body.title).toBe("Wipe kitchen counters");

  const archived = await auth(app, "member")
    .post(`/api/households/${context.householdId}/chores/${created.body.id}/archive`)
    .expect(200);

  expect(archived.body.archivedAt).toEqual(expect.any(String));

  const restored = await auth(app, "member")
    .post(`/api/households/${context.householdId}/chores/${created.body.id}/restore`)
    .expect(200);

  expect(restored.body.archivedAt).toBeUndefined();
});

it("blocks view-only members from mutating chore library chores", async () => {
  const context = await createHouseholdWithMember();
  const created = await auth(app, "owner")
    .post(`/api/households/${context.householdId}/chores`)
    .send({ chore: { title: "Dust shelves", source: "manual", tags: ["dusting"] } })
    .expect(201);

  await auth(app, "member")
    .post(`/api/households/${context.householdId}/chores`)
    .send({ chore: { title: "Vacuum stairs", source: "manual" } })
    .expect(403);

  await auth(app, "member")
    .put(`/api/households/${context.householdId}/chores/${created.body.id}`)
    .send({ title: "Dust book shelves", source: "manual", tags: ["dusting"] })
    .expect(403);

  await auth(app, "member")
    .post(`/api/households/${context.householdId}/chores/${created.body.id}/archive`)
    .expect(403);
});
```

If `createHouseholdWithMember()` does not exist, add a helper using the existing test helper style in the file:

```ts
async function createHouseholdWithMember() {
  const household = await auth(app, "owner").post("/api/households").send({ name: "Shared Home" }).expect(201);
  const invitation = await auth(app, "owner")
    .post(`/api/households/${household.body.id}/invitations`)
    .send({ recipientEmail: "member@example.com", role: "member" })
    .expect(201);
  await auth(app, "member").post(`/api/invitations/${invitation.body.token}/accept`).expect(200);
  return {
    householdId: household.body.id as string,
    memberId: "member"
  };
}
```

- [ ] **Step 2: Run backend tests to verify they fail**

Run:

```bash
npm run test -w server -- households.test.ts
```

Expected: FAIL with missing `choreLibraryPermission`, missing route, or 400 on definition-only chore creation.

- [ ] **Step 3: Add Prisma field**

In `server/prisma/schema.prisma`, update `HouseholdMember`:

```prisma
model HouseholdMember {
  id                     String    @id @default(cuid())
  householdId            String
  household              Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  userId                 String
  user                   User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  role                   String
  choreLibraryPermission String    @default("view")
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  @@unique([householdId, userId])
}
```

- [ ] **Step 4: Implement in-memory store changes**

In `server/src/repositories/inMemoryStore.ts`:

Update membership creation to include `choreLibraryPermission: "manage"` for household creators/owners and `"view"` for accepted members unless explicitly provided.

Update `listHouseholdMembers()` mapping to return:

```ts
choreLibraryPermission: membership.role === "owner" ? "manage" : membership.choreLibraryPermission ?? "view"
```

Add:

```ts
updateChoreLibraryPermission(householdId, userId, update) {
  const key = membershipKey(householdId, userId);
  const membership = memberships.get(key);
  if (!membership) return undefined;
  const updated = {
    ...membership,
    choreLibraryPermission: update.choreLibraryPermission
  };
  memberships.set(key, updated);
  const user = users.get(userId);
  return {
    userId,
    role: updated.role,
    displayName: user?.displayName,
    primaryEmail: user?.primaryEmail,
    choreLibraryPermission: updated.role === "owner" ? "manage" : updated.choreLibraryPermission
  };
},
createChore(householdId, chore) {
  const createdChore: Chore = {
    id: randomUUID(),
    householdId,
    ...chore
  };
  chores.set(householdId, [...(chores.get(householdId) ?? []), createdChore]);
  return createdChore;
},
```

Update `archiveChore()` to also archive active schedules for the chore:

```ts
for (const [scheduleId, schedule] of schedules.entries()) {
  if (schedule.householdId === householdId && schedule.choreId === choreId && !schedule.archivedAt) {
    schedules.set(scheduleId, { ...schedule, archivedAt: updated.archivedAt });
  }
}
```

- [ ] **Step 5: Implement Prisma store changes**

In `server/src/repositories/prismaStore.ts`:

Update member mapping helpers to include:

```ts
choreLibraryPermission: member.role === "owner" ? "manage" : ((member.choreLibraryPermission ?? "view") as ChoreLibraryPermission)
```

Add:

```ts
async updateChoreLibraryPermission(householdId, userId, update) {
  const member = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
    include: { user: true }
  });
  if (!member) return undefined;
  const saved = await prisma.householdMember.update({
    where: { householdId_userId: { householdId, userId } },
    data: { choreLibraryPermission: update.choreLibraryPermission },
    include: { user: true }
  });
  return {
    userId: saved.userId,
    role: saved.role as "owner" | "member",
    displayName: saved.user.displayName ?? undefined,
    primaryEmail: saved.user.primaryEmail ?? undefined,
    choreLibraryPermission: saved.role === "owner" ? "manage" : (saved.choreLibraryPermission as ChoreLibraryPermission)
  };
},
async createChore(householdId, chore) {
  const created = await prisma.chore.create({
    data: {
      id: randomUUID(),
      householdId,
      title: chore.title,
      source: chore.source,
      instructions: chore.instructions,
      tags: JSON.stringify(chore.tags ?? [])
    }
  });
  await this.markRecommendationsStale(householdId);
  return toChore(created);
},
```

Update `archiveChore()` transaction so active schedules for that chore get `archivedAt` set to the same timestamp:

```ts
const archivedAt = new Date();
const updated = await prisma.$transaction(async (tx) => {
  const chore = await tx.chore.update({
    where: { id: choreId, householdId },
    data: { archivedAt }
  });
  await tx.choreSchedule.updateMany({
    where: { householdId, choreId, archivedAt: null },
    data: { archivedAt }
  });
  return chore;
});
```

- [ ] **Step 6: Implement route authorization and definition-only create**

In `server/src/routes/households.ts`, add:

```ts
const choreLibraryPermissions = ["view", "manage"] as const;
```

Add helper near existing access helpers:

```ts
async function requireChoreLibraryManage(req: Request, res: Response) {
  const access = await requireHouseholdAccess(req, res);
  if (!access) return undefined;
  if (access.membership.role === "owner") return access;
  const members = await store.listHouseholdMembers(access.household.id);
  const currentMember = members.find((member) => member.userId === access.user.id);
  if (currentMember?.choreLibraryPermission !== "manage") {
    res.status(403).json({ error: "You do not have permission to manage the chore library." });
    return undefined;
  }
  return access;
}
```

Add owner-only route after member role routes:

```ts
router.patch("/:householdId/members/:userId/chore-library-permission", async (req, res) => {
  const access = await requireHouseholdOwner(req, res);
  if (!access) return;
  if (!isOneOf(req.body.choreLibraryPermission, choreLibraryPermissions)) {
    return res.status(400).json({ error: "Invalid chore library permission" });
  }

  const updated = await store.updateChoreLibraryPermission(access.household.id, req.params.userId, {
    choreLibraryPermission: req.body.choreLibraryPermission
  });
  if (!updated) return res.status(404).json({ error: "Household member not found" });

  return res.status(200).json(updated);
});
```

Change `router.post("/:householdId/chores"` so it accepts either scheduled payloads or definition-only payloads:

```ts
const access = await requireChoreLibraryManage(req, res);
if (!access) return;

if (Array.isArray(req.body.schedules)) {
  // keep existing scheduled create flow
}

const parsed = choreSchema.safeParse(req.body.chore);
if (!parsed.success) return res.status(400).json({ error: "Invalid chore payload" });
const chore = await store.createChore(access.household.id, parsed.data);
return res.status(201).json(chore);
```

Change update/archive/restore chore routes to use `requireChoreLibraryManage(req, res)` instead of owner-only access.

- [ ] **Step 7: Run backend tests**

Run:

```bash
npm run test -w server -- households.test.ts
```

Expected: PASS.

Run:

```bash
npm run typecheck -w server
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add shared/src/types.ts server/prisma/schema.prisma server/src/repositories/inMemoryStore.ts server/src/repositories/prismaStore.ts server/src/routes/households.ts server/test/households.test.ts
git commit -m "Add chore library permissions API"
```

---

### Task 3: Frontend API and Chore Library UI

**Files:**
- Modify: `web/src/api.ts`
- Modify: `web/src/pages/SettingsPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write frontend tests for labels and permissions**

In `web/src/App.test.tsx`, add tests near the Settings tests:

```tsx
it("shows Chore library as a settings view", async () => {
  mockSettingsPageFetches();
  renderAppAt("/settings");

  expect(await screen.findByRole("heading", { name: "Settings" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Chore library" })).toBeTruthy();
});

it("lets owners update each member's Chore library permission", async () => {
  const fetchMock = mockSettingsPageFetches();
  renderAppAt("/settings");

  fireEvent.click(await screen.findByRole("tab", { name: "Family" }));
  const select = await screen.findByLabelText("Member User chore library permission");
  fireEvent.change(select, { target: { value: "manage" } });

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/households/household-1/members/member-user/chore-library-permission"),
      expect.objectContaining({ method: "PATCH" })
    );
  });
});

it("shows CRUD controls to users who can manage the Chore library", async () => {
  mockSettingsPageFetches({ choreLibraryPermission: "manage" });
  renderAppAt("/settings");

  fireEvent.click(await screen.findByRole("tab", { name: "Chore library" }));

  expect(await screen.findByRole("button", { name: "Add chore" })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Edit chore" }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: "Archive chore" }).length).toBeGreaterThan(0);
});

it("keeps Chore library mutations unavailable to view-only users", async () => {
  mockSettingsPageFetches("member", { choreLibraryPermission: "view" });
  renderAppAt("/settings");

  fireEvent.click(await screen.findByRole("tab", { name: "Chore library" }));

  expect(await screen.findByText("Your household owner controls who can manage the Chore library.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Add chore" })).toBeNull();
});
```

Update existing `mockSettingsPageFetches()` or `mockFamilyPageFetches()` helper responses so `HouseholdMemberSummary` objects include:

```ts
choreLibraryPermission: "manage"
```

- [ ] **Step 2: Run frontend tests to verify they fail**

Run:

```bash
npm run test -w web -- App.test.tsx
```

Expected: FAIL because labels, API call, and Chore library controls are not implemented.

- [ ] **Step 3: Add API wrappers**

In `web/src/api.ts`, import `CreateChoreInput` and `ChoreLibraryPermission`.

Add:

```ts
export async function createChore(householdId: string, chore: CreateChoreInput): Promise<Chore> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/chores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chore })
  });

  if (!response.ok) throw new Error("Failed to create chore");
  return response.json();
}

export async function updateChoreLibraryPermission(
  householdId: string,
  memberId: string,
  choreLibraryPermission: ChoreLibraryPermission
): Promise<HouseholdMemberSummary> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/members/${memberId}/chore-library-permission`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choreLibraryPermission })
    }
  );

  if (!response.ok) throw new Error("Failed to update chore library permission");
  return response.json();
}
```

- [ ] **Step 4: Rename settings view and load library data**

In `web/src/pages/SettingsPage.tsx`:

Update:

```ts
type SettingsView = "general" | "connections" | "family" | "library";
```

Update `settingsViews`:

```ts
{ id: "family", label: "Family", summary: "Permissions" },
{ id: "library", label: "Chore library", summary: "Reusable work" }
```

Add state:

```ts
const [libraryChores, setLibraryChores] = useState<Chore[]>([]);
const [archivedChores, setArchivedChores] = useState<Chore[]>([]);
const [librarySearch, setLibrarySearch] = useState("");
const [librarySource, setLibrarySource] = useState<"all" | Chore["source"]>("all");
const [libraryStatus, setLibraryStatus] = useState<"active" | "archived">("active");
const [editingChore, setEditingChore] = useState<Chore | "new" | undefined>();
const [archiveCandidate, setArchiveCandidate] = useState<Chore>();
const [libraryStatusMessage, setLibraryStatusMessage] = useState<string>();
```

Load active and archived chores in an effect when `selectedHousehold?.id` changes:

```ts
void Promise.all([
  listChores(selectedHousehold.id),
  listArchivedChores(selectedHousehold.id)
]).then(([active, archived]) => {
  if (cancelled) return;
  setLibraryChores(active);
  setArchivedChores(archived);
});
```

- [ ] **Step 5: Add permission helpers**

In `SettingsPage.tsx`, add:

```ts
const currentMember = members.find((member) => member.userId === currentUserId);
const canManageChoreLibrary = isOwner || currentMember?.choreLibraryPermission === "manage";
```

Add:

```ts
function saveChoreLibraryPermission(member: HouseholdMemberSummary, choreLibraryPermission: ChoreLibraryPermission) {
  if (!selectedHousehold) return;
  void updateChoreLibraryPermission(selectedHousehold.id, member.userId, choreLibraryPermission)
    .then((updated) => {
      setMembers((current) => current.map((item) => item.userId === updated.userId ? updated : item));
    })
    .catch(() => setCalendarStatus("Could not save Chore library permission."));
}
```

- [ ] **Step 6: Update Family permissions UI**

Rename the panel heading to:

```tsx
<h3>Family permissions</h3>
```

Update explanatory copy:

```tsx
<p>Control how each member can import calendar events and manage the shared Chore library.</p>
```

Add a fourth table header:

```tsx
<span>Chore library</span>
```

Add this select in each owner row:

```tsx
<label>
  <span className="sr-only">{policy.memberName} chore library permission</span>
  <select
    value={members.find((member) => member.userId === policy.memberId)?.choreLibraryPermission ?? "view"}
    onChange={(event) => {
      const member = members.find((item) => item.userId === policy.memberId);
      if (member) saveChoreLibraryPermission(member, event.target.value as ChoreLibraryPermission);
    }}
  >
    <option value="view">View only</option>
    <option value="manage">Manage</option>
  </select>
</label>
```

- [ ] **Step 7: Implement Chore library list UI**

Replace `renderMasterChoreList()` with `renderChoreLibrary()` that:

```tsx
const visibleLibraryChores = (libraryStatus === "active" ? libraryChores : archivedChores)
  .filter((chore) => librarySource === "all" || chore.source === librarySource)
  .filter((chore) => {
    const query = librarySearch.trim().toLowerCase();
    if (!query) return true;
    return [
      chore.title,
      chore.instructions ?? "",
      ...(chore.tags ?? [])
    ].some((value) => value.toLowerCase().includes(query));
  });
```

Render search/source/status controls, list rows, and permission-aware actions:

```tsx
{canManageChoreLibrary ? (
  <button type="button" onClick={() => setEditingChore("new")}>Add chore</button>
) : (
  <p className="section-summary">Your household owner controls who can manage the Chore library.</p>
)}
```

For rows:

```tsx
{canManageChoreLibrary && libraryStatus === "active" ? (
  <>
    <button aria-label="Edit chore" type="button" onClick={() => setEditingChore(chore)}>Edit</button>
    <button aria-label="Archive chore" type="button" onClick={() => setArchiveCandidate(chore)}>Archive</button>
  </>
) : null}
{canManageChoreLibrary && libraryStatus === "archived" ? (
  <button aria-label="Restore chore" type="button" onClick={() => restoreLibraryChore(chore)}>Restore</button>
) : null}
```

Update `renderActiveView()`:

```tsx
if (activeView === "library") return renderChoreLibrary();
```

- [ ] **Step 8: Implement add/edit/archive handlers and modal**

Add:

```ts
type ChoreFormState = {
  title: string;
  instructions: string;
  tags: string;
};
```

Add handlers:

```ts
function saveLibraryChore(chore: Chore | "new", form: ChoreFormState) {
  if (!selectedHousehold) return;
  const input = {
    title: form.title.trim(),
    source: chore === "new" ? "manual" : chore.source,
    instructions: form.instructions.trim() || undefined,
    tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
  } satisfies ChoreDefinitionInput;

  const request = chore === "new"
    ? createChore(selectedHousehold.id, input)
    : updateChore(selectedHousehold.id, chore.id, input);

  void request.then((saved) => {
    setLibraryChores((current) => chore === "new"
      ? [...current, saved]
      : current.map((item) => item.id === saved.id ? saved : item));
    setEditingChore(undefined);
    setLibraryStatusMessage("Chore library saved.");
  }).catch(() => setLibraryStatusMessage("Could not save Chore library item."));
}

function archiveLibraryChore(chore: Chore) {
  if (!selectedHousehold) return;
  void archiveChore(selectedHousehold.id, chore.id).then((archived) => {
    setLibraryChores((current) => current.filter((item) => item.id !== chore.id));
    setArchivedChores((current) => [archived, ...current]);
    setArchiveCandidate(undefined);
  }).catch(() => setLibraryStatusMessage("Could not archive chore."));
}

function restoreLibraryChore(chore: Chore) {
  if (!selectedHousehold) return;
  void restoreChore(selectedHousehold.id, chore.id).then((restored) => {
    setArchivedChores((current) => current.filter((item) => item.id !== chore.id));
    setLibraryChores((current) => [restored, ...current]);
  }).catch(() => setLibraryStatusMessage("Could not restore chore."));
}
```

Create a compact modal inside `SettingsPage.tsx` using the existing modal classes:

```tsx
{editingChore ? (
  <ChoreLibraryModal
    chore={editingChore}
    onClose={() => setEditingChore(undefined)}
    onSave={saveLibraryChore}
  />
) : null}
```

The modal must label title/instructions/tags, close on Cancel, and save only when title is non-empty.

- [ ] **Step 9: Add styles**

In `web/src/App.css`, add styles for:

```css
.chore-library-toolbar {
  align-items: end;
  display: grid;
  gap: 0.75rem;
  grid-template-columns: minmax(12rem, 1fr) minmax(9rem, auto) minmax(9rem, auto) auto;
}

.chore-library-list {
  display: grid;
  gap: 0.75rem;
}

.chore-library-row {
  align-items: center;
  border: 1px solid var(--color-border);
  display: grid;
  gap: 0.75rem;
  grid-template-columns: minmax(13rem, 1.4fr) minmax(7rem, 0.6fr) minmax(8rem, 0.8fr) auto;
  padding: 0.85rem;
}

.chore-library-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
}

.chore-library-modal {
  max-width: 34rem;
  width: min(100%, 34rem);
}

@media (max-width: 720px) {
  .chore-library-toolbar,
  .chore-library-row {
    grid-template-columns: 1fr;
  }

  .chore-library-actions {
    justify-content: flex-start;
  }
}
```

Use existing colors and spacing from `.settings-master-list`, `.sync-policy-table`, and modal classes. In mobile media queries, make `.chore-library-row` a card-style single column with actions underneath.

- [ ] **Step 10: Run frontend tests**

Run:

```bash
npm run test -w web -- App.test.tsx
```

Expected: PASS.

Run:

```bash
npm run typecheck -w web
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add web/src/api.ts web/src/pages/SettingsPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Add chore library settings UI"
```

---

### Task 4: Integration Verification and Build

**Files:**
- No new source files unless verification finds issues.

- [ ] **Step 1: Run full relevant test suite**

Run:

```bash
npm run test -w server -- households.test.ts
npm run test -w web -- App.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full build**

Run:

```bash
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 3: Manual browser verification**

Start the dev server if needed:

```bash
npm run web:dev
```

Open `/settings` and verify:

- Sidebar tab says `Chore library`.
- Family view says `Family permissions`.
- Owner can change a member's Chore library permission.
- Manage user sees `Add chore`, `Edit`, `Archive`, and archived `Restore`.
- View-only user sees the list and helper text but no active mutation controls.
- Mobile layout uses cards, not a squeezed table.

- [ ] **Step 4: Final commit for any verification fixes**

If Step 3 required adjustments:

```bash
git add <changed-files>
git commit -m "Polish chore library verification issues"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Chore library naming: Task 3.
- CRUD with archive/restore: Tasks 2 and 3.
- Per-person permissions: Tasks 1, 2, and 3.
- New members default view-only: Task 2.
- Definition-only chore creation: Task 2.
- Schedule editing remains outside Settings: Task 3 only edits chore definition fields.
- Accessibility and mobile treatment: Tasks 3 and 4.
- Backend authorization is authoritative: Task 2.

Placeholder scan:

- No placeholder markers or unresolved decision markers remain.
- The plan uses concrete file paths, commands, expected results, and code shapes for each implementation task.

Type consistency:

- Permission values are `view` and `manage` across shared types, stores, routes, and frontend.
- The settings view id changes from `master` to `library` consistently.
- Definition-only creation uses `CreateChoreInput` and existing `ChoreDefinitionInput` shape.
