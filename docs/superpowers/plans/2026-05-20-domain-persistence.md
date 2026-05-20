# Domain Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Plan a local persisted chore CRUD surface backed by Prisma/Postgres, with soft archive/restore and stale recommendation handling.

**Architecture:** Extend the existing `Chore` and `Recommendation` persistence model rather than adding new domain tables. The server store boundary gains update/archive/restore operations and stale recommendation marking; Express routes expose those operations under the existing household route tree. The React Plan screen keeps its current queue/detail layout and turns the selected chore detail panel into an inline editor with active and archived chore views.

**Tech Stack:** TypeScript, Express, Prisma/Postgres, Vitest/Supertest, React 19, Testing Library, Vite.

---

## File Structure

- Modify `shared/src/types.ts`: add `archivedAt?: string` to `Chore` and `staleAt?: string` to `Recommendation`.
- Modify `server/prisma/schema.prisma`: add nullable `archivedAt` on `Chore` and nullable `staleAt` on `Recommendation`.
- Modify `server/src/repositories/inMemoryStore.ts`: extend `HouseholdStore` with chore update/archive/restore and recommendation stale operations.
- Modify `server/src/repositories/prismaStore.ts`: implement those store operations with Prisma.
- Modify `server/src/routes/households.ts`: add chore update, archive, restore routes and archived list query handling.
- Modify `server/test/households.test.ts`: route-level CRUD/archive/stale recommendation tests.
- Modify `server/test/prismaStore.test.ts`: persistence tests for archive/restore/stale behavior.
- Modify `web/src/api.ts`: add update/archive/restore/list archived helpers.
- Modify `web/src/PlanReview.tsx`: inline selected chore editor, archived section/toggle, stale recommendation prompt.
- Modify `web/src/App.test.tsx`: end-to-end component tests for edit/archive/restore/stale UI behavior.

---

### Task 1: Shared Types, Prisma Schema, and Store Contract

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Test: `server/test/prismaStore.test.ts`

- [ ] **Step 1: Write failing Prisma store tests**

Add this test to `server/test/prismaStore.test.ts`:

```ts
it("archives, restores, updates chores, and marks recommendations stale", async () => {
  const store = createPrismaStore(prisma!);
  const household = await store.createHousehold("Home");
  const chore = await store.createChore({
    householdId: household.id,
    title: "Clean bathrooms",
    cadence: "weekly",
    estimatedMinutes: 20,
    source: "manual"
  });

  await store.saveRecommendations(household.id, [
    {
      id: "recommendation-1",
      householdId: household.id,
      title: "Review duration",
      rationale: "The current estimate may be off.",
      confidence: "medium",
      status: "pending"
    }
  ]);

  const updated = await store.updateChore(household.id, chore.id, {
    title: "Clean main bathroom",
    cadence: "biweekly",
    estimatedMinutes: 30,
    source: "manual"
  });

  expect(updated).toEqual(
    expect.objectContaining({
      id: chore.id,
      title: "Clean main bathroom",
      cadence: "biweekly",
      estimatedMinutes: 30
    })
  );
  expect(await store.listRecommendations(household.id)).toEqual([
    expect.objectContaining({ staleAt: expect.any(String) })
  ]);

  const archived = await store.archiveChore(household.id, chore.id);
  expect(archived?.archivedAt).toEqual(expect.any(String));
  expect(await store.listChores(household.id)).toEqual([]);
  expect(await store.listChores(household.id, { includeArchived: true })).toEqual([
    expect.objectContaining({ id: chore.id, archivedAt: expect.any(String) })
  ]);

  const restored = await store.restoreChore(household.id, chore.id);
  expect(restored?.archivedAt).toBeUndefined();
  expect(await store.listChores(household.id)).toEqual([
    expect.objectContaining({ id: chore.id, archivedAt: undefined })
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd run test:db -w server`

Expected: FAIL because store methods and schema fields do not exist yet.

- [ ] **Step 3: Extend shared types**

In `shared/src/types.ts`, change `Chore` and `Recommendation`:

```ts
export type Chore = {
  id: string;
  householdId: string;
  title: string;
  cadence: string;
  estimatedMinutes: number;
  source: "manual" | "google-calendar";
  archivedAt?: string;
};

export type Recommendation = {
  id: string;
  householdId: string;
  title: string;
  rationale: string;
  confidence: RecommendationConfidence;
  status: "pending" | "accepted" | "skipped";
  staleAt?: string;
};
```

- [ ] **Step 4: Extend Prisma schema**

In `server/prisma/schema.prisma`, add:

```prisma
model Chore {
  id               String    @id
  householdId      String
  household        Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  title            String
  cadence          String
  estimatedMinutes Int
  source           String
  archivedAt       DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}

model Recommendation {
  id          String    @id
  householdId String
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  title       String
  rationale   String
  confidence  String
  status      String
  staleAt     DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

- [ ] **Step 5: Extend store contract**

In `server/src/repositories/inMemoryStore.ts`, update `HouseholdStore`:

```ts
export type ChoreListOptions = {
  includeArchived?: boolean;
  archivedOnly?: boolean;
};

export type ChoreUpdate = Omit<Chore, "id" | "householdId" | "archivedAt">;

export type HouseholdStore = {
  createHousehold(name: string): StoreResult<Household>;
  updateBaseline(householdId: string, baseline: HouseholdBaseline): StoreResult<Household | undefined>;
  getHousehold(householdId: string): StoreResult<Household | undefined>;
  createChore(chore: Omit<Chore, "id" | "archivedAt">): StoreResult<Chore>;
  updateChore(householdId: string, choreId: string, chore: ChoreUpdate): StoreResult<Chore | undefined>;
  archiveChore(householdId: string, choreId: string): StoreResult<Chore | undefined>;
  restoreChore(householdId: string, choreId: string): StoreResult<Chore | undefined>;
  listChores(householdId: string, options?: ChoreListOptions): StoreResult<Chore[]>;
  saveRecommendations(
    householdId: string,
    recommendations: Recommendation[]
  ): StoreResult<Recommendation[]>;
  markRecommendationsStale(householdId: string): StoreResult<void>;
  listRecommendations(householdId: string): StoreResult<Recommendation[]>;
};
```

- [ ] **Step 6: Implement in-memory behavior**

In `createInMemoryStore`, update chore handling:

```ts
function markStale(householdId: string) {
  const now = new Date().toISOString();
  recommendations.set(
    householdId,
    (recommendations.get(householdId) ?? []).map((recommendation) => ({
      ...recommendation,
      staleAt: recommendation.staleAt ?? now
    }))
  );
}
```

Implement update/archive/restore/list filtering using the `chores` map. `createChore`, `updateChore`, `archiveChore`, and `restoreChore` must call `markStale(householdId)`.

- [ ] **Step 7: Implement Prisma mapping and store behavior**

In `server/src/repositories/prismaStore.ts`, update `toChore` and `toRecommendation`:

```ts
function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : undefined;
}
```

Map `archivedAt: serializeDate(chore.archivedAt)` and `staleAt: serializeDate(recommendation.staleAt)`.

Implement these methods inside the object returned from `createPrismaStore`:

```ts
async updateChore(householdId, choreId, chore) {
  const existing = await prisma.chore.findFirst({ where: { id: choreId, householdId } });
  if (!existing) return undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const nextChore = await tx.chore.update({
      where: { id: choreId },
      data: chore
    });
    await tx.recommendation.updateMany({
      where: { householdId, staleAt: null },
      data: { staleAt: new Date() }
    });
    return nextChore;
  });

  return toChore(updated);
},

async archiveChore(householdId, choreId) {
  const existing = await prisma.chore.findFirst({ where: { id: choreId, householdId } });
  if (!existing) return undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const nextChore = await tx.chore.update({
      where: { id: choreId },
      data: { archivedAt: new Date() }
    });
    await tx.recommendation.updateMany({
      where: { householdId, staleAt: null },
      data: { staleAt: new Date() }
    });
    return nextChore;
  });

  return toChore(updated);
},

async restoreChore(householdId, choreId) {
  const existing = await prisma.chore.findFirst({ where: { id: choreId, householdId } });
  if (!existing) return undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const nextChore = await tx.chore.update({
      where: { id: choreId },
      data: { archivedAt: null }
    });
    await tx.recommendation.updateMany({
      where: { householdId, staleAt: null },
      data: { staleAt: new Date() }
    });
    return nextChore;
  });

  return toChore(updated);
},

async markRecommendationsStale(householdId) {
  await prisma.recommendation.updateMany({
    where: { householdId, staleAt: null },
    data: { staleAt: new Date() }
  });
}
```

Use `where: { id: choreId, householdId }` via `findFirst` before `update` so wrong household/chore combinations return `undefined`.

For `listChores`, use:

```ts
where: options?.archivedOnly
  ? { householdId, archivedAt: { not: null } }
  : options?.includeArchived
    ? { householdId }
    : { householdId, archivedAt: null }
```

For `saveRecommendations`, create fresh recommendations with `staleAt: null`.

- [ ] **Step 8: Run Prisma DB test**

Run: `npm.cmd run test:db -w server`

Expected: PASS when `DATABASE_URL` is configured; if skipped due missing DB, run server unit tests in later tasks and note DB coverage remains pending.

- [ ] **Step 9: Commit**

```bash
git add shared/src/types.ts server/prisma/schema.prisma server/src/repositories/inMemoryStore.ts server/src/repositories/prismaStore.ts server/test/prismaStore.test.ts
git commit -m "Add chore archive persistence model"
```

---

### Task 2: Chore CRUD API Routes

**Files:**
- Modify: `server/src/routes/households.ts`
- Modify: `server/test/households.test.ts`

- [ ] **Step 1: Write failing route tests**

Add tests to `server/test/households.test.ts`:

```ts
it("updates, archives, lists archived, and restores household chores", async () => {
  const app = createTestApp();
  const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
  const householdId = created.body.id;
  const chore = await request(app)
    .post(`/api/households/${householdId}/chores`)
    .send({ title: "Clean bathrooms", cadence: "weekly", estimatedMinutes: 20, source: "manual" })
    .expect(201);

  await request(app)
    .put(`/api/households/${householdId}/chores/${chore.body.id}`)
    .send({ title: "Clean main bathroom", cadence: "biweekly", estimatedMinutes: 30, source: "manual" })
    .expect(200)
    .expect((response) => {
      expect(response.body).toEqual(expect.objectContaining({ title: "Clean main bathroom" }));
    });

  await request(app)
    .post(`/api/households/${householdId}/chores/${chore.body.id}/archive`)
    .expect(200)
    .expect((response) => {
      expect(response.body.archivedAt).toEqual(expect.any(String));
    });

  await request(app)
    .get(`/api/households/${householdId}/chores`)
    .expect(200)
    .expect((response) => {
      expect(response.body).toEqual([]);
    });

  await request(app)
    .get(`/api/households/${householdId}/chores?status=archived`)
    .expect(200)
    .expect((response) => {
      expect(response.body).toEqual([expect.objectContaining({ id: chore.body.id })]);
    });

  await request(app)
    .post(`/api/households/${householdId}/chores/${chore.body.id}/restore`)
    .expect(200)
    .expect((response) => {
      expect(response.body.archivedAt).toBeUndefined();
    });
});

it("returns 404 when updating a chore through the wrong household", async () => {
  const app = createTestApp();
  const first = await request(app).post("/api/households").send({ name: "First" }).expect(201);
  const second = await request(app).post("/api/households").send({ name: "Second" }).expect(201);
  const chore = await request(app)
    .post(`/api/households/${first.body.id}/chores`)
    .send({ title: "Vacuum", cadence: "weekly", estimatedMinutes: 15, source: "manual" })
    .expect(201);

  await request(app)
    .put(`/api/households/${second.body.id}/chores/${chore.body.id}`)
    .send({ title: "Vacuum", cadence: "weekly", estimatedMinutes: 20, source: "manual" })
    .expect(404);
});
```

- [ ] **Step 2: Run route tests to verify failure**

Run: `npm.cmd run test -w server -- households.test.ts`

Expected: FAIL because update/archive/restore routes are missing.

- [ ] **Step 3: Add route schemas**

In `server/src/routes/households.ts`, rename `createChoreSchema` to reusable `choreSchema`:

```ts
const choreSchema = z.object({
  title: z.string().min(1),
  cadence: z.string().min(1),
  estimatedMinutes: z.number().int().positive(),
  source: z.enum(["manual"])
});
```

- [ ] **Step 4: Add list query handling**

In `GET /:householdId/chores`, parse:

```ts
const status = req.query.status;
const includeArchived = req.query.includeArchived === "true";
const archivedOnly = status === "archived";
```

Return `store.listChores(household.id, { includeArchived, archivedOnly })`.

- [ ] **Step 5: Add update route**

Add:

```ts
router.put("/:householdId/chores/:choreId", async (req, res) => {
  const household = await store.getHousehold(req.params.householdId);
  if (!household) return res.status(404).json({ error: "Household not found" });

  const parsed = choreSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid chore payload" });

  const chore = await store.updateChore(household.id, req.params.choreId, parsed.data);
  if (!chore) return res.status(404).json({ error: "Chore not found" });

  return res.status(200).json(chore);
});
```

- [ ] **Step 6: Add archive and restore routes**

Add:

```ts
router.post("/:householdId/chores/:choreId/archive", async (req, res) => {
  const household = await store.getHousehold(req.params.householdId);
  if (!household) return res.status(404).json({ error: "Household not found" });

  const chore = await store.archiveChore(household.id, req.params.choreId);
  if (!chore) return res.status(404).json({ error: "Chore not found" });

  return res.status(200).json(chore);
});

router.post("/:householdId/chores/:choreId/restore", async (req, res) => {
  const household = await store.getHousehold(req.params.householdId);
  if (!household) return res.status(404).json({ error: "Household not found" });

  const chore = await store.restoreChore(household.id, req.params.choreId);
  if (!chore) return res.status(404).json({ error: "Chore not found" });

  return res.status(200).json(chore);
});
```

- [ ] **Step 7: Filter stale recommendations from normal list**

In `GET /:householdId/recommendations`, return only non-stale recommendations:

```ts
const recommendations = await store.listRecommendations(household.id);
return res.status(200).json(recommendations.filter((recommendation) => !recommendation.staleAt));
```

- [ ] **Step 8: Run route tests**

Run: `npm.cmd run test -w server -- households.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/src/routes/households.ts server/test/households.test.ts
git commit -m "Add chore CRUD API routes"
```

---

### Task 3: Web API Helpers and Plan Inline Editing

**Files:**
- Modify: `web/src/api.ts`
- Modify: `web/src/PlanReview.tsx`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing web tests**

Add tests to `web/src/App.test.tsx`:

```tsx
it("edits the selected Plan chore and shows stale recommendation status", async () => {
  const fetchMock = mockSuccessfulSetupAndChoreFetches()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "chore-1", householdId: "household-1", title: "Clean bathrooms", cadence: "weekly", estimatedMinutes: 5, source: "manual" }
      ]
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "recommendation-1", householdId: "household-1", title: "Review duration for Clean bathrooms", rationale: "Too short.", confidence: "high", status: "pending" }
      ]
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "chore-1", householdId: "household-1", title: "Clean main bathroom", cadence: "biweekly", estimatedMinutes: 30, source: "manual" })
    });
  renderAt("/setup");

  await completeSetupWithChore();
  fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));
  await waitFor(() => expect(screen.getAllByText("Clean bathrooms").length).toBeGreaterThan(0));

  fireEvent.change(screen.getByLabelText("Selected chore title"), { target: { value: "Clean main bathroom" } });
  fireEvent.change(screen.getByLabelText("Selected chore cadence"), { target: { value: "biweekly" } });
  fireEvent.change(screen.getByLabelText("Selected chore estimated minutes"), { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "Save chore changes" }));

  await waitFor(() => expect(screen.getAllByText("Clean main bathroom").length).toBeGreaterThan(0));
  expect(screen.getByText("Chores changed. Run review again for updated recommendations.")).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/households/household-1/chores/chore-1",
    expect.objectContaining({ method: "PUT" })
  );
});

it("archives and restores chores in Plan", async () => {
  const fetchMock = mockSuccessfulSetupAndChoreFetches()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "chore-1", householdId: "household-1", title: "Clean bathrooms", cadence: "weekly", estimatedMinutes: 5, source: "manual" }
      ]
    })
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "chore-1", householdId: "household-1", title: "Clean bathrooms", cadence: "weekly", estimatedMinutes: 5, source: "manual", archivedAt: "2026-05-20T00:00:00.000Z" })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "chore-1", householdId: "household-1", title: "Clean bathrooms", cadence: "weekly", estimatedMinutes: 5, source: "manual", archivedAt: "2026-05-20T00:00:00.000Z" }
      ]
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "chore-1", householdId: "household-1", title: "Clean bathrooms", cadence: "weekly", estimatedMinutes: 5, source: "manual" })
    });
  renderAt("/setup");

  await completeSetupWithChore();
  fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));
  await waitFor(() => expect(screen.getAllByText("Clean bathrooms").length).toBeGreaterThan(0));

  fireEvent.click(screen.getByRole("button", { name: "Archive chore" }));
  await waitFor(() => expect(screen.getByText("No active chores in the review queue.")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Show archived chores" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Restore Clean bathrooms" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Restore Clean bathrooms" }));

  await waitFor(() => expect(screen.getAllByText("Clean bathrooms").length).toBeGreaterThan(0));
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/households/household-1/chores/chore-1/archive",
    expect.objectContaining({ method: "POST" })
  );
});
```

- [ ] **Step 2: Run web tests to verify failure**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: FAIL because editor/archive UI and API helpers do not exist.

- [ ] **Step 3: Add API helpers**

In `web/src/api.ts`, add:

```ts
export async function updateChore(
  householdId: string,
  choreId: string,
  chore: Omit<Chore, "id" | "householdId" | "archivedAt">
): Promise<Chore> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/chores/${choreId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(chore)
  });

  if (!response.ok) throw new Error("Failed to update chore");
  return response.json();
}

export async function archiveChore(householdId: string, choreId: string): Promise<Chore> {
  const response = await fetch(
    `${API_BASE_URL}/api/households/${householdId}/chores/${choreId}/archive`,
    { method: "POST" }
  );

  if (!response.ok) throw new Error("Failed to archive chore");
  return response.json();
}

export async function restoreChore(householdId: string, choreId: string): Promise<Chore> {
  const response = await fetch(
    `${API_BASE_URL}/api/households/${householdId}/chores/${choreId}/restore`,
    { method: "POST" }
  );

  if (!response.ok) throw new Error("Failed to restore chore");
  return response.json();
}

export async function listArchivedChores(householdId: string): Promise<Chore[]> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/chores?status=archived`);
  if (!response.ok) throw new Error("Failed to fetch archived chores");
  return response.json();
}
```

- [ ] **Step 4: Add Plan editor state**

In `web/src/PlanReview.tsx`, import new helpers and add state:

```tsx
const [archivedChores, setArchivedChores] = useState<Chore[]>([]);
const [showArchived, setShowArchived] = useState(false);
const [recommendationsStale, setRecommendationsStale] = useState(false);
const [editTitle, setEditTitle] = useState("");
const [editCadence, setEditCadence] = useState("");
const [editEstimatedMinutes, setEditEstimatedMinutes] = useState("");
```

Sync selected chore into edit state with `useEffect`. Add an Angular-learning comment:

```tsx
// Similar to Angular ngOnChanges for an @Input, this copies the selected chore into local edit fields.
```

- [ ] **Step 5: Implement save/archive/restore handlers**

Add:

```tsx
async function handleSaveSelectedChore(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!householdId || !selectedChore) return;

  setStatus("Saving chore changes...");
  const updated = await updateChore(householdId, selectedChore.id, {
    title: editTitle,
    cadence: editCadence,
    estimatedMinutes: Number(editEstimatedMinutes),
    source: "manual"
  });

  setChores((currentChores) =>
    currentChores.map((chore) => (chore.id === updated.id ? updated : chore))
  );
  setRecommendations([]);
  setRecommendationsStale(true);
  setStatus("Chores changed. Run review again for updated recommendations.");
}

async function handleArchiveSelectedChore() {
  if (!householdId || !selectedChore) return;

  setStatus("Archiving chore...");
  const archived = await archiveChore(householdId, selectedChore.id);
  setChores((currentChores) => currentChores.filter((chore) => chore.id !== archived.id));
  setArchivedChores((currentChores) => [archived, ...currentChores]);
  setSelectedChoreId(undefined);
  setRecommendations([]);
  setRecommendationsStale(true);
  setStatus("Chores changed. Run review again for updated recommendations.");
}

async function handleLoadArchivedChores() {
  if (!householdId) return;

  if (!showArchived) {
    setArchivedChores(await listArchivedChores(householdId));
  }
  setShowArchived((currentValue) => !currentValue);
}

async function handleRestoreChore(choreId: string) {
  if (!householdId) return;

  setStatus("Restoring chore...");
  const restored = await restoreChore(householdId, choreId);
  setArchivedChores((currentChores) =>
    currentChores.filter((chore) => chore.id !== restored.id)
  );
  setChores((currentChores) => [...currentChores, restored]);
  setSelectedChoreId(restored.id);
  setRecommendations([]);
  setRecommendationsStale(true);
  setStatus("Chores changed. Run review again for updated recommendations.");
}
```

After edit/archive/restore:

- update local active/archived arrays.
- set `recommendationsStale` true.
- set `recommendations` to `[]`.
- set status to `Chores changed. Run review again for updated recommendations.`

- [ ] **Step 6: Render inline selected chore editor**

Replace selected chore read-only detail content with a form containing:

- `Selected chore title`
- `Selected chore cadence`
- `Selected chore estimated minutes`
- disabled/manual source copy or one-option select
- `Save chore changes`
- `Archive chore`

Use the selected chore title as the heading so existing tests that find `Clean bathrooms` still pass.

- [ ] **Step 7: Render archived section**

Below the active queue/detail grid, add:

- button `Show archived chores` / `Hide archived chores`.
- empty copy `No archived chores yet.`
- archived restore buttons named `Restore ${chore.title}`.

- [ ] **Step 8: Run web tests**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src/api.ts web/src/PlanReview.tsx web/src/App.test.tsx
git commit -m "Add Plan chore editing and archive UI"
```

---

### Task 4: Final Verification and Documentation Check

**Files:**
- Inspect: `docs/superpowers/specs/2026-05-20-domain-persistence-design.md`
- Inspect: `docs/product-roadmap.md`
- Inspect: changed server/web files

- [ ] **Step 1: Run full verification**

Run:

```bash
npm.cmd run test -w server
npm.cmd run typecheck -w server
npm.cmd run test -w web
npm.cmd run typecheck -w web
npm.cmd run build -w web
```

Expected: all pass.

- [ ] **Step 2: Run DB verification when local Postgres is available**

Run:

```bash
npm.cmd run test:db -w server
```

Expected: pass with Prisma schema pushed to local database. If `DATABASE_URL` or Postgres is unavailable, record this as not run and do not claim DB test coverage passed.

- [ ] **Step 3: Check spec coverage**

Confirm implementation covers:

- add/edit/archive/restore chores in Plan.
- active list excludes archived.
- archived view can restore.
- recommendation stale marker is set on chore changes.
- localStorage active household remains unchanged.
- no Auth scope was added.

- [ ] **Step 4: Commit final cleanup if needed**

If any docs or minor fixes changed:

```bash
git add <changed files>
git commit -m "Finish domain persistence verification"
```

Skip if there are no changes.

---

## Spec Coverage Checklist

- Plan shows active chores loaded from local Postgres: Tasks 1, 2, 3.
- Users can add chores from Plan: existing behavior preserved and tested in Task 3.
- Users can edit selected chore inline: Task 3.
- Users can archive instead of hard delete: Tasks 1, 2, 3.
- Archived chores are viewable and restorable: Tasks 1, 2, 3.
- Normal chore lists exclude archived chores: Tasks 1 and 2.
- Chore mutations mark recommendations stale: Tasks 1, 2, 3.
- Auth remains deferred: no auth files or session behavior in any task.
