# Optimize Guided Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the partial review-page refactor into a guided Optimize workspace with recommendation and chat modes, backed by a household-scoped assistant chat API with deterministic provider behavior.

**Architecture:** Keep React calling product APIs only. Extend the backend `AgentProvider` contract with an informational chat method, add an Express route that loads household context before calling the provider, and update `OptimizePage` to host tabbed recommendation and chat modes. Keep full Households CRUD out of scope; add only a small `/household` placeholder so the nav route is real.

**Tech Stack:** React, TypeScript, Express, Zod, Vitest, Testing Library, Supertest, npm workspaces.

---

## File Structure

- Modify `server/src/agent/AgentProvider.ts`: add chat context/response types and `answerHouseholdQuestion(...)`.
- Modify `server/src/agent/MockChoreAgentProvider.ts`: return deterministic chat replies.
- Modify `server/src/agent/OpenAiChoreAgentProvider.ts`: implement deterministic chat replies for this slice without a real OpenAI chat call.
- Modify `server/src/routes/households.ts`: add `POST /:householdId/assistant/chat`.
- Modify `server/test/households.test.ts`: add backend chat route coverage.
- Modify `web/src/api.ts`: add `askAssistantQuestion(...)`.
- Modify `web/src/pages/OptimizePage.tsx`: add `Recommendations` and `Chat` modes, update recommendation copy, and wire chat UI to the new API helper.
- Create `web/src/pages/HouseholdPage.tsx`: small placeholder only.
- Modify `web/src/App.tsx`: clean unused setup props, route `/household`, remove old `/chores/review` assumptions.
- Modify `web/src/routes.ts`: keep routes aligned with actual pages.
- Modify `web/src/App.test.tsx`: update stale tests around nav, Optimize, and the removed review route.
- Modify `web/src/App.css`: add minimal styles for Optimize tabs/chat if existing classes are insufficient.

## Implementation Notes

- Preserve comments that compare React concepts to Angular where touching React files. Add short Angular-oriented comments only when they clarify state, effects, or service/API boundaries.
- Keep chat informational. It must not call chore mutation APIs or recommendation decision/apply APIs.
- Keep recommendation review staged. Do not collapse selection, decision, and apply into one screen.
- Do not implement household add/edit CRUD in this plan.
- Use `/optimize` as the assistant workspace route. `/chores/review` is no longer a product route.
- The current working tree is expected to be clean before implementation starts.

---

### Task 1: Add Backend Chat Contract Tests

**Files:**
- Modify: `server/test/households.test.ts`
- Later modify: `server/src/agent/AgentProvider.ts`
- Later modify: `server/src/routes/households.ts`

- [ ] **Step 1: Add recording and failing chat providers to the test file**

In `server/test/households.test.ts`, update the existing agent imports to include `AgentChatContext` and `AgentChatResponse`.

Use this import shape near the top:

```ts
import type {
  AgentChatContext,
  AgentChatResponse,
  AgentProvider,
  AgentRecommendationContext
} from "../src/agent/AgentProvider.js";
```

Below `FailingAgentProvider`, add:

```ts
class RecordingChatAgentProvider implements AgentProvider {
  receivedContext?: AgentChatContext;

  async recommendSetupImprovements(
    _context: AgentRecommendationContext
  ): Promise<Recommendation[]> {
    return [];
  }

  async answerHouseholdQuestion(context: AgentChatContext): Promise<AgentChatResponse> {
    this.receivedContext = context;
    return { reply: `Mock reply for ${context.household.name}` };
  }
}

class FailingChatAgentProvider implements AgentProvider {
  async recommendSetupImprovements(
    _context: AgentRecommendationContext
  ): Promise<Recommendation[]> {
    return [];
  }

  async answerHouseholdQuestion(_context: AgentChatContext): Promise<AgentChatResponse> {
    throw new Error("Assistant chat failed");
  }
}
```

Also update `FailingAgentProvider` so it implements `answerHouseholdQuestion`:

```ts
  async answerHouseholdQuestion(_context: AgentChatContext): Promise<AgentChatResponse> {
    return { reply: "Not used by this test." };
  }
```

- [ ] **Step 2: Add chat route tests**

Add these tests inside `describe("household baseline flow", () => { ... })`:

```ts
  it("answers assistant chat questions with household context", async () => {
    const agentProvider = new RecordingChatAgentProvider();
    const app = createApp({
      store: createInMemoryStore(),
      agentProvider
    });
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
    const householdId = created.body.id;

    await request(app)
      .put(`/api/households/${householdId}/baseline`)
      .send({
        homeType: "house",
        rooms: ["kitchen", "bathroom"],
        flooring: ["tile"],
        hasPets: true,
        hasOutdoorSpace: false,
        notes: "One dog."
      })
      .expect(200);

    const chore = await request(app)
      .post(`/api/households/${householdId}/chores`)
      .send({
        title: "Clean bathrooms",
        cadence: "weekly",
        estimatedMinutes: 10,
        source: "manual"
      })
      .expect(201);

    const recommendations = await request(app)
      .post(`/api/households/${householdId}/recommendations`)
      .send({ selectedChoreIds: [chore.body.id] })
      .expect(201);

    await request(app)
      .post(`/api/households/${householdId}/assistant/chat`)
      .send({ message: " Which chores look under-scoped? " })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ reply: "Mock reply for Home" });
      });

    expect(agentProvider.receivedContext).toEqual(
      expect.objectContaining({
        message: "Which chores look under-scoped?",
        household: expect.objectContaining({ id: householdId, name: "Home" }),
        chores: [expect.objectContaining({ id: chore.body.id, title: "Clean bathrooms" })],
        recommendations: [expect.objectContaining({ id: recommendations.body[0].id })]
      })
    );
  });

  it("returns 400 for empty assistant chat messages", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);

    await request(app)
      .post(`/api/households/${created.body.id}/assistant/chat`)
      .send({ message: "   " })
      .expect(400)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Invalid assistant chat payload" });
      });
  });

  it("returns 404 for assistant chat on an unknown household", async () => {
    const app = createTestApp();

    await request(app)
      .post("/api/households/missing-household/assistant/chat")
      .send({ message: "What should I optimize?" })
      .expect(404)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Household not found" });
      });
  });

  it("returns a stable 502 when assistant chat generation fails", async () => {
    const app = createApp({
      store: createInMemoryStore(),
      agentProvider: new FailingChatAgentProvider()
    });
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);

    await request(app)
      .post(`/api/households/${created.body.id}/assistant/chat`)
      .send({ message: "What should I optimize?" })
      .expect(502)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Could not answer assistant question" });
      });
  });
```

- [ ] **Step 3: Run the focused backend tests to verify they fail**

Run:

```powershell
npm.cmd run test -w server -- households.test.ts -t "assistant chat"
```

Expected: FAIL because `AgentChatContext`, `AgentChatResponse`, `answerHouseholdQuestion`, and the chat route do not exist yet.

---

### Task 2: Implement Backend Chat Contract

**Files:**
- Modify: `server/src/agent/AgentProvider.ts`
- Modify: `server/src/agent/MockChoreAgentProvider.ts`
- Modify: `server/src/agent/OpenAiChoreAgentProvider.ts`
- Modify: `server/src/routes/households.ts`
- Test: `server/test/households.test.ts`

- [ ] **Step 1: Extend the provider contract**

Replace `server/src/agent/AgentProvider.ts` with:

```ts
/*
  This interface is like a Spring service contract. In a Spring Boot app,
  this would be an interface that multiple `@Service` implementations can
  satisfy, allowing the controller layer to remain decoupled from the
  actual recommendation engine.
*/
import type { Chore, Household, Recommendation } from "@chore-helper/shared";

export type AgentRecommendationContext = {
  household: Household;
  chores: Chore[];
  reviewPrompt?: string;
};

export type AgentChatContext = {
  household: Household;
  chores: Chore[];
  recommendations: Recommendation[];
  message: string;
};

export type AgentChatResponse = {
  reply: string;
};

export type AgentProvider = {
  recommendSetupImprovements(context: AgentRecommendationContext): Promise<Recommendation[]>;
  answerHouseholdQuestion(context: AgentChatContext): Promise<AgentChatResponse>;
};
```

- [ ] **Step 2: Add deterministic mock chat replies**

In `server/src/agent/MockChoreAgentProvider.ts`, update the type import:

```ts
import type {
  AgentChatContext,
  AgentChatResponse,
  AgentProvider,
  AgentRecommendationContext
} from "./AgentProvider.js";
```

Then add this method inside `MockChoreAgentProvider` after `recommendSetupImprovements`:

```ts
  async answerHouseholdQuestion({
    household,
    chores,
    recommendations,
    message
  }: AgentChatContext): Promise<AgentChatResponse> {
    const underScopedChore = chores.find((chore) => chore.estimatedMinutes < 15);
    const petContext = household.baseline?.hasPets
      ? " Because this household has pets, floor and upholstery routines may need extra attention."
      : "";
    const recommendationContext =
      recommendations.length > 0
        ? ` I also see ${recommendations.length} current recommendation${recommendations.length === 1 ? "" : "s"} to consider.`
        : "";

    if (underScopedChore) {
      return {
        reply: `For "${message}", start with ${underScopedChore.title}. Its ${underScopedChore.estimatedMinutes}-minute estimate may be under-scoped for the current routine.${petContext}${recommendationContext}`
      };
    }

    return {
      reply: `For "${message}", review cadence and coverage across ${chores.length} active chore${chores.length === 1 ? "" : "s"}.${petContext}${recommendationContext}`
    };
  }
```

- [ ] **Step 3: Add deterministic chat replies to OpenAI provider**

In `server/src/agent/OpenAiChoreAgentProvider.ts`, update the provider type import:

```ts
import type {
  AgentChatContext,
  AgentChatResponse,
  AgentProvider,
  AgentRecommendationContext
} from "./AgentProvider.js";
```

Add this helper above the class:

```ts
function formatDeterministicChatReply({
  household,
  chores,
  recommendations,
  message
}: AgentChatContext): AgentChatResponse {
  const shortestChore = chores
    .slice()
    .sort((first, second) => first.estimatedMinutes - second.estimatedMinutes)[0];
  const focus = shortestChore
    ? `${shortestChore.title} has the shortest estimate at ${shortestChore.estimatedMinutes} minutes, so it is a practical first chore to review.`
    : "There are no active chores to inspect yet.";
  const recommendationSummary =
    recommendations.length > 0
      ? ` There are ${recommendations.length} current recommendation${recommendations.length === 1 ? "" : "s"} already available.`
      : "";

  return {
    reply: `For "${message}", ${focus}${recommendationSummary} This chat response is deterministic until real OpenAI chat behavior is added.`
  };
}
```

Add this method inside `OpenAiChoreAgentProvider`:

```ts
  async answerHouseholdQuestion(context: AgentChatContext): Promise<AgentChatResponse> {
    return formatDeterministicChatReply(context);
  }
```

- [ ] **Step 4: Add the chat request schema and route**

In `server/src/routes/households.ts`, add this schema near the other schemas:

```ts
const assistantChatRequestSchema = z.object({
  message: z.string().trim().min(1)
});
```

Add this route before `router.post("/:householdId/recommendations", ...)`:

```ts
  router.post("/:householdId/assistant/chat", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    const parsed = assistantChatRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid assistant chat payload" });

    const chores = await store.listChores(household.id);
    const activeChores = chores.filter((chore) => !chore.archivedAt);
    const recommendations = (await store.listRecommendations(household.id)).filter(
      (recommendation) => !recommendation.staleAt
    );

    try {
      return res.status(200).json(
        await agentProvider.answerHouseholdQuestion({
          household,
          chores: activeChores,
          recommendations,
          message: parsed.data.message
        })
      );
    } catch {
      return res.status(502).json({ error: "Could not answer assistant question" });
    }
  });
```

- [ ] **Step 5: Run focused backend chat tests**

Run:

```powershell
npm.cmd run test -w server -- households.test.ts -t "assistant chat"
```

Expected: PASS for the assistant chat tests.

- [ ] **Step 6: Run all server tests and typecheck**

Run:

```powershell
npm.cmd run test -w server
npm.cmd run typecheck -w server
```

Expected: PASS. DB-backed tests may remain skipped when no test database is configured.

- [ ] **Step 7: Commit backend chat contract**

Run:

```powershell
git add server/src/agent/AgentProvider.ts server/src/agent/MockChoreAgentProvider.ts server/src/agent/OpenAiChoreAgentProvider.ts server/src/routes/households.ts server/test/households.test.ts
git commit -m "Add assistant chat backend contract"
```

Expected: commit succeeds.

---

### Task 3: Add Frontend Chat API Helper Tests

**Files:**
- Modify: `web/src/App.test.tsx`
- Later modify: `web/src/api.ts`

- [ ] **Step 1: Add Optimize chat UI tests**

In `web/src/App.test.tsx`, add this test near the Optimize/review route tests:

```ts
  it("shows Optimize chat prompts and renders an assistant reply", async () => {
    restoreHouseholdInStorage();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "household-1",
          name: "Home",
          baseline: {
            homeType: "house",
            rooms: ["bathroom"],
            flooring: ["tile"],
            hasPets: true,
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
            estimatedMinutes: 10,
            source: "manual"
          }
        ]
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply: "Clean bathrooms may be under-scoped." })
      });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/optimize");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Optimize chores" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));

    expect(screen.getByText("Which chores look under-scoped?")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Ask the assistant"), {
      target: { value: "Which chores look under-scoped?" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Clean bathrooms may be under-scoped.")).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://localhost:3001/api/households/household-1/assistant/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Which chores look under-scoped?" })
      })
    );
  });

  it("keeps chat messages visible when assistant chat fails", async () => {
    restoreHouseholdInStorage();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "household-1", name: "Home" })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply: "First answer." })
      })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Could not answer assistant question" }) });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/optimize");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Optimize chores" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
    fireEvent.change(screen.getByLabelText("Ask the assistant"), {
      target: { value: "First question" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("First answer.")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Ask the assistant"), {
      target: { value: "Second question" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("First answer.")).toBeTruthy();
      expect(screen.getByRole("status").textContent).toBe("Could not answer assistant question.");
    });
  });
```

- [ ] **Step 2: Run focused web tests to verify they fail**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "Optimize chat"
```

Expected: FAIL because the `Chat` tab and API helper do not exist yet.

---

### Task 4: Implement Frontend Chat API And Optimize Modes

**Files:**
- Modify: `web/src/api.ts`
- Modify: `web/src/pages/OptimizePage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add chat API helper**

In `web/src/api.ts`, add this type and function after `applyRecommendationDecisions(...)`:

```ts
export type AssistantChatResponse = {
  reply: string;
};

export async function askAssistantQuestion(
  householdId: string,
  message: string
): Promise<AssistantChatResponse> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });

  if (!response.ok) throw new Error("Failed to ask assistant question");
  return response.json();
}
```

- [ ] **Step 2: Replace `OptimizePage.tsx` with tabbed recommendations and chat**

Replace all contents of `web/src/pages/OptimizePage.tsx` with:

```tsx
import { useEffect, useMemo, useState } from "react";
import { type Chore, type Recommendation } from "@chore-helper/shared";
import {
  applyRecommendationDecisions,
  askAssistantQuestion,
  generateRecommendations,
  listChores,
  listRecommendations,
  updateRecommendationDecision
} from "../api";

type OptimizeMode = "recommendations" | "chat";
type ReviewStep = "select" | "decide" | "complete";
type ReviewLoadState = "idle" | "loading" | "ready" | "error";
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type OptimizePageProps = {
  householdId?: string;
  householdName?: string;
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

export function OptimizePage({
  householdId,
  householdName = "Home"
}: OptimizePageProps) {
  const [chores, setChores] = useState<Chore[]>([]);
  const [reviewRecommendations, setReviewRecommendations] = useState<Recommendation[]>([]);
  const [selectedChoreIds, setSelectedChoreIds] = useState<string[]>([]);
  const [mode, setMode] = useState<OptimizeMode>("recommendations");
  const [reviewStep, setReviewStep] = useState<ReviewStep>("select");
  const [loadState, setLoadState] = useState<ReviewLoadState>("idle");
  const [status, setStatus] = useState("Choose chores to optimize.");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const activeChores = useMemo(
    () => chores.filter((chore) => !chore.archivedAt),
    [chores]
  );

  useEffect(() => {
    if (!householdId) return;
    const activeHouseholdId = householdId;

    let cancelled = false;

    async function loadReviewData() {
      // This effect is similar to Angular ngOnInit plus an injected service call.
      // Route inputs drive the API request, and component state drives the template.
      setLoadState("loading");
      setStatus("Loading optimization data...");

      try {
        const [nextChores, nextRecommendations] = await Promise.all([
          listChores(activeHouseholdId),
          listRecommendations(activeHouseholdId)
        ]);
        if (cancelled) return;

        const nextActiveChores = nextChores.filter((chore) => !chore.archivedAt);
        setChores(nextActiveChores);
        setSelectedChoreIds(getReviewDefaultSelection(nextActiveChores, nextRecommendations));
        setReviewRecommendations([]);
        setReviewStep("select");
        setLoadState("ready");
        setStatus("Choose chores to optimize.");
      } catch {
        if (!cancelled) {
          setLoadState("error");
          setStatus("Could not load optimization data.");
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
    setSelectedChoreIds(getReviewDefaultSelection(nextActiveChores, nextRecommendations));
  }

  async function handleGenerateSelectedReview() {
    if (!householdId || selectedChoreIds.length === 0) return;

    setStatus("Getting recommendations...");

    try {
      const nextRecommendations = await generateRecommendations(
        householdId,
        "Review the selected chores and suggest practical improvements.",
        selectedChoreIds
      );
      setReviewRecommendations(nextRecommendations);
      setReviewStep("decide");
      setStatus("Recommendations ready.");
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
      setStatus("Recommendations ready.");
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
      setStatus("Optimization complete.");
    } catch {
      setStatus("Could not apply recommendation decisions.");
    }
  }

  async function handleChatSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdId) return;

    const message = chatInput.trim();
    if (!message || chatLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: message
    };
    setChatMessages((currentMessages) => [...currentMessages, userMessage]);
    setChatInput("");
    setChatLoading(true);
    setStatus("Asking assistant...");

    try {
      const response = await askAssistantQuestion(householdId, message);
      setChatMessages((currentMessages) => [
        ...currentMessages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: response.reply
        }
      ]);
      setStatus("Assistant reply ready.");
    } catch {
      setStatus("Could not answer assistant question.");
    } finally {
      setChatLoading(false);
    }
  }

  if (!householdId) {
    return (
      <section className="placeholder-page">
        <p className="eyebrow">Assistant workspace</p>
        <h1>Optimize chores</h1>
        <p className="lede">Set up a household before optimizing existing chores.</p>
      </section>
    );
  }

  return (
    <div className="plan-review review-page optimize-page">
      <header className="workspace-hero compact-hero">
        <div>
          <p className="eyebrow">Assistant workspace</p>
          <h1>Optimize chores</h1>
          <p className="lede">
            Review selected chores or ask the assistant a question about the household routine.
          </p>
          <p className="supporting-copy">
            <span><strong>{householdName}</strong></span>
          </p>
        </div>
      </header>

      <div className="optimize-tabs" role="tablist" aria-label="Optimize modes">
        <button
          aria-selected={mode === "recommendations"}
          className={mode === "recommendations" ? "active" : ""}
          onClick={() => setMode("recommendations")}
          role="tab"
          type="button"
        >
          Recommendations
        </button>
        <button
          aria-selected={mode === "chat"}
          className={mode === "chat" ? "active" : ""}
          onClick={() => setMode("chat")}
          role="tab"
          type="button"
        >
          Chat
        </button>
      </div>

      {mode === "recommendations" ? (
        <section className="dashboard-section review-flow-section" aria-labelledby="recommendations-heading">
          <div className="section-heading">
            <div className="section-title">
              <div>
                <h2 id="recommendations-heading">
                  {reviewStep === "select" ? "Choose chores to optimize" : null}
                  {reviewStep === "decide" ? "Review recommendations" : null}
                  {reviewStep === "complete" ? "Optimization complete" : null}
                </h2>
                <p>
                  {reviewStep === "select"
                    ? "Unreviewed chores are selected by default. Include reviewed chores when you want another pass."
                    : null}
                  {reviewStep === "decide"
                    ? "Accept or decline each recommendation, then apply the decisions together."
                    : null}
                  {reviewStep === "complete"
                    ? "Your recommendation decisions were applied. Calendar export can fit here in a future slice."
                    : null}
                </p>
              </div>
            </div>
            <span className="confidence" role="status">{status}</span>
          </div>

          {loadState === "loading" ? (
            <div className="empty-state">Loading optimization data...</div>
          ) : null}

          {loadState === "error" ? (
            <div className="empty-state">Could not load optimization data.</div>
          ) : null}

          {loadState === "ready" && reviewStep === "select" ? (
            <>
              {activeChores.length === 0 ? (
                <div className="empty-state">No active chores are ready for optimization.</div>
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
                <button
                  disabled={selectedChoreIds.length === 0}
                  onClick={handleGenerateSelectedReview}
                  type="button"
                >
                  Get recommendations
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
            </div>
          ) : null}
        </section>
      ) : null}

      {mode === "chat" ? (
        <section className="dashboard-section optimize-chat-section" aria-labelledby="chat-heading">
          <div className="section-heading">
            <div className="section-title">
              <div>
                <h2 id="chat-heading">Ask about the household routine</h2>
                <p>Chat answers are informational and do not change chores or recommendations.</p>
              </div>
            </div>
            <span className="confidence" role="status">{status}</span>
          </div>

          {chatMessages.length === 0 ? (
            <div className="chat-prompts" aria-label="Prompt examples">
              <button onClick={() => setChatInput("Which chores look under-scoped?")} type="button">
                Which chores look under-scoped?
              </button>
              <button onClick={() => setChatInput("What recurring work might be missing?")} type="button">
                What recurring work might be missing?
              </button>
              <button onClick={() => setChatInput("How should I think about pet-related chores?")} type="button">
                How should I think about pet-related chores?
              </button>
            </div>
          ) : null}

          <div className="chat-thread" aria-label="Assistant conversation">
            {chatMessages.map((message) => (
              <article className={`chat-message chat-message-${message.role}`} key={message.id}>
                <strong>{message.role === "user" ? "You" : "Assistant"}</strong>
                <p>{message.text}</p>
              </article>
            ))}
          </div>

          <form className="chat-form" onSubmit={handleChatSubmit}>
            <label htmlFor="assistant-question">Ask the assistant</label>
            <textarea
              id="assistant-question"
              onChange={(event) => setChatInput(event.target.value)}
              rows={3}
              value={chatInput}
            />
            <div className="form-actions">
              <button disabled={chatInput.trim().length === 0 || chatLoading} type="submit">
                {chatLoading ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Add minimal Optimize chat styles**

Append these styles near the existing review styles in `web/src/App.css`:

```css
.optimize-tabs {
  display: inline-flex;
  gap: 0.35rem;
  margin-bottom: 1rem;
  padding: 0.3rem;
  border: 1px solid rgba(31, 41, 55, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
}

.optimize-tabs button {
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted-text);
  padding: 0.55rem 0.9rem;
}

.optimize-tabs button.active,
.optimize-tabs button[aria-selected="true"] {
  background: var(--panel-bg);
  color: var(--text-color);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
}

.optimize-chat-section {
  display: grid;
  gap: 1rem;
}

.chat-prompts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.chat-prompts button {
  border: 1px solid rgba(31, 41, 55, 0.14);
  border-radius: 999px;
  background: var(--panel-bg);
  color: var(--text-color);
  padding: 0.5rem 0.75rem;
}

.chat-thread {
  display: grid;
  gap: 0.75rem;
}

.chat-message {
  max-width: 760px;
  border: 1px solid rgba(31, 41, 55, 0.12);
  border-radius: 8px;
  padding: 0.85rem 1rem;
  background: var(--panel-bg);
}

.chat-message-user {
  justify-self: end;
}

.chat-message-assistant {
  justify-self: start;
  background: rgba(23, 117, 91, 0.08);
}

.chat-form {
  display: grid;
  gap: 0.55rem;
}

.chat-form textarea {
  min-height: 5.5rem;
}
```

If any CSS variable names differ in the existing file, use the closest existing variables and keep the same layout.

- [ ] **Step 4: Run focused Optimize chat tests**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "Optimize chat"
```

Expected: PASS for the new chat tests.

- [ ] **Step 5: Run web typecheck**

Run:

```powershell
npm.cmd run typecheck -w web
```

Expected: it may still fail on stale tests/routes before Task 5, but `OptimizePage.tsx` and `api.ts` should not introduce new type errors. If the output points at the new files, fix those errors before continuing.

- [ ] **Step 6: Commit frontend Optimize chat implementation**

Run:

```powershell
git add web/src/api.ts web/src/pages/OptimizePage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Add Optimize chat mode"
```

Expected: commit succeeds.

---

### Task 5: Clean Routing, Household Placeholder, And Stale Tests

**Files:**
- Create: `web/src/pages/HouseholdPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/routes.ts`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/ChoresPage.tsx`

- [ ] **Step 1: Add a placeholder Household page**

Create `web/src/pages/HouseholdPage.tsx`:

```tsx
export function HouseholdPage() {
  return (
    <section className="placeholder-page">
      <p className="eyebrow">Households</p>
      <h1>Household management</h1>
      <p className="lede">
        Add and edit household details here in the next slice.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Update routes**

Replace `web/src/routes.ts` with:

```ts
/*
  This route list is a lightweight alternative to Angular's RouterModule
  configuration. Each path is a known route, and `normalizePath` ensures
  unknown URLs default back to `/`.
*/
export const routes = ["/today", "/household", "/chores", "/optimize", "/settings"] as const;

export type AppRoute = (typeof routes)[number];

export function normalizePath(pathname: string): AppRoute | "/" {
  return routes.includes(pathname as AppRoute) ? (pathname as AppRoute) : "/";
}
```

- [ ] **Step 3: Update `App.tsx` nav and route rendering**

In `web/src/App.tsx`:

1. Add import:

```ts
import { HouseholdPage } from "./pages/HouseholdPage";
```

2. Change the `useHouseholdSetup` destructure to remove unused setup actions:

```ts
  const { householdSetup } = useHouseholdSetup();
```

3. Remove the commented `SetupPage` block.

4. Render the household placeholder:

```tsx
      {path === "/household" ? <HouseholdPage /> : null}
```

5. Keep Optimize rendering at `/optimize`.

6. Change nav items to:

```ts
  const navItems = [
    { label: "Today", path: "/today" },
    { label: "Households", path: "/household" },
    { label: "Chores", path: "/chores" },
    { label: "Optimize", path: "/optimize" },
    { label: "Settings", path: "/settings" }
  ];
```

- [ ] **Step 4: Remove stale Chores props and unused helpers**

In `web/src/pages/ChoresPage.tsx`:

1. Remove `onReviewChores?: () => void;` from `PlanReviewProps`.
2. Remove `onReviewChores = () => undefined` from the function parameter destructuring.
3. Remove `formatUnreviewedSummary(...)` if it is unused.
4. Remove `unreviewedCount` if it is unused.

- [ ] **Step 5: Update navigation and Optimize route tests**

In `web/src/App.test.tsx`, replace the compact nav test with:

```ts
  it("renders compact top app navigation", () => {
    renderAt("/today");

    expect(screen.getByRole("link", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Households" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Chores" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Optimize" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Review" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Plan" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Setup" })).toBeNull();
  });
```

Replace the old dedicated review route nav test with:

```ts
  it("routes primary navigation to the Optimize workspace", async () => {
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

    renderAt("/today");
    fireEvent.click(screen.getByRole("link", { name: "Optimize" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/optimize");
      expect(screen.getByRole("heading", { name: "Optimize chores" })).toBeTruthy();
    });
  });
```

Add this household placeholder test near nav tests:

```ts
  it("routes Households nav to the household placeholder", () => {
    renderAt("/today");

    fireEvent.click(screen.getByRole("link", { name: "Households" }));

    expect(window.location.pathname).toBe("/household");
    expect(screen.getByRole("heading", { name: "Household management" })).toBeTruthy();
  });
```

- [ ] **Step 6: Update remaining `/chores/review` test expectations**

Search in `web/src/App.test.tsx` for `/chores/review`.

For tests that intentionally exercise the guided recommendation flow, change the render path to:

```ts
renderAt("/optimize");
```

Change heading assertions:

```ts
expect(screen.getByRole("heading", { name: "Optimize chores" })).toBeTruthy();
expect(screen.getByRole("heading", { name: "Choose chores to optimize" })).toBeTruthy();
```

Change button names:

```ts
screen.getByRole("button", { name: "Get recommendations" })
```

Remove assertions that clicking a Chores page `Review` CTA navigates to the review page, because the Chores CTA has been removed from scope.

- [ ] **Step 7: Run focused route tests**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "navigation|Optimize workspace|Households nav|guided"
```

Expected: PASS for updated route/navigation tests. If unrelated old setup tests fail under this filter, narrow the `-t` expression and keep updating stale expectations in the next step.

- [ ] **Step 8: Run web typecheck**

Run:

```powershell
npm.cmd run typecheck -w web
```

Expected: PASS. This task explicitly removes the stale unused values reported before this plan:

- `addExistingChore`
- `saveHouseholdContext`
- `formatUnreviewedSummary`
- `onReviewChores`
- `unreviewedCount`

- [ ] **Step 9: Commit routing and stale test cleanup**

Run:

```powershell
git add web/src/App.tsx web/src/routes.ts web/src/pages/HouseholdPage.tsx web/src/pages/ChoresPage.tsx web/src/App.test.tsx
git commit -m "Route Optimize and Household pages"
```

Expected: commit succeeds.

---

### Task 6: Full Verification And Polish

**Files:**
- Verify all changed files.
- Modify only files with verification failures.

- [ ] **Step 1: Run all server tests**

Run:

```powershell
npm.cmd run test -w server
```

Expected: PASS. DB-backed tests may be skipped when no test database is configured.

- [ ] **Step 2: Run server typecheck**

Run:

```powershell
npm.cmd run typecheck -w server
```

Expected: PASS.

- [ ] **Step 3: Run web typecheck**

Run:

```powershell
npm.cmd run typecheck -w web
```

Expected: PASS.

- [ ] **Step 4: Run focused Optimize web tests**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "Optimize|assistant chat|Households"
```

Expected: PASS for Optimize, chat, and Households placeholder coverage.

- [ ] **Step 5: Run all web tests**

Run:

```powershell
npm.cmd run test -w web
```

Expected: PASS. If unrelated legacy setup tests still fail, update stale expectations only when they contradict the approved Optimize spec or current app behavior.

- [ ] **Step 6: Run workspace checks**

Run:

```powershell
npm.cmd run typecheck -ws
npm.cmd run test -ws
```

Expected: PASS, with DB-backed tests allowed to skip when no test database is configured.

- [ ] **Step 7: Optional browser/manual check**

If implementation changed layout substantially, run the app and check `/optimize`:

```powershell
npm.cmd run dev -w web
```

Expected browser behavior:

- Primary nav has `Today`, `Households`, `Chores`, `Optimize`, `Settings`.
- `/optimize` shows heading `Optimize chores`.
- `Recommendations` mode shows the guided flow.
- `Chat` mode shows prompt chips, input, and informational replies.
- `/household` shows the placeholder page.

- [ ] **Step 8: Commit verification fixes if needed**

If verification required fixes, run:

```powershell
git add server/src server/test web/src
git commit -m "Polish Optimize guided flow"
```

Expected: commit succeeds only when fixes were needed.

## Self-Review

- Spec coverage: Optimize route, guided recommendations, chat UI/API/backend, provider boundary, `/household` placeholder, and stale test/typecheck cleanup are all covered.
- Scope check: full household CRUD, auth, Google Calendar, and real OpenAI chat are explicitly excluded.
- Placeholder scan: no placeholder markers or incomplete implementation steps remain.
- Type consistency: `AgentChatContext`, `AgentChatResponse`, `answerHouseholdQuestion`, `askAssistantQuestion`, `OptimizeMode`, and route names are consistent across tasks.
