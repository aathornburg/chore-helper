# Auth Household Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Clerk authentication and make household data accessible only through authenticated household membership.

**Architecture:** Clerk owns identity; the app persists a local `User` mapped to Clerk's user ID plus `HouseholdMember` rows for access. The backend protects household-scoped routes with auth + membership checks, and the frontend waits for Clerk before loading all accessible household data without any selected, current, or active household pointer.

**Tech Stack:** React 19, Vite, Clerk React, Express, Clerk Express middleware, Prisma/Postgres, Vitest, Supertest.

---

## File Structure

- Modify `server/package.json`: add `@clerk/express`.
- Modify `web/package.json`: add `@clerk/clerk-react`.
- Modify `server/.env.example`: document `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY`.
- Modify `web/.env.example`: create if missing and document `VITE_CLERK_PUBLISHABLE_KEY`.
- Modify `server/prisma/schema.prisma`: add `User` and `HouseholdMember`.
- Modify `server/src/repositories/inMemoryStore.ts`: add user and membership methods for route tests.
- Modify `server/src/repositories/prismaStore.ts`: implement user and membership methods with Prisma.
- Create `server/src/auth/currentUser.ts`: isolate Clerk request auth and app-user resolution.
- Create `server/src/routes/me.ts`: current-user and user household list endpoints.
- Modify `server/src/routes/households.ts`: require membership before household reads/writes.
- Modify `server/src/app.ts`: install Clerk middleware and mount `/api/me`.
- Modify `server/test/households.test.ts`: cover protected household behavior.
- Create `server/test/auth.test.ts`: cover `/api/me`, household creation ownership, and user-scoped household listing.
- Modify `web/src/api.ts`: support authenticated fetch and `/api/me` endpoints.
- Create `web/src/auth/AuthProvider.tsx`: pass Clerk token getter into the API layer.
- Modify `web/src/main.tsx`: wrap the app with `ClerkProvider`.
- Modify `web/src/App.tsx`: signed-in/signed-out shell gating and user menu.
- Modify `web/src/state/AppDataProvider.tsx`: load only after auth is ready and use authenticated `/api/households`.
- Modify `web/src/App.test.tsx`: mock Clerk state and assert auth-driven loading.

---

## Task 1: Dependencies And Environment Contract

**Files:**
- Modify: `server/package.json`
- Modify: `web/package.json`
- Modify: `server/.env.example`
- Create: `web/.env.example`

- [ ] **Step 1: Add Clerk packages**

Run:

```powershell
npm.cmd install @clerk/express -w server
npm.cmd install @clerk/clerk-react -w web
```

Expected: package manifests and lockfile include Clerk dependencies.

- [ ] **Step 2: Document server env**

In `server/.env.example`, add:

```dotenv
CLERK_SECRET_KEY=sk_test_replace_me
CLERK_PUBLISHABLE_KEY=pk_test_replace_me
```

- [ ] **Step 3: Document web env**

In `web/.env.example`, add:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_test_replace_me
VITE_API_BASE_URL=http://localhost:3001
```

- [ ] **Step 4: Verify install**

Run:

```powershell
npm.cmd run typecheck
```

Expected: any failures are pre-existing type failures only. If Clerk packages changed types, fix before moving on.

---

## Task 2: User And Membership Persistence

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Test: `server/test/auth.test.ts`

- [ ] **Step 1: Write failing repository/API tests**

Create `server/test/auth.test.ts` with tests that use a fake authenticated request header such as `Authorization: Bearer test-user-a` after Task 3 introduces the test auth adapter:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";

describe("auth ownership", () => {
  it("creates the app user on first authenticated /api/me request", async () => {
    const app = createApp({ store: createInMemoryStore(), authMode: "test" });

    const response = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer test-user-a")
      .expect(200);

    expect(response.body.clerkUserId).toBe("test-user-a");
    expect(response.body.id).toBeTruthy();
  });

  it("creates an owner membership when the user creates a household", async () => {
    const app = createApp({ store: createInMemoryStore(), authMode: "test" });

    const created = await request(app)
      .post("/api/households")
      .set("Authorization", "Bearer test-user-a")
      .send({ name: "Home" })
      .expect(201);

    const households = await request(app)
      .get("/api/households")
      .set("Authorization", "Bearer test-user-a")
      .expect(200);

    expect(households.body).toHaveLength(1);
    expect(households.body[0].id).toBe(created.body.id);
  });
});
```

Run:

```powershell
npm.cmd run test -w server -- auth.test.ts
```

Expected: fail because auth mode, `/api/me`, user records, and memberships do not exist yet.

- [ ] **Step 2: Add Prisma models**

In `server/prisma/schema.prisma`, add:

```prisma
model User {
  id          String            @id @default(cuid())
  clerkUserId String            @unique
  memberships HouseholdMember[]
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
}

model HouseholdMember {
  id          String    @id @default(cuid())
  householdId String
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  role        String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([householdId, userId])
}
```

Add these fields to `Household`:

```prisma
members          HouseholdMember[]
```

- [ ] **Step 3: Extend `HouseholdStore`**

Add these types and methods to `server/src/repositories/inMemoryStore.ts`:

```ts
export type AppUser = {
  id: string;
  clerkUserId: string;
};

export type HouseholdMembership = {
  householdId: string;
  userId: string;
  role: "owner" | "member";
};

export type HouseholdStore = {
  upsertUserByClerkId(clerkUserId: string): StoreResult<AppUser>;
  getUserByClerkId(clerkUserId: string): StoreResult<AppUser | undefined>;
  userHasHouseholdAccess(userId: string, householdId: string): StoreResult<boolean>;
  listHouseholdsForUser(userId: string): StoreResult<Household[]>;
  createHouseholdForUser(name: string, userId: string): StoreResult<Household>;
  // existing methods remain
};
```

- [ ] **Step 4: Implement in-memory ownership**

In `createInMemoryStore`, add `users` and `memberships` maps. `createHouseholdForUser` should call the existing household creation logic and add an `owner` membership. It must not set or store a selected household.

- [ ] **Step 5: Implement Prisma ownership**

In `createPrismaStore`, implement:

```ts
async upsertUserByClerkId(clerkUserId) {
  const user = await prisma.user.upsert({
    where: { clerkUserId },
    create: { clerkUserId },
    update: {}
  });
  return { id: user.id, clerkUserId: user.clerkUserId };
}
```

Use Prisma joins for `listHouseholdsForUser`, `userHasHouseholdAccess`, and `createHouseholdForUser`.

- [ ] **Step 6: Verify schema**

Run:

```powershell
npm.cmd run db:generate -w server
npm.cmd run typecheck -w server
```

Expected: Prisma client generation and server typecheck pass.

---

## Task 3: Backend Auth Boundary And `/api/me`

**Files:**
- Create: `server/src/auth/currentUser.ts`
- Create: `server/src/routes/me.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/auth.test.ts`

- [ ] **Step 1: Add an app auth dependency seam**

In `server/src/app.ts`, extend dependencies:

```ts
type AuthMode = "clerk" | "test";

type AppDependencies = {
  store?: HouseholdStore;
  agentProvider?: AgentProvider;
  authMode?: AuthMode;
};
```

Tests pass `authMode: "test"`. Production defaults to `"clerk"`.

- [ ] **Step 2: Create current-user helper**

Create `server/src/auth/currentUser.ts`:

```ts
import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import type { AppUser, HouseholdStore } from "../repositories/inMemoryStore.js";

export type AuthMode = "clerk" | "test";

export async function resolveCurrentUser(
  req: Request,
  res: Response,
  store: HouseholdStore,
  authMode: AuthMode
): Promise<AppUser | undefined> {
  const clerkUserId = authMode === "test"
    ? req.header("Authorization")?.replace(/^Bearer\s+/i, "")
    : getAuth(req).userId;

  if (!clerkUserId) {
    res.status(401).json({ error: "Authentication required" });
    return undefined;
  }

  return store.upsertUserByClerkId(clerkUserId);
}
```

- [ ] **Step 3: Add `/api/me` routes**

Create `server/src/routes/me.ts` with:

```ts
import { Router } from "express";
import type { AuthMode } from "../auth/currentUser.js";
import { resolveCurrentUser } from "../auth/currentUser.js";
import type { HouseholdStore } from "../repositories/inMemoryStore.js";

export function createMeRouter(store: HouseholdStore, authMode: AuthMode) {
  const router = Router();

  router.get("/", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    return res.status(200).json(user);
  });

  router.get("/households", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    return res.status(200).json(await store.listHouseholdsForUser(user.id));
  });

  return router;
}
```

- [ ] **Step 4: Mount Clerk middleware and `/api/me`**

In `server/src/app.ts`, import `clerkMiddleware` and `createMeRouter`. Use:

```ts
const authMode = dependencies.authMode ?? "clerk";
if (authMode === "clerk") {
  app.use(clerkMiddleware());
}
app.use("/api/me", createMeRouter(store, authMode));
```

- [ ] **Step 5: Verify `/api/me`**

Run:

```powershell
npm.cmd run test -w server -- auth.test.ts
```

Expected: the `/api/me` tests pass after Task 2 and Task 3 are complete.

---

## Task 4: Protect Household Routes By Membership

**Files:**
- Modify: `server/src/routes/households.ts`
- Modify: `server/src/app.ts`
- Modify: `server/test/households.test.ts`
- Test: `server/test/auth.test.ts`

- [ ] **Step 1: Update route factory signature**

Change:

```ts
export function createHouseholdRouter(store: HouseholdStore, agentProvider: AgentProvider)
```

to:

```ts
export function createHouseholdRouter(store: HouseholdStore, agentProvider: AgentProvider, authMode: AuthMode)
```

- [ ] **Step 2: Add route auth helpers**

Inside `households.ts`, add:

```ts
async function requireUser(req: Request, res: Response) {
  return resolveCurrentUser(req, res, store, authMode);
}

async function requireHouseholdAccess(req: Request, res: Response) {
  const user = await requireUser(req, res);
  if (!user) return undefined;
  const householdId = req.params.householdId;
  if (!(await store.userHasHouseholdAccess(user.id, householdId))) {
    res.status(404).json({ error: "Household not found" });
    return undefined;
  }
  const household = await store.getHousehold(householdId);
  if (!household) {
    res.status(404).json({ error: "Household not found" });
    return undefined;
  }
  return { user, household };
}
```

- [ ] **Step 3: Protect collection routes**

`GET /api/households` should resolve the current user and call `store.listHouseholdsForUser(user.id)`.

`POST /api/households` should resolve the current user and call `store.createHouseholdForUser(parsed.data.name, user.id)`.

- [ ] **Step 4: Protect household ID routes**

Replace direct `store.getHousehold(req.params.householdId)` checks with `requireHouseholdAccess(req, res)` in structure, baseline, chore, recommendation, decision, apply, and assistant chat handlers.

- [ ] **Step 5: Update server tests**

Update existing `server/test/households.test.ts` request helpers to set:

```ts
.set("Authorization", "Bearer test-user-a")
```

where routes are expected to succeed.

Add tests:

```ts
it("rejects unauthenticated household API requests", async () => {
  const app = createApp({ store: createInMemoryStore(), authMode: "test" });
  await request(app).get("/api/households").expect(401);
});

it("returns 404 when an authenticated user accesses another user's household", async () => {
  const app = createApp({ store: createInMemoryStore(), authMode: "test" });
  const created = await request(app)
    .post("/api/households")
    .set("Authorization", "Bearer test-user-a")
    .send({ name: "Home" })
    .expect(201);

  await request(app)
    .get(`/api/households/${created.body.id}`)
    .set("Authorization", "Bearer test-user-b")
    .expect(404);
});
```

- [ ] **Step 6: Verify backend auth**

Run:

```powershell
npm.cmd run test -w server -- households.test.ts auth.test.ts
npm.cmd run typecheck -w server
```

Expected: tests and typecheck pass.

---

## Task 5: Frontend Clerk Shell And Authenticated Fetch

**Files:**
- Modify: `web/src/main.tsx`
- Create: `web/src/auth/AuthProvider.tsx`
- Modify: `web/src/api.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/state/AppDataProvider.tsx`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add authenticated API token seam**

In `web/src/api.ts`, add:

```ts
let getAuthToken: (() => Promise<string | null>) | undefined;

export function configureApiAuth(nextGetAuthToken: () => Promise<string | null>) {
  getAuthToken = nextGetAuthToken;
}

async function apiFetch(input: string, init: RequestInit = {}) {
  const token = getAuthToken ? await getAuthToken() : null;
  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
}
```

Replace existing `fetch(...)` calls with `apiFetch(...)`.

- [ ] **Step 2: Wrap app in Clerk**

In `web/src/main.tsx`, import `ClerkProvider` and fail loudly when missing:

```ts
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPublishableKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}
```

Wrap `<App />` in `<ClerkProvider publishableKey={clerkPublishableKey}>`.

- [ ] **Step 3: Configure API auth from Clerk**

Create `web/src/auth/AuthProvider.tsx`:

```tsx
import { useAuth } from "@clerk/clerk-react";
import { useEffect } from "react";
import { configureApiAuth } from "../api";

export function ApiAuthBridge({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    configureApiAuth(() => getToken());
  }, [getToken]);

  return children;
}
```

- [ ] **Step 4: Gate app shell**

In `web/src/App.tsx`, use Clerk prebuilt components:

```tsx
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton, useAuth } from "@clerk/clerk-react";
```

Render landing/signed-out prompt in `<SignedOut>`, and wrap `AppDataProvider` plus routes in `<SignedIn>`.

- [ ] **Step 5: Delay AppDataProvider load until auth is ready**

In `AppDataProvider`, use a prop:

```ts
type AppDataProviderProps = {
  authReady: boolean;
  children: React.ReactNode;
};
```

Only call `listHouseholds()` when `authReady` is true.

- [ ] **Step 6: Update frontend tests**

Mock `@clerk/clerk-react` in `web/src/App.test.tsx` so the default test state is signed in and `getToken()` returns `"test-user-a"`.

Add a signed-out test:

```ts
it("shows auth entry points when signed out", async () => {
  mockClerkSignedOut();
  renderAt("/today");
  expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /sign up/i })).toBeTruthy();
});
```

- [ ] **Step 7: Verify frontend auth shell**

Run:

```powershell
npm.cmd test --workspace web -- --run src/App.test.tsx
npm.cmd run typecheck -w web
npm.cmd run build -w web
```

Expected: tests, typecheck, and build pass.

---

## Task 6: All-Household App Data Flow

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `web/src/api.ts`
- Modify: `web/src/state/AppDataProvider.tsx`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add shared current-user types**

In `shared/src/types.ts`, add:

```ts
export type AppUserProfile = {
  id: string;
  clerkUserId: string;
};
```

- [ ] **Step 2: Add API helpers**

In `web/src/api.ts`, add:

```ts
export async function getCurrentUser(): Promise<AppUserProfile> {
  const response = await apiFetch(`${API_BASE_URL}/api/me`);
  if (!response.ok) throw new Error("Failed to fetch current user");
  return response.json();
}
```

- [ ] **Step 3: Load user profile before household app data**

In `AppDataProvider`, load `/api/me` before `/api/households` so the first app data load is clearly dependent on authenticated user resolution. Continue storing `households: HouseholdAppData[]` as the primary state. Do not add `activeHouseholdId`, `selectedHouseholdId`, or shell-level household selection.

- [ ] **Step 4: Keep temporary legacy consumers explicit**

Some existing pages still accept a single `householdSetup` shape. Until those pages are converted to all-household workflows, derive that value locally from `households[0]` and mark it as a compatibility bridge in code:

```ts
// Compatibility bridge for pages not yet converted to all-household data.
const householdSetup = useMemo(
  () => toHouseholdSetup(households[0], isLoading, loadError),
  [households, isLoading, loadError]
);
```

- [ ] **Step 5: Test there is no selected household state**

In `web/src/App.test.tsx`, add a test where `/api/me` returns the user profile and `/api/households` returns two households. Assert both household panels render on `/households`, no "Active household" selector is present, and no request is made to `/api/me/active-household`.

- [ ] **Step 6: Verify all-household flow**

Run:

```powershell
npm.cmd test --workspace web -- --run src/App.test.tsx
npm.cmd run typecheck
```

Expected: all tests and typecheck pass.

---

## Task 7: Full Verification And Database Push

**Files:**
- Generated: Prisma client
- Database: local development Postgres schema

- [ ] **Step 1: Push database schema**

Run:

```powershell
npm.cmd run db:push
```

Expected: Prisma applies `User` and `HouseholdMember` models to local Postgres.

- [ ] **Step 2: Run complete verification**

Run:

```powershell
npm.cmd run test -w server
npm.cmd run test -w web
npm.cmd run typecheck
npm.cmd run web:build
```

Expected: all pass.

- [ ] **Step 3: Manual smoke test**

Start server and web dev servers with Clerk test keys configured. In the browser:

1. Signed out user sees sign-in/sign-up entry points.
2. Signed in user with no households can create a household from Households or Setup.
3. Created household appears in `/api/households`.
4. Multiple households render as separate panels without a global selected household.
5. Chores, Optimize, and Households still load through authenticated requests.

---

## Self-Review

- Spec coverage: The plan covers Clerk React and Express wiring, app user upsert, membership ownership, protected household routes, frontend signed-in/signed-out behavior, localStorage replacement, all-household data loading, and verification.
- Intentional gap: invitations and member management remain out of scope, matching the spec.
- Compatibility note: Existing tests must be updated to use the test auth mode; production mode should not introduce anonymous fallback behavior.
