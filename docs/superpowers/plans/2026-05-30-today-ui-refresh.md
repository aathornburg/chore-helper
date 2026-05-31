# Today UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the authenticated app shell and Today page toward the selected Option A direction: compact header, prominent Optimize CTA, status metrics, week rail, daily agenda, upcoming cards, household summary, and mobile-friendly layout.

**Architecture:** Keep the existing manual routing and data loading. Refactor Today's render structure into clearer UI sections inside `TodayDashboard.tsx`, add small local SVG icons, and update `App.css` to support the new desktop/mobile layout. No API or schema changes.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, existing `date-fns` utilities.

---

## Key Changes

- Create `web/src/components/AppIcons.tsx` with local SVG icons for navigation/actions: optimize sparkle, bell, chevrons, check, empty circle, calendar, clock, home, users, menu, close.
- Update `web/src/App.tsx` shell:
  - Keep `/` routing to Today.
  - Keep nav order as `Optimize`, `Today`, `Calendar`, `Households`, `Family`, `Settings`.
  - Make Optimize visually prominent but not the active route unless selected.
  - Add a mobile menu button and responsive nav behavior.
  - Keep Clerk `UserButton`; add a notification icon button for the screenshot-style shell.
- Update `web/src/pages/TodayDashboard.tsx`:
  - Replace the large hero-card feel with a compact page header.
  - Add top status metrics: completed, to do, skipped, estimated remaining time.
  - Keep the seven-day strip, but style it as a week carousel/rail with selected-day emphasis.
  - Convert the selected-day area into a table-like agenda with `TO DO`, `DONE`, and `SKIPPED` sections.
  - Show completed chores inline with a check icon and retain "Improve future suggestions."
  - Keep the completion toast and check-in sheet.
  - Keep merged/by-household toggle.
  - Keep upcoming next 7 days and household cards as right-rail content on desktop, stacked on mobile.
- Update `web/src/App.css`:
  - Add the Option A visual system: compact shell, off-white canvas, dark green CTA, subtle borders, tight rows, no large hero cards on Today.
  - Add responsive rules for browser-window resizing only: desktop two-column layout, tablet stacked sections, mobile compact topbar + scroll-safe content.
  - Ensure no text overlap, no clipped buttons, and touch-friendly row actions.

## Test Plan

- Update `web/src/App.test.tsx` coverage:
  - Header renders `Optimize` first and marks it with the primary nav class.
  - Today renders the compact status metrics: done, to do, skipped, remaining time.
  - Today renders the week rail with selectable dates and selected-day emphasis.
  - Today renders `TO DO`, `DONE`, and `SKIPPED` sections with inline completed chores.
  - "View full calendar" navigates to Calendar.
  - Completion still updates the row, shows the toast, and opens "Add details."
  - Mobile menu button toggles primary navigation visibility.
- Run:
  - `npm run test -w web`
  - `npm run build -w web`
- Visual validation:
  - Start `npm run web:dev`.
  - Inspect Today in the browser at desktop width.
  - Resize the same browser window down to mobile width and confirm header, week rail, agenda rows, toast, and action buttons remain usable.

## Task Breakdown

### Task 1: Lock Expected Today Refresh Behavior With Tests

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] Add or update tests that assert the nav order remains `Optimize`, `Today`, `Calendar`, `Households`, `Family`, `Settings`.
- [ ] Add or update tests that assert `Optimize` has `is-primary-nav-action`.
- [ ] Add tests that assert Today shows status summary labels: `done`, `to do`, `skipped`, `hrs remaining`.
- [ ] Add tests that assert Today shows `View full calendar`.
- [ ] Add tests that assert completed chores render inline in the `DONE` section rather than inside a drawer-only affordance.
- [ ] Add tests that assert the mobile menu button can open and close nav.
- [ ] Run `npm run test -w web -- App.test.tsx` and confirm the new/updated tests fail for the missing UI.

### Task 2: Add Local Icon Components

**Files:**
- Create: `web/src/components/AppIcons.tsx`

- [ ] Add typed SVG components with `aria-hidden="true"` by default.
- [ ] Export only icons needed by shell and Today: `SparklesIcon`, `BellIcon`, `MenuIcon`, `CloseIcon`, `ChevronLeftIcon`, `ChevronRightIcon`, `CheckIcon`, `CircleIcon`, `CalendarIcon`, `ClockIcon`, `HomeIcon`, `UsersIcon`.

### Task 3: Refresh App Shell Header

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.css`

- [ ] Import shell icons.
- [ ] Add mobile nav state to `AppShell`.
- [ ] Add a notification icon button before `UserButton`.
- [ ] Make brand, Optimize CTA, nav links, notification, and user controls match the compact screenshot direction.
- [ ] On mobile, expose navigation through a menu button and keep Optimize easy to find.

### Task 4: Restructure Today Page Markup

**Files:**
- Modify: `web/src/pages/TodayDashboard.tsx`

- [ ] Replace the current `workspace-hero` Today header with page title, status metric row, short encouragement/status sentence, and `View full calendar` action.
- [ ] Rework the seven-day strip into a week rail with left/right chevron buttons for visual consistency. The initial implementation can keep the same seven dates; chevrons can be non-mutating controls unless range navigation is already trivial from existing state.
- [ ] Rework selected-day content into a main agenda panel with `TO DO`, `DONE`, and `SKIPPED` section labels.
- [ ] Render table-like rows with status icon, chore title, detail line, household chip, assignee, duration/time, and completion/check-in actions.
- [ ] Keep existing data flow and completion/check-in behavior.

### Task 5: Add Right Rail and Mobile Stack

**Files:**
- Modify: `web/src/pages/TodayDashboard.tsx`
- Modify: `web/src/App.css`

- [ ] Move "Upcoming next 7 days" and "Households" into a right rail on desktop.
- [ ] Stack right-rail panels below the agenda on mobile.
- [ ] Keep existing empty/loading/error states, but make them fit the new compact page style.

### Task 6: Polish Responsive Styling

**Files:**
- Modify: `web/src/App.css`

- [ ] Add layout rules for desktop: page shell with main agenda plus right rail.
- [ ] Add layout rules for tablet: agenda and rail stack cleanly.
- [ ] Add layout rules for mobile: compact header, mobile nav menu, horizontally scrollable week rail, dense agenda rows.
- [ ] Verify text fits inside buttons and rows.
- [ ] Keep border radii restrained and avoid nested-card styling.

### Task 7: Verify and Commit

**Commands:**
- [ ] Run `npm run test -w web`.
- [ ] Run `npm run build -w web`.
- [ ] Run `npm run web:dev`.

**Browser validation:**
- [ ] Open Today at the local dev URL.
- [ ] Resize the browser window manually to mobile width.
- [ ] Confirm the UI still exposes navigation, Optimize emphasis, Today metrics, week rail, chore completion, toast, and check-in sheet.

**Commit:**
- [ ] Commit after tests/build/browser validation pass with a message like `Refresh Today dashboard UI`.

## Assumptions

- Option A is the selected visual direction, using the screenshot as the north star rather than a pixel-perfect clone.
- No backend changes are needed.
- No new icon dependency will be added; local SVG icons are enough.
- Mobile validation means resizing the browser window, not device emulation.
