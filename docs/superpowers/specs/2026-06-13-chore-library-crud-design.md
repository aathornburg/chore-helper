# Chore Library CRUD Design

## Context

Settings now has a sidebar workspace with a read-only "Master chore list" view. That name and behavior should evolve into a **Chore library**: a household-level place to manage reusable chore definitions separately from the calendar schedule.

Visual companion: `.superpowers/brainstorm/settings-sidebar-session/content/master-chore-crud-options.html`

## Goals

- Rename the settings view from "Master chore list" to **Chore library**.
- Allow permitted household members to create, update, archive, and restore chore definitions.
- Preserve chore history by archiving instead of permanently deleting.
- Add per-person Chore library permissions alongside the existing family import controls.
- Keep schedule editing primarily in Calendar so Settings does not become a second calendar editor.

## Non-Goals

- No permanent hard-delete for chores.
- No bulk editing in the first pass.
- No full schedule editor inside Chore library.
- No change to calendar import/export behavior beyond sharing the Family permissions UI.

## Permission Model

Add a per-household, per-member Chore library permission:

- `view`: the member can browse the Chore library but cannot add, edit, archive, or restore chores.
- `manage`: the member can add, edit, archive, and restore library chores.

Household owners can always manage the Chore library and can change member permissions. New household members default to `view`.

The Family settings view should become a broader **Family permissions** panel. Each member row should continue to show calendar import controls and add a new **Chore library** permission control.

## Chore Library View

The Settings sidebar tab should be labeled **Chore library**.

The view should show active chores by default with:

- Search by title/instructions/tags.
- Source filter for manual versus Google Calendar.
- Status filter for active versus archived.
- Chore title and instructions preview.
- Tags.
- Source label.
- Schedule status signal, such as "Scheduled" or "Unscheduled" when schedule data is available.
- Row actions based on permission.

Members with `manage` see:

- `Add chore`
- `Edit`
- `Archive`
- Archived-view `Restore`

Members with `view` see the same list but with disabled or hidden mutation controls and helper text explaining that a household owner controls Chore library access.

## Create and Edit Behavior

Create and edit forms manage the chore definition only:

- Title
- Instructions
- Tags

Create should produce a reusable manual chore definition. Imported chores keep their source label as read-only metadata. The user-facing behavior should not force users to schedule a chore just to add it to the library, so the backend should support definition-only chore creation.

Editing a chore should update the definition and refresh any visible list data. Existing schedules and occurrences should keep referencing the chore.

## Archive and Restore Behavior

Archive replaces delete.

Archiving should:

- Hide the chore from the active Chore library by default.
- Prevent the chore from creating or displaying future planned work.
- Preserve past completions, imported context, recommendations, and history.
- Make the chore visible through the archived status filter.
- Allow permitted users to restore it.

The archive confirmation should explain that future scheduled work for the chore will stop while historical activity remains available. Restoring the chore returns it to the library, but does not need to automatically recreate future occurrences unless the underlying schedules were preserved and can safely resume.

## UI and Accessibility

- Use the existing settings panel, table/list, modal, and confirmation patterns.
- On mobile, render chores as compact cards rather than a squeezed table.
- Keep modals consistent with existing import/event modal sizing, including focus trap, outside-click close, Escape close, and accessible labels.
- Permission controls must have visible labels or screen-reader labels per member.
- Disabled CRUD controls need accessible explanation, not color-only communication.

## Data and API Shape

The app already has frontend wrappers for:

- Listing household chores.
- Updating chores.
- Archiving chores.
- Restoring chores.
- Listing archived chores.

Implementation should add or adapt data for Chore library permissions. The preferred model is a per-member household policy similar to calendar import policies, with owner-only endpoints to list and update permissions.

Backend authorization must enforce Chore library permissions for create, update, archive, and restore. The frontend should mirror that state for UX, but the server remains authoritative.

## Testing

Backend tests should cover:

- New members default to `view`.
- Owners can update Chore library permissions.
- `manage` members can create, update, archive, and restore chores.
- `view` members cannot mutate chores.
- Owners remain allowed even if no explicit permission record exists.

Frontend tests should cover:

- Settings sidebar displays "Chore library".
- Family permissions displays the Chore library permission control.
- Manage users see CRUD controls.
- View-only users do not get active mutation controls.
- Archive hides chores from active list and restore returns them.
- Empty, active, and archived states render correctly.

## Implementation Notes

- Add a definition-only chore creation path instead of requiring a schedule.
- Ensure archiving a chore prevents future active calendar work for that chore while preserving historical records.
