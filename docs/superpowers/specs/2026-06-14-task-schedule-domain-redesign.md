# Task And Schedule Domain Redesign

## Context

The app currently uses "chore" as the main domain word, with a Chore library in Settings and calendar flows that create scheduled chores/events. That is becoming confusing because the app needs to represent both household work that can be optimized and commitments that should be treated as time constraints.

The new model should make this obvious to normal household users:

- **Tasks** are the things that take household time.
- **Chores** are tasks Clenella can optimize.
- **Commitments** are tasks Clenella plans around.
- **Schedules** are when tasks happen.

Visual companions:

- `.superpowers/brainstorm/task-schedule-language-session/content/task-schedule-ux-options.html`
- `.superpowers/brainstorm/task-schedule-language-session/content/tasks-page-ia-options.html`
- `.superpowers/brainstorm/task-schedule-language-session/content/tasks-page-secondary-view-options.html`
- `.superpowers/brainstorm/task-schedule-language-session/content/calendar-tasks-ia-and-scope-options.html`
- `.superpowers/brainstorm/task-schedule-language-session/content/calendar-sections-task-inbox-refined.html`

## Goals

- Hard-rename the domain from Chore to Task across database, API, shared types, and UI.
- Add task type as a first-class concept: `chore` or `commitment`.
- Keep Calendar and Tasks as separate top-level pages.
- Move Task library CRUD out of Settings and into a top-level Tasks page.
- Add Task inbox as a review lane for task candidates and unsaved/unlinked scheduled tasks.
- Restructure Calendar with a Settings-style section selector for Calendar, List, Import queue, Import events, and Export.
- Make imports distinguish between calendar decisions and task-library decisions.
- Update Optimize so chores are optimizable and commitments are context/constraints in v1.
- Preserve existing data through Prisma migrations.

## Non-Goals

- No backward-compatible `/chores` API aliases after the hard rename.
- No optimizing commitments in v1.
- No automatic assumption that all future matching imports should map to the same task unless the user explicitly chooses that scope.
- No task-level storage of default recurrence/time schedules. Schedules remain separate records.
- No permanent hard-delete for saved tasks in v1; archive remains the destructive-style action.

## Terminology

- **Task**: umbrella term for something that may take time in the household plan.
- **Chore**: a task type for household work Clenella can help optimize.
- **Commitment**: a task type for time Clenella should account for but not optimize in v1.
- **Task library**: saved reusable tasks, including both chores and commitments.
- **Task inbox**: review lane for task candidates that need a save/link/keep decision.
- **Task schedule**: schedule definition for a task, including date/time, recurrence, assignment, and planning mode.
- **Scheduled task**: a planned occurrence or scheduled item shown on Calendar/Today.
- **One-time task**: a scheduled task that is not saved or linked to a Task library item.

User-facing helper copy for type selection:

- **Chore**: Household work Clenella can help optimize.
- **Commitment**: Time Clenella should plan around.

## Navigation

Top navigation should be:

`Optimize | Today | Calendar | Tasks | My Home | Family | Settings`

Calendar and Tasks are siblings:

- **Calendar** answers "when is work/time happening?"
- **Tasks** answers "what reusable work/time do we know about, and what task candidates need review?"

Settings should no longer contain Task library CRUD. It should retain General, Connections, and Family permissions.

## Tasks Page

The Tasks page owns saved task management and task-candidate review.

### Task Library

Task library shows saved reusable tasks. It supports:

- Add task.
- Edit task.
- Archive/restore task.
- Search.
- Type filter: All, Chores, Commitments.
- Status filter: Active, Archived.
- Visual distinction between chores and commitments using the same teal/gold language already used on Calendar.
- Schedule action on each task row/card.
- Task details showing active schedules linked to the task.

Task fields:

- Name.
- Type: Chore or Commitment.
- Notes/instructions.
- Default duration if useful.
- Tags.
- Source/import metadata if created from import.
- Archived state.

Task library items must not store default recurrence or time-of-day preferences. Existing schedules should be listed in task detail, but schedule data belongs to task schedules.

Saved tasks may have multiple active schedules.

### Task Inbox

Task inbox is a review lane, not a calendar substitute.

It should show task candidates by default when they need a task-library decision:

- Pending import candidates not yet added to Calendar.
- Scheduled one-time tasks already on Calendar but not saved/linked.
- Suggested links to existing saved tasks.

Rows should use badges:

- **Pending import**: still in Calendar Import queue and not on Calendar yet.
- **Scheduled**: already on Calendar but not saved/linked.
- **Suggested link**: Clenella found a likely saved task match.
- **Kept one-time**: user chose not to save/link; hidden from default Needs review view but available through a filter.

Default Task inbox view should show Needs review. It should include pending imports by default. Additional filters can be introduced as needed, especially for Kept one-time.

Task inbox actions are task-library decisions:

- Save as task.
- Link to existing task.
- Keep one-time.
- Ignore/dismiss from inbox where appropriate.
- Open in Import queue for pending import candidates.

Task inbox actions do not decide whether an imported event is added to Calendar. Saving/linking a pending import candidate updates task-link metadata shown in Calendar Import queue, but the calendar import decision remains pending.

## Calendar Page

Calendar should use a Settings-style section selector.

Desktop selector:

- Calendar: month/week/day schedule view.
- List: agenda/list view.
- Import queue: imported items needing calendar decisions, with a badge count.
- Import events: source calendar and date range controls for finding external events.
- Export: export settings, selection, review, and destination controls.

Mobile should use the compact section selector pattern already chosen for Settings.

The top action clutter should be reduced. Import and export should move out of a modal-first action popover into first-class sections.

### Schedule Task

The consistent action is **Schedule task**.

Scheduling can start from:

- Calendar: choose saved task or create a new task.
- Task library: saved task is preselected.
- Task inbox: task candidate is prefilled.
- Import queue: external event time/source are prefilled.

The same scheduling form should be used everywhere, with context-specific prefill:

- Task selection or new task entry.
- Type: Chore or Commitment.
- Date.
- Time or Anytime.
- Duration.
- Recurrence.
- Assignment.
- Household.
- Save/link/library behavior when relevant.

When manually scheduling a brand-new typed task, **Save to Task library** defaults to on. Users can turn it off for one-time work.

## Imports

Imports have two separate decisions:

1. **Calendar decision**: should this external event become scheduled work?
2. **Task decision**: should the underlying task be saved or linked in the Task library?

Calendar Import queue handles calendar decisions.
Task inbox handles task-library decisions.

Pending import candidates appear in Task inbox by default because users may reject adding the event to Calendar but still want to save the underlying task for future use.

If a pending import candidate is saved or linked from Task inbox, Import queue should show that metadata when the user returns there.

Import queue decisions should include:

- Add to Calendar as scheduled task.
- Treat as commitment where appropriate.
- Reject calendar import.
- Link to existing saved task.
- Save as new task.
- Keep one-time.

Exact or near-exact title matches should be preselected as suggested links, with a reason such as:

- Matched by title.
- Matched recurring task.
- Matched previous imports.

Users must be able to change the suggested link, save as a new task, keep one-time, or reject.

### Import Scope

Import queue should include scope controls in v1:

- This imported item only (default).
- This repeating series.
- Future matching imports.

Clenella may suggest links, but the default scope should never silently map all future matching imports to the same task. Broader scope must be an intentional user choice.

## Scheduled Task Details

The scheduled task modal should include schedule fields and task detail fields.

Schedule fields:

- Date/time.
- Duration for this scheduled item.
- Assignment.
- Recurrence/scope.
- Status.
- Import/source metadata.

Task detail fields:

- Name.
- Type: Chore or Commitment.
- Notes/instructions.
- Tags.

If the scheduled task is linked to a saved task, edits to task detail fields can either:

- Apply to this scheduled task only.
- Sync to the saved task.

When edits apply only to the scheduled task, the scheduled task should remain linked to the saved task with quiet overrides. For example, a "Clean bathroom" scheduled task can have custom instructions for "toilet only" while still counting as Clean bathroom history.

Overrides should stay mostly invisible. The modal may show a subtle line such as "Custom details for this scheduled task" and offer low-friction actions:

- Sync to saved task.
- Reset to saved task defaults.

One-time scheduled tasks can be saved to Task library from the details modal.

## Optimize

Optimize should be updated as part of the redesign.

V1 behavior:

- Chores can receive recommendations.
- Commitments are constraints/context only.
- Optimize uses both chores and commitments to understand the household schedule.
- Commitments do not receive recommendations in v1.

Suggested language:

- Page title: **Optimize household work**.
- Supporting copy: **Clenella looks at chores, commitments, rooms, timing, and workload to suggest safer improvements.**
- Selection copy: **Choose chores to optimize**.
- Context copy: **Commitments are included as schedule context.**

If a task is misclassified, users should be able to change its type from task details or scheduled task details.

## Permissions

Rename Chore library permissions to Task library permissions.

- `view`: member can browse Task library and Task inbox where appropriate.
- `manage`: member can create, edit, archive, restore, save, and link tasks.

Household owners can always manage the Task library and member permissions.

The Family settings view should retain per-person permission controls, but copy should refer to Task library. Scheduling permissions are not split out in this design unless a future need appears.

Import queue permissions remain tied to existing import controls.

## Data And API Shape

This is a hard rename. Internal names should match user-facing domain concepts.

Expected renames:

- `Chore` -> `Task`.
- `ChoreSchedule` -> `TaskSchedule`.
- `ChoreOccurrence` -> `TaskOccurrence` or `ScheduledTaskOccurrence`.
- `ScheduledChore` -> `ScheduledTask`.
- `ChoreLibraryPermission` -> `TaskLibraryPermission`.
- `/api/households/:householdId/chores` -> `/api/households/:householdId/tasks`.
- Chore-related route helpers, repository methods, frontend API functions, tests, and fixtures should be renamed consistently.

Task should include:

- `type: "chore" | "commitment"`.
- Existing definition fields such as title/name, instructions/notes, tags, source, archived state.

Scheduled one-time tasks must be representable even when they are not linked to a saved Task library item. The implementation plan should decide whether this is modeled as:

- A task-like embedded snapshot on the schedule/occurrence, or
- A non-library task record with a saved/library state.

The selected design must preserve the ability to later save/link that one-time task to the Task library without losing history.

## Migration

Use Prisma Migrate, not `db push`, for schema changes.

The migration should preserve existing data:

- Existing chores become tasks with `type = "chore"`.
- Existing chore schedules become task schedules.
- Existing occurrences/history keep their references.
- Existing Chore library permissions become Task library permissions.

Production deployment reminder:

- After deploying code with migration files, run `npm run db:deploy -w server` in Render or use Render pre-deploy command automation.

If this design requires a new migration after the previously established baseline, create it locally with Prisma Migrate and commit the generated migration folder.

## Implementation Phases

Phases are for reviewability, not for preserving old concepts long-term. The destination is the full task/schedule redesign.

1. **Domain rename and migration**
   - Rename DB, shared types, API routes, repositories, and tests from chore to task.
   - Add task type.
   - Preserve existing data as chore-type tasks.

2. **Tasks page and Task library**
   - Add top-level Tasks nav item.
   - Move library CRUD out of Settings.
   - Add type filtering and visual distinction.
   - Show active schedules from task detail.

3. **Schedule task flow**
   - Rename Add event/add chore flows to Schedule task.
   - Use a common scheduling form from Calendar and Tasks.
   - Default manual new tasks to Save to Task library on.

4. **Task inbox**
   - Add Task inbox view.
   - Include pending import candidates, scheduled one-time tasks, suggested links, and kept one-time filter/state.
   - Add save/link/keep flows without conflating calendar import decisions.

5. **Calendar workspace sections**
   - Add Calendar left selector and mobile compact selector.
   - Promote Import queue, Import events, and Export into sections.
   - Add import queue badge count.
   - Add import scope controls.

6. **Scheduled task details**
   - Update detail modal for linked task details, one-time task saving, quiet overrides, sync/reset actions, and task type editing.

7. **Optimize update**
   - Update copy and behavior so chores are optimized and commitments are constraints/context in v1.

## Testing

Backend tests should cover:

- Existing chore data migrates to chore-type tasks.
- Task CRUD supports both chore and commitment types.
- Saved tasks can have multiple active schedules.
- One-time scheduled tasks can exist without a saved task link.
- Task library permissions enforce create/update/archive/link/save behavior.
- Import queue task-link metadata can be updated independently from calendar import decisions.
- Import scope controls apply only the chosen scope.

Frontend tests should cover:

- Top nav includes Tasks.
- Settings no longer exposes Task library CRUD.
- Tasks page shows Task library and Task inbox.
- Task library filters and visually distinguishes chores and commitments.
- Calendar Schedule task flow can pick an existing task or create a new one.
- Manual new tasks default Save to Task library on.
- Pending imports appear in Task inbox with a Pending import badge.
- Saving/linking from Task inbox updates task metadata without deciding calendar import.
- Calendar Import queue shows review counts and task-link metadata.
- Scheduled task detail supports one-time save, linked task overrides, sync, reset, and type edits.
- Optimize only selects chores for recommendations and treats commitments as context.

Accessibility tests or checks should cover:

- Section selectors are keyboard accessible and labeled.
- Task type is communicated by text/badge, not color alone.
- Import scope controls have clear labels.
- Modals maintain focus management, Escape close, outside-click close, and accessible names.

## Open Follow-Ups For Implementation Planning

- Choose the exact data representation for one-time scheduled tasks.
- Decide whether Task inbox is backed by a dedicated table/state or derived from import queue and schedules.
- Decide whether "future matching imports" creates an explicit matching rule table.
- Decide whether "Keep one-time" is stored on the scheduled task, inbox item, or task candidate.
- Decide whether commitments need any fields beyond the shared Task fields in v1.
