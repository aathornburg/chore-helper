# Dedicated Chore Review Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move assistant chore review out of the Chores page into a hidden `/chores/review` workflow with concise `Accept` and `Decline` decisions and a completion state.

**Architecture:** Keep `ChoresPage` focused on chore CRUD, filtering, and inline row editing. Add a focused `ChoreReviewPage` route that owns loading review data, selecting chores, generating recommendations, applying decisions, and returning to `/chores` through the existing manual router in `App.tsx`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, React Testing Library, existing `web/src/api.ts` helpers, existing shared `Chore` and `Recommendation` types.

---

## File Structure

- Create `web/src/pages/ChoreReviewPage.tsx`
  - Owns the dedicated review workflow route.
  - Reuses `listChores`, `listRecommendations`, `generateRecommendations`, `updateRecommendationDecision`, and `applyRecommendationDecisions`.
  - Manages review route state: load state, status message, selected chore ids, generated recommendations, and `select` / `decide` / `complete` step.
- Modify `web/src/pages/ChoresPage.tsx`
  - Remove embedded review-flow state, handlers, and JSX.
  - Add an `onReviewChores` prop and wire the existing review entry panel button to that prop.
  - Keep chore CRUD, filters, archive/restore, inline row editing, and per-row recommendation display.
- Modify `web/src/App.tsx`
  - Import and render `ChoreReviewPage` for exact path `/chores/review`.
  - Pass `onReviewChores={() => navigate("/chores/review")}` into `ChoresPage`.
  - Do not add a `Review` nav item.
- Modify `web/src/App.test.tsx`
  - Replace inline review-flow expectations with route-level review-flow expectations.
  - Add regression coverage for hidden nav, route handoff, default selected checkboxes, concise decision labels, completion state, and `Back to chores`.
- Modify `web/src/App.css`
  - Reuse existing review classes where possible.
  - Add small route-specific layout classes only where the dedicated page needs spacing or completion-state polish.

---

### Task 1: Write Failing Route And Chores Handoff Tests

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add a helper for restored household test setup**

Add this helper near the existing `mockSuccessfulSetupAndChoreFetches` helper. It avoids repeating local-storage setup for direct `/chores` and `/chores/review` route tests.

```tsx
function restoreHouseholdInStorage() {
  window.localStorage.setItem("chore-helper:household-id", "household-1");
}
```

- [ ] **Step 2: Add a failing test proving the route stays hidden from primary nav**

Add this test in the existing `describe("App", () => { ... })` block near the navigation tests.

```tsx
it("keeps the dedicated chore review route out of primary navigation", async () => {
  restoreHouseholdInStorage();
  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce({
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
            notes: ""
          }
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
  );

  renderAt("/chores/review");

  expect(screen.getByRole("link", { name: "Today" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Setup" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Chores" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Review" })).toBeNull();

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Review chores" })).toBeTruthy();
  });
});
```

- [ ] **Step 3: Add a failing test proving Chores routes to the dedicated page**

Add this test near the existing Chores tests. It should fail before implementation because the button still says `Start review flow` and opens inline UI.

```tsx
it("routes from the Chores review CTA to the dedicated review page", async () => {
  restoreHouseholdInStorage();
  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "household-1",
          name: "Home",
          baseline: {
            homeType: "house",
            rooms: ["bathrooms"],
            flooring: ["tile"],
            hasPets: false,
            hasOutdoorSpace: false,
            notes: ""
          }
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
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
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
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
  );

  renderAt("/chores");

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Chore list" })).toBeTruthy();
  });
  expect(screen.queryByRole("heading", { name: "Choose chores to review" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Review selected chores" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Apply decisions" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Review" }));

  await waitFor(() => {
    expect(window.location.pathname).toBe("/chores/review");
    expect(screen.getByRole("heading", { name: "Review chores" })).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run the focused tests and verify they fail**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: FAIL. The first test fails because `/chores/review` does not render `Review chores`; the second fails because `Review` is not the Chores CTA and the route does not exist.

- [ ] **Step 5: Commit the failing tests**

```bash
git add web/src/App.test.tsx
git commit -m "test: cover dedicated chore review route"
```

---

### Task 2: Add The Dedicated Review Page And Route

**Files:**
- Create: `web/src/pages/ChoreReviewPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/pages/ChoresPage.tsx`

- [ ] **Step 1: Create `ChoreReviewPage.tsx`**

Create `web/src/pages/ChoreReviewPage.tsx` with this implementation.

```tsx
import { useEffect, useMemo, useState } from "react";
import { type Chore, type Recommendation } from "@chore-helper/shared";
import {
  applyRecommendationDecisions,
  generateRecommendations,
  listChores,
  listRecommendations,
  updateRecommendationDecision
} from "../api";

type ReviewStep = "select" | "decide" | "complete";
type ReviewLoadState = "idle" | "loading" | "ready" | "error";

type ChoreReviewPageProps = {
  householdId?: string;
  householdName?: string;
  onBackToChores: () => void;
};

function findRecommendationForChore(chore: Chore, recommendations: Recommendation[]) {
  return recommendations.find((recommendation) =>
    recommendation.affectedChoreId === chore.id ||
    recommendation.title.toLowerCase().includes(chore.title.toLowerCase())
  );
}

function getReviewDefaultSelection(chores: Chore[], recommendations: Recommendation[]) {
  const unreviewedIds = chores
    .filter((chore) => {
      const recommendation = findRecommendationForChore(chore, recommendations);
      return !recommendation || recommendation.decision !== "applied";
    })
    .map((chore) => chore.id);

  return unreviewedIds.length > 0 ? unreviewedIds : chores.map((chore) => chore.id);
}

export function ChoreReviewPage({
  householdId,
  householdName = "Home",
  onBackToChores
}: ChoreReviewPageProps) {
  const [chores, setChores] = useState<Chore[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [reviewRecommendations, setReviewRecommendations] = useState<Recommendation[]>([]);
  const [selectedChoreIds, setSelectedChoreIds] = useState<string[]>([]);
  const [reviewStep, setReviewStep] = useState<ReviewStep>("select");
  const [loadState, setLoadState] = useState<ReviewLoadState>("idle");
  const [status, setStatus] = useState("Choose chores for assistant review.");

  const activeChores = useMemo(
    () => chores.filter((chore) => !chore.archivedAt),
    [chores]
  );

  useEffect(() => {
    if (!householdId) return;

    let cancelled = false;

    async function loadReviewData() {
      // This mirrors Angular's ngOnInit plus service calls: the component reacts
      // to the household id and keeps async route data in local render state.
      setLoadState("loading");
      setStatus("Loading review queue...");

      try {
        const [nextChores, nextRecommendations] = await Promise.all([
          listChores(householdId),
          listRecommendations(householdId)
        ]);
        if (cancelled) return;

        const nextActiveChores = nextChores.filter((chore) => !chore.archivedAt);
        setChores(nextActiveChores);
        setRecommendations(nextRecommendations);
        setSelectedChoreIds(getReviewDefaultSelection(nextActiveChores, nextRecommendations));
        setReviewRecommendations([]);
        setReviewStep("select");
        setLoadState("ready");
        setStatus("Choose chores for assistant review.");
      } catch {
        if (!cancelled) {
          setLoadState("error");
          setStatus("Could not load the review queue.");
        }
      }
    }

    void loadReviewData();

    return () => {
      cancelled = true;
    };
  }, [householdId]);

  async function refreshReviewData() {
    if (!householdId) return;

    const [nextChores, nextRecommendations] = await Promise.all([
      listChores(householdId),
      listRecommendations(householdId)
    ]);
    const nextActiveChores = nextChores.filter((chore) => !chore.archivedAt);
    setChores(nextActiveChores);
    setRecommendations(nextRecommendations);
    setSelectedChoreIds(getReviewDefaultSelection(nextActiveChores, nextRecommendations));
  }

  async function handleGenerateSelectedReview() {
    if (!householdId || selectedChoreIds.length === 0) return;

    setStatus("Reviewing selected chores...");

    try {
      const nextRecommendations = await generateRecommendations(
        householdId,
        "Review the selected chores and suggest practical improvements.",
        selectedChoreIds
      );
      setReviewRecommendations(nextRecommendations);
      setRecommendations(nextRecommendations);
      setReviewStep("decide");
      setStatus("Review ready.");
    } catch {
      setStatus("Could not review selected chores. Adjust the selection and try again.");
    }
  }

  async function handleDecisionChange(
    recommendation: Recommendation,
    decision: Recommendation["decision"]
  ) {
    if (!householdId || !decision) return;

    setStatus("Saving recommendation decision...");

    try {
      const updated = await updateRecommendationDecision(householdId, recommendation.id, decision);
      setReviewRecommendations((currentRecommendations) =>
        currentRecommendations.map((candidate) => (candidate.id === updated.id ? updated : candidate))
      );
      setRecommendations((currentRecommendations) =>
        currentRecommendations.map((candidate) => (candidate.id === updated.id ? updated : candidate))
      );
      setStatus("Review ready.");
    } catch {
      setStatus("Could not save that recommendation decision.");
    }
  }

  async function handleApplyDecisions() {
    if (!householdId) return;

    setStatus("Applying recommendation decisions...");

    try {
      await applyRecommendationDecisions(householdId);
      await refreshReviewData();
      setReviewRecommendations([]);
      setReviewStep("complete");
      setStatus("Recommendation decisions applied.");
    } catch {
      setStatus("Could not apply recommendation decisions.");
    }
  }

  if (!householdId) {
    return (
      <section className="placeholder-page">
        <p className="eyebrow">Review</p>
        <h1>Review chores</h1>
        <p className="lede">Set up a household before reviewing existing chores.</p>
        <button className="secondary-action" onClick={onBackToChores} type="button">
          Back to chores
        </button>
      </section>
    );
  }

  return (
    <div className="plan-review review-page">
      <header className="workspace-hero compact-hero">
        <div>
          <p className="eyebrow">Assistant review</p>
          <h1>Review chores</h1>
          <p className="lede">
            Choose chores for the assistant to review, decide what to accept, and apply the changes when ready.
          </p>
          <p className="supporting-copy">
            <span><strong>{householdName}</strong></span>
          </p>
        </div>
      </header>

      <section className="dashboard-section review-flow-section" aria-labelledby="review-flow-heading">
        <div className="section-heading">
          <div className="section-title">
            <div>
              <h2 id="review-flow-heading">
                {reviewStep === "select" ? "Choose chores to review" : null}
                {reviewStep === "decide" ? "Decide on recommendations" : null}
                {reviewStep === "complete" ? "Review complete" : null}
              </h2>
              <p>
                {reviewStep === "select" ? "Unreviewed chores are selected by default. Select reviewed chores too if you want another pass." : null}
                {reviewStep === "decide" ? "Accept or decline each recommendation, then apply the decisions together." : null}
                {reviewStep === "complete" ? "Your recommendation decisions were applied. Calendar export can fit here in a future slice." : null}
              </p>
            </div>
          </div>
          <span className="confidence" role="status">{status}</span>
        </div>

        {loadState === "loading" ? (
          <div className="empty-state">Loading review queue...</div>
        ) : null}

        {loadState === "error" ? (
          <div className="empty-state">Could not load the review queue.</div>
        ) : null}

        {loadState === "ready" && reviewStep === "select" ? (
          <>
            {activeChores.length === 0 ? (
              <div className="empty-state">No active chores are ready for review.</div>
            ) : (
              <div className="review-checkbox-list">
                {activeChores.map((chore) => (
                  <label className="review-checkbox-row" key={chore.id}>
                    <input
                      checked={selectedChoreIds.includes(chore.id)}
                      onChange={(event) => {
                        setSelectedChoreIds((currentIds) =>
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
            )}

            <div className="form-actions">
              <button className="secondary-action" onClick={onBackToChores} type="button">
                Back to chores
              </button>
              <button
                disabled={selectedChoreIds.length === 0}
                onClick={handleGenerateSelectedReview}
                type="button"
              >
                Review selected chores
              </button>
            </div>
          </>
        ) : null}

        {loadState === "ready" && reviewStep === "decide" ? (
          <>
            <div className="recommendation-list">
              {reviewRecommendations.map((recommendation) => (
                <article className="recommendation" key={recommendation.id}>
                  <div>
                    <span className="recommendation-type">Recommendation</span>
                    <h3>{recommendation.title}</h3>
                    <p>{recommendation.rationale}</p>
                  </div>
                  <span className="confidence">Confidence: {recommendation.confidence}</span>
                  <div className="decision-toggle" role="group" aria-label={`Decision for ${recommendation.title}`}>
                    <button
                      aria-pressed={recommendation.decision === "accepted"}
                      onClick={() => handleDecisionChange(recommendation, "accepted")}
                      type="button"
                    >
                      Accept
                    </button>
                    <button
                      aria-pressed={recommendation.decision === "declined"}
                      onClick={() => handleDecisionChange(recommendation, "declined")}
                      type="button"
                    >
                      Decline
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="context-support">
              <strong>Recommendations not adding up?</strong>
              <p>Make sure your household context is correct for more accurate recommendations.</p>
            </div>

            <div className="form-actions">
              <button className="secondary-action" onClick={() => setReviewStep("select")} type="button">
                Back
              </button>
              <button onClick={handleApplyDecisions} type="button">
                Apply decisions
              </button>
            </div>
          </>
        ) : null}

        {loadState === "ready" && reviewStep === "complete" ? (
          <div className="review-completion">
            <p>Recommendation decisions applied.</p>
            <div className="form-actions">
              <button onClick={onBackToChores} type="button">
                Back to chores
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Modify `App.tsx` to route `/chores/review`**

Add this import:

```tsx
import { ChoreReviewPage } from "./pages/ChoreReviewPage";
```

Change the Chores route block to pass `onReviewChores`:

```tsx
{path === "/chores" || path === "/plan" ? (
  <ChoresPage
    householdId={householdSetup.householdId}
    householdName={householdSetup.householdName}
    baseline={householdSetup.baseline}
    onReviewChores={() => navigate("/chores/review")}
  />
) : null}
```

Add the dedicated review route between the setup route and the Chores route:

```tsx
{path === "/chores/review" ? (
  <ChoreReviewPage
    householdId={householdSetup.householdId}
    householdName={householdSetup.householdName}
    onBackToChores={() => navigate("/chores")}
  />
) : null}
```

Keep `navItems` unchanged:

```tsx
const navItems = [
  { label: "Today", path: "/today" },
  { label: "Setup", path: "/setup" },
  { label: "Chores", path: "/chores" },
  { label: "Settings", path: "/settings" }
];
```

- [ ] **Step 3: Remove review API imports from `ChoresPage.tsx`**

Change the API imports at the top of `web/src/pages/ChoresPage.tsx` from:

```tsx
  applyRecommendationDecisions,
  archiveChore,
  createChore,
  generateRecommendations,
  listArchivedChores,
  listChores,
  listRecommendations,
  restoreChore,
  updateRecommendationDecision,
  updateChore
```

to:

```tsx
  archiveChore,
  createChore,
  listArchivedChores,
  listChores,
  listRecommendations,
  restoreChore,
  updateChore
```

- [ ] **Step 4: Add the Chores review navigation prop**

Change `PlanReviewProps` in `web/src/pages/ChoresPage.tsx` from:

```tsx
type PlanReviewProps = {
  householdId?: string;
  householdName?: string;
  baseline?: HouseholdBaseline;
};
```

to:

```tsx
type PlanReviewProps = {
  householdId?: string;
  householdName?: string;
  baseline?: HouseholdBaseline;
  onReviewChores?: () => void;
};
```

Change the component signature from:

```tsx
export function ChoresPage({
  householdId,
  householdName = "Home",
  baseline
}: PlanReviewProps) {
```

to:

```tsx
export function ChoresPage({
  householdId,
  householdName = "Home",
  baseline,
  onReviewChores
}: PlanReviewProps) {
```

- [ ] **Step 5: Remove embedded review state from `ChoresPage.tsx`**

Delete these state declarations:

```tsx
const [reviewFlowOpen, setReviewFlowOpen] = useState(false);
const [reviewStep, setReviewStep] = useState<"select" | "decide">("select");
const [selectedReviewChoreIds, setSelectedReviewChoreIds] = useState<string[]>([]);
const [reviewRecommendations, setReviewRecommendations] = useState<Recommendation[]>([]);
```

- [ ] **Step 6: Remove embedded review handlers from `ChoresPage.tsx`**

Delete these functions:

```tsx
function handleStartReviewFlow() {
  const defaultIds = chores
    .filter((chore) => getChoreReviewState(chore, recommendations) === "unreviewed")
    .map((chore) => chore.id);

  setSelectedReviewChoreIds(defaultIds.length > 0 ? defaultIds : chores.map((chore) => chore.id));
  setReviewRecommendations([]);
  setReviewStep("select");
  setReviewFlowOpen(true);
}
```

```tsx
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

```tsx
async function handleDecisionChange(
  recommendation: Recommendation,
  decision: Recommendation["decision"]
) {
  if (!householdId || !decision) return;

  const updated = await updateRecommendationDecision(householdId, recommendation.id, decision);
  setReviewRecommendations((currentRecommendations) =>
    currentRecommendations.map((candidate) => (candidate.id === updated.id ? updated : candidate))
  );
  setRecommendations((currentRecommendations) =>
    currentRecommendations.map((candidate) => (candidate.id === updated.id ? updated : candidate))
  );
}
```

```tsx
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
  setReviewRecommendations([]);
  setReviewFlowOpen(false);
  setStatus("Recommendation decisions applied.");
}
```

- [ ] **Step 7: Replace the Chores review CTA behavior**

Change the review entry panel button from:

```tsx
<button className="secondary-action" onClick={handleStartReviewFlow} type="button">
  Start review flow
</button>
```

to:

```tsx
<button className="secondary-action" onClick={onReviewChores} type="button">
  Review
</button>
```

- [ ] **Step 8: Remove embedded review JSX from `ChoresPage.tsx`**

Delete the full conditional block that starts with:

```tsx
{reviewFlowOpen ? (
  <section className="dashboard-section review-flow-section" aria-label="Review flow">
```

and ends at the matching:

```tsx
  </section>
) : null}
```

The Chores page should still render the error state, empty state, queue list, add chore form, filters, row editor, archive/restore controls, and inline recommendation details.

- [ ] **Step 9: Run the focused tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: the new route and handoff tests pass. Existing inline review tests fail until Task 3 updates them.

- [ ] **Step 10: Commit the route extraction**

```bash
git add web/src/App.tsx web/src/pages/ChoresPage.tsx web/src/pages/ChoreReviewPage.tsx
git commit -m "feat: move chore review flow to dedicated page"
```

---

### Task 3: Update Review Flow Behavior Tests

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Replace the existing Chores recommendation submit test**

Find the test named:

```tsx
it("keeps the Chores recommendation submit flow working", async () => {
```

Replace the full test with:

```tsx
it("submits selected chores for review from the dedicated review page", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "household-1", name: "Home" })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "household-1", name: "Home" })
    })
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
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
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
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: "recommendation-1",
          householdId: "household-1",
          affectedChoreId: "chore-1",
          title: "Review duration for Clean bathrooms",
          rationale: "The current estimate may be too short for the scope.",
          confidence: "high",
          status: "pending",
          decision: "pending"
        }
      ]
    });
  vi.stubGlobal("fetch", fetchMock);
  renderAt("/setup");

  await completeSetupWithChore();
  fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));
  await waitFor(() => {
    expect(screen.getAllByText("Clean bathrooms").length).toBeGreaterThan(0);
  });

  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  await waitFor(() => {
    expect(window.location.pathname).toBe("/chores/review");
  });
  fireEvent.click(screen.getByRole("button", { name: "Review selected chores" }));

  await waitFor(() => {
    expect(screen.getAllByText("Review duration for Clean bathrooms").length).toBeGreaterThan(0);
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/households/household-1/recommendations",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        prompt: "Review the selected chores and suggest practical improvements.",
        choreIds: ["chore-1"]
      })
    })
  );
});
```

- [ ] **Step 2: Replace the existing staged review flow test**

Find the test named:

```tsx
it("runs a staged review flow from Chores and applies decisions explicitly", async () => {
```

Replace the full test with:

```tsx
it("runs a staged review flow on the dedicated page and stays there after applying decisions", async () => {
  const fetchMock = mockSuccessfulSetupAndChoreFetches()
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
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
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
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: "chore-1",
          householdId: "household-1",
          title: "Clean bathrooms",
          cadence: "weekly",
          estimatedMinutes: 30,
          source: "manual"
        }
      ]
    })
    .mockResolvedValueOnce({ ok: true, json: async () => [] });
  renderAt("/setup");

  await completeSetupWithChore();
  fireEvent.click(screen.getByRole("button", { name: "Review existing chores" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Household chores" })).toBeTruthy());

  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Review chores" })).toBeTruthy());
  expect((screen.getByLabelText("Clean bathrooms") as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText("Vacuum bedrooms") as HTMLInputElement).checked).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Review selected chores" }));
  await waitFor(() => expect(screen.getAllByText("Review duration for Clean bathrooms").length).toBeGreaterThan(0));

  expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Accept Review duration for Clean bathrooms" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Decline Review duration for Clean bathrooms" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Accept" }).getAttribute("aria-pressed")).toBe("true");
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply decisions" }));

  await waitFor(() => expect(screen.getByText("Recommendation decisions applied.")).toBeTruthy());
  expect(window.location.pathname).toBe("/chores/review");
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/households/household-1/recommendations/apply",
    expect.objectContaining({ method: "POST" })
  );

  fireEvent.click(screen.getByRole("button", { name: "Back to chores" }));
  expect(window.location.pathname).toBe("/chores");
});
```

- [ ] **Step 3: Add a test for default unreviewed selection and re-review selection**

Add this test near the staged review flow test.

```tsx
it("defaults review selection to unreviewed chores while allowing reviewed chores to be re-selected", async () => {
  restoreHouseholdInStorage();
  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "household-1",
          name: "Home",
          baseline: {
            homeType: "house",
            rooms: ["bathrooms", "bedrooms"],
            flooring: ["tile", "carpet"],
            hasPets: false,
            hasOutdoorSpace: false,
            notes: ""
          }
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
            estimatedMinutes: 30,
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
        json: async () => [
          {
            id: "recommendation-1",
            householdId: "household-1",
            affectedChoreId: "chore-1",
            title: "Review duration for Clean bathrooms",
            rationale: "Updated duration already applied.",
            confidence: "high",
            status: "applied",
            decision: "applied"
          }
        ]
      })
  );

  renderAt("/chores/review");

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Choose chores to review" })).toBeTruthy();
  });

  const cleanBathrooms = screen.getByLabelText("Clean bathrooms") as HTMLInputElement;
  const vacuumBedrooms = screen.getByLabelText("Vacuum bedrooms") as HTMLInputElement;

  expect(cleanBathrooms.checked).toBe(false);
  expect(vacuumBedrooms.checked).toBe(true);

  fireEvent.click(cleanBathrooms);

  expect(cleanBathrooms.checked).toBe(true);
});
```

- [ ] **Step 4: Add a test for fallback selection when every chore is reviewed**

Add this test near the previous selection test.

```tsx
it("defaults review selection to all active chores when every chore has already been reviewed", async () => {
  restoreHouseholdInStorage();
  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "household-1",
          name: "Home",
          baseline: {
            homeType: "house",
            rooms: ["bathrooms", "bedrooms"],
            flooring: ["tile", "carpet"],
            hasPets: false,
            hasOutdoorSpace: false,
            notes: ""
          }
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
            estimatedMinutes: 30,
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
        json: async () => [
          {
            id: "recommendation-1",
            householdId: "household-1",
            affectedChoreId: "chore-1",
            title: "Review duration for Clean bathrooms",
            rationale: "Updated duration already applied.",
            confidence: "high",
            status: "applied",
            decision: "applied"
          },
          {
            id: "recommendation-2",
            householdId: "household-1",
            affectedChoreId: "chore-2",
            title: "Review duration for Vacuum bedrooms",
            rationale: "Updated duration already applied.",
            confidence: "medium",
            status: "applied",
            decision: "applied"
          }
        ]
      })
  );

  renderAt("/chores/review");

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Choose chores to review" })).toBeTruthy();
  });

  expect((screen.getByLabelText("Clean bathrooms") as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText("Vacuum bedrooms") as HTMLInputElement).checked).toBe(true);
});
```

- [ ] **Step 5: Run the focused tests and fix small mock-count issues**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: PASS after the mocks match the route's fetch sequence. If a test fails because the restored household provider consumes a fetch before the page does, add one `mockResolvedValueOnce` for the restored household before chore-list expectations.

- [ ] **Step 6: Commit the updated behavior tests**

```bash
git add web/src/App.test.tsx
git commit -m "test: cover dedicated chore review behavior"
```

---

### Task 4: Add Recoverable Error Tests And Finish Route Polish

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/ChoreReviewPage.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Add a test for review queue load failure**

Add this test near the review page tests.

```tsx
it("shows a review-page error when the review queue cannot load", async () => {
  restoreHouseholdInStorage();
  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce({
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
            notes: ""
          }
        })
      })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
  );

  renderAt("/chores/review");

  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBe("Could not load the review queue.");
  });
  expect(screen.getByText("Could not load the review queue.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Review selected chores" })).toBeNull();
});
```

- [ ] **Step 2: Add a test for generation failure staying on selection**

Add this test near the load failure test.

```tsx
it("keeps the review page on selection when recommendation generation fails", async () => {
  restoreHouseholdInStorage();
  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "household-1",
          name: "Home",
          baseline: {
            homeType: "house",
            rooms: ["bathrooms"],
            flooring: ["tile"],
            hasPets: false,
            hasOutdoorSpace: false,
            notes: ""
          }
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
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false })
  );

  renderAt("/chores/review");

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Choose chores to review" })).toBeTruthy();
  });
  fireEvent.click(screen.getByRole("button", { name: "Review selected chores" }));

  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBe(
      "Could not review selected chores. Adjust the selection and try again."
    );
  });
  expect(screen.getByRole("heading", { name: "Choose chores to review" })).toBeTruthy();
});
```

- [ ] **Step 3: Add a test for apply failure staying on decision**

Add this test near the generation failure test.

```tsx
it("keeps the review page on recommendations when applying decisions fails", async () => {
  restoreHouseholdInStorage();
  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "household-1",
          name: "Home",
          baseline: {
            homeType: "house",
            rooms: ["bathrooms"],
            flooring: ["tile"],
            hasPets: false,
            hasOutdoorSpace: false,
            notes: ""
          }
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
            decision: "pending"
          }
        ]
      })
      .mockResolvedValueOnce({ ok: false })
  );

  renderAt("/chores/review");

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Choose chores to review" })).toBeTruthy();
  });
  fireEvent.click(screen.getByRole("button", { name: "Review selected chores" }));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Decide on recommendations" })).toBeTruthy();
  });

  fireEvent.click(screen.getByRole("button", { name: "Apply decisions" }));

  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBe("Could not apply recommendation decisions.");
  });
  expect(screen.getByRole("heading", { name: "Decide on recommendations" })).toBeTruthy();
});
```

- [ ] **Step 4: Ensure API helpers throw on non-OK responses through existing behavior**

Open `web/src/api.ts` and confirm that `listChores`, `listRecommendations`, `generateRecommendations`, and `applyRecommendationDecisions` already throw when `response.ok` is false through the shared request helper. If they do, do not change `api.ts`.

The helper should look equivalent to this pattern:

```ts
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
```

- [ ] **Step 5: Add dedicated page CSS polish**

Append this CSS to `web/src/App.css` near the existing review-flow styles.

```css
.review-page .review-flow-section {
  display: grid;
  gap: 1rem;
}

.review-page .review-checkbox-list {
  max-width: 48rem;
}

.review-page .recommendation-list {
  display: grid;
  gap: 0.875rem;
}

.review-completion {
  display: grid;
  gap: 1rem;
  max-width: 42rem;
}

.review-completion p {
  margin: 0;
  color: var(--text-muted);
}
```

- [ ] **Step 6: Run the focused tests**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit error handling and polish**

```bash
git add web/src/App.test.tsx web/src/pages/ChoreReviewPage.tsx web/src/App.css
git commit -m "test: cover chore review error states"
```

---

### Task 5: Full Verification And Browser Review

**Files:**
- Verify: `web/src/App.tsx`
- Verify: `web/src/pages/ChoresPage.tsx`
- Verify: `web/src/pages/ChoreReviewPage.tsx`
- Verify: `web/src/App.test.tsx`
- Verify: `web/src/App.css`

- [ ] **Step 1: Run web tests**

Run:

```bash
npm.cmd run test -w web
```

Expected: PASS.

- [ ] **Step 2: Run web typecheck**

Run:

```bash
npm.cmd run typecheck -w web
```

Expected: PASS.

- [ ] **Step 3: Run web build**

Run:

```bash
npm.cmd run build -w web
```

Expected: PASS.

- [ ] **Step 4: Start the app for browser review**

Run:

```bash
npm.cmd run dev -w web
```

Expected: Vite prints a local URL, usually `http://localhost:5173/`.

- [ ] **Step 5: Browser-check the Chores page**

Open the local Vite URL at `/chores`. Verify these page facts:

- Primary nav includes `Today`, `Setup`, `Chores`, and `Settings`.
- Primary nav does not include `Review`.
- The Chores page does not show inline headings `Choose chores to review` or `Decide on recommendations`.
- The review entry panel button reads `Review`.
- Clicking a chore row still opens its inline edit controls.
- Expanding a chore with an existing recommendation still shows that recommendation inside the row.

- [ ] **Step 6: Browser-check the dedicated review page**

From `/chores`, click `Review`. Verify:

- URL becomes `/chores/review`.
- Page heading is `Review chores`.
- Selection step shows checkboxes.
- `Review selected chores` advances to the recommendation decision step when the API returns recommendations.
- Decision buttons read exactly `Accept` and `Decline`.
- `Apply decisions` keeps the user on `/chores/review`.
- Completion state shows `Recommendation decisions applied.` and a `Back to chores` button.
- `Back to chores` navigates to `/chores`.

- [ ] **Step 7: Browser-check mobile width**

Set the browser viewport to a mobile width around 390 px. Verify:

- Review checkbox rows do not overlap.
- Decision buttons remain readable.
- The completion state action is visible without horizontal scrolling.

- [ ] **Step 8: Commit any browser polish adjustments**

If Step 5, Step 6, or Step 7 requires CSS or copy changes, make only those changes and run:

```bash
npm.cmd run test -w web
npm.cmd run typecheck -w web
npm.cmd run build -w web
git add web/src/App.css web/src/pages/ChoreReviewPage.tsx web/src/pages/ChoresPage.tsx web/src/App.test.tsx
git commit -m "style: polish dedicated chore review page"
```

If no browser polish changes are needed, skip this commit.

---

## Self-Review Checklist

- The plan implements the hidden `/chores/review` route in `App.tsx` and keeps primary nav unchanged.
- The plan removes embedded review selection, decision, and apply flow from `ChoresPage`.
- The plan keeps Chores CRUD, filters, inline row editing, archive/restore, and row recommendation display intact.
- The plan creates a dedicated page with select, decide, and complete states.
- The plan uses `Accept` and `Decline` button labels and keeps the recommendation title in the decision group's accessible label.
- The plan keeps the user on `/chores/review` after applying decisions.
- The plan includes recoverable load, generation, and apply error states.
- The plan does not build Google Calendar export.
- The plan includes tests and browser checks for the approved behavior.
