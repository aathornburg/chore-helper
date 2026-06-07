# Owner Import Queue Notifications Plan

## Summary
Add durable in-app notifications for household owners when calendar import queue items are waiting for review. The notification is a task-style reminder, not an activity feed: one unread notification per owner per household with pending imports. The bell tells owners "new review work exists," while the Calendar page/import queue badge continues to show "review work remains."

## Key Changes
- Add a reusable notification model with fields for recipient user, type, household, title/body, target path, metadata, `readAt`, and a dedupe key.
- Use notification type `calendar_import_queue_review` with one active notification per owner and household.
- When manual import queue items are submitted, create or refresh the notification for all household owners:
  - Auto-approved imports do not create owner review notifications.
  - New pending items reset `readAt` to unread.
  - Notification copy aggregates the work, such as "Calendar imports need review" and "X events are waiting in Home."
- Add notification APIs:
  - `GET /api/me/notifications` returns current user notifications, including unread task count.
  - `PATCH /api/me/notifications/read` marks supplied notifications read.
  - Endpoints only return or mutate the current user's notifications.
- Keep WebSocket/SSE delivery out of MVP, but structure the response shape so future realtime delivery can reuse the same notification payload.

## App Behavior
- On signed-in app load and when the tab regains focus, fetch notifications.
- The existing header bell gets:
  - A small unread badge counting unread tasks, not pending queue items.
  - A popover listing notifications.
  - Opening the popover marks visible notifications read.
- Clicking the import queue notification navigates to `/calendar?reviewImports=1`.
- Calendar reads the query param, opens the owner review imports modal, then may clean the URL after opening.
- The Calendar review badge/count remains based on pending queue items and does not clear merely because the notification was read.

## UI Requirements
- Bell popover should be compact and match the newer squared, light-shadow app styling.
- Empty state: "No new notifications."
- Import queue notification row should show household name, pending count, and "Review imports."
- The notification should be keyboard accessible:
  - Bell button has `aria-expanded`.
  - Popover is dismissible with Escape and outside click.
  - Notification rows are buttons/links with clear accessible labels.
- Mobile: popover can become a full-width dropdown under the header; no hover-only interactions.

## Data Flow
- Member submits selected Google events.
- Server creates pending `CalendarImportQueueItem` rows when owner policy is manual.
- After queue creation, server counts pending queue items for that household and upserts one unread notification for each owner.
- Header fetches notifications after auth/app shell is ready.
- Opening bell marks unread notifications read.
- Clicking the queue notification opens Calendar owner review.
- Approving/rejecting queue items updates queue state; once no pending items remain, future notification fetches should not show an active import review task.

## Test Plan
- Server tests:
  - Manual import submission creates one notification per owner.
  - Multiple submissions update one deduped notification instead of creating duplicates.
  - Auto-approved imports do not create owner review notifications.
  - Non-owner users cannot see owner notifications.
  - Mark-read only affects the current user's notifications.
  - Notification disappears or becomes inactive once no pending queue items remain.
- Web tests:
  - Header bell shows unread badge after notification fetch.
  - Opening bell popover marks notifications read and clears bell badge.
  - Clicking import queue notification navigates to Calendar and opens review modal.
  - Calendar queue badge remains visible while pending imports remain.
  - Empty notification popover renders correctly.
- Verification:
  - `npm.cmd run test -w server -- calendarSync.test.ts`
  - `npm.cmd --% run test -w web -- App.test.tsx -t "Calendar|notifications"`
  - `npm.cmd run build -w web`

## Assumptions
- "On login" means when the signed-in SPA shell first loads; notifications also refresh on tab focus.
- All household owners receive the same review-task notification.
- Bell badge counts unread notification tasks, not individual imported events.
- Browser push, email, WebSockets, and SSE are future work, not part of this MVP.
