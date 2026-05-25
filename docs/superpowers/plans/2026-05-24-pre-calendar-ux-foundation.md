# Pre-Calendar UX Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a cohesive public landing, authenticated Today home, complete Household editor, and Calendar entry shell before functional Google Calendar integration.

**Architecture:** Replace the duplicate household baseline contract with a general `HouseholdProfile` plus the existing normalized floor/room structure, and expose all authenticated household data to page-level views. Keep Calendar behavior deliberately thin: Settings owns the pre-integration shell and Today/Chores navigate to it. Preserve the existing Clerk membership boundary and the warm CSS visual language.

**Tech Stack:** React 19, TypeScript, Vite, Clerk React, Express, Zod, Prisma/Postgres, Vitest, Testing Library, `browser-use`.

---

## File Structure

- Modify `docs/product-roadmap.md`: insert this milestone before Google Calendar integration.
- Modify `shared/src/types.ts`: replace `HouseholdBaseline` with `HouseholdProfile` and update `HouseholdAppData`.
- Modify `server/prisma/schema.prisma`, `server/src/repositories/inMemoryStore.ts`, `server/src/repositories/prismaStore.ts`, and `server/src/routes/households.ts`: replace baseline persistence/API with authenticated profile persistence/API.
- Modify `server/src/agent/MockChoreAgentProvider.ts` and `server/src/agent/OpenAiChoreAgentProvider.ts`: produce household context from profile plus structure-derived room details.
- Modify `web/src/api.ts` and `web/src/state/AppDataProvider.tsx`: expose profile saves and all-household data with no single-household Today bridge.
- Modify `web/src/App.tsx`, `web/src/pages/LandingPage.tsx`, `web/src/pages/TodayDashboard.tsx`, `web/src/pages/HouseholdsPage.tsx`, `web/src/pages/ChoresPage.tsx`, `web/src/pages/SettingsPage.tsx`, and `web/src/App.css`: deliver the page and navigation refresh.
- Modify `server/test/*.test.ts`, `web/src/App.test.tsx`, and relevant utility tests: cover the replacement contract and UX states.

## Task 1: Replace The Household Baseline Contract

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Modify: `server/src/routes/households.ts`
- Test: `server/test/households.test.ts`
- Test: `server/test/prismaStore.test.ts`

- [ ] **Step 1: Write failing API/store tests**

Add tests proving that `PUT /api/households/:id/profile` accepts and reloads:

```ts
{
  name: "Home",
  homeType: "house",
  hasPets: true,
  hasOutdoorSpace: false,
  notes: "Dog sheds in the living room."
}
```

Assert authenticated household application data contains `profile`, and replace baseline persistence expectations in Prisma tests with profile expectations.

- [ ] **Step 2: Verify the new contract is red**

Run:

```powershell
npm.cmd run test -w server -- households.test.ts prismaStore.test.ts
```

Expected: failure because `/profile` and `HouseholdProfile` do not exist.

- [ ] **Step 3: Implement the shared and Prisma contract**

Define:

```ts
export type HouseholdProfile = {
  homeType: "house" | "apartment" | "condo" | "townhouse" | "other";
  hasPets: boolean;
  hasOutdoorSpace: boolean;
  notes?: string;
};

export type Household = {
  id: string;
  name: string;
  profile?: HouseholdProfile;
};
```

Replace Prisma `HouseholdBaseline` with a one-to-one `HouseholdProfile` model containing the same general fields only; remove stored rooms and flooring from that model.

- [ ] **Step 4: Implement authenticated profile persistence**

Replace store method `updateBaseline` with:

```ts
updateProfile(
  householdId: string,
  update: { name: string; profile: HouseholdProfile }
): StoreResult<Household | undefined>;
```

Add `PUT /:householdId/profile`, protected through the existing membership access helper, and remove `/baseline`.

- [ ] **Step 5: Verify and commit the domain replacement**

Run:

```powershell
npm.cmd run test -w server -- households.test.ts prismaStore.test.ts
npm.cmd run typecheck -w server
npm.cmd run typecheck -w shared
```

Commit only after the new tests pass.

## Task 2: Update Recommendation Context And Frontend Data Loading

**Files:**
- Modify: `server/src/agent/MockChoreAgentProvider.ts`
- Modify: `server/src/agent/OpenAiChoreAgentProvider.ts`
- Modify: `server/test/openAiChoreAgentProvider.test.ts`
- Modify: `web/src/api.ts`
- Modify: `web/src/state/AppDataProvider.tsx`
- Modify: `web/src/utils/household.ts`
- Modify: `web/src/utils/householdStructure.ts`
- Test: `web/src/App.test.tsx`
- Test: `web/src/utils/householdStructure.test.ts`

- [ ] **Step 1: Write failing provider and frontend data tests**

Require agent context summaries to read profile facts and structure room counts rather than baseline arrays. Require app data loading to expose all households to Today and profile saves through:

```ts
saveHouseholdProfile(householdId, {
  name,
  homeType,
  hasPets,
  hasOutdoorSpace,
  notes
});
```

- [ ] **Step 2: Verify failures**

Run:

```powershell
npm.cmd run test -w server -- openAiChoreAgentProvider.test.ts
npm.cmd run test -w web -- App.test.tsx householdStructure.test.ts
```

Expected: failures from baseline references and missing profile API/data state.

- [ ] **Step 3: Implement profile/structure summary helpers and provider state**

Remove `householdSetup` and baseline summary dependencies from authenticated page data. Expose `households`, loading/error state, `addHousehold`, and `reloadHouseholds`; summarize profile with room/floor counts derived from `structure`.

- [ ] **Step 4: Verify and commit**

Run the focused server and web tests plus corresponding typechecks. Commit after green.

## Task 3: Public Landing And Authenticated Root Routing

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/pages/LandingPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing auth-entry tests**

Cover:

```ts
expect(signedOutLanding).toHaveTextContent("Cleanly");
expect(screen.getByRole("button", { name: "Sign up" })).toBeTruthy();
expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
```

For a signed-in render at `/`, assert the Today heading/content appears instead of public landing marketing content.

- [ ] **Step 2: Verify failures**

Run `npm.cmd run test -w web -- App.test.tsx`.

- [ ] **Step 3: Implement landing/auth routing and style refresh**

Render `LandingPage` in the signed-out branch with Clerk actions; route authenticated `/` to the Today view. Use full-product landing copy while avoiding functional Calendar claims on signed-in controls.

- [ ] **Step 4: Verify and commit**

Run focused web tests and `npm.cmd run typecheck -w web`; commit after green.

## Task 4: Redesign Today As The Multi-Household Home

**Files:**
- Modify: `web/src/pages/TodayDashboard.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing state tests**

Add tests for loading/failure, no households, incomplete profile/no chores, two ready households, and a Calendar action navigating to `/settings#calendar`. Assert no `due today` or completion-control copy is rendered.

- [ ] **Step 2: Verify failures**

Run `npm.cmd run test -w web -- App.test.tsx`.

- [ ] **Step 3: Implement aggregate Today rendering**

Pass the full household collection and load state into `TodayDashboard`. Derive `profileComplete` from `profile` plus at least one floor and derive `reviewReady` from profile completeness plus active chores.

- [ ] **Step 4: Verify and commit**

Run focused tests and web typecheck; commit after green.

## Task 5: Complete The Household Editing Workspace

**Files:**
- Modify: `web/src/pages/HouseholdsPage.tsx`
- Modify: `web/src/api.ts`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Cover saving name/profile fields from `Overview`, saving floor detail fields and notes from `Floors`, saving room overrides and notes from `Rooms`, inline failure feedback, and existing destructive confirmations.

- [ ] **Step 2: Verify failures**

Run `npm.cmd run test -w web -- App.test.tsx`.

- [ ] **Step 3: Implement editable profile and full floor/room forms**

Use `saveHouseholdProfile` for Overview, and continue full-structure replacement saves for floor/room operations. After successful profile or structure save, call the provider reload callback so other pages show consistent context.

- [ ] **Step 4: Verify and commit**

Run focused web tests and typecheck; commit after green.

## Task 6: Add Calendar Entry Shells

**Files:**
- Modify: `web/src/pages/SettingsPage.tsx`
- Modify: `web/src/pages/ChoresPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing Calendar-shell tests**

Assert Settings renders a `Google Calendar` card with `Not connected`, selecting `Connect Google Calendar` reveals an explanation without API writes, and `Import calendar events` from Chores navigates to `/settings#calendar`.

- [ ] **Step 2: Verify failures**

Run `npm.cmd run test -w web -- App.test.tsx`.

- [ ] **Step 3: Implement Settings target and navigation actions**

Keep the shell local UI state only. Provide navigation callbacks to Chores and Today; Settings reads the hash to emphasize the Calendar card.

- [ ] **Step 4: Verify and commit**

Run focused tests and web typecheck; commit after green.

## Task 7: Database Reset, Full Verification, And Browser Validation

**Files:**
- Modify only if required by discovered verification fixes.

- [ ] **Step 1: Apply the accepted local reset workflow**

With local Postgres running, regenerate and apply the replacement schema:

```powershell
npm.cmd run db:generate -w server
npm.cmd run db:push -w server -- --force-reset
```

Expected: local development baseline rows are discarded and the profile schema is active.

- [ ] **Step 2: Run full automated verification**

```powershell
npm.cmd run test -w server
npm.cmd run test -w web
npm.cmd run typecheck
npm.cmd run web:build
```

Expected: all commands pass.

- [ ] **Step 3: Run browser smoke validation**

Use `browser-use` for desktop and narrow viewport review of:

- Signed-out landing and Clerk sign-in/sign-up entry.
- Signed-in root-to-Today experience.
- Household Overview/Floors/Rooms editing.
- Chores `Import calendar events` action.
- Settings Calendar shell.

For Clerk test authentication, use `alan+clerk_test@example.com` and MFA code `424242`.

## Self-Review

- Spec coverage: landing/auth routing, multi-household Today, replacement profile domain, complete Household editing, Calendar entry shells, roadmap placement, and browser validation are each assigned to implementation tasks.
- Data decision: the plan intentionally removes baseline migration and uses a local reset because the project is not in production.
- Integration boundary: Calendar shell controls do not perform OAuth, imports, exports, or stored connection state.
