# Mobile Week Calendar Design

## Goal

Make the Calendar week view readable and usable on phones without squeezing the desktop seven-column time grid into a narrow viewport.

The mobile Calendar page should also feel calendar-first. When a user taps Calendar on a phone, the first impression should be the calendar surface and the selected day's work, not a stack of management buttons.

## Approved Direction

Use a mobile-only Week surface built around a week strip and selected-day agenda.

- Desktop and wider tablet Week view stays as the current time-grid layout.
- On mobile, Week view shows a compact seven-day strip at the top.
- Each day in the strip is a tap target with the day label, date, selected state, today state, and item count.
- Below the strip, show a selected-day agenda with readable chore and calendar-event rows.
- Tapping a day updates the agenda.
- Tapping an agenda row opens the existing chore detail or calendar event detail modal.
- Mobile header actions are compressed so they do not push the calendar below the fold.

This mirrors the mobile Month pattern: the calendar grid answers "which days have work?" and the agenda answers "what is scheduled for this selected day?"

## Mobile Calendar Header And Actions

On mobile, the Calendar page should use a compact command area above the calendar.

Rules:

- Do not stack full-width `Add event`, `Calendar actions`, import, or export buttons above the calendar.
- Use a single compact `Calendar actions` trigger in the mobile header or calendar control row.
- Put `Add event`, `Import events`, and `Export events` inside that action menu, with `Add event` first.
- The action trigger may use an icon, short label, or icon plus label, but it must have an accessible name of `Calendar actions`.
- The menu closes after an action is chosen, when Escape is pressed, and when the user clicks outside it.
- Keyboard users can open the menu, tab through its actions, and return focus predictably when it closes.
- Desktop and wider tablet layouts may keep `Add event` visible as a primary action.

The mobile header should preserve useful context, but keep it compact. The period label, view selector, filters, and action menu should be arranged so the Week strip is visible quickly on a normal phone viewport.

## Mobile Week Strip

The week strip should show all seven days in one row.

Each day button should include:

- Short weekday label.
- Date number.
- Work count.
- Selected state.
- Today state when applicable.

The strip should not render full chore rows. It should stay stable and compact, with consistent hit targets.

Default selected date:

- If today falls within the focused week, select today.
- Otherwise select the first day of the focused week.

## Selected-Day Agenda

The selected-day agenda appears below the strip.

The agenda should:

- Use the selected date as its heading.
- Render flexible chores, timed chores, and imported calendar events as readable rows.
- Preserve existing row click behavior and accessible names.
- Use the current compact chore row styling where practical, including right-side assignee initials.
- Display start time and duration for timed work, not end-time ranges.
- Show a calm empty state when the selected day has no work.

Ordering:

- Flexible or anytime work appears first under an "Anytime" grouping when present.
- Timed items follow in chronological order.
- Completed items remain visually distinct and sort after active items within their group.

## Scroll Behavior

When a user taps a day in the mobile Week strip, the agenda may scroll into view.

Rules:

- Only auto-scroll on mobile-sized layouts.
- Only auto-scroll after an explicit day tap.
- Do not auto-scroll on initial render or when navigating to the previous/next week.
- Use smooth scrolling when supported.

This should reuse the mobile Month selected-agenda scroll behavior where possible.

## Accessibility

The mobile Week view must remain keyboard and screen-reader friendly.

Requirements:

- Each day button has an accessible label such as `Select Friday, May 29, 3 items`.
- The selected day exposes selected or pressed state.
- Item counts are included in accessible labels, not only visual badges.
- The selected-day agenda is a named region.
- Agenda rows remain normal buttons with existing accessible names.
- Keyboard users can select a day, then tab into the agenda rows.
- The mobile action menu trigger exposes expanded or collapsed state.
- The mobile action menu items are reachable without trapping focus.
- Desktop Week semantics stay unchanged.

## Responsive Behavior

This design applies only at the mobile breakpoint already used for the compact Month view.

On desktop, Week remains the existing time-grid view with the time rail and seven day columns. If later testing shows tablet layouts are also cramped, the mobile Week pattern can expand upward, but that is outside this first implementation.

The mobile header cleanup also applies at the same breakpoint. The goal is not only to make Week readable once selected, but to make the whole mobile Calendar entry point feel like a calendar immediately.

## Testing

Add tests for:

- Mobile Calendar renders one compact `Calendar actions` trigger instead of stacked top action buttons.
- Opening mobile `Calendar actions` reveals `Add event`, `Import events`, and `Export events`.
- Mobile Calendar shows the calendar surface without requiring the user to scroll past header action buttons.
- Mobile Week renders the week strip and selected-day agenda instead of the desktop time rail.
- Selecting a day updates the selected-day agenda.
- Agenda rows open existing chore and calendar event detail modals.
- Empty selected days show an empty agenda state.
- Tapping a day scrolls to the agenda on mobile but not on initial render.
- Desktop Week behavior remains unchanged.

## Out Of Scope

- Changing desktop Week layout.
- Changing mobile Month behavior.
- Adding drag-and-drop on mobile Week.
- Adding a new route for agenda details.
- Reworking import/export behavior beyond how actions are surfaced on mobile.
