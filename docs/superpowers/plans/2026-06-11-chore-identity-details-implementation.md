# Chore Identity Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add accessible assignee initials to calendar chore cards and show assignee/importer/source details in the relevant detail modals.

**Architecture:** Keep the implementation local to `CalendarPage` and its existing CSS. Add small member lookup/render helpers, a non-button identity token, and a cleanly calendar event detail modal for imported/shared calendar events. Tests drive the behavior through `App.test.tsx`.

**Tech Stack:** React, TypeScript, CSS, Vitest, Testing Library.

---

### Task 1: Assignee Identity Tokens On Calendar Cards

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Write failing tests**

Add tests in `web/src/App.test.tsx` that render `/calendar` with existing calendar mocks and assert:

```ts
expect(await screen.findByRole("img", { name: "Assigned to Morgan Member" })).toHaveTextContent("MM");
expect(screen.queryByRole("img", { name: "Imported by Alex Owner" })).toBeNull();
```

Use the existing owner/member calendar fixture where `occurrence.assignedUserId` is `app-user-2`.

- [ ] **Step 2: Run red test**

Run:

```bash
npm.cmd test -- App.test.tsx -t "shows assignee initials on calendar chore cards"
```

Expected: FAIL because no identity token exists.

- [ ] **Step 3: Implement member helpers and token rendering**

In `web/src/pages/CalendarPage.tsx`, add helpers near `assignedMemberLabel`:

```ts
function memberForUserId(userId?: string) {
  if (!userId) return undefined;
  return members.find((item) => item.userId === userId || item.clerkUserId === userId);
}

function memberDisplayName(userId?: string, fallback = "Unknown member") {
  if (!userId) return "Unassigned";
  const member = memberForUserId(userId);
  if (member) return memberLabel(member);
  if (userId === currentUserId) return "You";
  return fallback;
}

function memberInitials(userId?: string) {
  const label = memberDisplayName(userId, "Unknown");
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function renderIdentityToken(label: string, initials: string) {
  return (
    <span className="calendar-identity-token" role="img" aria-label={label}>
      <span aria-hidden="true">{initials}</span>
      <span className="calendar-identity-tooltip" role="tooltip">{label}</span>
    </span>
  );
}
```

Update scheduled chore card renderers that already have metadata lines to include `renderIdentityToken("Assigned to ...", initials)`.
Do not add `tabIndex` when the token is inside an already-clickable calendar card; expose the helper from the parent card's hover/focus state instead.

- [ ] **Step 4: Add token CSS**

In `web/src/App.css`, add `.calendar-identity-token` and `.calendar-identity-tooltip` styles using the approved contrast colors and focus outline.

- [ ] **Step 5: Run green test**

Run:

```bash
npm.cmd test -- App.test.tsx -t "shows assignee initials on calendar chore cards"
```

Expected: PASS.

### Task 2: Chore Detail Modal Identity Source Rows

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Write failing test**

Add a test that opens `Clean bathrooms` and asserts the modal contains:

```ts
expect(screen.getByText("Assigned to")).toBeTruthy();
expect(screen.getByText("Morgan Member")).toBeTruthy();
expect(screen.getByText("Source")).toBeTruthy();
expect(screen.getByText("Manual chore")).toBeTruthy();
```

- [ ] **Step 2: Run red test**

Run:

```bash
npm.cmd test -- App.test.tsx -t "shows assignee and source details in the chore detail modal"
```

Expected: FAIL because modal summary is currently unlabeled.

- [ ] **Step 3: Implement modal metadata grid**

Replace the top `chore-view-summary` spans with labeled rows:

```tsx
<div className="chore-detail-meta-grid">
  <div><span>Assigned to</span><strong>{assignedMemberLabel(selectedOccurrence)}</strong></div>
  <div><span>When</span><strong>{occurrenceDateLine(selectedOccurrence)}</strong></div>
  <div><span>Date</span><strong>{format(parseISO(occurrencePrimaryDate(selectedOccurrence)), "EEEE, MMM d")}</strong></div>
  <div><span>Source</span><strong>{selectedChore?.source === "google-calendar" ? "Google Calendar" : "Manual chore"}</strong></div>
</div>
```

Use the selected chore already available through `editorDraft`/`selectedHousehold` lookup.

- [ ] **Step 4: Run green test**

Run:

```bash
npm.cmd test -- App.test.tsx -t "shows assignee and source details in the chore detail modal"
```

Expected: PASS.

### Task 3: Imported Event Detail Modal

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`

- [ ] **Step 1: Write failing test**

Use `mockCalendarWorkspaceFetches` with a `cleanlyCalendarEvents` item where `createdByUserId: "app-user-1"`. Render `/calendar`, click `View Soccer practice`, and assert:

```ts
expect(screen.getByRole("dialog", { name: "Calendar event details" })).toBeTruthy();
expect(screen.getByText("Imported by")).toBeTruthy();
expect(screen.getByText("Alex Owner")).toBeTruthy();
expect(screen.getByText("Source")).toBeTruthy();
expect(screen.getByText("Google Calendar")).toBeTruthy();
```

- [ ] **Step 2: Run red test**

Run:

```bash
npm.cmd test -- App.test.tsx -t "shows importer and source details for imported calendar events"
```

Expected: FAIL because cleanly calendar events are not clickable in normal mode.

- [ ] **Step 3: Implement selected cleanly event state and modal**

Add `selectedCleanlyCalendarEventId` state. In normal calendar mode, render cleanly events as buttons with `aria-label="View <title>"` and `onClick` that selects the event.

Render a detail modal when `selectedCleanlyCalendarEvent` exists:

```tsx
<section className="chore-editor-modal calendar-event-detail-modal" role="dialog" aria-modal="true" aria-label="Calendar event details">
  <div className="panel-heading">...</div>
  <div className="chore-detail-meta-grid">
    <div><span>When</span><strong>...</strong></div>
    <div><span>Duration</span><strong>...</strong></div>
    <div><span>Source</span><strong>{event.source === "google" ? "Google Calendar" : "Manual event"}</strong></div>
    <div><span>Imported by</span><strong>{memberDisplayName(event.createdByUserId)}</strong></div>
  </div>
</section>
```

- [ ] **Step 4: Run green test**

Run:

```bash
npm.cmd test -- App.test.tsx -t "shows importer and source details for imported calendar events"
```

Expected: PASS.

### Task 4: Full Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run full affected test file**

Run:

```bash
npm.cmd test -- App.test.tsx
```

Expected: all tests pass.

- [ ] **Step 2: Run web build**

Run:

```bash
npm.cmd run build
```

Expected: TypeScript and Vite build pass. Existing Vite large-chunk warning is acceptable.

- [ ] **Step 3: Commit**

Run:

```bash
git add web/src/App.test.tsx web/src/pages/CalendarPage.tsx web/src/App.css docs/superpowers/plans/2026-06-11-chore-identity-details-implementation.md
git commit -m "Add chore identity details to calendar"
```
