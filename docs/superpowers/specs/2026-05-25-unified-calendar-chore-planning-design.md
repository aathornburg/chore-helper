# Unified Calendar Chore Planning Design

Date: 2026-05-25

## Summary

Cleanly should treat chores as planned household work, not as a separate catalog that
users must manage before returning to a calendar. `Calendar` becomes the single
destination for creating chores, arranging timed or flexible schedules, viewing
upcoming obligations, completing assigned work, and reviewing completed or skipped
history.

This design supersedes the separate `Chores` page workflow and the add-form parity
design. It also refines the scheduling model established in the Chore Manager
Initiative: schedule series, rather than chore-level cadence or duration, define when
and how long work is expected to take.

Current application chore, schedule, and occurrence data is disposable test data. The
implementation may reset that data rather than migrate free-form cadence values or
unscheduled chore records.

## Product Experience

### Navigation And Views

- Remove the `Chores` navigation destination.
- `Calendar` is the only primary destination for chore setup, planning, execution, and
  history.
- Calendar exposes two top-level views:
  - `Calendar`: month, week, and day planning presentations.
  - `List`: an actionable chronological agenda beginning with overdue flexible work,
    followed by today's work and future occurrences.
- `Add chore` is available from Calendar and opens the same shared editor used for
  existing chores.

### Occurrence Interactions

- Selecting an occurrence in either view opens the shared chore editor with that
  occurrence automatically selected.
- Planned occurrence cards and list rows offer a quick `Complete` action when the
  signed-in member is allowed to complete the work.
- Timing changes, schedule-series changes, reassignment, and skipping occur through
  the shared editor rather than overloaded card actions.
- Timed occurrences occupy calendar time slots.
- Flexible occurrences appear in an `Anytime` region and carry an explicit flexible
  indicator, such as an icon with `Flexible` or `Anytime` text.

## Shared Chore Editor

Calendar uses a substantial modal on larger screens and a full-screen sheet on narrow
screens. The same editor supports creation and editing so users learn one workflow.

### Create Mode

- Starts with blank chore descriptive fields and one required schedule series.
- Allows owners to add multiple schedule series before saving.
- Rejects save unless the new chore has at least one valid schedule.
- Persists the chore and its required schedule series as one successful user action;
  failure must not leave a newly created unscheduled chore visible in the product.

### Edit Mode

- Shows descriptive chore fields and all active schedule series.
- Allows owners to add, edit, or archive schedule series.
- Shows upcoming occurrences in chronological order.
- When opened from an occurrence card or row, highlights and expands that selected
  occurrence for permitted actions.
- Includes a collapsed `History` section for completed and skipped occurrences.

### Editor Sections

1. **Chore Details:** title, instructions, tags, source metadata, and archive action.
2. **Schedule Series:** one or more timed or flexible schedule definitions and their
   assignment rules.
3. **Upcoming Occurrences:** generated future work, with selected-occurrence controls.
4. **History:** completed and skipped work with recorded completion audit details.

## Domain Model

### Chores

A `Chore` describes the work itself:

- Household ownership.
- Title.
- Optional instructions.
- Free-form tags.
- Source metadata.
- Archive state.

Remove active product usage of `cadence` and chore-level `estimatedMinutes`. A chore
may be carried out under more than one schedule pattern, and the schedule series must
be the single source of truth for recurrence and planned duration.

### Schedule Series

Every new chore must contain at least one `ChoreSchedule`. A schedule can represent a
one-time obligation or repeating household work and uses one of two planning modes.

#### Timed Mode

A timed schedule defines:

- One-time, daily, weekly/selected-weekday, or monthly recurrence.
- Optional recurrence interval and date bounds.
- A local start time and local end time.
- Derived planned duration from the time range.
- Fixed assignment or ordered rotation among household members.

Example: `Clean bathrooms` on Saturday from `10:00 AM` through `11:00 AM`.

#### Flexible Mode

A flexible schedule defines:

- One-time, daily, weekly/selected-day, or monthly recurrence.
- Optional recurrence interval and date bounds.
- Eligible completion days without a clock start or end.
- Estimated duration.
- Fixed assignment or ordered rotation among household members.
- A selected-days behavior:
  - `Once within selected days`: one required completion may be done on any eligible
    day in the configured window.
  - `Each selected day`: each eligible day creates its own required completion.

Example: `Clean bathrooms` once on Saturday or Sunday, expected to take one hour.

## Occurrences And Completion

### Occurrence Generation

- Timed schedules materialize timed occurrences with frozen planned start/end
  instants.
- Flexible `each selected day` schedules materialize independent flexible
  occurrences for each selected day.
- Flexible `once within selected days` schedules materialize one obligation with a
  multi-day eligible window. While pending, that obligation is projected on every
  eligible day in Calendar and List views so the user sees when it can be performed.
- Completing or skipping a linked flexible-window obligation removes its pending
  presentation from all other eligible days.
- A flexible-window obligation that reaches the end of its eligible window without an
  outcome remains visible as `Overdue` until a member completes it or an owner skips
  it.

### Occurrence State

An occurrence has a status of:

- `planned`
- `completed`
- `skipped`

Completed occurrences record:

- `completedAt`
- `completedByUserId`

Future schedule-series edits regenerate only future untouched occurrences. Completed,
skipped, or individually adjusted occurrences remain preserved as history.

### Occurrence Exceptions

Owners can change an individual occurrence without changing its originating schedule:

- Assign a specific time to a flexible occurrence.
- Reschedule timed work.
- Resize timed work by changing its start/end range.
- Reassign responsibility.
- Skip the occurrence.

## Permissions

The existing Clerk authentication and app-owned household membership model remains in
place.

Owners can:

- Create, edit, and archive chore definitions.
- Add, edit, and archive schedule series.
- Reschedule, resize, reassign, or skip occurrences.
- Review all household completion and skip history.

Assigned household members can:

- View the shared calendar and list views.
- Complete their own planned occurrences through a quick action or the shared editor.

A completion action records both the completing user and completion time. A member
cannot complete an occurrence assigned to another member unless owner permissions are
explicitly extended in a later design.

## Interfaces And Persistence

The implementation will revise the app-owned scheduling interfaces around these
contracts:

- Chore create/update inputs exclude `cadence` and `estimatedMinutes`.
- Schedule inputs include planning mode, timed end time or flexible estimated
  duration, selected-day behavior for flexible schedules, recurrence, bounds, and
  assignment.
- New chore creation accepts descriptive chore data plus one or more schedule series
  in an atomic server operation, or an equivalently transactional operation.
- Occurrence queries return enough flexible-window metadata for the UI to project a
  single pending flexible obligation across eligible days without treating each
  display item as a separate completion.
- Occurrence completion records status, `completedAt`, and `completedByUserId`.

Implementation may drop or reset development chore, schedule, and occurrence rows
when adopting this contract. No compatibility behavior for the separate Chores page,
unscheduled chores, legacy cadence strings, or chore-level duration is required.

## Failure Handling

- Reject new chore creation without at least one valid schedule series.
- Creating a chore with multiple schedules is atomic from the user's perspective:
  either the chore and all initial schedules are available, or none are.
- Failed schedule-series edits leave the existing schedule and generated occurrences
  unchanged.
- Failed occurrence actions keep the editor open, retain the selected occurrence, and
  show a recoverable error.
- Quick completion failures restore the planned visual state and show an actionable
  error message.
- Flexible linked projections update together after completion or skip so duplicate
  pending presentations cannot remain visible.

## Verification

Automated server coverage must include:

- Atomic chore creation with one and multiple schedule series.
- Rejection of unscheduled chore creation.
- Timed schedule materialization with derived duration.
- Flexible `once within selected days` projection, completion, overdue, and skip
  behavior.
- Flexible `each selected day` independent occurrence behavior.
- Completion auditing and assigned-member authorization.
- Owner schedule-series and occurrence-exception permissions.
- Preservation of completed, skipped, and altered historical occurrences after series
  updates.

Automated web coverage must include:

- Removal of the separate Chores destination and Calendar/List view navigation.
- Shared editor create mode with one required schedule and multiple-series creation.
- Shared editor edit mode with selected occurrence focus, schedule-series controls,
  upcoming occurrences, and collapsed history.
- Timed and flexible schedule controls, flexible labels, and overdue presentation.
- Quick completion from both views and immediate removal of alternate flexible-window
  projections.
- Owner/member action visibility and recoverable mutation errors.

Manual browser validation must cover:

- Desktop Calendar view with timed and flexible occurrence presentation.
- Desktop List view with overdue, today, and upcoming groupings.
- Shared modal creation and occurrence editing.
- Narrow-width full-screen sheet behavior and accessible form-based actions.

## Superseded Direction

This specification replaces the product direction in:

- `2026-05-25-add-chore-parity-design.md`, which treated add-form parity on a
  separate Chores page as the end state.
- The portions of `2026-05-25-chore-manager-initiative-design.md` that define
  `Chores` as a separate catalog/setup destination or place planned duration on the
  chore rather than the schedule.

The broader household membership and assistant optimization directions from the Chore
Manager Initiative remain applicable unless subsequently revised.

## Assumptions

- React, Express, Prisma/Postgres, and Clerk remain the platform foundation.
- Google Calendar integration remains outside this redesign.
- Development chore data may be reset without migration.
- One household time zone remains authoritative for recurrence and calendar display.
- The initial completion record captures completion timestamp and completing member,
  not notes, photos, or proof-of-work attachments.
- The selected modal layout direction is the dedicated editor modal/full-screen sheet,
  with quick completion remaining available directly on planned cards and rows.
