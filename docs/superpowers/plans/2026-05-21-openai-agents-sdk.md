# OpenAI Agents SDK Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock-only chore recommendations with an env-gated OpenAI Agents SDK provider behind the existing backend `AgentProvider` boundary.

**Architecture:** Keep React and the recommendation route contract unchanged. Add a backend provider factory that selects mock or OpenAI from env, and add an `OpenAiChoreAgentProvider` that uses one focused Agents SDK agent with structured `zod` output. Tests inject provider doubles or a fake OpenAI runner so automated verification never calls OpenAI.

**Tech Stack:** TypeScript, Express, Vitest, Supertest, Zod, OpenAI Agents SDK for TypeScript, npm workspaces.

---

## File Structure

- Create `server/src/agent/createAgentProvider.ts`: owns env-based provider selection and configuration validation.
- Create `server/src/agent/OpenAiChoreAgentProvider.ts`: owns OpenAI agent instructions, structured output schema, SDK runner, context prompt formatting, and mapping to shared `Recommendation[]`.
- Modify `server/src/app.ts`: use the provider factory when no provider is injected.
- Modify `server/src/routes/households.ts`: catch provider failures and return a stable `502` recommendation-generation error.
- Modify `server/package.json` and root lockfile: add `@openai/agents` to server dependencies.
- Modify `server/.env.example`: document agent provider env variables.
- Modify `README.md`: document local mock/OpenAI recommendation setup.
- Create `server/test/createAgentProvider.test.ts`: covers provider selection and missing key behavior.
- Create `server/test/openAiChoreAgentProvider.test.ts`: covers OpenAI output mapping and structured-output rejection without network calls.
- Modify `server/test/households.test.ts`: add provider failure behavior test for the recommendation route.

## Implementation Notes

- Keep `MockChoreAgentProvider` as the default. This avoids requiring an OpenAI key for normal local development and tests.
- Do not expose `OPENAI_API_KEY` to Vite. Only `server/.env.example` and server-side code should mention it.
- Keep comments short and useful. Existing server comments compare Express/DI concepts to Spring Boot; preserve that style when adding provider-factory comments.
- Do not change the Chores or Review page UI in this plan.

---

### Task 1: Add The OpenAI Agents SDK Dependency

**Files:**
- Modify: `server/package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the dependency**

Run:

```powershell
npm install @openai/agents -w server
```

Expected: `server/package.json` contains `@openai/agents` under `dependencies`, and `package-lock.json` updates.

- [ ] **Step 2: Verify the dependency install did not break server tests**

Run:

```powershell
npm.cmd run test -w server
```

Expected: PASS. Existing tests should still use the mock provider and should not require `OPENAI_API_KEY`.

- [ ] **Step 3: Commit the dependency update**

Run:

```powershell
git add server/package.json package-lock.json
git commit -m "Add OpenAI Agents SDK dependency"
```

Expected: commit succeeds.

---

### Task 2: Add Provider Factory Tests

**Files:**
- Create: `server/test/createAgentProvider.test.ts`
- Later modify: `server/src/agent/createAgentProvider.ts`

- [ ] **Step 1: Write the failing provider factory tests**

Create `server/test/createAgentProvider.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MockChoreAgentProvider } from "../src/agent/MockChoreAgentProvider.js";
import { OpenAiChoreAgentProvider } from "../src/agent/OpenAiChoreAgentProvider.js";
import { createAgentProvider } from "../src/agent/createAgentProvider.js";

describe("createAgentProvider", () => {
  it("uses the mock provider by default", () => {
    const provider = createAgentProvider({});

    expect(provider).toBeInstanceOf(MockChoreAgentProvider);
  });

  it("uses the mock provider when AGENT_PROVIDER is mock", () => {
    const provider = createAgentProvider({ AGENT_PROVIDER: "mock" });

    expect(provider).toBeInstanceOf(MockChoreAgentProvider);
  });

  it("uses the OpenAI provider when AGENT_PROVIDER is openai and an API key is present", () => {
    const provider = createAgentProvider({
      AGENT_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_AGENT_MODEL: "gpt-test"
    });

    expect(provider).toBeInstanceOf(OpenAiChoreAgentProvider);
  });

  it("fails clearly when OpenAI provider is selected without an API key", () => {
    expect(() => createAgentProvider({ AGENT_PROVIDER: "openai" })).toThrow(
      "OPENAI_API_KEY is required when AGENT_PROVIDER=openai"
    );
  });

  it("fails clearly for an unsupported AGENT_PROVIDER value", () => {
    expect(() => createAgentProvider({ AGENT_PROVIDER: "local-ai" })).toThrow(
      "Unsupported AGENT_PROVIDER: local-ai"
    );
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```powershell
npm.cmd run test -w server -- createAgentProvider.test.ts
```

Expected: FAIL because `createAgentProvider.ts` and `OpenAiChoreAgentProvider.ts` do not exist yet.

---

### Task 3: Implement Provider Factory And Wire App Startup

**Files:**
- Create: `server/src/agent/createAgentProvider.ts`
- Create: `server/src/agent/OpenAiChoreAgentProvider.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/createAgentProvider.test.ts`

- [ ] **Step 1: Add a minimal OpenAI provider shell**

Create `server/src/agent/OpenAiChoreAgentProvider.ts` with this minimal shell. Later tasks replace the placeholder runner behavior with the real SDK implementation.

```ts
import type { Recommendation } from "@chore-helper/shared";
import type { AgentProvider, AgentRecommendationContext } from "./AgentProvider.js";

export const DEFAULT_OPENAI_AGENT_MODEL = "gpt-5.5";

export class OpenAiChoreAgentProvider implements AgentProvider {
  constructor(private readonly model = DEFAULT_OPENAI_AGENT_MODEL) {}

  async recommendSetupImprovements(
    _context: AgentRecommendationContext
  ): Promise<Recommendation[]> {
    throw new Error(
      `OpenAiChoreAgentProvider is configured for ${this.model}, but its runner has not been implemented.`
    );
  }
}
```

- [ ] **Step 2: Add the provider factory**

Create `server/src/agent/createAgentProvider.ts`:

```ts
/*
  This factory matches Spring profile-based bean selection. It keeps app
  startup responsible for choosing an implementation while controllers
  depend only on the AgentProvider service contract.
*/
import type { AgentProvider } from "./AgentProvider.js";
import { MockChoreAgentProvider } from "./MockChoreAgentProvider.js";
import {
  DEFAULT_OPENAI_AGENT_MODEL,
  OpenAiChoreAgentProvider
} from "./OpenAiChoreAgentProvider.js";

type AgentProviderEnv = {
  AGENT_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_AGENT_MODEL?: string;
};

export function createAgentProvider(env: AgentProviderEnv = process.env): AgentProvider {
  const providerName = env.AGENT_PROVIDER ?? "mock";

  if (providerName === "mock") {
    return new MockChoreAgentProvider();
  }

  if (providerName === "openai") {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required when AGENT_PROVIDER=openai");
    }

    return new OpenAiChoreAgentProvider(
      env.OPENAI_AGENT_MODEL ?? DEFAULT_OPENAI_AGENT_MODEL
    );
  }

  throw new Error(`Unsupported AGENT_PROVIDER: ${providerName}`);
}
```

- [ ] **Step 3: Wire the app default provider through the factory**

Modify `server/src/app.ts` so the imports and provider setup read:

```ts
import cors from "cors";
import express from "express";
import type { AgentProvider } from "./agent/AgentProvider.js";
import { createAgentProvider } from "./agent/createAgentProvider.js";
import type { HouseholdStore } from "./repositories/inMemoryStore.js";
import { createPrismaClient } from "./repositories/prismaClient.js";
import { createPrismaStore } from "./repositories/prismaStore.js";
import { createHouseholdRouter } from "./routes/households.js";

type AppDependencies = {
  store?: HouseholdStore;
  agentProvider?: AgentProvider;
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const store = dependencies.store ?? createPrismaStore(createPrismaClient());
  const agentProvider = dependencies.agentProvider ?? createAgentProvider();

  app.use(cors());
  app.use(express.json());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/households", createHouseholdRouter(store, agentProvider));

  return app;
}
```

- [ ] **Step 4: Run provider factory tests**

Run:

```powershell
npm.cmd run test -w server -- createAgentProvider.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run existing server tests**

Run:

```powershell
npm.cmd run test -w server
```

Expected: PASS. Existing tests continue using injected providers or the default mock provider.

- [ ] **Step 6: Commit provider selection**

Run:

```powershell
git add server/src/agent/createAgentProvider.ts server/src/agent/OpenAiChoreAgentProvider.ts server/src/app.ts server/test/createAgentProvider.test.ts
git commit -m "Add agent provider selection"
```

Expected: commit succeeds.

---

### Task 4: Add Route Error Handling For Provider Failures

**Files:**
- Modify: `server/test/households.test.ts`
- Modify: `server/src/routes/households.ts`

- [ ] **Step 1: Add the failing route test**

At the top of `server/test/households.test.ts`, add these imports:

```ts
import type { Recommendation } from "@chore-helper/shared";
import type { AgentProvider, AgentRecommendationContext } from "../src/agent/AgentProvider.js";
```

If the file already has imports from these modules after implementation, merge them into one import per module.

Below `createTestApp`, add this test provider:

```ts
class FailingAgentProvider implements AgentProvider {
  async recommendSetupImprovements(
    _context: AgentRecommendationContext
  ): Promise<Recommendation[]> {
    throw new Error("OpenAI request failed");
  }
}
```

Add this test inside the existing `describe("household baseline flow", () => { ... })` block:

```ts
  it("returns a stable 502 when recommendation generation fails", async () => {
    const app = createApp({
      store: createInMemoryStore(),
      agentProvider: new FailingAgentProvider()
    });
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);

    await request(app)
      .post(`/api/households/${created.body.id}/recommendations`)
      .send({ reviewPrompt: "Review these chores." })
      .expect(502)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Could not generate recommendations" });
      });
  });
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npm.cmd run test -w server -- households.test.ts -t "returns a stable 502"
```

Expected: FAIL because the route currently lets the provider error escape.

- [ ] **Step 3: Catch provider failures in the recommendation route**

In `server/src/routes/households.ts`, replace the provider call and save block in `router.post("/:householdId/recommendations", ...)` with:

```ts
    try {
      const recommendations = await agentProvider.recommendSetupImprovements({
        household,
        chores: selectedChores,
        reviewPrompt: parsed.data.reviewPrompt
      });
      const reviewRecommendations = recommendations.map((recommendation) =>
        attachReviewMetadata(recommendation, selectedChores)
      );

      return res.status(201).json(await store.saveRecommendations(household.id, reviewRecommendations));
    } catch {
      return res.status(502).json({ error: "Could not generate recommendations" });
    }
```

- [ ] **Step 4: Run the focused route test**

Run:

```powershell
npm.cmd run test -w server -- households.test.ts -t "returns a stable 502"
```

Expected: PASS.

- [ ] **Step 5: Run all server tests**

Run:

```powershell
npm.cmd run test -w server
```

Expected: PASS.

- [ ] **Step 6: Commit route error handling**

Run:

```powershell
git add server/src/routes/households.ts server/test/households.test.ts
git commit -m "Handle recommendation provider failures"
```

Expected: commit succeeds.

---

### Task 5: Add OpenAI Provider Mapping Tests

**Files:**
- Create: `server/test/openAiChoreAgentProvider.test.ts`
- Modify later: `server/src/agent/OpenAiChoreAgentProvider.ts`

- [ ] **Step 1: Write failing OpenAI provider tests**

Create `server/test/openAiChoreAgentProvider.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { OpenAiChoreAgentProvider } from "../src/agent/OpenAiChoreAgentProvider.js";
import type { AgentRecommendationContext } from "../src/agent/AgentProvider.js";

function createContext(): AgentRecommendationContext {
  return {
    household: {
      id: "household-1",
      name: "Home",
      baseline: {
        homeType: "house",
        rooms: ["kitchen", "bathroom"],
        flooring: ["hardwood", "tile"],
        hasPets: true,
        hasOutdoorSpace: false,
        notes: "Two adults and one dog."
      }
    },
    chores: [
      {
        id: "chore-1",
        householdId: "household-1",
        title: "Clean bathrooms",
        cadence: "weekly",
        estimatedMinutes: 10,
        source: "manual"
      }
    ],
    reviewPrompt: "Focus on duration and cadence."
  };
}

describe("OpenAiChoreAgentProvider", () => {
  it("maps structured agent output into app recommendations", async () => {
    const provider = new OpenAiChoreAgentProvider("gpt-test", async (input) => {
      expect(input.model).toBe("gpt-test");
      expect(input.prompt).toContain("Home");
      expect(input.prompt).toContain("Clean bathrooms");
      expect(input.prompt).toContain("Focus on duration and cadence.");

      return {
        recommendations: [
          {
            title: "Review duration for Clean bathrooms",
            rationale: "Ten minutes may be too short for a full bathroom reset.",
            confidence: "high",
            affectedChoreTitle: "Clean bathrooms",
            proposedCadence: "weekly",
            proposedEstimatedMinutes: 25
          }
        ]
      };
    });

    const recommendations = await provider.recommendSetupImprovements(createContext());

    expect(recommendations).toEqual([
      expect.objectContaining({
        householdId: "household-1",
        affectedChoreId: "chore-1",
        title: "Review duration for Clean bathrooms",
        rationale: "Ten minutes may be too short for a full bathroom reset.",
        confidence: "high",
        status: "pending",
        decision: "pending",
        proposedCadence: "weekly",
        proposedEstimatedMinutes: 25
      })
    ]);
    expect(recommendations[0]?.id).toEqual(expect.any(String));
  });

  it("allows an empty recommendation list", async () => {
    const provider = new OpenAiChoreAgentProvider("gpt-test", async () => ({
      recommendations: []
    }));

    await expect(provider.recommendSetupImprovements(createContext())).resolves.toEqual([]);
  });

  it("rejects malformed structured output", async () => {
    const provider = new OpenAiChoreAgentProvider("gpt-test", async () => ({
      recommendations: [
        {
          title: "Missing confidence",
          rationale: "This object does not match the schema."
        }
      ]
    }));

    await expect(provider.recommendSetupImprovements(createContext())).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```powershell
npm.cmd run test -w server -- openAiChoreAgentProvider.test.ts
```

Expected: FAIL because the OpenAI provider shell throws.

---

### Task 6: Implement The OpenAI Provider

**Files:**
- Modify: `server/src/agent/OpenAiChoreAgentProvider.ts`
- Test: `server/test/openAiChoreAgentProvider.test.ts`

- [ ] **Step 1: Replace the provider shell with the SDK-backed implementation**

Replace all contents of `server/src/agent/OpenAiChoreAgentProvider.ts` with:

```ts
import { Agent, run } from "@openai/agents";
import type { Chore, Recommendation } from "@chore-helper/shared";
import { z } from "zod";
import type { AgentProvider, AgentRecommendationContext } from "./AgentProvider.js";

export const DEFAULT_OPENAI_AGENT_MODEL = "gpt-5.5";

const choreAgentRecommendationSchema = z.object({
  title: z.string().min(1),
  rationale: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  affectedChoreTitle: z.string().min(1).optional(),
  proposedCadence: z.string().min(1).optional(),
  proposedEstimatedMinutes: z.number().int().positive().optional()
});

const choreAgentOutputSchema = z.object({
  recommendations: z.array(choreAgentRecommendationSchema)
});

export type ChoreAgentRunInput = {
  model: string;
  instructions: string;
  prompt: string;
};

type ChoreAgentOutput = z.infer<typeof choreAgentOutputSchema>;

type ChoreAgentRunner = (input: ChoreAgentRunInput) => Promise<unknown>;

const choreReviewInstructions = [
  "You are a household chore review assistant.",
  "Recommend practical improvements to household chores.",
  "Focus on cadence, duration, missing recurring work, and chore scope.",
  "Prefer recommendations tied to selected chores when selected chores are provided.",
  "Include concise rationale and confidence as low, medium, or high.",
  "Do not invent household facts that are not present in the provided context.",
  "Do not recommend automatic calendar edits or automatic chore changes.",
  "Every recommendation is only a suggestion and requires manual user approval."
].join(" ");

async function runOpenAiChoreAgent({
  model,
  instructions,
  prompt
}: ChoreAgentRunInput): Promise<unknown> {
  const agent = new Agent({
    name: "Chore review assistant",
    instructions,
    model,
    outputType: choreAgentOutputSchema
  });
  const result = await run(agent, prompt);

  return result.finalOutput;
}

function formatChores(chores: Chore[]) {
  if (chores.length === 0) {
    return "No selected chores.";
  }

  return chores
    .map(
      (chore) =>
        `- ${chore.title}: cadence=${chore.cadence}, estimatedMinutes=${chore.estimatedMinutes}, source=${chore.source}`
    )
    .join("\n");
}

function formatPrompt({ household, chores, reviewPrompt }: AgentRecommendationContext) {
  return [
    `Household: ${household.name}`,
    `Baseline: ${JSON.stringify(household.baseline ?? null)}`,
    "Selected chores:",
    formatChores(chores),
    `User review prompt: ${reviewPrompt?.trim() || "Review the selected chores for practical improvements."}`,
    "Return only structured recommendations that match the requested schema."
  ].join("\n\n");
}

function findAffectedChoreId(affectedChoreTitle: string | undefined, chores: Chore[]) {
  if (!affectedChoreTitle) return undefined;

  const normalizedTitle = affectedChoreTitle.trim().toLowerCase();
  return chores.find((chore) => chore.title.trim().toLowerCase() === normalizedTitle)?.id;
}

function mapOutputToRecommendations(
  output: ChoreAgentOutput,
  context: AgentRecommendationContext
): Recommendation[] {
  return output.recommendations.map((recommendation) => ({
    id: crypto.randomUUID(),
    householdId: context.household.id,
    affectedChoreId: findAffectedChoreId(recommendation.affectedChoreTitle, context.chores),
    title: recommendation.title,
    rationale: recommendation.rationale,
    confidence: recommendation.confidence,
    status: "pending",
    decision: "pending",
    proposedCadence: recommendation.proposedCadence,
    proposedEstimatedMinutes: recommendation.proposedEstimatedMinutes
  }));
}

export class OpenAiChoreAgentProvider implements AgentProvider {
  constructor(
    private readonly model = DEFAULT_OPENAI_AGENT_MODEL,
    private readonly runChoreAgent: ChoreAgentRunner = runOpenAiChoreAgent
  ) {}

  async recommendSetupImprovements(
    context: AgentRecommendationContext
  ): Promise<Recommendation[]> {
    const output = choreAgentOutputSchema.parse(
      await this.runChoreAgent({
        model: this.model,
        instructions: choreReviewInstructions,
        prompt: formatPrompt(context)
      })
    );

    return mapOutputToRecommendations(output, context);
  }
}
```

- [ ] **Step 2: Run OpenAI provider tests**

Run:

```powershell
npm.cmd run test -w server -- openAiChoreAgentProvider.test.ts
```

Expected: PASS. The fake runner is used, and no OpenAI network call is made.

- [ ] **Step 3: Run provider factory tests**

Run:

```powershell
npm.cmd run test -w server -- createAgentProvider.test.ts
```

Expected: PASS.

- [ ] **Step 4: Typecheck the server**

Run:

```powershell
npm.cmd run typecheck -w server
```

Expected: PASS. If TypeScript reports an Agents SDK type mismatch for `outputType`, adjust only the SDK-facing `runOpenAiChoreAgent` function to match the installed SDK types while preserving the constructor, runner injection, and test contract from this plan.

- [ ] **Step 5: Commit OpenAI provider implementation**

Run:

```powershell
git add server/src/agent/OpenAiChoreAgentProvider.ts server/test/openAiChoreAgentProvider.test.ts
git commit -m "Implement OpenAI chore agent provider"
```

Expected: commit succeeds.

---

### Task 7: Document Local OpenAI Provider Configuration

**Files:**
- Modify: `server/.env.example`
- Modify: `README.md`

- [ ] **Step 1: Update server env example**

Modify `server/.env.example` so it contains:

```dotenv
DATABASE_URL="postgresql://chore_helper:chore_helper_password@localhost:5432/chore_helper?schema=public"

# Recommendation provider. Use "mock" for deterministic local recommendations.
AGENT_PROVIDER="mock"

# Required only when AGENT_PROVIDER="openai".
OPENAI_API_KEY=""

# Optional. Defaults to gpt-5.5 when omitted.
OPENAI_AGENT_MODEL="gpt-5.5"
```

- [ ] **Step 2: Update README local setup documentation**

Replace the current `README.md` contents with:

````md
# chore-helper

Chore Helper is a local React + Express + Prisma app for managing household chores and reviewing them with assistant-generated recommendations.

## Local Recommendation Provider

The backend owns recommendation generation behind `AgentProvider`. The React app calls Chore Helper APIs only; it never receives an OpenAI API key.

By default, local development uses deterministic mock recommendations:

```powershell
AGENT_PROVIDER="mock"
```

To use OpenAI-backed recommendations locally, set these values in `server/.env`:

```powershell
AGENT_PROVIDER="openai"
OPENAI_API_KEY="sk-your-key"
OPENAI_AGENT_MODEL="gpt-5.5"
```

`OPENAI_API_KEY` is required when `AGENT_PROVIDER` is `openai`. Keep it in `server/.env`; do not add it to Vite or any frontend `.env` file.
````

- [ ] **Step 3: Commit docs**

Run:

```powershell
git add server/.env.example README.md
git commit -m "Document OpenAI recommendation provider config"
```

Expected: commit succeeds.

---

### Task 8: Final Verification

**Files:**
- Verify all files changed in previous tasks.

- [ ] **Step 1: Run all server tests**

Run:

```powershell
npm.cmd run test -w server
```

Expected: PASS. No test should require real OpenAI access.

- [ ] **Step 2: Run server typecheck**

Run:

```powershell
npm.cmd run typecheck -w server
```

Expected: PASS.

- [ ] **Step 3: Run all workspace typechecks**

Run:

```powershell
npm.cmd run typecheck -ws
```

Expected: PASS.

- [ ] **Step 4: Run all workspace tests**

Run:

```powershell
npm.cmd run test -ws
```

Expected: PASS. If DB-backed tests are skipped because no test database is configured, record that explicitly in the final implementation summary.

- [ ] **Step 5: Confirm git state**

Run:

```powershell
git status --short --branch
```

Expected: clean working tree on `main`, ahead of `origin/main` by the implementation commits.

- [ ] **Step 6: Commit final verification fixes if needed**

If verification required code or docs changes, run:

```powershell
git add server/src server/test server/package.json package-lock.json server/.env.example README.md
git commit -m "Polish OpenAI agent integration"
```

Expected: commit succeeds only when there were verification fixes to commit.

## Self-Review

- Spec coverage: provider selection, OpenAI provider, structured output, route `502`, manual approval preservation, dependency config, documentation, and no-network tests are all covered.
- Placeholder scan: no placeholder markers or incomplete implementation steps remain.
- Type consistency: `AgentProvider`, `AgentRecommendationContext`, `Recommendation`, `OpenAiChoreAgentProvider`, `createAgentProvider`, and env names match the approved design.
