# Calendar Sync Actions Placement Design

Date: 2026-06-04

## Summary

Move active Google Calendar import and export work out of Settings and into the Calendar page. Settings should remain the place for durable sync configuration: Google connection state, source calendar choice, privacy defaults, export destination, personal export defaults, and owner-managed member import policy. Calendar should become the place where users do the work: import external events, export Cleanly events, and, for owners, review the shared Cleanly calendar queue.

Selected direction: **Calendar toolbar actions with focused import review and export selection mode**.

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

Use a hybrid pattern: fast review once the user is familiar, with helpful onboarding or blocked states when setup is incomplete.

### Import First-Run and Blocked States

If the user has connected Google Calendar but has not completed their first import, the modal opens with a prominent first-run intro above the controls:

- "You're connected. Choose which Google Calendar events Cleanly can use."
- Explain that nothing is shared until the user selects events and sends them to Cleanly.
- Explain that the household owner may review selected events before they appear on the shared calendar.

After the first successful import, replace the prominent intro with a compact reminder strip:

- Source calendar.
- Privacy default.
- Household import policy.
- `Change in Settings` link.

Blocked states:

- No Google connection: explain that Google Calendar must be connected first and provide `Go to Settings`.
- No source calendar: explain that a source calendar is needed and provide `Choose in Settings`.
- Owner policy `Off`: explain that this household does not currently allow this member to send calendar events to Cleanly.

### Import Controls

The modal should include lightweight session controls:

- `From calendar`: source Google calendar selector.
- `Date range`: range-picker control, defaulting to the current visible Calendar range.
- Privacy default summary, read-only, with `Change in Settings`.

The date range picker should be a single calendar popover:

- User clicks a start date first, then an end date.
- Dates between start and end receive a soft range background.
- Start and end dates receive stronger endpoint styling.
- Hovering after selecting the start date previews the candidate range.
- Presets such as `This week`, `Next 2 weeks`, and `This month` may sit above the calendar picker, but the picker is the primary range selection affordance.

### Import Review

The modal should:

- Fetch import candidates from the user's connected provider.
- Show candidate events in a selectable list.
- Select no candidate events by default.
- Provide a simple batch default toggle for selected event type: `Commitments` or `Chores`.
- Let individual rows override the batch type when needed.
- Keep the row override visually light; avoid making every row feel like a dense form.
- Submit selected events to Cleanly.

Submission behavior remains governed by the owner policy:

- `Off`: show a blocked state explaining that the household owner has disabled imports for this member.
- `Review first`: send selected events to the owner queue.
- `Auto-add`: create Cleanly calendar events immediately while preserving source metadata.

The modal should close after a successful submission and show a concise Calendar-level status message.

## Export Flow

`Export` starts a temporary Calendar export selection mode instead of opening a traditional modal immediately.

Export uses the actual Calendar as the selection surface and a dedicated export panel or mobile sheet as the control and confirmation surface.

### Entering Export Mode

When the user clicks `Export`:

- Calendar enters an obvious temporary export mode.
- Nothing is selected by default.
- Eligible events receive a subtle selectable affordance.
- Ineligible events remain visible but muted.
- Already exported events remain visible with a quiet "already exported" state.
- The page shows a clear `Cancel` or `Exit export mode` action.
- The export panel/sheet appears with selection controls and summary.

Export mode should not feel like a hidden state. Use a clear mode banner or panel title such as `Exporting Cleanly events`.

### Export Panel Controls

The export panel should include:

- `From Cleanly`: content selector for `Chores`, `Commitments`, or `Both`, respecting the user's export content setting.
- `To calendar`: destination Google calendar selector.
- `Date range`: range-picker control, defaulting to the current visible Calendar range.
- A clear note that export does not require importing Google events.

The date range picker should match the Import modal range picker:

- User clicks start date first, then end date.
- The in-between range is highlighted.
- Hover preview shows the candidate range before the second click.
- On mobile, the picker opens in a bottom sheet or near-full-screen panel so the calendar grid has room.

### Batch Selection

The panel should make range-based selection easy:

- Primary helper button starts as `Select eligible events in range`.
- Button copy may become more specific based on filters:
  - `Select 8 eligible events`
  - `Select 6 chores`
  - `Select 2 commitments`
- Clicking the helper selects all exportable events matching the date range and content filter.
- Users can then click individual Calendar events to deselect or reselect them.
- Provide `Clear selection` after one or more events are selected.

The selected date range should lightly highlight matching days on the Calendar surface. Events outside the range should remain visible but de-emphasized.

### Export Summary

The panel should update live as the user changes range, content, destination, or event selection:

- Selected event count.
- Chore count.
- Commitment count.
- Already exported count.
- Not eligible count.
- Destination calendar.

This is the selected C-style summary, but it should support the batch-selection workflow rather than forcing users to click every event one by one.

### Export Confirmation

The final action is `Export selected`.

In review mode, the export panel is the review surface. In auto mode, the user still explicitly triggers export in this MVP; auto mode should not background-export without user action.

Blocked states:

- No connected Google account: prompt the user to connect in Settings.
- No export destination: prompt the user to choose a destination in Settings.
- No eligible events in range: explain that there is nothing exportable for the selected date range/content filter.
- No events selected: keep `Export selected` disabled and explain that the user can select events from the Calendar or use the batch selection helper.

### Exit Behavior

When export succeeds:

- Exit export mode.
- Clear export selection.
- Show a Calendar-level status message with the exported count.

When the user cancels:

- Exit export mode.
- Clear export selection.
- Return focus to the `Export` button.

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
- Export mode title:
  - `Exporting Cleanly events`
- Export panel action:
  - `Select eligible events in range`
- Export submit:
  - `Export selected`

Avoid labels that imply automatic broad sync, such as `Sync everything` or `Import calendar`.

## Visual Direction

Use the selected visual comparison file as the reference:

- `docs/calendar-sync-placement-options.html`

The target direction is Option A for placement, with the export flow refined by the later export selection mode decision:

- Calendar header action row.
- Owner queue as a compact strip/table above the calendar workspace.
- Focused import modal instead of permanent side panels.
- Export selection mode using the Calendar as the selection surface.
- Export panel/sheet with range controls, batch selection, and live summary.
- Settings as a calm configuration page.

The export ideation artifact is:

- `docs/export-modal-visual-options.html`
- `docs/export-selection-mode-concept.html`

The first artifact shows the earlier modal alternatives. The second artifact captures the selected final direction: Option C's summary-first panel combined with direct event selection on the Calendar page.

## Accessibility

- Import modal must use proper dialog semantics.
- Export mode must announce that the Calendar has entered a temporary selection mode.
- The triggering button should regain focus after the modal closes.
- Export mode cancel/success should return focus to the `Export` button.
- Candidate lists must use checkbox labels with event titles and times.
- Exportable calendar events must expose selected/unselected state to assistive technology.
- Batch selection and clear-selection controls must be keyboard accessible.
- The date range picker must support keyboard navigation, visible focus, and non-pointer date selection.
- The date range picker must announce start date, end date, and in-range dates clearly.
- Queue approve/reject actions must retain clear accessible labels.
- Status messages should use `role="status"` where they report async outcomes.

## Mobile Requirements

Import:

- Use a full-width bottom sheet or near-full-screen dialog.
- Keep the first-run intro concise so controls are visible without excessive scrolling.
- Put source calendar and date range controls before the candidate list.
- Keep the submit action sticky at the bottom of the sheet.

Export:

- The Calendar remains the selection surface, but the export panel becomes a bottom sheet.
- The bottom sheet should support collapsed and expanded states:
  - Collapsed: selected count, destination, `Export selected`, `Cancel`.
  - Expanded: destination selector, content filter, date range picker, batch selection helper, summary counts.
- Opening the date range picker should expand into a near-full-screen picker so the calendar grid is usable.
- Event selection must remain possible without tiny tap targets; selected event cards need clear visual state.
- Avoid requiring horizontal scrolling for export controls.

## Testing

Web tests should cover:

- Settings no longer renders `Review events to share`.
- Settings still renders connection, source calendar, privacy, export destination, and owner policy controls.
- Calendar renders `Import events`, `Export`, and `Add chore`.
- Clicking `Import events` opens the import modal.
- Clicking `Export` enters export selection mode.
- Export mode starts with no selected events.
- Export mode can select all eligible events in the selected range.
- Export mode allows individual event deselection after batch selection.
- Export mode exits on cancel and after successful export.
- Non-owners do not see owner queue controls.
- Owners can still see and act on pending queue items.
- Import blocked state appears when the member's import policy is `off`.
- Export blocked state appears when no destination calendar is configured.

Manual verification should cover:

- Desktop Calendar action row alignment.
- Mobile Calendar action behavior.
- Desktop export mode event selection and panel behavior.
- Mobile export bottom-sheet behavior.
- Settings no longer feels like the sync workbench.
- Import and export copy clearly explain that import and export are independent.

## Open Implementation Notes

- The current Settings page owns import candidate state. That state should move into a Calendar-owned import modal component.
- Calendar already imports `exportCleanlyCalendarEvents`; this behavior should move from the integration strip into the Export selection mode.
- The existing Calendar integration strip can be removed or reduced to a small setup/error prompt if the user has no connection.
- Keep this implementation scoped to UI and client orchestration unless backend gaps are discovered during implementation.
