# Mobile Month Calendar Design

## Goal

Make the Calendar month view usable on phones without squeezing desktop-sized chore cards into seven narrow columns.

## Approved Direction

Use a compact mobile-only month surface:

- The Month view remains a recognizable seven-column calendar grid.
- Each day cell becomes a tap target focused on the date, today state, selected state, and lightweight work indicators.
- Full chore and calendar-event rows move out of the grid and into a selected-day agenda below the month grid.
- Tapping a date selects that day and updates the agenda.
- Tapping an agenda item opens the existing chore or imported calendar event detail modal.
- Desktop Month view stays as it is today.

## Mobile Month Grid

On small screens, day cells should not render full chore cards. They should show:

- Day number.
- Today styling.
- Outside-month styling.
- Selected-day styling.
- A compact indicator when the day has work.

The indicator can be a dot, a small count, or a short stacked marker if there are multiple item types. The first implementation should favor clarity over dense metadata. The grid answers "which days have work?" rather than "what exactly is all the work?"

## Selected-Day Agenda

Below the mobile month grid, show an agenda section for the selected date.

The agenda should:

- Use the selected date as its heading.
- Show readable rows for chores and imported calendar events.
- Reuse existing calendar item styling where practical, but avoid the dense desktop month-card treatment.
- Preserve existing item click behavior: chore rows open the chore detail modal, imported calendar event rows open the calendar event detail modal.
- Show a calm empty state when the selected date has no work.

Default selected date:

- If today is visible in the current month range, select today.
- Otherwise select the first day in the focused month.

## Scroll Behavior

When a user taps a date on a mobile Month view, the browser should scroll to the selected-day agenda.

Rules:

- Only auto-scroll on mobile-sized layouts.
- Only auto-scroll after an explicit date tap.
- Use smooth scrolling when supported.
- Avoid auto-scrolling on initial render or when the user changes month via previous/next controls.
- If the agenda is already visible, the scroll should not feel disruptive.

The intended implementation is a `ref` on the agenda section with `scrollIntoView({ behavior: "smooth", block: "start" })`, gated by mobile viewport detection or CSS breakpoint alignment.

## Accessibility

The mobile month grid still needs semantic, keyboard-friendly behavior.

Requirements:

- Each date tap target has an accessible label such as `Select Friday, May 29`.
- The selected date exposes selected state.
- Work indicators are not the only accessible signal; labels should include a summary such as `2 items`.
- The selected-day agenda has a named region.
- Agenda rows remain normal buttons with existing accessible names.
- Keyboard users can select a day and then tab into the agenda items.

## Responsive Behavior

This design applies only at the mobile breakpoint.

Desktop and wider tablet Month view should keep the existing full month grid with inline cards. If later testing shows tablet layouts are also cramped, the same compact pattern can expand upward to tablet widths, but that is not part of this first pass.

## Testing

Add tests for:

- Mobile Month renders compact date buttons instead of full inline chore cards.
- Selecting a date updates the selected-day agenda.
- Agenda rows open the existing detail modals.
- Empty selected dates show an empty agenda state.
- Desktop Month behavior remains unchanged.

For the scroll behavior, prefer a focused test that verifies `scrollIntoView` is called after a mobile date selection and not on initial render.

## Out Of Scope

- Reworking Week or Day views.
- Adding drag-and-drop on mobile Month.
- Changing import/export behavior.
- Changing desktop Month layout.
- Introducing a new route for selected-day agendas.
