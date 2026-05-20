# Chores Page Review Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ongoing Setup/Plan experience with a Chores page for chore CRUD/status plus a separate staged review flow for recommendation decisions.

**Architecture:** Reuse the current React + Express + Prisma foundation and evolve the existing `PlanReview` behavior into a `ChoresPage`. Backend recommendation records gain affected-chore and decision fields so accept/decline choices can be staged and then applied in one request. Setup remains the first-time household-basics onboarding path, while Chores becomes the durable post-onboarding workspace.

**Tech Stack:** TypeScript, React 19, Vite, Testing Library, Express, Prisma/Postgres, Vitest, Supertest.

---

## File Structure

- Modify `shared/src/types.ts`: add recommendation decision and proposed-change fields.
- Modify `server/prisma/schema.prisma`: add recommendation decision fields and optional affected chore relation metadata.
- Modify `server/src/repositories/inMemoryStore.ts`: extend the store contract with recommendation decision and apply operations.
- Modify `server/src/repositories/prismaStore.ts`: implement decision persistence and applying accepted recommendation changes.
- Modify `server/src/routes/households.ts`: add selected-chore review generation, recommendation decision, and apply routes.
- Modify `server/test/households.test.ts`: route tests for selected review, staged decisions, apply, and stale/unreviewed behavior.
- Modify `web/src/api.ts`: add recommendation decision/apply API helpers and selected-chore review request support.
- Rename or replace `web/src/PlanReview.tsx` with `web/src/ChoresPage.tsx`: durable chores CRUD/status page and review flow.
- Modify `web/src/App.tsx`: nav changes from Setup/Plan to Chores for post-onboarding.
- Modify `web/src/pages/TodayDashboard.tsx`: route setup-complete actions to Chores.
- Modify `web/src/pages/SetupPage.tsx`: preserve onboarding but route review handoff to Chores.
- Modify `web/src/App.css`: Chores page tabs, chore state cards, review flow layout.
- Modify `web/src/App.test.tsx`: navigation, Chores page, review selection, staged decision, and apply tests.
- Modify `docs/product-roadmap.md`: note the Chores page/review-flow refinement before agent integration.

---

## Task 1: Backend Recommendation Decision Model

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Test: `server/test/households.test.ts`

- [ ] **Step 1: Write failing backend route test for staged decisions**

Add this test to `server/test/households.test.ts`:

```ts
it("stages recommendation decisions without immediately applying chore changes", async () => {
  const app = createTestApp();
  const household = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
  const chore = await request(app)
    .post(`/api/households/${household.body.id}/chores`)
    .send({ title: "Clean bathrooms", cadence: "weekly", estimatedMinutes: 5, source: "manual" })
    .expect(201);

  const generated = await request(app)
    .post(`/api/households/${household.body.id}/recommendations`)
    .send({ selectedChoreIds: [chore.body.id] })
    .expect(201);

  const recommendation = generated.body[0];
  await request(app)
    .put(`/api/households/${household.body.id}/recommendations/${recommendation.id}/decision`)
    .send({ decision: "accepted" })
    .expect(200)
    .expect((response) => {
      expect(response.body).toEqual(expect.objectContaining({ decision: "accepted" }));
    });

  await request(app)
    .get(`/api/households/${household.body.id}/chores`)
    .expect(200)
    .expect((response) => {
      expect(response.body).toEqual([
        expect.objectContaining({ id: chore.body.id, estimatedMinutes: 5 })
      ]);
    });
});
```

- [ ] **Step 2: Run route test to verify failure**

Run: `npm.cmd run test -w server -- households.test.ts`

Expected: FAIL with `expected 200 "OK", got 404 "Not Found"` for the missing decision route.

- [ ] **Step 3: Extend shared recommendation types**

In `shared/src/types.ts`, add:

```ts
export type RecommendationDecision = "pending" | "accepted" | "declined" | "applied";
```

Update `Recommendation`:

```ts
export type Recommendation = {
  id: string;
  householdId: string;
  affectedChoreId?: string;
  title: string;
  rationale: string;
  confidence: RecommendationConfidence;
  status: "pending" | "accepted" | "skipped";
  decision: RecommendationDecision;
  proposedCadence?: string;
  proposedEstimatedMinutes?: number;
  staleAt?: string;
};
```

Keep `status` for current compatibility in existing tests and UI; new review-flow behavior should use `decision`.

- [ ] **Step 4: Extend Prisma schema**

In `server/prisma/schema.prisma`, update `Recommendation`:

```prisma
model Recommendation {
  id                       String    @id
  householdId              String
  household                Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  affectedChoreId          String?
  title                    String
  rationale                String
  confidence               String
  status                   String
  decision                 String    @default("pending")
  proposedCadence          String?
  proposedEstimatedMinutes Int?
  staleAt                  DateTime?
  createdAt                DateTime  @default(now())
  updatedAt                DateTime  @updatedAt
}
```

- [ ] **Step 5: Extend store contract**

In `server/src/repositories/inMemoryStore.ts`, add:

```ts
export type RecommendationDecisionUpdate = {
  decision: Recommendation["decision"];
};

export type ApplyRecommendationResult = {
  applied: Recommendation[];
  declined: Recommendation[];
};
```

Extend `HouseholdStore`:

```ts
updateRecommendationDecision(
  householdId: string,
  recommendationId: string,
  update: RecommendationDecisionUpdate
): StoreResult<Recommendation | undefined>;
applyRecommendationDecisions(householdId: string): StoreResult<ApplyRecommendationResult>;
```

- [ ] **Step 6: Implement in-memory recommendation decisions**

In `createInMemoryStore`, implement:

```ts
updateRecommendationDecision(householdId, recommendationId, update) {
  const householdRecommendations = recommendations.get(householdId) ?? [];
  const existing = householdRecommendations.find((recommendation) => recommendation.id === recommendationId);
  if (!existing) return undefined;

  const updated = { ...existing, decision: update.decision };
  recommendations.set(
    householdId,
    householdRecommendations.map((recommendation) =>
      recommendation.id === recommendationId ? updated : recommendation
    )
  );
  return updated;
},
```

Also ensure `saveRecommendations` normalizes records:

```ts
const saved = nextRecommendations.map((recommendation) => ({
  ...recommendation,
  decision: recommendation.decision ?? "pending"
}));
recommendations.set(householdId, saved);
return saved;
```

Implement `applyRecommendationDecisions`:

```ts
applyRecommendationDecisions(householdId) {
  const householdRecommendations = recommendations.get(householdId) ?? [];
  const householdChores = chores.get(householdId) ?? [];
  const applied: Recommendation[] = [];
  const declined: Recommendation[] = [];

  const nextRecommendations = householdRecommendations.map((recommendation) => {
    if (recommendation.decision === "accepted" && recommendation.affectedChoreId) {
      const chore = householdChores.find((candidate) => candidate.id === recommendation.affectedChoreId);
      if (chore) {
        chores.set(
          householdId,
          householdChores.map((candidate) =>
            candidate.id === chore.id
              ? {
                  ...candidate,
                  cadence: recommendation.proposedCadence ?? candidate.cadence,
                  estimatedMinutes: recommendation.proposedEstimatedMinutes ?? candidate.estimatedMinutes
                }
              : candidate
          )
        );
      }
      const nextRecommendation = { ...recommendation, decision: "applied" as const };
      applied.push(nextRecommendation);
      return nextRecommendation;
    }

    if (recommendation.decision === "declined") {
      declined.push(recommendation);
    }

    return recommendation;
  });

  recommendations.set(householdId, nextRecommendations);
  return { applied, declined };
}
```

- [ ] **Step 7: Implement Prisma mapping and decisions**

In `server/src/repositories/prismaStore.ts`, update `toRecommendation` to include:

```ts
affectedChoreId: recommendation.affectedChoreId ?? undefined,
decision: recommendation.decision as Recommendation["decision"],
proposedCadence: recommendation.proposedCadence ?? undefined,
proposedEstimatedMinutes: recommendation.proposedEstimatedMinutes ?? undefined,
staleAt: serializeDate(recommendation.staleAt)
```

In `saveRecommendations`, create records with:

```ts
affectedChoreId: recommendation.affectedChoreId,
decision: recommendation.decision ?? "pending",
proposedCadence: recommendation.proposedCadence,
proposedEstimatedMinutes: recommendation.proposedEstimatedMinutes,
staleAt: recommendation.staleAt ? new Date(recommendation.staleAt) : null
```

Implement `updateRecommendationDecision` with `findFirst({ where: { id: recommendationId, householdId } })` before `update`.

Implement `applyRecommendationDecisions` using a Prisma transaction:

```ts
const accepted = await tx.recommendation.findMany({
  where: { householdId, decision: "accepted", staleAt: null }
});
for (const recommendation of accepted) {
  if (!recommendation.affectedChoreId) continue;
  await tx.chore.update({
    where: { id: recommendation.affectedChoreId },
    data: {
      ...(recommendation.proposedCadence ? { cadence: recommendation.proposedCadence } : {}),
      ...(recommendation.proposedEstimatedMinutes
        ? { estimatedMinutes: recommendation.proposedEstimatedMinutes }
        : {})
    }
  });
  await tx.recommendation.update({
    where: { id: recommendation.id },
    data: { decision: "applied" }
  });
}
const declined = await tx.recommendation.findMany({
  where: { householdId, decision: "declined", staleAt: null }
});
return { applied: accepted.map(toRecommendation), declined: declined.map(toRecommendation) };
```

- [ ] **Step 8: Run backend route test**

Run: `npm.cmd run test -w server -- households.test.ts`

Expected: test still fails because routes are not implemented yet; TypeScript should compile once Task 2 routes are added.

- [ ] **Step 9: Commit**

```bash
git add shared/src/types.ts server/prisma/schema.prisma server/src/repositories/inMemoryStore.ts server/src/repositories/prismaStore.ts server/test/households.test.ts
git commit -m "Add recommendation decision persistence"
```

---

## Task 2: Review API Routes

**Files:**
- Modify: `server/src/routes/households.ts`
- Modify: `server/test/households.test.ts`

- [ ] **Step 1: Add failing apply-decisions route test**

Add to `server/test/households.test.ts`:

```ts
it("applies accepted recommendation decisions in one explicit request", async () => {
  const app = createTestApp();
  const household = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
  const chore = await request(app)
    .post(`/api/households/${household.body.id}/chores`)
    .send({ title: "Clean bathrooms", cadence: "weekly", estimatedMinutes: 5, source: "manual" })
    .expect(201);

  const generated = await request(app)
    .post(`/api/households/${household.body.id}/recommendations`)
    .send({ selectedChoreIds: [chore.body.id] })
    .expect(201);

  await request(app)
    .put(`/api/households/${household.body.id}/recommendations/${generated.body[0].id}/decision`)
    .send({ decision: "accepted" })
    .expect(200);

  await request(app)
    .post(`/api/households/${household.body.id}/recommendations/apply`)
    .expect(200)
    .expect((response) => {
      expect(response.body.applied).toEqual([
        expect.objectContaining({ id: generated.body[0].id, decision: "applied" })
      ]);
    });

  await request(app)
    .get(`/api/households/${household.body.id}/chores`)
    .expect(200)
    .expect((response) => {
      expect(response.body[0].estimatedMinutes).toBeGreaterThan(5);
    });
});
```

- [ ] **Step 2: Run route tests to verify failure**

Run: `npm.cmd run test -w server -- households.test.ts`

Expected: FAIL because `/recommendations/:recommendationId/decision` and `/recommendations/apply` are missing.

- [ ] **Step 3: Add route schemas**

In `server/src/routes/households.ts`, add:

```ts
const recommendationDecisionSchema = z.object({
  decision: z.enum(["pending", "accepted", "declined"])
});

const recommendationReviewRequestSchema = z.object({
  reviewPrompt: z.string().trim().optional(),
  selectedChoreIds: z.array(z.string()).optional()
});
```

Replace `recommendationRequestSchema` usage with `recommendationReviewRequestSchema`.

- [ ] **Step 4: Generate recommendations for selected chores**

In `router.post("/:householdId/recommendations")`, after listing chores:

```ts
const chores = await store.listChores(household.id);
const selectedChores = parsed.data.selectedChoreIds?.length
  ? chores.filter((chore) => parsed.data.selectedChoreIds?.includes(chore.id))
  : chores;
```

Pass `selectedChores` to `agentProvider.recommendSetupImprovements`.

Before saving recommendations, attach affected chore and proposed changes:

```ts
const recommendationsWithDecision = recommendations.map((recommendation) => {
  const affectedChore = selectedChores.find((chore) =>
    recommendation.title.toLowerCase().includes(chore.title.toLowerCase())
  ) ?? selectedChores[0];

  return {
    ...recommendation,
    affectedChoreId: affectedChore?.id,
    decision: "pending" as const,
    proposedEstimatedMinutes: affectedChore && affectedChore.estimatedMinutes < 15
      ? 30
      : undefined
  };
});
```

Return `store.saveRecommendations(household.id, recommendationsWithDecision)`.

- [ ] **Step 5: Add decision route**

Add before the generic recommendation routes if needed:

```ts
router.put("/:householdId/recommendations/:recommendationId/decision", async (req, res) => {
  const household = await store.getHousehold(req.params.householdId);
  if (!household) return res.status(404).json({ error: "Household not found" });

  const parsed = recommendationDecisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid recommendation decision" });

  const recommendation = await store.updateRecommendationDecision(
    household.id,
    req.params.recommendationId,
    parsed.data
  );
  if (!recommendation) return res.status(404).json({ error: "Recommendation not found" });

  return res.status(200).json(recommendation);
});
```

- [ ] **Step 6: Add apply route**

Add:

```ts
router.post("/:householdId/recommendations/apply", async (req, res) => {
  const household = await store.getHousehold(req.params.householdId);
  if (!household) return res.status(404).json({ error: "Household not found" });

  return res.status(200).json(await store.applyRecommendationDecisions(household.id));
});
```

- [ ] **Step 7: Run route tests**

Run: `npm.cmd run test -w server -- households.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/households.ts server/test/households.test.ts
git commit -m "Add staged review recommendation routes"
```

---

## Task 3: Navigation and Chores Page Shell

**Files:**
- Create: `web/src/ChoresPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/pages/TodayDashboard.tsx`
- Modify: `web/src/pages/SetupPage.tsx`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing navigation tests**

In `web/src/App.test.tsx`, add:

```tsx
it("shows Chores as the durable post-onboarding workspace", async () => {
  mockSuccessfulSetupAndChoreFetches()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "chore-1", householdId: "household-1", title: "Clean bathrooms", cadence: "weekly", estimatedMinutes: 5, source: "manual" }
      ]
    })
    .mockResolvedValueOnce({ ok: true, json: async () => [] });
  renderAt("/setup");

  await completeSetupWithChore();
  fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Household chores" })).toBeTruthy();
  });
  expect(screen.getByRole("link", { name: "Chores" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Plan" })).toBeNull();
});
```

- [ ] **Step 2: Run web tests to verify failure**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: FAIL because nav still uses Plan and route still renders `PlanReview`.

- [ ] **Step 3: Create ChoresPage wrapper**

Create `web/src/ChoresPage.tsx` by copying the current `PlanReview` implementation and renaming:

```tsx
export function ChoresPage({ householdId, householdName = "Home", baseline }: ChoresPageProps) {
  return (
    <div className="chores-page">
      {/* Task 4 replaces the internals. This task establishes route ownership. */}
    </div>
  );
}
```

For this task, include enough of the existing Plan UI so current behavior still loads chores and recommendations.

- [ ] **Step 4: Update App routes and nav**

In `web/src/App.tsx`:

```ts
import { ChoresPage } from "./ChoresPage";
```

Update route rendering:

```tsx
{path === "/chores" || path === "/plan" ? (
  <ChoresPage
    householdId={householdSetup.householdId}
    householdName={householdSetup.householdName}
    baseline={householdSetup.baseline}
  />
) : null}
```

Update nav:

```ts
const navItems = [
  { label: "Today", path: "/today" },
  { label: "Chores", path: "/chores" },
  { label: "Settings", path: "/settings" }
];
```

- [ ] **Step 5: Update Today and Setup handoffs**

In `web/src/pages/TodayDashboard.tsx`, change setup-complete review buttons to:

```tsx
<button onClick={() => onNavigate("/chores")} type="button">Manage chores</button>
```

In `web/src/App.tsx`, pass:

```tsx
onReviewChores={() => navigate("/chores")}
```

Keep Setup's button label for now if tests expect it; Task 4 updates copy.

- [ ] **Step 6: Run web tests**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: PASS after updating old Plan expectations to Chores expectations.

- [ ] **Step 7: Commit**

```bash
git add web/src/ChoresPage.tsx web/src/App.tsx web/src/pages/TodayDashboard.tsx web/src/pages/SetupPage.tsx web/src/App.test.tsx
git commit -m "Route post-onboarding work to Chores"
```

---

## Task 4: Chores CRUD and Status UI

**Files:**
- Modify: `web/src/ChoresPage.tsx`
- Modify: `web/src/App.css`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing Chores page UI test**

Add:

```tsx
it("renders Chores status tabs and separates unreviewed chores visually", async () => {
  mockSuccessfulSetupAndChoreFetches()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "chore-1", householdId: "household-1", title: "Clean bathrooms", cadence: "weekly", estimatedMinutes: 5, source: "manual" },
        { id: "chore-2", householdId: "household-1", title: "Vacuum bedrooms", cadence: "weekly", estimatedMinutes: 20, source: "manual" }
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
    expect(screen.getByRole("heading", { name: "Household chores" })).toBeTruthy();
  });
  expect(screen.getByRole("button", { name: "All active" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Unreviewed" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Recommendation pending" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reviewed" })).toBeTruthy();
  expect(screen.getByText("Unreviewed")).toBeTruthy();
  expect(screen.getByText("Recommendation pending")).toBeTruthy();
});
```

- [ ] **Step 2: Run web test to verify failure**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: FAIL because status tabs and Chores heading are not implemented.

- [ ] **Step 3: Add review status derivation**

In `web/src/ChoresPage.tsx`, add:

```ts
type ChoreReviewState = "unreviewed" | "recommendation-pending" | "reviewed";

function getChoreReviewState(chore: Chore, recommendations: Recommendation[]): ChoreReviewState {
  const recommendation = recommendations.find((candidate) => candidate.affectedChoreId === chore.id);
  if (!recommendation) return "unreviewed";
  if (recommendation.decision === "pending" || recommendation.decision === "accepted" || recommendation.decision === "declined") {
    return "recommendation-pending";
  }
  return "reviewed";
}
```

- [ ] **Step 4: Replace Plan copy with Chores copy**

Use:

```tsx
<h1>Household chores</h1>
<p className="lede">Add, edit, archive, and track chore review state.</p>
```

Add review CTA panel:

```tsx
<section className="review-entry-panel" aria-label="Review entry point">
  <div>
    <strong>{unreviewedCount} chores have not been reviewed yet</strong>
    <p>Choose which chores the assistant should review. You can include already-reviewed chores if you want a second pass.</p>
  </div>
  <button className="secondary-action" onClick={() => setReviewFlowOpen(true)} type="button">
    Start review flow
  </button>
</section>
```

- [ ] **Step 5: Add status tab state**

Add:

```ts
const [activeTab, setActiveTab] = useState<"all-active" | "unreviewed" | "recommendation-pending" | "reviewed" | "archived">("all-active");
```

Render buttons:

```tsx
<div className="status-tabs" role="tablist" aria-label="Chore status filters">
  <button aria-selected={activeTab === "all-active"} onClick={() => setActiveTab("all-active")} role="tab" type="button">All active</button>
  <button aria-selected={activeTab === "unreviewed"} onClick={() => setActiveTab("unreviewed")} role="tab" type="button">Unreviewed</button>
  <button aria-selected={activeTab === "recommendation-pending"} onClick={() => setActiveTab("recommendation-pending")} role="tab" type="button">Recommendation pending</button>
  <button aria-selected={activeTab === "reviewed"} onClick={() => setActiveTab("reviewed")} role="tab" type="button">Reviewed</button>
  <button aria-selected={activeTab === "archived"} onClick={() => setActiveTab("archived")} role="tab" type="button">Archived</button>
</div>
```

- [ ] **Step 6: Add status-card CSS**

In `web/src/App.css`, add:

```css
.status-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.status-tabs button {
  background: white;
  border: 1px solid #eaded1;
  color: #3f4a43;
  padding: 9px 13px;
}

.status-tabs button[aria-selected="true"] {
  background: #eef6ea;
  border-color: #b8d1af;
  color: #2f694d;
}

.review-entry-panel {
  align-items: center;
  background: white;
  border: 1px solid #eaded1;
  border-radius: 12px;
  display: flex;
  gap: 14px;
  justify-content: space-between;
  padding: 14px;
}

.secondary-action {
  background: #f4f0e9;
  border: 1px solid #d8cabd;
  color: #2f694d;
}

.chore-card-unreviewed {
  border-style: dotted;
  border-width: 2px;
}

.chore-card-recommendation-pending {
  border-color: #ddbd9f;
}

.chore-card-reviewed {
  border-color: #b8d1af;
}
```

- [ ] **Step 7: Run web tests**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/ChoresPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Add Chores status workspace UI"
```

---

## Task 5: Review Flow UI and API Integration

**Files:**
- Modify: `web/src/api.ts`
- Modify: `web/src/ChoresPage.tsx`
- Modify: `web/src/App.css`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing review-flow test**

Add:

```tsx
it("runs a staged review flow from Chores and applies decisions explicitly", async () => {
  const fetchMock = mockSuccessfulSetupAndChoreFetches()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "chore-1", householdId: "household-1", title: "Clean bathrooms", cadence: "weekly", estimatedMinutes: 5, source: "manual" },
        { id: "chore-2", householdId: "household-1", title: "Vacuum bedrooms", cadence: "weekly", estimatedMinutes: 20, source: "manual" }
      ]
    })
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: "recommendation-1",
          householdId: "household-1",
          affectedChoreId: "chore-1",
          title: "Review duration for Clean bathrooms",
          rationale: "The current estimate may be too short.",
          confidence: "high",
          status: "pending",
          decision: "pending",
          proposedEstimatedMinutes: 30
        }
      ]
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "recommendation-1",
        householdId: "household-1",
        affectedChoreId: "chore-1",
        title: "Review duration for Clean bathrooms",
        rationale: "The current estimate may be too short.",
        confidence: "high",
        status: "pending",
        decision: "accepted",
        proposedEstimatedMinutes: 30
      })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ applied: [{ id: "recommendation-1", decision: "applied" }], declined: [] })
    });
  renderAt("/setup");

  await completeSetupWithChore();
  fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Household chores" })).toBeTruthy());

  fireEvent.click(screen.getByRole("button", { name: "Start review flow" }));
  expect((screen.getByLabelText("Clean bathrooms") as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText("Vacuum bedrooms") as HTMLInputElement).checked).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Review selected chores" }));
  await waitFor(() => expect(screen.getByText("Review duration for Clean bathrooms")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Accept Review duration for Clean bathrooms" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply decisions" }));

  await waitFor(() => expect(screen.getByRole("heading", { name: "Household chores" })).toBeTruthy());
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/households/household-1/recommendations/apply",
    expect.objectContaining({ method: "POST" })
  );
});
```

- [ ] **Step 2: Run web test to verify failure**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: FAIL because review-flow UI and helpers are missing.

- [ ] **Step 3: Add API helpers**

In `web/src/api.ts`, update `generateRecommendations`:

```ts
export async function generateRecommendations(
  householdId: string,
  reviewPrompt?: string,
  selectedChoreIds?: string[]
): Promise<Recommendation[]> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/recommendations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewPrompt, selectedChoreIds })
  });

  if (!response.ok) throw new Error("Failed to generate recommendations");
  return response.json();
}
```

Add:

```ts
export async function updateRecommendationDecision(
  householdId: string,
  recommendationId: string,
  decision: Recommendation["decision"]
): Promise<Recommendation> {
  const response = await fetch(
    `${API_BASE_URL}/api/households/${householdId}/recommendations/${recommendationId}/decision`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision })
    }
  );

  if (!response.ok) throw new Error("Failed to update recommendation decision");
  return response.json();
}

export async function applyRecommendationDecisions(
  householdId: string
): Promise<{ applied: Recommendation[]; declined: Recommendation[] }> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/recommendations/apply`, {
    method: "POST"
  });

  if (!response.ok) throw new Error("Failed to apply recommendation decisions");
  return response.json();
}
```

- [ ] **Step 4: Add review-flow state**

In `web/src/ChoresPage.tsx`, add:

```ts
const [reviewFlowOpen, setReviewFlowOpen] = useState(false);
const [reviewStep, setReviewStep] = useState<"select" | "decide" | "summary">("select");
const [selectedReviewChoreIds, setSelectedReviewChoreIds] = useState<string[]>([]);
const [reviewRecommendations, setReviewRecommendations] = useState<Recommendation[]>([]);
```

When review opens:

```ts
function handleStartReviewFlow() {
  const defaultIds = chores
    .filter((chore) => getChoreReviewState(chore, recommendations) === "unreviewed")
    .map((chore) => chore.id);
  setSelectedReviewChoreIds(defaultIds);
  setReviewStep("select");
  setReviewFlowOpen(true);
}
```

- [ ] **Step 5: Render select step**

Render when `reviewFlowOpen && reviewStep === "select"`:

```tsx
<section className="dashboard-section review-flow-section" aria-label="Review flow">
  <h2>Choose chores to review</h2>
  <p>Unreviewed chores are selected by default. You can add reviewed chores if you want another pass.</p>
  <div className="review-checkbox-list">
    {chores.map((chore) => (
      <label className="review-checkbox-row" key={chore.id}>
        <input
          checked={selectedReviewChoreIds.includes(chore.id)}
          onChange={(event) => {
            setSelectedReviewChoreIds((currentIds) =>
              event.target.checked
                ? [...currentIds, chore.id]
                : currentIds.filter((id) => id !== chore.id)
            );
          }}
          type="checkbox"
        />
        <span>{chore.title}</span>
      </label>
    ))}
  </div>
  <div className="form-actions">
    <button className="secondary-action" onClick={() => setReviewFlowOpen(false)} type="button">Cancel</button>
    <button onClick={handleGenerateSelectedReview} type="button">Review selected chores</button>
  </div>
</section>
```

- [ ] **Step 6: Add generate handler**

Add:

```ts
async function handleGenerateSelectedReview() {
  if (!householdId) return;

  setStatus("Reviewing selected chores...");
  const nextRecommendations = await generateRecommendations(
    householdId,
    "Review the selected chores and suggest practical improvements.",
    selectedReviewChoreIds
  );
  setReviewRecommendations(nextRecommendations);
  setRecommendations(nextRecommendations);
  setReviewStep("decide");
  setStatus("Review ready.");
}
```

- [ ] **Step 7: Render decision step with staged toggles**

For each `reviewRecommendations`, render:

```tsx
<article className="recommendation" key={recommendation.id}>
  <div>
    <span className="recommendation-type">Recommendation</span>
    <h3>{recommendation.title}</h3>
    <p>{recommendation.rationale}</p>
  </div>
  <div className="decision-toggle" role="group" aria-label={`Decision for ${recommendation.title}`}>
    <button
      aria-pressed={recommendation.decision === "accepted"}
      onClick={() => handleDecisionChange(recommendation, "accepted")}
      type="button"
    >
      Accept {recommendation.title}
    </button>
    <button
      aria-pressed={recommendation.decision === "declined"}
      onClick={() => handleDecisionChange(recommendation, "declined")}
      type="button"
    >
      Decline {recommendation.title}
    </button>
  </div>
</article>
```

Implement:

```ts
async function handleDecisionChange(
  recommendation: Recommendation,
  decision: Recommendation["decision"]
) {
  if (!householdId) return;

  const updated = await updateRecommendationDecision(householdId, recommendation.id, decision);
  setReviewRecommendations((currentRecommendations) =>
    currentRecommendations.map((candidate) => candidate.id === updated.id ? updated : candidate)
  );
  setRecommendations((currentRecommendations) =>
    currentRecommendations.map((candidate) => candidate.id === updated.id ? updated : candidate)
  );
}
```

- [ ] **Step 8: Render apply step and household context prompt**

Add:

```tsx
<button onClick={handleApplyDecisions} type="button">Apply decisions</button>
```

Add footer copy:

```tsx
<div className="context-support">
  <strong>Recommendations not adding up?</strong>
  <p>Make sure your household context is correct for more accurate recommendations.</p>
  <button className="secondary-action" onClick={() => setReviewFlowOpen(false)} type="button">
    Review household context
  </button>
</div>
```

Implement:

```ts
async function handleApplyDecisions() {
  if (!householdId) return;

  setStatus("Applying recommendation decisions...");
  await applyRecommendationDecisions(householdId);
  const [nextChores, nextRecommendations] = await Promise.all([
    listChores(householdId),
    listRecommendations(householdId)
  ]);
  setChores(nextChores);
  setRecommendations(nextRecommendations);
  setReviewFlowOpen(false);
  setStatus("Recommendation decisions applied.");
}
```

- [ ] **Step 9: Run web tests**

Run: `npm.cmd run test -w web -- App.test.tsx`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add web/src/api.ts web/src/ChoresPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Add staged Chores review flow"
```

---

## Task 6: Roadmap, Final Verification, and Push

**Files:**
- Modify: `docs/product-roadmap.md`
- Inspect: changed server/web files

- [ ] **Step 1: Update roadmap wording**

In `docs/product-roadmap.md`, add to the current persistence/domain milestone:

```md
- Consolidate ongoing Setup/Plan behavior into a Chores workspace with a separate staged review flow.
- Store recommendation accept/decline decisions before real agent integration so the Agents SDK plugs into a durable review contract.
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm.cmd run test -w server
npm.cmd run typecheck -w server
npm.cmd run test -w web
npm.cmd run typecheck -w web
npm.cmd run build -w web
```

Expected:

- Server tests pass, with destructive Prisma DB tests skipped unless a `*_test` DB is configured.
- Server typecheck passes.
- Web tests pass.
- Web typecheck passes.
- Web build passes.

- [ ] **Step 3: Check DB schema generation**

Run:

```bash
npm.cmd exec -w server prisma generate
npm.cmd run test:db -w server
```

Expected:

- Prisma client generation passes.
- `test:db` skips destructive store tests against the normal `chore_helper` database.
- To run DB-backed Prisma store tests, use a `DATABASE_URL` database name ending in `_test`.

- [ ] **Step 4: Commit roadmap cleanup if needed**

```bash
git add docs/product-roadmap.md
git commit -m "Update roadmap for Chores review workflow"
```

Skip this commit if the roadmap already contains equivalent language.

- [ ] **Step 5: Push**

```bash
git push origin main
```

Expected: local `main` is synced with `origin/main`.

---

## Spec Coverage Checklist

- Today remains the command center: Task 3 keeps Today and routes its post-setup action to Chores.
- Setup is only first-time onboarding: Task 3 removes Setup from primary nav after route consolidation.
- Plan is replaced by Chores: Task 3 redirects `/plan` behavior to `ChoresPage`.
- Chores owns CRUD/status: Task 4 keeps current chore edit/archive/add behavior and reframes it as Chores.
- State filters are lifecycle/review-focused: Task 4 adds All active, Unreviewed, Recommendation pending, Reviewed, Archived.
- Unreviewed chores have a dotted visual treatment: Task 4 adds `chore-card-unreviewed`.
- No per-card review buttons: Task 4 and Task 5 only expose the page-level review CTA.
- Review flow defaults to unreviewed chores but permits re-review: Task 5 checkbox list includes all active chores with unreviewed defaults.
- Accept/decline is staged: Task 1 and Task 5 store decisions before applying.
- Applying decisions is explicit: Task 2 and Task 5 add `/recommendations/apply`.
- Household context prompt moves to end of review: Task 5 adds context support copy inside the review flow.
