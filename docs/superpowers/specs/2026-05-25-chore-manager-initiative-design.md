# Chore Manager Initiative Design

Date: 2026-05-25

## Summary

Chore Helper should evolve from storing chore ideas into an app-owned, shared household
chore manager. The app will schedule recurring and one-time work, assign occurrences to
real household members, capture quick outcome evidence, expose calendar planning
surfaces, and allow the assistant to recommend better schedules and better-scoped
chores.

The complete initiative consists of four dependency-ordered releases:

1. Shared household foundation: invitations, members, roles, and household time zone.
2. Scheduling and calendar planner: chore definitions, schedules, occurrences, and
   month/week/day planning views.
3. Outcomes and Today experience: check-ins, history, audit corrections, and immediate
   daily/weekly views.
4. Evidence-based AI optimization: periodic reviews and approved recommendation drafts.

Google Calendar import/export is not part of this initiative. The application owns
schedule truth first; external calendar integration can follow later.

## Product Experience

### Today

After login, Today becomes an action-oriented home screen for the signed-in member.
If assigned occurrences are currently due or have ended without an answer, a prominent
check-in queue appears before general overview content.

For each eligible occurrence, the member answers:

- Did you complete this chore?
- If completed, did you start at the scheduled time?
- If completed, did you finish within the planned duration?
- Optional notes for context the assistant may use later.

Upcoming assigned work remains visible and may be completed early. An unanswered
occurrence after its planned window is overdue for response, not automatically missed;
only an explicit not-completed response or an owner correction is missed-work evidence.

Today includes both:

- A personal timed timeline for today's assigned work.
- A seven-day household strip and agenda with assignee and status markers.

Both views link into the full Calendar planner.

### Calendar

Add a primary `Calendar` page with month, week, and day views. It presents the
household schedule by default and offers member and status filters.

Members can see household scheduled work and respond to their own eligible
occurrences. Owners can:

- Create chore schedules.
- Edit a schedule series or one occurrence.
- Reschedule, resize, skip, or reassign an occurrence.
- Drag planned work in timed views to reschedule it.
- Resize planned work in timed views to adjust expected duration.

All drag and resize interactions must have form-based equivalents for keyboard and
mobile users.

### Chores And Family

`Chores` becomes the catalog and setup surface for chore definitions: title,
instructions, floors/rooms, tags, schedules, assignments, and archive state. A single
chore may have multiple schedules, such as morning and evening kitchen resets.

`Family` becomes real member administration instead of a placeholder. It provides
invitations, accepted members, role changes, removals, and member assignment context.

### Optimize

`Optimize` remains the assistant workspace, but recommendations may also arrive from
periodic review cycles. All members may read recommendations and their reasoning; only
owners may apply changes to schedules, assignments, or chore definitions.

## Collaboration And Permissions

The app continues to use Clerk for authentication and app-owned Prisma membership for
authorization. Households support multiple owners and ordinary members.

An owner invites a member by email. The server stores an expiring, single-use
invitation token and sends an acceptance link using a mail adapter. Deployed
invitation emails use Resend; local development and automated tests use a deterministic
capture sender. A signed-in recipient accepting the invitation becomes a household
member.

Owner capabilities:

- Invite, remove, and promote members.
- Configure household time zone and weekly review settings.
- Manage chores, schedules, rotations, and calendar exceptions.
- Correct an occurrence response while retaining attribution.
- Preview and apply assistant recommendation drafts.

Member capabilities:

- View the shared household calendar and assistant explanations.
- View personal assigned work and outcome history.
- Submit responses only for assigned occurrences.

The last owner of a household cannot leave or be removed.

## Scheduling Domain

The scheduling model is occurrence-led: schedules generate durable occurrences, and
outcomes attach to those occurrences. This ensures calendar edits, rotations, overdue
responses, owner corrections, and assistant analysis all operate on stable history.

### Data Model

- `Household` gains a required IANA `timeZone`.
- `HouseholdInvitation` stores recipient email, household, invited role, token digest,
  expiry, inviter, delivery state, and accepted/cancelled timestamps.
- `Chore` stores title, optional instructions, archived state, linked existing
  floors/rooms, and free-form tags.
- `ChoreSchedule` stores one-time or recurring timing rules, planned duration, optional
  date bounds, and active/archived state.
- `ChoreScheduleAssignee` configures either one fixed member or an ordered rotation.
- `ChoreOccurrence` stores frozen planned start/end, assigned member, source schedule,
  sequence position, exception state, and occurrence status.
- `OccurrenceOutcome` stores completed/not-completed, started-as-scheduled and
  fit-planned-duration answers when completed, optional notes, reporter, and timestamp.
- `OccurrenceOutcomeCorrection` appends owner corrections and attribution without
  removing the submitted response.
- `ReviewCycle` stores due-cycle claiming, evidence coverage, skipped/running/completed
  status, and generated recommendation references.

### Recurrence And Occurrences

Schedules support:

- One-time occurrences.
- Daily repetition.
- Selected weekdays or weekly repetition.
- Every-N-weeks repetition.
- Monthly repetition.
- Optional start and end dates.
- Single-occurrence rescheduling or skipping.

A rolling generator materializes upcoming occurrences in the household time zone.
Editing a recurring series affects future generated occurrences, not historical
occurrences or submitted outcomes. Calendar occurrence rescheduling and resizing
produce explicit exceptions.

Assignment supports fixed responsibility or an ordered rotation. Rotation advances by
scheduled occurrence sequence even when an assigned member does not complete their
previous occurrence.

Current development chore data may be reset when this schema is introduced. There is
no attempt to infer precise schedule data from the existing free-text `cadence` field.

## Assistant Review

Each household can configure a weekly review day and time in its household time zone.
The initial implementation does not require a background scheduler. When any member
loads a household after a review becomes due, the backend atomically claims at most
one run for that cycle.

If no answered or explicitly missed occurrences are new since the previous reviewed
cycle, the cycle is marked checked without invoking the assistant. Unanswered
occurrences do not become failures solely because a member has not reported.

When evidence exists, assistant context includes:

- Household profile and floor/room structure.
- Chore title, instructions, locations, and tags.
- Schedules, duration, fixed and rotating assignments.
- Submitted outcomes, optional notes, and attributed corrections.
- Prior recommendation decisions.

The assistant may propose owner-approved drafts for:

- Start time or duration changes.
- Recurrence changes.
- Fixed or rotating assignment changes.
- Chore title, instructions, or scope changes.
- Splitting an overly broad chore into multiple narrower scheduled chores.

For example, repeated duration overruns for `Clean bathrooms` may lead to a proposed
split into narrower work such as `Clean toilet` and other separately scheduled tasks.
Applying an edit or split retains the original occurrence and outcome history that
motivated the recommendation. The assistant never silently mutates household plans.

## Public Interfaces

The existing product API is extended around six capability groups:

- Membership and invitations: create, list, cancel, accept, list members, promote,
  remove, and enforce last-owner restrictions.
- Household settings: read and update time zone and weekly review configuration.
- Chore definitions: CRUD for instructions, structured locations, tags, and archive
  state.
- Scheduling: CRUD for series and assignment configuration, plus single-occurrence
  exception actions.
- Calendar and outcomes: query occurrences by date range/filter, submit assigned
  outcomes, and append owner corrections.
- Assistant cycles and drafts: atomically run a due cycle when needed, list structured
  drafts, and owner-apply selected proposals.

The existing `cadence` field stops being the source of schedule truth once schedule
records are introduced.

## Delivery Releases

### 1. Shared Household Foundation

- Add household time zone, displayable members, invitation records, Resend/test mail
  adapters, member role administration, and owner invariants.
- Replace the Family placeholder with invitation and member management.
- Keep existing household endpoints membership-protected.

### 2. Scheduling And Calendar Planner

- Add chore detail fields, schedule series, assignment/rotation configuration,
  occurrence generation, exceptions, and range-query APIs.
- Reset local development chore data when the new scheduling schema is adopted.
- Add the Calendar route, month/week/day views, filters, and owner planning actions.
- Provide form-based alternatives for drag/resize behavior.

### 3. Outcomes And Today Experience

- Add outcomes, correction history, status derivation, and outcome authorization.
- Rebuild Today around check-in prompts, the personal daily timeline, and seven-day
  household agenda.
- Surface occurrence status in Calendar and Chores.

### 4. Evidence-Based AI Optimization

- Add review configuration, cycle deduplication, and due-review-on-load behavior.
- Expand assistant context and structured recommendations for scheduling, assignment,
  scope, and split-chore proposals.
- Add owner preview/apply behavior and member-readable explanation surfaces.

## Error Handling And Verification

- Reject unauthorized household, schedule, outcome, membership, and recommendation
  actions without disclosing inaccessible household records.
- Prevent expired, cancelled, already-used, or wrong-recipient invitation acceptance.
- Make invitation email sending and due review-cycle claims idempotent.
- Keep outcome reporting recoverable: unanswered is distinct from explicitly missed,
  and corrections remain attributed.
- Handle time-zone generation, recurrence bounds, schedule exceptions, and rotations
  deterministically.

Automated coverage must include:

- Invitation delivery/acceptance, role administration, and last-owner constraints.
- Schedule recurrence, multiple schedules per chore, rotations, exceptions, time zones,
  and immutable historical occurrences.
- Today check-ins, early completion, overdue unanswered states, outcome permission, and
  owner correction audit behavior.
- Calendar views, filtering, owner-only mutation behavior, and accessible edit paths.
- Due-cycle concurrency, evidence skipping, expanded assistant context, and structured
  draft application including chore splits.

Manual browser validation must cover desktop and narrow-width Today, Calendar, Family,
and Optimize workflows, including drag/resize behavior and keyboard/mobile editing
fallbacks.

## Assumptions

- React, Express, Prisma/Postgres, and Clerk remain the platform foundation.
- Scheduling is app-owned; Google Calendar integration is a later milestone.
- Development data reset is acceptable; no production migration is required here.
- One household time zone controls scheduling, prompts, occurrence generation, and
  review timing for all members.
- Invitation email is the only outbound notification in this initiative; due work and
  assistant drafts are communicated in-app.
- Completion timing is self-reported categorical evidence with optional notes, not
  exact timer-based tracking.
- The visual companion browser path failed during this design session because locally
  served preview content was blocked by the in-app browser; calendar mockup review must
  be revalidated during UI implementation.
