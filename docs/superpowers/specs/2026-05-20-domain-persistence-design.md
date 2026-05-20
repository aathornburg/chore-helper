# Domain Persistence + Chore CRUD Design

Date: 2026-05-20

## Summary

Roadmap Step 2 focuses on making the local app durable and editable before auth or hosted deployment. The app already persists households, baseline context, chores, and recommendation rows through Prisma/Postgres. This milestone hardens that foundation by making Plan a persisted chore CRUD surface: users can add, edit, archive, view archived chores, and restore chores, with all changes saved to the local database.

Auth remains future scope. The app continues using the localStorage active household pointer until the Auth + Household Ownership milestone replaces it with session-backed ownership.

## Product Scope

This milestone should deliver:

- Plan shows active chores loaded from the local Postgres database.
- Users can add chores from Plan.
- Users can select a chore and edit title, cadence, estimated minutes, and source.
- Users can archive a chore instead of permanently deleting it.
- Plan includes an archived chores view or toggle where archived chores can be restored.
- Normal chore lists exclude archived chores unless explicitly requested.
- Editing, archiving, or restoring a chore marks existing recommendations stale.

This milestone should not deliver:

- Auth, users, sessions, or household ownership.
- Google Calendar OAuth or real imported event sync.
- People/workload/fairness domain tables.
- Full recommendation decision history, accept/skip workflows, or calendar change drafts.
- Household switching/deletion UI beyond the current local active household behavior.

## Domain Model

Extend the existing `Chore` model instead of introducing a separate task table.

Chore fields:

- Keep existing `id`, `householdId`, `title`, `cadence`, `estimatedMinutes`, `source`, `createdAt`, and `updatedAt`.
- Add `archivedAt DateTime?`.
- Keep `source` as `"manual"` for active entry in this slice. Google Calendar remains a future source and should not be selectable until the integration exists.

Recommendation fields:

- Keep existing recommendation fields.
- Add a stale marker such as `staleAt DateTime?`.
- When a chore is edited, archived, or restored, mark current recommendations for that household as stale.
- Stale recommendations should not be presented as current advice in Plan. The UI should tell the user to rerun review after chore changes.

The design intentionally stops short of recommendation decision history. Accepted/skipped recommendation persistence is a later domain-hardening slice once the recommendation UX has explicit decision actions.

## API Design

Add complete local chore persistence operations under the existing household-scoped route shape:

- `GET /api/households/:householdId/chores`
  - Returns active chores only by default.
  - Supports an explicit query such as `?includeArchived=true` or `?status=archived` for archived views.
- `POST /api/households/:householdId/chores`
  - Creates a manual chore.
  - Marks current recommendations stale for the household.
- `PUT /api/households/:householdId/chores/:choreId`
  - Updates editable fields for a chore in that household.
  - Rejects mismatched household/chore IDs.
  - Marks current recommendations stale when values change.
- `POST /api/households/:householdId/chores/:choreId/archive`
  - Sets `archivedAt`.
  - Hides the chore from active lists.
  - Marks current recommendations stale.
- `POST /api/households/:householdId/chores/:choreId/restore`
  - Clears `archivedAt`.
  - Returns the chore to active lists.
  - Marks current recommendations stale.

Keep hard delete out of the public API for now. If test setup needs cleanup, it should use repository/database helpers rather than product routes.

Repository changes:

- Add `getChore`, `updateChore`, `archiveChore`, and `restoreChore` to the store boundary.
- Add a store method for marking recommendations stale for a household.
- Prisma and in-memory stores should implement the same behavior so route tests remain fast and deterministic.

## Frontend Behavior

Plan remains the primary chore management surface.

Active queue:

- Load active chores and non-stale recommendations for the current local household.
- Selecting a chore opens the existing detail panel.
- The detail panel becomes an inline editor with fields for title, cadence, estimated minutes, and source.
- Save updates the chore through the API and refreshes local Plan state.
- Archive removes the chore from the active queue and moves it to the archived view.

Archived view:

- Provide a simple archived chores section or toggle in Plan.
- Archived chores show enough detail to identify them.
- Restore returns a chore to the active queue.
- Archived chores do not participate in active queue metrics or active recommendation matching.

Recommendations:

- If recommendations become stale after a chore change, hide them from the current recommendation list or label them as stale.
- Show a clear status such as "Chores changed. Run review again for updated recommendations."
- Running review again saves a fresh non-stale recommendation set.

Local household behavior:

- Continue reading the active household ID from `chore-helper:household-id`.
- Do not add household ownership, user selection, or auth dependencies in this milestone.

## Error Handling

- Invalid chore payloads return `400`.
- Missing household or chore returns `404`.
- Updating or archiving a chore through the wrong household route returns `404`.
- Failed save/archive/restore actions keep the current UI state visible and show an actionable status message.
- Empty active and empty archived lists should have distinct copy.

## Testing Strategy

Backend tests should cover:

- Creating and listing active chores.
- Updating a chore persists changed fields.
- Archiving a chore hides it from the default list.
- Archived chores are available through the archived/includeArchived API path.
- Restoring a chore returns it to active lists.
- Wrong household/chore combinations return `404`.
- Editing, archiving, and restoring chores mark existing recommendations stale.
- Freshly generated recommendations are current, not stale.

Frontend tests should cover:

- Plan loads active chores from the API.
- Inline chore edits call the update API and update the selected card/detail view.
- Archive removes a chore from the active queue.
- Archived view shows archived chores.
- Restore moves a chore back to the active queue.
- Chore changes show a stale-recommendations status and prompt rerunning review.
- Empty active and archived states render intentionally.

Verification commands for the eventual implementation:

- `npm.cmd run test -w server`
- `npm.cmd run typecheck -w server`
- `npm.cmd run test -w web`
- `npm.cmd run typecheck -w web`
- `npm.cmd run build -w web`

## Assumptions

- Local Postgres via the existing Docker/Prisma setup is the source of truth for this milestone.
- The existing localStorage active household pointer remains acceptable until Auth + Household Ownership.
- Soft archive is preferred over hard delete to preserve history for future agent and recommendation features.
- Marking recommendations stale is enough for this slice; full accept/skip decision history is deferred.
- Plan is the right first UI surface for chore CRUD because it is already the review queue and chore management workspace.
