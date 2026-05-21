# Chores Row Editing Design

## Summary

The Chores page should read as a list-first workspace. The default state should show chores as rows, with no edit form visible until the user chooses a specific chore. The edit and archive controls should expand inline inside that chore row instead of living in a persistent right-side panel.

This keeps the page focused on chore CRUD while reducing the visual weight of the current split list/detail layout.

## Goals

- Make `Add chore` visually distinct from the filter tabs.
- Keep the Chores page calm on load by showing only the chore list.
- Let users edit or archive a chore by clicking that chore row.
- Keep edit context local to the row being changed.
- Preserve review-state filtering and the existing review flow entry point.
- Rename the visible `Recommendation pending` tab to `Pending`.

## Non-Goals

- Do not change persistence behavior or API contracts.
- Do not redesign the review flow itself.
- Do not add bulk edit, sorting, or drag-and-drop behavior.
- Do not reintroduce a separate setup or plan page concept.

## Layout

The Chore list section should have a top toolbar with two distinct zones:

- Left side: status filters.
- Right side: primary `Add chore` action.

The filter labels should be:

- `All active`
- `Unreviewed`
- `Pending`
- `Reviewed`
- `Archived`

The `Pending` label represents chores with pending recommendations. The internal state name can remain `recommendation-pending` unless renaming it would simplify the implementation without broad churn.

`Add chore` should use a stronger primary-action treatment than the filters. It should not reuse the same visual style as a tab or secondary action.

## Chore Rows

On page load, active chores should render as a single-column list. Each row should show:

- Review state.
- Chore title.
- Cadence.
- Estimated minutes.
- Source.

Unreviewed chores should keep the dashed or dotted treatment so they remain visually distinct.

Rows should be clickable. Clicking an active chore expands that row inline. Only one active chore row should be expanded at a time.

## Expanded Row

The expanded row should contain the edit form currently shown in the right-side detail panel:

- Title.
- Cadence.
- Estimated minutes.
- Source.
- `Save chore changes`.
- `Archive chore`.
- `Cancel`.

Recommendation details for the selected chore should also appear inside the expanded row below the edit controls. If the chore has no recommendation, show `No recommendation for this chore yet.`

Saving should update the chore, clear stale recommendations as the current implementation does, and collapse the expanded row so the user returns to the list.

Cancelling should discard unsaved local edits and collapse the row.

Archiving should remove the chore from the active list and collapse the row.

## Add Chore

Clicking `Add chore` should open the existing add form in the list section below the toolbar and above the rows, so it is clearly separate from existing chores.

After saving a new chore:

- Clear the add form.
- Close the add form.
- Return to `All active`.
- Add the new chore to the list.
- Do not automatically open the edit form for the new chore.

## Archived Rows

The `Archived` tab should remain the single archive surface.

Archived rows should not use the active edit form. They should show archived chore details with a `Restore <title>` action. Restoring a chore should return the page to `All active` with the restored chore available in the list.

## Empty States

Existing filter-specific empty states should remain, with updated tab wording where needed:

- `Pending`: `No chores have pending recommendations.`
- `Archived`: `No archived chores yet.`
- `All active`: `No active chores yet. Add a chore to start building the household routine.`

The add form should not appear merely because a filter has no matching chores.

## Testing

Add or update tests to cover:

- `Add chore` is visually and structurally separate from the status tabs.
- The pending filter uses the visible label `Pending`.
- The Chores page initially shows rows without selected edit fields.
- Clicking a chore row expands the inline edit form.
- Only one chore row is expanded at a time.
- Cancelling collapses the row and resets edit fields.
- Saving updates the chore and collapses the row.
- Archiving removes the chore from the active list.
- Archived rows show restore actions without active edit fields.

## Browser Review

After implementation, verify in the browser:

- The toolbar separates filters from the `Add chore` action.
- Initial page load is list-first and no active edit form is visible.
- Clicking a row expands the edit form inline without shifting the whole page into a two-column detail layout.
- The `Pending` tab reads correctly and still filters pending recommendations.
- Mobile width keeps row content readable without overlapping controls.
