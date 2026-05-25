# Add Chore Parity Design

**Status:** Approved for planning

## Goal

Make the `Add chore` workflow expose the same chore-definition and initial
scheduling capabilities available after expanding an existing chore for editing.
Users should not need to create an incomplete chore and immediately reopen it to
finish setup.

## Scope

The create form will include:

- Chore title, cadence, estimated minutes, and fixed manual source.
- Optional instructions and comma-separated tags.
- Optional initial schedule setup for the selected household.
- The same schedule fields exposed by edit: recurrence frequency and interval,
  conditional weekday or monthly day configuration, local start time, planned
  duration, start/end dates, assignment mode, and household assignees.

This change does not add check-ins, assistant-authored schedules, calendar import,
or new backend endpoints.

## User Flow

1. The user opens `Add chore` and chooses a household.
2. The form loads that household's members for schedule assignment choices.
3. The user fills out definition fields and may enable an initial schedule.
4. Save creates the chore using the complete definition payload.
5. If an initial schedule was enabled, save creates that schedule using the returned
   chore identifier.
6. After success, the chore list shows the new chore and the user can open Calendar
   when a schedule was created.

## Data Flow And Failure Handling

The existing APIs already support the required operations:

- `POST /api/households/:householdId/chores` creates definition data including
  `instructions` and `tags`.
- `POST /api/households/:householdId/chores/:choreId/schedules` creates the
  optional initial schedule after chore creation.

Creation is intentionally sequential because a schedule requires a persisted chore
ID. If the chore request fails, no schedule request is made and the form remains
open with an error status. If the chore succeeds but schedule creation fails, the
saved chore remains visible and the UI reports that the chore was added but its
schedule still needs to be configured. The user can finish scheduling through the
existing expanded edit surface.

## Component Design

`ChoresPage` will add create-form state for instructions, tags, optional scheduling,
member choices, and schedule fields. The implementation should reuse small helper
functions or reusable form fragments where doing so prevents create/edit schedule
fields from drifting again, without restructuring unrelated chore-list behavior.

Schedule controls remain owner-oriented. The create form loads household members
after household selection and provides assignments only when member data is
available.

## Validation

Automated UI tests will cover:

- Creating a chore with instructions and tags.
- Creating a chore with an initial schedule payload.
- Keeping a successfully created chore visible and reporting partial failure when
  initial schedule creation fails.

Existing schedule editor and Calendar tests remain regression coverage. The web
typecheck and production build must pass, followed by local browser inspection of
the add form at desktop and narrow widths.

## Self-Review

- Placeholder scan: no unresolved requirements or placeholders.
- Consistency: uses existing chore and schedule endpoints and existing owner-managed
  scheduling model.
- Scope: limited to add-form parity and its failure state.
- Ambiguity: schedule creation is optional and occurs only after chore creation.
