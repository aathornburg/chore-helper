# UI Data + MVP 1 Setup Flow Design

Date: 2026-05-19

## Summary

Roadmap Step 1 includes finishing the MVP 1 setup flow. The product should focus first on optimizing existing chores, not people or workload balancing. The core user journey is: Today sends incomplete users into Setup, Setup gathers household context and at least one existing chore, Google Calendar is presented as an upcoming import path, and Plan reviews the saved chore setup.

## Product Scope

MVP 1 is about chore optimization:

- Establish household context that affects recommendations.
- Capture existing chores manually.
- Make Google Calendar visible as the future import path without implementing OAuth yet.
- Send users to Plan for review once they have context and at least one chore.
- Keep recommendation and calendar-change posture manual-acceptance only.

MVP 2 includes people, workload, ownership rotation, fairness, and richer Family views.

## Setup Flow

Replace the current single setup form with a guided stepper:

1. **Household Context**: household name, home type, rooms, flooring, pets, outdoor space, and notes.
2. **Existing Chores**: add at least one current chore with title, cadence, estimated minutes, and source.
3. **Import Options**: show Google Calendar as an upcoming import option; keep manual entry as the active path.
4. **Review Handoff**: summarize setup progress and route to Plan.

Setup is complete only when baseline context exists and at least one chore exists.

## App Behavior

- Today should show a clear incomplete setup state until setup completion criteria are met.
- Today should summarize real household context and chore readiness after setup is complete.
- Plan should remain the review workspace and load persisted chores/recommendations.
- Family should be removed or de-emphasized from primary MVP 1 navigation.
- Demo data should be removed from core MVP 1 surfaces or clearly isolated as future/demo-only content.

## Data Flow

Reuse current backend APIs:

- `POST /api/households`
- `PUT /api/households/:householdId/baseline`
- `POST /api/households/:householdId/chores`
- `GET /api/households/:householdId/chores`
- `GET /api/households/:householdId/recommendations`
- `POST /api/households/:householdId/recommendations`

No Prisma schema changes are required for this milestone. The frontend should derive setup completion from saved baseline context plus persisted chore count. `localStorage` remains the pre-auth active household pointer until the auth milestone replaces it.

## Test Plan

- Today routes incomplete users to Setup.
- Setup renders the guided steps in order.
- Saving household context alone does not complete setup.
- Adding one existing chore completes setup.
- Google Calendar appears as an upcoming/disabled import option.
- Completed setup routes users toward Plan review.
- Family is not shown as a primary MVP 1 nav item.
- Plan loads persisted chores and generates recommendations.
- Run `npm.cmd test`, `npm.cmd run typecheck`, and `npm.cmd run build -w web`.

## Assumptions

- Google Calendar OAuth/import is not part of this slice.
- Auth and OpenAI Agents SDK integration remain separate roadmap milestones.
- People/workload views move to MVP 2.
- This milestone improves flow and data integration without changing the database schema.
