# Add Chore Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users enter complete chore details and an optional initial timed schedule while creating a chore.

**Architecture:** Extend the existing `ChoresPage` add form with definition and schedule state that submits through the already implemented `createChore` and `createSchedule` API functions. The chore creation request remains authoritative; optional schedule creation follows only after a chore ID exists and surfaces a recoverable partial-success state if it fails.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing Express schedule APIs.

---

## File Map

- Modify `web/src/pages/ChoresPage.tsx`: add-form details, member loading, optional schedule controls, sequential submission, and partial-success status.
- Modify `web/src/App.test.tsx`: creation parity and schedule failure behavior coverage.
- Modify `web/src/App.css`: layout for create-form schedule controls where existing editor styles do not apply.

## Task 1: Chore Definition Parity

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/ChoresPage.tsx`

- [x] **Step 1: Write failing create-detail test**

Extend the existing create-chore test to fill `Instructions` and `Tags` and assert that
the `POST /api/households/:householdId/chores` body includes:

```ts
{
  title: "Sweep porch",
  cadence: "weekly",
  estimatedMinutes: 15,
  source: "manual",
  instructions: "Sweep steps and shake the mat.",
  tags: ["outdoor", "weekly"]
}
```

- [x] **Step 2: Run the web test and verify RED**

Run:

```powershell
npm.cmd test -w web -- App.test.tsx
```

Expected: the create form does not expose `Instructions` or `Tags`.

- [x] **Step 3: Implement definition fields in the add form**

Add `newInstructions` and `newTags` state, reset them in `handleOpenAddChore`, render
the same labeled inputs used by edit, and submit:

```ts
instructions: newInstructions.trim() || undefined,
tags: newTags.split(",").map((tag) => tag.trim()).filter(Boolean)
```

- [x] **Step 4: Run the web test and verify GREEN**

Run:

```powershell
npm.cmd test -w web -- App.test.tsx
```

Expected: the detail payload assertion passes.

## Task 2: Optional Initial Schedule And Partial Success

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/ChoresPage.tsx`
- Modify: `web/src/App.css`

- [x] **Step 1: Write failing initial-schedule tests**

Add tests that:

- Select a household, enable `Add initial schedule`, load its members, fill the same
  schedule fields available in edit, save, and assert `createSchedule` is posted for
  the newly created chore.
- Return a failed schedule response after a successful chore create and assert the new
  chore remains visible with status text `Chore added, but its schedule could not be saved. Open the chore to finish scheduling.`

- [x] **Step 2: Run tests and verify RED**

Run:

```powershell
npm.cmd test -w web -- App.test.tsx
```

Expected: initial schedule controls are absent.

- [x] **Step 3: Implement initial schedule form state and submission**

On household selection, load members via `listHouseholdMembers`. When scheduling is
enabled, render fields for recurrence, interval, conditional weekday/monthly input,
time, duration, date bounds, assignment mode, and assignees. After `createChore`
returns, call:

```ts
await createSchedule(newHouseholdId, added.id, initialSchedulePayload);
```

Only close the form after full success. When schedule creation fails after the chore
was stored, add the chore to the list, close the create form, and display the
recoverable partial-success status.

- [x] **Step 4: Run focused checks and verify GREEN**

Run:

```powershell
npm.cmd test -w web -- App.test.tsx
npm.cmd run typecheck -w web
npm.cmd run build -w web
```

Expected: add/edit parity and partial-success tests pass; typecheck and build succeed.

## Task 3: Browser Verification And Commit

**Files:**
- Modify: `docs/superpowers/plans/2026-05-25-add-chore-parity.md`

- [x] **Step 1: Inspect the add form locally**

Use the Browser workflow on `/chores` to verify desktop and narrow-width rendering of
definition inputs plus the optional schedule form, without submitting new persistent
data.

- [x] **Step 2: Mark plan progress and verify repository changes**

Mark completed plan checkboxes, then run:

```powershell
git diff --check
git status --short --branch
```

- [x] **Step 3: Commit**

```powershell
git add docs/superpowers/plans/2026-05-25-add-chore-parity.md web/src/pages/ChoresPage.tsx web/src/App.test.tsx web/src/App.css
git commit -m "Add complete chore creation workflow"
```

## Self-Review

- Spec coverage: definition parity, optional initial schedule, partial success, tests,
  build verification, and browser inspection are all assigned to concrete tasks.
- Placeholder scan: no deferred behaviors or unspecified validations.
- Type consistency: the plan uses the existing `Chore`, `ChoreSchedule`,
  `createChore`, `createSchedule`, and `listHouseholdMembers` contracts.
