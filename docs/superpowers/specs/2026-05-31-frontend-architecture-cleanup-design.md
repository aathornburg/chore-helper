# Frontend Architecture Cleanup Design

Date: 2026-05-31

## Summary

Refactor the React frontend toward a standard, readable SPA architecture while preserving current product behavior and visual design. The cleanup should make the app feel closer to Angular's maintainability model: routes are explicit, components own their styles, API access is organized like services, and large page files are split into feature-owned pieces.

This is intentionally deferred behind near-term UI refinement work. The spec exists so the cleanup can be resumed without re-litigating the direction.

## Current State

The frontend is a Vite React app under `web/src`. It already has separate page files, shared app data state, and a centralized API module, but several files have grown past the point where they are easy to reason about:

- `web/src/App.css` is roughly 4,000 lines and owns styles for app shell, landing, Today, Calendar, Households, Optimize, Family, Settings, forms, modals, and responsive behavior.
- `web/src/pages/CalendarPage.tsx` is the largest page module and mixes date helpers, API orchestration, view state, render helpers, editor behavior, and markup.
- `web/src/App.tsx` still owns manual routing with `window.history`, `popstate`, local path state, and app shell navigation.
- `web/src/api.ts` is a useful service layer, but it combines all domains in one module.
- Tests are concentrated in `web/src/App.test.tsx`, which makes full-app behavior coverage possible but harder to keep focused as features split.

The problem is not that React lacks structure. The problem is that the current structure does not assign ownership strongly enough.

## Goals

- Make route ownership explicit with standard React Router primitives.
- Make styling component-owned with CSS Modules while keeping a small global token/reset layer.
- Split large page files into components and hooks that match product concepts.
- Organize API access into domain service modules rather than one growing file.
- Preserve the current UI and behavior unless a change is required to complete the refactor safely.
- Keep the migration incremental so UI refinements can continue before or during the cleanup.

## Non-Goals

- Do not redesign the UI as part of this cleanup.
- Do not change backend API contracts.
- Do not migrate to a different frontend framework.
- Do not introduce a large component library.
- Do not convert every file in one risky commit.

## Architecture

### Routing

Adopt React Router in declarative SPA mode:

- Wrap the authenticated app in `BrowserRouter`.
- Replace `normalizePath`, manual `popstate` handling, `window.history.pushState`, and hand-rolled `navigate()` calls.
- Use route declarations for `/today`, `/calendar`, `/households`, `/optimize`, `/family`, and `/settings`.
- Use `NavLink` in the app shell so active navigation state is owned by the router.
- Use `useNavigate` where pages need imperative navigation, such as Today linking to Calendar or Calendar linking to Settings.

React Router Data Router loaders/actions are intentionally deferred. The first routing pass should reduce custom navigation code without also changing the data-loading model.

### Styling

Use Vite-supported CSS Modules for component-owned styles:

- `web/src/styles/tokens.css` owns CSS custom properties for colors, spacing, radii, shadows, and typography primitives.
- `web/src/styles/global.css` owns reset/body/root-level global styling.
- Each substantial component or page owns a `*.module.css` file beside its implementation.
- Global selectors stay only for true globals, third-party integration styling, and temporary legacy coverage during migration.

`App.css` should be migrated down gradually. It can remain as `legacy.css` temporarily if needed, but it should stop being the permanent home for new styles.

### Components And Hooks

Move toward feature folders where each folder can be understood without reading the whole app:

- `app/` for providers, route composition, and shell layout.
- `pages/` or `features/` for route-level features.
- `components/` for genuinely shared UI primitives.
- `services/` for domain API modules.
- `hooks/` inside features when a hook is feature-specific.

Extract repeated UI patterns only when they are already repeated or clearly shared:

- `PageHeader`
- `Panel`
- `SegmentedControl`
- `EmptyState`
- `Modal`
- `IconButton`

Avoid building a design system prematurely. The goal is ownership and readability, not a large abstraction layer.

### Data And Services

Split `web/src/api.ts` into domain modules while preserving behavior:

- `services/apiClient.ts` for base URL, auth token injection, and `apiFetch`.
- `services/householdsApi.ts` for households, profiles, structure, members, and invitations.
- `services/choresApi.ts` for chores, schedules, occurrences, and completion actions.
- `services/recommendationsApi.ts` for recommendations and assistant chat.
- Keep a compatibility barrel if needed so intermediate commits can migrate imports safely.

Introduce TanStack Query after routing and style ownership are stable. Use it for server-state concerns that are currently hand-managed in page components: loading, error, caching, invalidation, and mutations.

### Testing

Keep behavior protected while files move:

- Add routing tests before replacing manual routing.
- Add focused tests around app shell navigation and active link state.
- Add Calendar behavior tests before splitting Calendar internals.
- Move tests closer to feature boundaries once the corresponding feature is extracted.
- Continue running `npm.cmd run test -w web` and `npm.cmd run build -w web` during the migration.

## Migration Strategy

Use small, reviewable commits:

1. Add global token/reset structure without removing `App.css`.
2. Extract app shell and navigation into their own component and CSS Module.
3. Add React Router and remove manual path state.
4. Move smaller page styles into CSS Modules first: Landing, Settings, Family.
5. Split API services by domain while keeping compatibility exports.
6. Extract feature hooks/components from Today, Optimize, and Households.
7. Split Calendar last, with tests protecting date/view/editor behavior.
8. Introduce TanStack Query once API and feature boundaries are clear.
9. Remove the remaining legacy global CSS when no selectors depend on it.

## Success Criteria

- `App.tsx` is composition-only: auth gates, providers, router, and app routes.
- `App.css` is removed or reduced to a temporary legacy file with a clear deletion path.
- Major pages no longer mix API orchestration, helpers, component markup, and all styling in one file.
- New features have an obvious place to live.
- Existing tests pass, build passes, and direct navigation to each route still works.

## Assumptions

- The current visual refresh remains the baseline design.
- CSS Modules are the preferred styling strategy because they are native to the Vite toolchain and map well to Angular-style component stylesheets.
- React Router should be adopted before TanStack Query.
- TanStack Query is desirable, but not part of the first mechanical split unless a specific feature migration benefits from it.
