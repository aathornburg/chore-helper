# Calendar Sync Actions Placement Design

Date: 2026-06-04

## Summary

Move active Google Calendar import and export work out of Settings and into the Calendar page. Settings should remain the place for durable sync configuration: Google connection state, source calendar choice, privacy defaults, export destination, personal export defaults, and owner-managed member import policy. Calendar should become the place where users do the work: import external events, export Cleanly events, and, for owners, review the shared Cleanly calendar queue.

Selected direction: **Calendar toolbar + focused import/export modals**.

## Goals

- Make import/export feel like "working my calendar" instead of "changing my settings."
- Keep Settings calmer and more clearly scoped to persistent preferences.
- Put calendar sync actions near `Add chore`, where users already manage scheduled work.
- Preserve strict permissions:
  - Members manage their own import submissions and export actions.
  - Owners manage the household import queue.
  - Owners do not control member export settings.
- Keep import and export independent: exporting Cleanly events must not require importing personal Google events.

## Non-Goals

- Do not change Google OAuth, token storage, or provider API behavior.
- Do not add background sync, polling, webhooks, or cron jobs.
- Do not introduce a separate top-level navigation page for sync in this slice.
- Do not expose owner queue actions to non-owners.
- Do not remove sync preferences from Settings.

## Information Architecture

### Settings

Settings owns durable configuration only.

Keep these controls in Settings:

- Google Calendar connection and reconnect state.
- Source calendar selection.
- Privacy default, with `Busy only` as the default.
- Export destination calendar.
- Export mode and export content preference.
- Owner-only family import controls:
  - Per-member import mode: `Off`, `Review first`, or `Auto-add`.
  - Per-member allowed import content: `Chores`, `Commitments`, or `Both`.
- Calendar display preferences such as week start day.

Remove these active work actions from Settings:

- `Review events to share`.
- Inline imported-event candidate review.
- `Send selected to Cleanly`.
- Any export review or export execution action.

Settings copy should point users to Calendar for active work. Example:

> Choose which calendars Cleanly can review here. When you are ready to import or export events, use Calendar.

### Calendar

Calendar owns active sync work.

Add compact sync actions near the existing `Add chore` button:

- `Import events`
- `Export`
- `Add chore`

Use secondary styling for `Import events` and `Export`; keep `Add chore` as the primary action. If space is tight on mobile, collapse `Import events` and `Export` into a compact `Sync` menu or stacked action row, but do not move them back into Settings.

Keep the owner import queue on Calendar near the top of the page. The queue should appear above the calendar workspace when there are pending items or when an owner intentionally opens the queue. It should not become a permanent heavy panel for every user state.

## Import Flow

`Import events` opens a focused modal or mobile sheet.

The modal should:

- Show the selected source calendar and privacy default, with a link to Settings for changes.
- Fetch import candidates from the user's connected provider.
- Show candidate events in a selectable list.
- Let the member choose the proposed type for each selected event: `Commitment` or `Chore`, constrained by the owner policy.
- Submit selected events to Cleanly.

Submission behavior remains governed by the owner policy:

- `Off`: show a blocked state explaining that the household owner has disabled imports for this member.
- `Review first`: send selected events to the owner queue.
- `Auto-add`: create Cleanly calendar events immediately while preserving source metadata.

The modal should close after a successful submission and show a concise Calendar-level status message.

## Export Flow

`Export` opens a focused modal or mobile sheet.

The modal should:

- Show the configured export destination and export content mode.
- Make clear that export does not require importing Google events.
- Show eligible visible Cleanly events, filtered by the user's export content preference.
- In review mode, let the user confirm selected events before export.
- In auto mode, still require the user to trigger export manually in this MVP.

Blocked states:

- No connected Google account: prompt the user to connect in Settings.
- No export destination: prompt the user to choose a destination in Settings.
- No eligible visible events: explain that there is nothing to export for the current calendar range.

## Owner Queue

Owners continue to see the import queue on Calendar. Non-owners must not see the queue.

The queue remains the shared-calendar gatekeeper:

- Pending imported events appear in a compact queue table.
- Selecting a queue item opens or updates a detail rail/panel.
- Owners can approve or reject.
- Owners can adjust the proposed type when allowed.

The queue belongs on Calendar because approving an imported commitment changes what appears on the shared calendar. It is active calendar work, not a setting.

## Interaction Copy

Preferred labels:

- Calendar toolbar:
  - `Import events`
  - `Export`
  - `Add chore`
- Import modal title:
  - `Import calendar events`
- Import submit:
  - `Send selected to Cleanly`
- Export modal title:
  - `Export Cleanly events`
- Export submit:
  - `Export selected`

Avoid labels that imply automatic broad sync, such as `Sync everything` or `Import calendar`.

## Visual Direction

Use the selected visual comparison file as the reference:

- `docs/calendar-sync-placement-options.html`

The target direction is Option A:

- Calendar header action row.
- Owner queue as a compact strip/table above the calendar workspace.
- Focused import/export modal instead of permanent side panels.
- Settings as a calm configuration page.

## Accessibility

- Import and export modals must use proper dialog semantics.
- The triggering button should regain focus after the modal closes.
- Candidate lists must use checkbox labels with event titles and times.
- Queue approve/reject actions must retain clear accessible labels.
- Status messages should use `role="status"` where they report async outcomes.

## Testing

Web tests should cover:

- Settings no longer renders `Review events to share`.
- Settings still renders connection, source calendar, privacy, export destination, and owner policy controls.
- Calendar renders `Import events`, `Export`, and `Add chore`.
- Clicking `Import events` opens the import modal.
- Clicking `Export` opens the export modal.
- Non-owners do not see owner queue controls.
- Owners can still see and act on pending queue items.
- Import blocked state appears when the member's import policy is `off`.
- Export blocked state appears when no destination calendar is configured.

Manual verification should cover:

- Desktop Calendar action row alignment.
- Mobile Calendar action behavior.
- Settings no longer feels like the sync workbench.
- Import and export copy clearly explain that import and export are independent.

## Open Implementation Notes

- The current Settings page owns import candidate state. That state should move into a Calendar-owned import modal component.
- Calendar already imports `exportCleanlyCalendarEvents`; this behavior should move from the integration strip into the Export modal.
- The existing Calendar integration strip can be removed or reduced to a small setup/error prompt if the user has no connection.
- Keep this implementation scoped to UI and client orchestration unless backend gaps are discovered during implementation.
