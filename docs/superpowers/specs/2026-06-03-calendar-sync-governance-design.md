# Calendar Sync Governance Design

Date: 2026-06-03

## Summary

Cleanly should support Google Calendar import and export as the first provider in a broader provider-agnostic calendar sync system. The product needs two distinct control surfaces:

- Owners manage what each family member can send into the shared Cleanly calendar.
- Each member manages their own Google connection, privacy level, import submissions, and export destinations.

This keeps the family calendar useful without making Cleanly feel invasive. Owners can protect the shared planning surface, while members keep control over their personal calendars and event detail privacy.

## Goals

- Add a separate internal Cleanly calendar that can contain chores and commitments.
- Let owners manage per-member import governance for the household.
- Let members choose which external events they share with Cleanly.
- Let members choose whether and how Cleanly exports events back to their own calendar.
- Keep export independent from import so users can export Cleanly chores without sharing personal commitments.
- Prepare for Google Calendar first, while leaving room for future calendar providers.
- Add an owner-only import queue on the Calendar page using the selected queue table/detail rail direction.

## Non-Goals

- Do not build support for non-Google providers in the first implementation.
- Do not let owners connect calendars on behalf of members.
- Do not let owners control member export settings.
- Do not expose household import queue endpoints to non-owners.
- Do not default to storing full private event details.
- Do not imply that members must import personal calendar events to use export.

## Product Rules

The internal Cleanly calendar is separate from every external provider calendar. Imported commitments and Cleanly chores become Cleanly-owned planning objects with source references, not provider-owned state.

Google Calendar connections are user-owned. A household owner can decide whether a member is allowed to submit events into the household Cleanly calendar, but the owner cannot connect that member's Google account or choose that member's export destination.

Members choose the events they send to Cleanly. If the household owner policy for that member is `manual`, selected events enter the owner review queue. If the policy is `auto`, selected events are added automatically to the shared Cleanly calendar. If the policy is `off`, the member cannot submit imported events for that household.

Members choose their own export behavior. Export can be off, review-first, or automatic. Members choose the target calendar for exported Cleanly events. Export does not require import.

Cleanly may store full event details only when the member permits it. The default imported commitment detail level is busy-only.

## Owner Settings Experience

Use the selected Owner Settings A direction: a governance dashboard.

The owner Settings page has two clear lanes:

- `Your calendar connection`: the owner's personal Google connection, source calendars, privacy preference, and export preference.
- `Family import controls`: owner-managed rules for what each household member can send into the shared Cleanly calendar.

The family import controls table shows one row per member:

- Member name/email.
- Import to Cleanly: `Off`, `Review first`, or `Auto-add`.
- Allowed content: `Chores`, `Commitments`, or `Both`.
- Detail policy summary showing that member privacy controls still apply.

Page copy should be explicit:

- Import governance controls what members can send into the shared Cleanly calendar.
- Export is personal. Each member controls whether Cleanly writes to their own calendar and where those exports go.
- Members may share busy-only information unless they opt into full event details.

## Non-Owner Settings Experience

Use the selected Non-owner Settings A direction: a personal sync center.

The member Settings page includes:

- Google Calendar connection status.
- Source calendar selection.
- Privacy default: `Busy only` first, `Full details` as an opt-in.
- A way to review candidate events and choose which ones to send to Cleanly.
- Export destination calendar selection.
- Export mode: `Off`, `Review first`, or `Auto`.
- Export content mode: `Chores`, `Commitments`, or `Both`.

Non-owners do not see the owner per-member import governance table. They can see a small status summary for their own household policy, such as "Your household owner reviews shared events before they appear on the Cleanly calendar."

## Calendar Import Queue Experience

Use Queue C from `docs/settings-calendar-sync-comparison.html`.

The owner-only Calendar queue appears near the top of the Calendar page on desktop. It should not be shown to non-owners.

The queue has a compact table and a detail rail:

- Table columns: event, submitted by, type, time, detail level, status/action.
- Detail rail: selected event summary, submitted member, proposed type, privacy level, approve/reject actions, and editable type selection.

The queue should respect privacy. If a member submitted busy-only details, the owner sees only the allowed summary and timing information.

When the queue is empty, show a quiet empty state. It should not feel like a large marketing hero.

## Data Model

### CalendarConnection

Represents a user's connection to a calendar provider.

Fields:

- `id`
- `userId`
- `provider`: currently `google`
- `providerAccountEmail`
- `status`: `connected`, `expired`, `revoked`, or `error`
- `scopes`
- `accessTokenEncrypted`
- `refreshTokenEncrypted`
- `tokenExpiresAt`
- `lastSyncedAt`
- `createdAt`
- `updatedAt`

### ExternalCalendar

Represents a provider calendar available through a connection.

Fields:

- `id`
- `connectionId`
- `providerCalendarId`
- `name`
- `color`
- `timezone`
- `accessRole`
- `isSelectedForImport`
- `isSelectedForExport`
- `createdAt`
- `updatedAt`

### HouseholdMemberCalendarPolicy

Owner-managed import governance for one household member.

Fields:

- `id`
- `householdId`
- `memberId`
- `importQueueMode`: `off`, `manual`, or `auto`
- `importContentMode`: `chores`, `commitments`, or `both`
- `createdAt`
- `updatedAt`

### MemberCalendarSharingPreference

Member-managed import and privacy preferences.

Fields:

- `id`
- `userId`
- `householdId`
- `defaultDetailLevel`: `busy_only` or `full_details`
- `selectedSourceCalendarIds`
- `createdAt`
- `updatedAt`

### MemberCalendarExportPreference

Member-managed export settings.

Fields:

- `id`
- `userId`
- `householdId`
- `exportMode`: `off`, `review`, or `auto`
- `exportContentMode`: `chores`, `commitments`, or `both`
- `destinationExternalCalendarId`
- `createdAt`
- `updatedAt`

### CleanlyCalendarEvent

Provider-agnostic internal calendar event used by Cleanly planning.

Fields:

- `id`
- `householdId`
- `createdByUserId`
- `type`: `chore` or `commitment`
- `title`
- `privacyTitle`
- `detailLevel`: `busy_only` or `full_details`
- `description`
- `location`
- `startsAt`
- `endsAt`
- `timezone`
- `source`: `cleanly`, `google`, or future provider key
- `status`: `active`, `cancelled`, or `archived`
- `createdAt`
- `updatedAt`

### CalendarImportQueueItem

Owner-managed item submitted by a member for shared Cleanly calendar review.

Fields:

- `id`
- `householdId`
- `submittedByUserId`
- `sourceConnectionId`
- `sourceExternalCalendarId`
- `providerEventId`
- `proposedType`: `chore` or `commitment`
- `detailLevel`: `busy_only` or `full_details`
- `allowedPayloadJson`
- `queueStatus`: `pending`, `approved`, `rejected`, `auto_added`, or `needs_member`
- `ownerDecisionByUserId`
- `ownerDecisionAt`
- `createdCleanlyEventId`
- `createdAt`
- `updatedAt`

### CalendarExportQueueItem

Member-managed item used when export mode is review-first.

Fields:

- `id`
- `userId`
- `householdId`
- `cleanlyCalendarEventId`
- `destinationExternalCalendarId`
- `queueStatus`: `pending`, `approved`, `rejected`, or `exported`
- `createdAt`
- `updatedAt`

### ExternalCalendarEventLink

Links internal Cleanly events to provider events to prevent duplicate imports/exports.

Fields:

- `id`
- `cleanlyCalendarEventId`
- `connectionId`
- `externalCalendarId`
- `providerEventId`
- `direction`: `import` or `export`
- `createdAt`
- `updatedAt`

## API Design

### Owner-Only Household Import Governance

`GET /api/households/:householdId/calendar/import-policies`

- Requires household owner.
- Returns members and each member's import queue/content mode.

`PATCH /api/households/:householdId/calendar/import-policies/:memberId`

- Requires household owner.
- Updates one member's import queue/content mode.
- Rejects changes for users who are not household members.

`GET /api/households/:householdId/calendar/import-queue`

- Requires household owner.
- Returns import queue items for the household.

`PATCH /api/households/:householdId/calendar/import-queue/:queueItemId`

- Requires household owner.
- Approves or rejects one queue item.
- On approval, creates or updates a `CleanlyCalendarEvent`.

### Member-Owned Calendar Connection and Preferences

`GET /api/me/calendar/connections`

- Returns current user's calendar provider connections.

`POST /api/me/calendar/google/connect`

- Starts the Google OAuth flow for the current user.

`DELETE /api/me/calendar/connections/:connectionId`

- Disconnects the current user's provider connection.

`GET /api/me/calendar/preferences`

- Returns current user's sharing and export preferences.

`PATCH /api/me/calendar/preferences`

- Updates current user's source calendars, privacy default, export destination, export mode, and export content mode.

### Member Event Submission and Export Review

`GET /api/me/calendar/import-candidates`

- Returns external events the current user may choose to send to Cleanly.
- Applies household owner policy before returning candidates.

`POST /api/me/calendar/import-queue`

- Sends selected events to the Cleanly queue or auto-adds them when the member policy is `auto`.
- Returns created queue items or created Cleanly events.

`GET /api/me/calendar/export-queue`

- Returns current user's pending export review items.

`PATCH /api/me/calendar/export-queue/:queueItemId`

- Approves or rejects one of the current user's export items.

## Permissions

Owners can:

- Manage household member import policies.
- View and manage the household import queue.
- Approve or reject member-submitted events.
- See only the event details each member has permitted.

Members can:

- Connect or disconnect their own Google Calendar account.
- Choose source calendars and privacy defaults.
- Submit selected events to Cleanly when household policy allows it.
- Configure export mode, content mode, and destination calendar.
- Review their own export queue.

Members cannot:

- See household import policies for other members.
- See the owner import queue.
- Approve household imports.
- Edit another member's calendar settings.

Owners cannot:

- Force member export behavior.
- Choose another member's export destination.
- Connect another member's Google account.
- See private details beyond the member's selected detail level.

## Error Handling

Expired or revoked Google connections should remain visible in Settings with a reconnect action. Import and export work should fail closed: no background import/export should run when the connection is expired, revoked, or missing required scopes.

If a member's household import policy changes to `off`, new import submissions are blocked. Existing pending queue items remain visible to owners with a policy-change note so the owner can reject or approve them deliberately.

If an export destination calendar is deleted or no longer writable, export mode stays configured but export attempts move into an error state until the member chooses a valid destination.

## Testing Strategy

Backend tests should cover:

- Owner-only access for import policy and import queue endpoints.
- Non-owner rejection for queue management endpoints.
- Member-only access to their own calendar connection and preferences.
- Import submission behavior for `off`, `manual`, and `auto`.
- Privacy behavior for busy-only versus full-detail queue items.
- Export preference behavior independent from import settings.

Frontend tests should cover:

- Owner Settings renders the governance dashboard and per-member controls.
- Non-owner Settings renders the personal sync center and does not show per-member controls.
- Owner Calendar shows the queue table/detail rail.
- Non-owner Calendar does not show the owner queue.
- Export copy clearly states export is controlled by the member and does not require importing personal events.

## Implementation Plan Split

This spec should become multiple implementation plans:

1. Data model and backend calendar sync foundations.
2. Settings UI for owner governance and member personal sync.
3. Calendar owner import queue UI.
4. Google OAuth and provider sync execution, if not included in the backend foundation slice.

This split keeps each implementation batch testable without requiring the full Google integration to land in one risky change.
