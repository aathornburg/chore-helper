# React Express Agent Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first testable foundation for the chore assistant: React frontend, Express backend, shared types, and an app-owned agent boundary with mock recommendations.

**Architecture:** The React app talks to an Express API. The Express API owns chore/household/recommendation state and calls an internal `AgentProvider` interface. The first implementation uses in-memory repositories and a mock agent provider so the product flow is testable before adding Postgres, Google Calendar OAuth, or the OpenAI Agents SDK. The React app is scaffolded with Vite, while the Express and shared TypeScript packages are added manually.

**Tech Stack:** React, Vite, TypeScript, Express, Vitest, Supertest, Zod.

**Implementation Note:** During execution, the frontend was created with `npm.cmd create vite@latest web -- --template react-ts` to keep normal React/Vite conventions visible for learning. The root npm workspace, shared package, and Express server were added around that scaffold.

**Agent Integration Decision:** The real agent implementation should use the OpenAI Agents SDK for TypeScript, not a one-off raw Responses API integration. The SDK should be introduced behind the existing server-side `AgentProvider` boundary so the React app and product API do not depend directly on OpenAI-specific types.

---

## File Structure

- `package.json`: root workspace scripts.
- `tsconfig.base.json`: shared TypeScript settings.
- `shared/package.json`: shared package metadata.
- `shared/src/types.ts`: shared household, chore, and recommendation types.
- `shared/src/index.ts`: shared exports.
- `server/package.json`: Express package metadata and scripts.
- `server/src/app.ts`: Express app factory.
- `server/src/index.ts`: server entrypoint.
- `server/src/repositories/inMemoryStore.ts`: in-memory state for the first slice.
- `server/src/agent/AgentProvider.ts`: provider interface.
- `server/src/agent/MockChoreAgentProvider.ts`: deterministic mock expert assistant.
- `server/src/routes/households.ts`: household baseline and recommendation routes.
- `server/test/households.test.ts`: API tests.
- `web/package.json`: React package metadata and scripts.
- `web/src/main.tsx`: React entrypoint.
- `web/src/App.tsx`: first usable UI.
- `web/src/api.ts`: typed API client.
- `web/src/App.test.tsx`: UI smoke test.

## Task 1: Workspace Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `shared/package.json`
- Create: `shared/src/index.ts`
- Create: `shared/src/types.ts`

- [ ] **Step 1: Create the root workspace files**

`package.json`:

```json
{
  "name": "chore-agent",
  "private": true,
  "workspaces": ["shared", "server", "web"],
  "scripts": {
    "dev": "npm run dev -w server",
    "test": "npm run test -ws",
    "typecheck": "npm run typecheck -ws"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 2: Create shared package metadata**

`shared/package.json`:

```json
{
  "name": "@chore-agent/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "echo \"shared has no tests yet\"",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 3: Create shared domain types**

`shared/src/types.ts`:

```ts
export type HomeType = "house" | "apartment" | "condo" | "townhouse" | "other";

export type FlooringType = "carpet" | "hardwood" | "tile" | "mixed" | "unknown";

export type HouseholdBaseline = {
  homeType: HomeType;
  rooms: string[];
  flooring: FlooringType[];
  hasPets: boolean;
  hasOutdoorSpace: boolean;
  notes?: string;
};

export type Household = {
  id: string;
  name: string;
  baseline?: HouseholdBaseline;
};

export type Chore = {
  id: string;
  householdId: string;
  title: string;
  cadence: string;
  estimatedMinutes: number;
  source: "manual" | "google-calendar";
};

export type RecommendationConfidence = "low" | "medium" | "high";

export type Recommendation = {
  id: string;
  householdId: string;
  title: string;
  rationale: string;
  confidence: RecommendationConfidence;
  status: "pending" | "accepted" | "skipped";
};
```

`shared/src/index.ts`:

```ts
export * from "./types";
```

- [ ] **Step 4: Run typecheck**

Run: `npm install`

Run: `npm run typecheck -w shared`

Expected: TypeScript exits successfully.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.base.json shared
git commit -m "chore-agent foundation: add shared workspace"
```

## Task 2: Express API With Mock Agent Boundary

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`
- Create: `server/src/repositories/inMemoryStore.ts`
- Create: `server/src/agent/AgentProvider.ts`
- Create: `server/src/agent/MockChoreAgentProvider.ts`
- Create: `server/src/routes/households.ts`
- Create: `server/test/households.test.ts`

- [ ] **Step 1: Create server package metadata**

`server/package.json`:

```json
{
  "name": "@chore-agent/server",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@chore-agent/shared": "0.0.0",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`server/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 2: Write the failing API test**

`server/test/households.test.ts`:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("household baseline flow", () => {
  it("creates a household, saves baseline facts, and returns expert recommendations", async () => {
    const app = createApp();

    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);

    const householdId = created.body.id;

    await request(app)
      .put(`/api/households/${householdId}/baseline`)
      .send({
        homeType: "house",
        rooms: ["kitchen", "bathroom"],
        flooring: ["hardwood", "tile"],
        hasPets: true,
        hasOutdoorSpace: true,
        notes: "We already have recurring chores in Google Calendar."
      })
      .expect(200);

    const recommendations = await request(app)
      .post(`/api/households/${householdId}/recommendations`)
      .expect(201);

    expect(recommendations.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Add a recurring pet hair floor reset",
          confidence: "medium",
          status: "pending"
        })
      ])
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -w server`

Expected: FAIL because `server/src/app.ts` does not exist.

- [ ] **Step 4: Implement in-memory storage**

`server/src/repositories/inMemoryStore.ts`:

```ts
import type { Household, HouseholdBaseline, Recommendation } from "@chore-agent/shared";

export type InMemoryStore = {
  households: Map<string, Household>;
  recommendations: Map<string, Recommendation[]>;
  createHousehold(name: string): Household;
  updateBaseline(householdId: string, baseline: HouseholdBaseline): Household | undefined;
  getHousehold(householdId: string): Household | undefined;
  saveRecommendations(householdId: string, recommendations: Recommendation[]): Recommendation[];
};

export function createInMemoryStore(): InMemoryStore {
  const households = new Map<string, Household>();
  const recommendations = new Map<string, Recommendation[]>();

  return {
    households,
    recommendations,
    createHousehold(name) {
      const household = { id: crypto.randomUUID(), name };
      households.set(household.id, household);
      return household;
    },
    updateBaseline(householdId, baseline) {
      const household = households.get(householdId);
      if (!household) return undefined;
      const updated = { ...household, baseline };
      households.set(householdId, updated);
      return updated;
    },
    getHousehold(householdId) {
      return households.get(householdId);
    },
    saveRecommendations(householdId, nextRecommendations) {
      recommendations.set(householdId, nextRecommendations);
      return nextRecommendations;
    }
  };
}
```

- [ ] **Step 5: Implement the agent provider interface and mock provider**

`server/src/agent/AgentProvider.ts`:

```ts
import type { Household, Recommendation } from "@chore-agent/shared";

export type AgentProvider = {
  recommendSetupImprovements(household: Household): Promise<Recommendation[]>;
};
```

`server/src/agent/MockChoreAgentProvider.ts`:

```ts
import type { Household, Recommendation } from "@chore-agent/shared";
import type { AgentProvider } from "./AgentProvider";

export class MockChoreAgentProvider implements AgentProvider {
  async recommendSetupImprovements(household: Household): Promise<Recommendation[]> {
    const baseline = household.baseline;
    const recommendations: Recommendation[] = [];

    if (baseline?.hasPets) {
      recommendations.push({
        id: crypto.randomUUID(),
        householdId: household.id,
        title: "Add a recurring pet hair floor reset",
        rationale: "Pets usually increase floor and upholstery maintenance. A short recurring reset can prevent pet hair from becoming a larger weekend chore.",
        confidence: "medium",
        status: "pending"
      });
    }

    if (baseline?.hasOutdoorSpace) {
      recommendations.push({
        id: crypto.randomUUID(),
        householdId: household.id,
        title: "Add seasonal outdoor maintenance reminders",
        rationale: "Outdoor spaces often need lower-frequency chores that are easy to forget because they do not show up in weekly cleaning routines.",
        confidence: "high",
        status: "pending"
      });
    }

    return recommendations;
  }
}
```

- [ ] **Step 6: Implement Express routes**

`server/src/routes/households.ts`:

```ts
import { Router } from "express";
import { z } from "zod";
import type { AgentProvider } from "../agent/AgentProvider";
import type { InMemoryStore } from "../repositories/inMemoryStore";

const createHouseholdSchema = z.object({
  name: z.string().min(1)
});

const baselineSchema = z.object({
  homeType: z.enum(["house", "apartment", "condo", "townhouse", "other"]),
  rooms: z.array(z.string().min(1)),
  flooring: z.array(z.enum(["carpet", "hardwood", "tile", "mixed", "unknown"])),
  hasPets: z.boolean(),
  hasOutdoorSpace: z.boolean(),
  notes: z.string().optional()
});

export function createHouseholdRouter(store: InMemoryStore, agentProvider: AgentProvider) {
  const router = Router();

  router.post("/", (req, res) => {
    const parsed = createHouseholdSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid household payload" });
    return res.status(201).json(store.createHousehold(parsed.data.name));
  });

  router.put("/:householdId/baseline", (req, res) => {
    const parsed = baselineSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid baseline payload" });

    const household = store.updateBaseline(req.params.householdId, parsed.data);
    if (!household) return res.status(404).json({ error: "Household not found" });

    return res.status(200).json(household);
  });

  router.post("/:householdId/recommendations", async (req, res) => {
    const household = store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    const recommendations = await agentProvider.recommendSetupImprovements(household);
    return res.status(201).json(store.saveRecommendations(household.id, recommendations));
  });

  return router;
}
```

- [ ] **Step 7: Implement app factory and server entrypoint**

`server/src/app.ts`:

```ts
import cors from "cors";
import express from "express";
import { MockChoreAgentProvider } from "./agent/MockChoreAgentProvider";
import { createInMemoryStore } from "./repositories/inMemoryStore";
import { createHouseholdRouter } from "./routes/households";

export function createApp() {
  const app = express();
  const store = createInMemoryStore();
  const agentProvider = new MockChoreAgentProvider();

  app.use(cors());
  app.use(express.json());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/households", createHouseholdRouter(store, agentProvider));

  return app;
}
```

`server/src/index.ts`:

```ts
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3001);

createApp().listen(port, () => {
  console.log(`Chore agent API listening on http://localhost:${port}`);
});
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npm run test -w server`

Expected: PASS.

Run: `npm run typecheck -w server`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server
git commit -m "chore-agent foundation: add express agent boundary"
```

## Task 3: React Setup Flow

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/api.ts`
- Create: `web/src/App.tsx`
- Create: `web/src/App.test.tsx`

- [ ] **Step 1: Create web package metadata**

`web/package.json`:

```json
{
  "name": "@chore-agent/web",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@chore-agent/shared": "0.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`web/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write the UI smoke test**

`web/src/App.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the setup entry point", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Household Baseline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate expert suggestions" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -w web`

Expected: FAIL because `web/src/App.tsx` does not exist.

- [ ] **Step 4: Implement API client**

`web/src/api.ts`:

```ts
import type { HouseholdBaseline, Recommendation } from "@chore-agent/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export async function createHousehold(name: string) {
  const response = await fetch(`${API_BASE_URL}/api/households`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  if (!response.ok) throw new Error("Failed to create household");
  return response.json();
}

export async function saveBaseline(householdId: string, baseline: HouseholdBaseline) {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/baseline`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(baseline)
  });
  if (!response.ok) throw new Error("Failed to save baseline");
  return response.json();
}

export async function generateRecommendations(householdId: string): Promise<Recommendation[]> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/recommendations`, {
    method: "POST"
  });
  if (!response.ok) throw new Error("Failed to generate recommendations");
  return response.json();
}
```

- [ ] **Step 5: Implement first React screen**

`web/index.html`:

```html
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
```

`web/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`web/src/App.tsx`:

```tsx
import { useState } from "react";
import type { Recommendation } from "@chore-agent/shared";
import { createHousehold, generateRecommendations, saveBaseline } from "./api";

export function App() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [status, setStatus] = useState("Ready to learn the lay of the land.");

  async function handleGenerate() {
    setStatus("Building household baseline...");
    const household = await createHousehold("Home");
    await saveBaseline(household.id, {
      homeType: "house",
      rooms: ["kitchen", "bathroom"],
      flooring: ["hardwood", "tile"],
      hasPets: true,
      hasOutdoorSpace: true,
      notes: "Initial mock baseline for the first vertical slice."
    });
    const nextRecommendations = await generateRecommendations(household.id);
    setRecommendations(nextRecommendations);
    setStatus("Expert suggestions ready.");
  }

  return (
    <main>
      <h1>Household Baseline</h1>
      <p>{status}</p>
      <button type="button" onClick={handleGenerate}>Generate expert suggestions</button>
      <ul>
        {recommendations.map((recommendation) => (
          <li key={recommendation.id}>
            <strong>{recommendation.title}</strong>
            <p>{recommendation.rationale}</p>
            <small>Confidence: {recommendation.confidence}</small>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm run test -w web`

Expected: PASS.

Run: `npm run typecheck -w web`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "chore-agent foundation: add react baseline UI"
```

## Task 4: Whole Workspace Verification

**Files:**
- Modify: none.

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: shared script exits successfully, server tests pass, web tests pass.

- [ ] **Step 2: Run all typechecks**

Run: `npm run typecheck`

Expected: shared, server, and web typechecks pass.

- [ ] **Step 3: Run the local backend**

Run: `npm run dev -w server`

Expected: server logs `Chore agent API listening on http://localhost:3001`.

- [ ] **Step 4: Run the local frontend**

Run: `npm run dev -w web`

Expected: Vite starts and serves the React app.

- [ ] **Step 5: Manual browser check**

Open the Vite URL. Click `Generate expert suggestions`. Expected: the page shows at least one recommendation with rationale and confidence.

- [ ] **Step 6: Commit verification notes if docs changed**

If implementation changes require updating this plan or the spec, commit those docs with:

```bash
git add docs
git commit -m "docs: update chore agent foundation plan"
```

## Self-Review

- Spec coverage: This plan covers the selected React + Express stack, app-owned agent boundary, household baseline, recommendations with rationale/confidence, and internal API ownership. It intentionally leaves Google Calendar OAuth, Postgres persistence, authentication, and OpenAI Agents SDK integration for follow-up plans.
- Placeholder scan: No placeholder tasks remain.
- Type consistency: Shared types are used by both server and web. The mock provider returns the same `Recommendation` shape consumed by the API and React screen.
