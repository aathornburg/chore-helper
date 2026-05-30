# Calendar Density View Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Calendar month/week/list views scannable by showing sparse chore cards and moving full occurrence context into a read-only view modal.

**Architecture:** `CalendarPage.tsx` keeps the current data loading and schedule edit flow, but introduces a separate `view` editor mode for read-only occurrence details. Compact calendar cards become clickable buttons/articles with view behavior, while edit remains a modal action from the view modal.

**Tech Stack:** React, TypeScript, date-fns, Vitest, Testing Library, CSS.

---

### Task 1: Lock The Sparse Calendar Behavior

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Write failing tests**

Add tests that assert month and week cards only show the chore title in the calendar grid, week uses one left time rail instead of repeated per-day hour labels, day cards omit the flexible chip, and clicking a card opens a view modal with `Edit`, `Complete`, and `Close`.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test -w web -- App.test.tsx`

Expected: tests fail because compact cards still show metadata/actions and no view modal exists.

- [ ] **Step 3: Implement sparse card rendering**

Add a compact rendering helper that accepts `detailLevel: "title" | "summary"` and renders a clickable card. Month and week pass `"title"`. Day and list pass `"summary"`.

- [ ] **Step 4: Implement a shared week time rail**

Change week rendering from per-column slot labels to a grid with one `.calendar-time-rail` column and day columns that share row heights.

- [ ] **Step 5: Implement view modal**

Add `EditorMode = "closed" | "create" | "view" | "edit"`. Clicking any chore sets selected occurrence and opens view mode. View mode shows title, date/timing, assignee, instructions/tags when available, upcoming occurrences, historical occurrences from currently loaded occurrences, an x icon at top-right, `Close` bottom-left, primary `Edit`, and secondary `Complete`.

- [ ] **Step 6: Keep edit modal focused**

Remove upcoming occurrences and history from edit mode. Leave schedule series and occurrence timing controls in edit mode.

- [ ] **Step 7: Verify green**

Run:
- `npm.cmd test -w web -- App.test.tsx`
- `npm.cmd run typecheck -w web`
- `npm.cmd run build -w web`
- `git diff --check`

Expected: all pass.

- [ ] **Step 8: Browser verify**

Open `http://localhost:5173/calendar`, inspect month/week/day/list density, click chore cards, confirm the view modal action placement and x icon.
