# Frontend Architecture Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the React frontend into a readable, standard SPA structure with React Router, component-owned CSS Modules, feature components, and domain service modules.

**Architecture:** Migrate incrementally. First create global style boundaries and route ownership, then split styles and components by feature, then split API services, and only then introduce TanStack Query for server state. Preserve current UI behavior throughout.

**Tech Stack:** React 19, TypeScript, Vite, React Router, Vite CSS Modules, Vitest, Testing Library, optional later TanStack Query.

---

## File Structure

- Create `web/src/styles/tokens.css`: app design tokens and CSS custom properties.
- Create `web/src/styles/global.css`: reset, `body`, and root background/font rules.
- Modify `web/src/main.tsx`: import `global.css` instead of `index.css`.
- Move `web/src/App.css` gradually into feature-owned CSS Modules.
- Create `web/src/app/AppShell.tsx` and `web/src/app/AppShell.module.css`.
- Modify `web/src/App.tsx`: remove manual routing and render React Router routes.
- Create `web/src/services/apiClient.ts`, `householdsApi.ts`, `choresApi.ts`, and `recommendationsApi.ts`.
- Split large page modules gradually, with Calendar last.

## Task 1: Establish Style Boundaries

**Files:**
- Create: `web/src/styles/tokens.css`
- Create: `web/src/styles/global.css`
- Modify: `web/src/main.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Move existing root tokens into `tokens.css`**

Create `web/src/styles/tokens.css` with the current `:root` color variables from `App.css`.

- [ ] **Step 2: Move global reset into `global.css`**

Create `web/src/styles/global.css` with:

```css
@import "./tokens.css";

:root {
  color: #17201c;
  background:
    radial-gradient(circle at top left, rgba(208, 227, 204, 0.7), transparent 34rem),
    linear-gradient(135deg, #f7f1e9 0%, #eef4ec 52%, #f8f5ef 100%);
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}
```

- [ ] **Step 3: Update `main.tsx` style import**

Replace the `index.css` import with `./styles/global.css`.

- [ ] **Step 4: Remove duplicated root/reset rules**

Remove the moved token/reset rules from `App.css` and `index.css`. Delete `index.css` only after confirming no imports remain.

- [ ] **Step 5: Verify**

Run:

```bash
npm.cmd run test -w web
npm.cmd run build -w web
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/styles web/src/main.tsx web/src/App.css web/src/index.css web/src/App.test.tsx
git commit -m "Prepare frontend style boundaries"
```

## Task 2: Extract App Shell And Add Router Tests

**Files:**
- Create: `web/src/app/AppShell.tsx`
- Create: `web/src/app/AppShell.module.css`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add tests for route rendering and active nav**

Add focused tests proving direct navigation to `/calendar`, `/households`, `/family`, `/optimize`, and `/settings` renders the expected heading and marks the matching nav link active.

- [ ] **Step 2: Run tests to verify the new active-nav assertions fail before router adoption**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx -t "navigation"
```

Expected: fail because the current manual nav does not expose router-owned active state through `NavLink`.

- [ ] **Step 3: Move shell markup**

Move `AppShell` from `App.tsx` into `web/src/app/AppShell.tsx`. Keep the same props initially:

```ts
type AppShellProps = {
  children: React.ReactNode;
  currentPath: string;
  onNavigate: (path: string) => void;
};
```

- [ ] **Step 4: Move shell CSS**

Move only app shell selectors into `AppShell.module.css`: workspace shell, topbar, brand cluster, nav, menu button, icon button, user actions, and mobile nav behavior.

- [ ] **Step 5: Convert shell class names**

Replace shell global class strings with CSS Module references in `AppShell.tsx`.

- [ ] **Step 6: Verify**

Run:

```bash
npm.cmd run test -w web
npm.cmd run build -w web
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/app web/src/App.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Extract app shell component"
```

## Task 3: Replace Manual Routing With React Router

**Files:**
- Modify: `web/package.json`
- Modify: `package-lock.json`
- Modify: `web/src/App.tsx`
- Modify: `web/src/app/AppShell.tsx`
- Modify: `web/src/routes.ts`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Install React Router**

Run:

```bash
npm.cmd install react-router-dom -w web
```

- [ ] **Step 2: Wrap the app with router primitives**

Use `BrowserRouter`, `Routes`, `Route`, `Navigate`, `NavLink`, and `useNavigate`.

- [ ] **Step 3: Remove manual path state**

Delete `window.location`, `window.history.pushState`, `popstate`, and `normalizePath` usage from `App.tsx`.

- [ ] **Step 4: Update page navigation props**

Where pages currently receive `onNavigate`, pass a wrapper from `useNavigate`. Replace simple in-app anchor/button navigation with `Link` or `NavLink` when the element only changes routes and does not perform additional page behavior.

- [ ] **Step 5: Simplify `routes.ts`**

Keep route constants if useful, but remove `normalizePath` if no longer used.

- [ ] **Step 6: Verify**

Run:

```bash
npm.cmd run test -w web
npm.cmd run build -w web
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add web/package.json package-lock.json web/src/App.tsx web/src/app web/src/routes.ts web/src/App.test.tsx
git commit -m "Adopt React Router navigation"
```

## Task 4: Migrate Small Pages To CSS Modules

**Files:**
- Modify/create near: `web/src/pages/LandingPage.tsx`
- Modify/create near: `web/src/pages/SettingsPage.tsx`
- Modify/create near: `web/src/pages/FamilyPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Migrate Landing page styles**

Create `LandingPage.module.css`, move landing-only selectors, and replace class names with module references.

- [ ] **Step 2: Verify Landing page**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx -t "Landing"
```

Expected: pass.

- [ ] **Step 3: Migrate Settings page styles**

Create `SettingsPage.module.css`, move settings-only selectors, and replace class names with module references.

- [ ] **Step 4: Verify Settings page**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx -t "Settings"
```

Expected: pass.

- [ ] **Step 5: Migrate Family page styles**

Create `FamilyPage.module.css`, move family-only selectors, and replace class names with module references.

- [ ] **Step 6: Verify Family page**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx -t "Family"
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages web/src/App.css web/src/App.test.tsx
git commit -m "Move small page styles to CSS modules"
```

## Task 5: Split API Into Domain Services

**Files:**
- Create: `web/src/services/apiClient.ts`
- Create: `web/src/services/householdsApi.ts`
- Create: `web/src/services/choresApi.ts`
- Create: `web/src/services/recommendationsApi.ts`
- Modify: `web/src/api.ts`
- Modify imports in pages/state as needed

- [ ] **Step 1: Move transport code**

Move `API_BASE_URL`, `configureApiAuth`, and `apiFetch` into `services/apiClient.ts`.

- [ ] **Step 2: Move household APIs**

Move user, household, profile, structure, member, and invitation functions into `householdsApi.ts`.

- [ ] **Step 3: Move chore/calendar APIs**

Move chore, schedule, occurrence, completion, skip, archive, and restore functions into `choresApi.ts`.

- [ ] **Step 4: Move recommendation APIs**

Move recommendation generation, decisions, apply, and assistant chat functions into `recommendationsApi.ts`.

- [ ] **Step 5: Keep compatibility exports**

Make `web/src/api.ts` re-export from the new service modules so imports can migrate gradually.

- [ ] **Step 6: Verify**

Run:

```bash
npm.cmd run test -w web
npm.cmd run build -w web
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/api.ts web/src/services web/src/App.test.tsx
git commit -m "Split frontend API services by domain"
```

## Task 6: Extract Feature Components And Hooks

**Files:**
- Modify/create under `web/src/pages` or `web/src/features`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Extract Today components**

Move Today-specific row, status group, side panel, toast, and check-in sheet pieces out of `TodayDashboard.tsx`.

- [ ] **Step 2: Extract Optimize components**

Move assistant prompt, review queue, signal grid, chat thread, and recommendation review pieces out of `OptimizePage.tsx`.

- [ ] **Step 3: Extract Households components**

Move profile summary, floor selector, room cards, and room editor pieces out of `HouseholdsPage.tsx`.

- [ ] **Step 4: Move feature styles**

Create CSS Modules for each extracted feature group and remove the migrated selectors from `App.css`.

- [ ] **Step 5: Verify after each feature**

Run the relevant focused test after each extraction, then run:

```bash
npm.cmd run test -w web
npm.cmd run build -w web
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages web/src/features web/src/App.css web/src/App.test.tsx
git commit -m "Extract frontend feature components"
```

## Task 7: Split Calendar Last

**Files:**
- Modify/create near `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add focused Calendar behavior tests**

Protect month/week/day/list rendering, completed ordering, editor open/close, schedule creation/editing, and occurrence completion/skip behavior before splitting internals.

- [ ] **Step 2: Extract pure calendar helpers**

Move date range, labels, time calculations, recurrence helpers, and grouping helpers into a calendar utility module with unit tests where practical.

- [ ] **Step 3: Extract Calendar views**

Split month, week/day columns, and agenda/list views into separate components.

- [ ] **Step 4: Extract editor modal**

Move chore view/edit/create modal behavior into a focused component or small component group.

- [ ] **Step 5: Move Calendar styles**

Create Calendar CSS Modules and remove migrated selectors from `App.css`.

- [ ] **Step 6: Verify**

Run:

```bash
npm.cmd run test -w web -- App.test.tsx -t "Calendar"
npm.cmd run test -w web
npm.cmd run build -w web
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages web/src/features web/src/App.css web/src/App.test.tsx
git commit -m "Split Calendar feature internals"
```

## Task 8: Introduce TanStack Query

**Files:**
- Modify: `web/package.json`
- Modify: `package-lock.json`
- Modify: app providers and feature hooks

- [ ] **Step 1: Install TanStack Query**

Run:

```bash
npm.cmd install @tanstack/react-query -w web
```

- [ ] **Step 2: Add query provider**

Create a `QueryClient` provider near the authenticated app providers.

- [ ] **Step 3: Convert household loading first**

Replace `AppDataProvider` household loading state with query-backed loading, error, reload, and create-household mutation behavior.

- [ ] **Step 4: Convert feature-specific server state gradually**

Move Calendar occurrences, members, Optimize recommendations, and Family invitations to query-backed hooks.

- [ ] **Step 5: Verify**

Run:

```bash
npm.cmd run test -w web
npm.cmd run build -w web
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add web/package.json package-lock.json web/src
git commit -m "Introduce query-backed frontend server state"
```

## Task 9: Remove Legacy CSS And Final Verify

**Files:**
- Modify/delete: `web/src/App.css`
- Modify imports throughout `web/src`

- [ ] **Step 1: Find remaining global selectors**

Run:

```bash
rg "className=\"|className={`|App.css|legacy" web/src
```

- [ ] **Step 2: Migrate or delete remaining selectors**

Move any remaining feature-owned selectors into CSS Modules. Keep only true global rules in `styles/global.css`.

- [ ] **Step 3: Remove unused imports/files**

Delete `App.css` only when no component imports it.

- [ ] **Step 4: Final verification**

Run:

```bash
npm.cmd run test -w web
npm.cmd run build -w web
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "Remove legacy frontend global stylesheet"
```

## Self-Review Notes

- Spec coverage: routing, CSS ownership, component extraction, API services, TanStack Query, and tests are covered.
- Placeholder scan: no `TBD` or open-ended implementation placeholders remain.
- Sequencing: Calendar is intentionally last because it has the most behavioral surface area.
- Risk control: every task has focused verification plus full test/build gates.
