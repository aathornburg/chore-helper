# App.tsx refactor design

Date: 2026-05-18

## Summary

Refactor `web/src/App.tsx` into smaller, more maintainable React modules while preserving the existing application behavior and manual route handling.

## Goal

Make the React frontend easier to understand and maintain by separating page UI, routing logic, and utility helpers into focused files.

## Scope

- Extract page components from `web/src/App.tsx` into separate files.
- Add a lightweight route abstraction in `web/src/routes.ts`.
- Move shared helper functions into `web/src/utils/household.ts`.
- Keep top-level state management and effects in `web/src/App.tsx`.
- Preserve `PlanReview.tsx`, `api.ts`, and existing app flow.

## Design

### Top-level application structure

`web/src/App.tsx` will remain the top-level component for:

- app state (`path`, `householdSetup`)
- browser history synchronization
- loading saved household data
- navigation via `navigate()`
- saving household baseline
- rendering the selected page inside `AppShell`

`App.tsx` will import the extracted page components and route helper instead of defining them inline.

### Pages and components

Create separate component files for each page:

- `web/src/pages/LandingPage.tsx`
- `web/src/pages/TodayDashboard.tsx`
- `web/src/pages/SetupPage.tsx`
- `web/src/pages/FamilyPage.tsx`
- `web/src/pages/SettingsPage.tsx`

Each page file will export a React component with the props it needs, matching the current behavior.

`PlanReview.tsx` is already componentized and will remain unchanged.

### Route abstraction

Create `web/src/routes.ts` to contain:

- the route list (`/today`, `/setup`, `/plan`, `/family`, `/settings`)
- the `AppRoute` type
- `normalizePath(pathname: string): AppRoute | "/"`
- a small helper such as `getPageComponent(path: string, props)` if needed

This keeps route constants and normalization logic out of `App.tsx` while preserving the manual routing approach.

### Shared helpers

Move utility functions from `App.tsx` into `web/src/utils/household.ts`:

- `parseList(value: string): string[]`
- `parseFlooring(value: string): FlooringType[]`
- `formatBaselineSummary(baseline: HouseholdBaseline): string`

The route normalization helper will live in `routes.ts` instead of `household.ts`.

### Props and types

Keep the existing `HouseholdSetupState` and `SetupFormValues` types in `App.tsx` if they are only used there. If page components also use them, export the shared types or move them into a small `web/src/types.ts` file.

### Rendering behavior

`App.tsx` will continue to render pages conditionally based on `path`:

- `path === "/"` renders `<LandingPage />`
- otherwise, render `<AppShell>` with page children

This refactor will preserve the current UX while moving code into smaller files.

## Files to create

- `web/src/pages/LandingPage.tsx`
- `web/src/pages/TodayDashboard.tsx`
- `web/src/pages/SetupPage.tsx`
- `web/src/pages/FamilyPage.tsx`
- `web/src/pages/SettingsPage.tsx`
- `web/src/routes.ts`
- `web/src/utils/household.ts`

## Files to update

- `web/src/App.tsx`

## Verification

After refactor:

- run `npm test` from `web`
- run `npm run build` from `web`
- verify the app still navigates correctly and the household setup flow works
