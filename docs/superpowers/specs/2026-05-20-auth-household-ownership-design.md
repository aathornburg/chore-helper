# Auth + Household Ownership Design

Date: 2026-05-20

## Summary

Roadmap Step 2 introduces hosted authentication and makes household data belong to authenticated users. The product should move from a browser-local household pointer to server-enforced household access while keeping local development and the first signed-in experience straightforward.

The selected direction is Clerk for hosted auth, Clerk prebuilt React UI, Clerk Express middleware, many-household support in the data model, server-persisted active household selection, and membership-based household access. The first UI can create and select households, but invitations and shared-household management are future scope.

Reference docs:

- Clerk React provider: `https://clerk.com/docs/react/reference/components/clerk-provider`
- Clerk Express middleware: `https://clerk.com/docs/reference/express/clerk-middleware`

## Product Scope

This milestone should deliver:

- Users can sign in, sign up, and sign out through Clerk.
- Signed-in users can create, list, and select households they can access.
- The selected active household is stored on the server user profile, not in browser localStorage.
- Household API routes require authentication.
- Existing household reads and writes are authorized through membership, not only by client-provided household IDs.
- Local development uses real Clerk test keys from environment variables.

This milestone should not deliver:

- Migration or claiming of anonymous localStorage household IDs.
- Household invitations, member management screens, role editing, or family workload features.
- Google Calendar OAuth, OpenAI user auth integration, or billing.
- A parallel mock-auth path for local development.

## Authentication Model

Use Clerk as the source of identity.

Frontend:

- Wrap the React app in `ClerkProvider` using `VITE_CLERK_PUBLISHABLE_KEY`.
- Use Clerk prebuilt components for signed-in/signed-out rendering, sign-in, sign-up, and the user menu.
- Treat signed-out users as unauthenticated: they can see the landing/sign-in entry point, but setup, Today, Plan, and Settings require sign-in.

Backend:

- Install Clerk Express middleware before API routes.
- Require authentication for household APIs.
- Convert the Clerk user ID into an app `User` record on first authenticated API use.
- Store Clerk IDs as stable external identity keys; do not duplicate passwords or session secrets in the app database.

Environment:

- `server/.env.example` should document `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY`.
- `web` should document `VITE_CLERK_PUBLISHABLE_KEY`.
- If these keys are missing, the app should fail loudly in development instead of silently falling back to anonymous ownership.

## Household Ownership Model

Support many households per user from the beginning.

Database model:

- `User`
  - `id`: app-owned ID.
  - `clerkUserId`: unique Clerk user ID.
  - `activeHouseholdId`: nullable selected household ID.
  - timestamps.
- `Household`
  - existing household fields remain.
  - no client-trusted owner field is enough by itself; access flows through membership.
- `HouseholdMember`
  - `householdId`.
  - `userId`.
  - `role`: start with `owner` and `member`.
  - unique `(householdId, userId)`.
  - timestamps.

Behavior:

- Creating a household creates a membership for the current user with role `owner`.
- A signed-in user can only list households where they have a membership.
- A signed-in user can only read, update, create chores, list chores, and generate/list recommendations for households where they have a membership.
- `User.activeHouseholdId` must either be null or point to a household where the user has membership.
- When the user creates their first household, it becomes active.
- If an active household is deleted or access is later removed in a future feature, the active selection should be cleared or moved to another accessible household. Deletion/access removal is not part of this milestone.

## API Design

Add authenticated current-user household endpoints:

- `GET /api/me`
  - Returns the app user profile, Clerk user ID, active household ID, and minimal active household summary when available.
- `GET /api/me/households`
  - Lists households the signed-in user can access with role and active marker.
- `POST /api/me/households`
  - Creates a household for the signed-in user and owner membership.
  - Sets it active if no active household exists, or if the request asks to make it active.
- `PUT /api/me/active-household`
  - Accepts a household ID.
  - Succeeds only when the signed-in user has membership in that household.

Protect existing household-scoped routes:

- `GET /api/households/:householdId`
- `PUT /api/households/:householdId/baseline`
- `POST /api/households/:householdId/chores`
- `GET /api/households/:householdId/chores`
- `GET /api/households/:householdId/recommendations`
- `POST /api/households/:householdId/recommendations`

Authorization failures should be explicit:

- Missing or invalid auth: `401`.
- Authenticated but not a member of the household: `404` for household ID routes to avoid confirming household existence.
- Invalid payloads remain `400`.

The existing route shape can stay, but route handlers must resolve the authenticated app user and verify membership before touching household data.

## Frontend Behavior

Replace household localStorage ownership with authenticated household selection.

Signed-out state:

- Landing shows sign-in and sign-up actions.
- Workspace routes should show a sign-in prompt or redirect through Clerk UI.
- No household API calls should be made without an authenticated Clerk session.

Signed-in state:

- The app loads the current user profile and household list from authenticated `/api/me` endpoints.
- If the signed-in user has no households, Setup starts by creating the first authenticated household.
- If the signed-in user has households but no active household, the app asks them to select one.
- If the signed-in user has an active household, Today, Setup, and Plan load data for that active household.
- The app no longer restores ownership from `chore-helper:household-id` for signed-in users.
- Any existing localStorage household ID should be ignored after auth is introduced. It may be removed opportunistically after successful sign-in to avoid confusion.

Household selector:

- Include a minimal household selector in the app shell or Settings.
- The selector lists accessible households and calls `PUT /api/me/active-household`.
- The selector does not manage members or invitations in this milestone.

## Data Flow

1. User opens the app.
2. Clerk determines signed-in or signed-out state.
3. Signed-out users see auth entry points.
4. Signed-in users call `/api/me` and `/api/me/households`.
5. The backend upserts the app `User` from the Clerk user ID.
6. The frontend uses the server active household selection.
7. Setup creates or updates the authenticated household.
8. Today and Plan read household data through membership-protected routes.

The React `HouseholdSetupProvider` should evolve into an authenticated household provider. Its responsibility changes from "restore a localStorage household ID" to "load the signed-in user's active household and setup readiness from the server."

## Testing Strategy

Backend tests should cover:

- Unauthenticated household API requests return `401`.
- First authenticated request creates or resolves the app `User`.
- Authenticated user can create a household and receives owner membership.
- Authenticated user can list only their accessible households.
- Authenticated user can set active household only to a household where they are a member.
- Household baseline, chore, and recommendation routes reject access for non-members.
- Existing recommendation behavior still works for an authorized member.

Frontend tests should cover:

- Signed-out shell renders sign-in/sign-up entry points.
- Signed-in user with no household is sent into authenticated setup.
- Setup creates an authenticated household instead of relying on localStorage ownership.
- Signed-in user with active household sees Today and Plan data.
- Household selector changes active household through the server.
- Existing localStorage household ID is ignored after sign-in.

Verification commands for the eventual implementation:

- `npm.cmd run test -w server`
- `npm.cmd run typecheck -w server`
- `npm.cmd run test -w web`
- `npm.cmd run typecheck -w web`
- `npm.cmd run build -w web`

## Assumptions

- Clerk test keys are acceptable local development prerequisites.
- Membership is introduced now even though member invitation UI is future scope.
- Active household selection belongs on the app `User` record and follows the user across browsers.
- Anonymous setup data is not migrated into authenticated accounts.
- The first implementation plan should keep schema and API changes incremental, preserving the existing household route names while adding authenticated current-user endpoints.
