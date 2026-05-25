# Pre-Calendar UX Foundation Design

Date: 2026-05-24

## Summary

After Clerk authentication and before Google Calendar integration, Cleanly needs a coherent product-facing UI foundation. This milestone replaces the minimal signed-out auth gate, turns Today into the authenticated home screen, finishes Household management as a real editing surface, and establishes honest Calendar entry points that the next milestone can activate.

The visual direction retains the current warm, home-oriented palette and rounded card language while improving hierarchy, density, responsive behavior, and small interaction details.

## Product Experience

### Landing And Authentication

- Signed-out users visiting `/` or an authenticated workspace URL see a redesigned public landing page with Clerk `Sign up` and `Sign in` actions.
- The page markets the intended finished product, including assistant optimization, Calendar import/export, and fairer household routines.
- Signed-in users visiting `/` are routed to `/today`; the current signed-in marketing landing view is removed.

### Today

- Today becomes a unified overview across every household accessible to the authenticated user; no active-household selector is introduced.
- Empty users receive a clear create/setup-household action.
- Incomplete households receive household-labeled actions to complete profile details or add chores.
- Ready households show real stored chore counts, recommendation activity, profile readiness, and navigation actions.
- Today must not imply that chores are due or completable on a date until scheduling/completion state exists.
- A Google Calendar prompt navigates to the Calendar integration section in Settings.

### Households

`Manage` becomes a complete editing workspace:

- `Overview`: editable household name and general profile facts.
- `Floors`: editable floor name, appropriate level type, surfaces, pet impact, robot coverage, notes, add/remove floor, and basement controls.
- `Rooms`: editable name, surfaces, pet-impact and robot-coverage overrides, notes, add/remove room.

Saves and errors are scoped to the edited area and successful saves refresh shared household state.

### Calendar Entry Surfaces

- Settings gains an Integrations section containing a Google Calendar card at `/settings#calendar`.
- Before OAuth exists, the card shows `Not connected` and an active `Connect Google Calendar` action that opens an inline explanation only. It does not persist fake connection state.
- Today links to this Settings card.
- Chores gains `Import calendar events`; before integration is implemented, it navigates to the same Settings card.

## Data Contract

Remove the duplicate legacy `HouseholdBaseline` model and endpoint. Local development data may be cleared rather than migrated.

Replacement domain:

- `Household`: identity, ownership/membership, and editable `name`.
- `HouseholdProfile`: one-to-one general facts: `homeType`, `hasPets`, `hasOutdoorSpace`, and optional `notes`.
- `HouseholdFloor` and `HouseholdRoom`: the only source of floors, rooms, surfaces, pet-impact context, device coverage, and floor/room notes.

Public interface changes:

- Remove `PUT /api/households/:householdId/baseline`.
- Add `PUT /api/households/:householdId/profile` with `{ name, homeType, hasPets, hasOutdoorSpace, notes? }`.
- Authenticated household application data returns `profile` and `structure`.
- Continue saving structure through `PUT /api/households/:householdId/structure`.

Derived behavior:

- `profileComplete`: general profile exists and structure contains at least one floor.
- `reviewReady`: profile is complete and at least one active chore exists.
- Today consumes all authenticated households instead of a `households[0]` compatibility projection.

## Error Handling And Verification

- Clerk actions remain available without app data and do not issue household API calls while signed out.
- Today distinguishes loading, load failure, no-household, incomplete, and ready states.
- Profile and structure save failures retain recoverable user context and render inline error messages.
- Calendar shell actions are explicit about the not-yet-connected state and never simulate successful integration.

Automated tests cover signed-out landing/root routing, multi-household Today states, profile and structure persistence/authorization, complete Household editing controls, Settings Calendar shell navigation, and the Chores import entry action.

Manual validation uses `browser-use` at desktop and narrow viewports. Authenticated Clerk smoke testing may use the development test identity `alan+clerk_test@example.com` and MFA code `424242`.

## Assumptions

- Existing uncommitted Clerk/landing changes are part of the current baseline and must be incorporated rather than reverted.
- The app is not in production, so dropping baseline data and resetting the local Prisma database is acceptable.
- Calendar OAuth, imported events, export drafts, and stored connection status remain in the subsequent Google Calendar milestone.
