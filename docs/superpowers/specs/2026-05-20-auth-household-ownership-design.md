# Auth + Household Ownership Design

Date: 2026-05-20

## Summary

Roadmap Step 2 introduces hosted authentication and makes household data belong to authenticated users. The product should move from a browser-local household pointer to server-enforced household access while keeping local development and the first signed-in experience straightforward.

The selected direction is Clerk for hosted auth, Clerk prebuilt React UI, Clerk Express middleware, many-household support in the data model, and membership-based household access. The product should not introduce a selected, current, or active household concept; authenticated screens should load the signed-in user's accessible household data and render household context where needed. Invitations and shared-household management are future scope.

Reference docs:

- Clerk React provider: `https://clerk.com/docs/react/reference/components/clerk-provider`
- Clerk Express middleware: `https://clerk.com/docs/reference/express/clerk-middleware`

## Product Scope

This milestone should deliver:

- Users can sign in, sign up, and sign out through Clerk.
- Signed-in users can create and list households they can access.
- Household ownership is resolved through server-side membership, not browser localStorage or an active-household pointer.
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
- The app does not persist a current household on the user. When a workflow needs household context, it should either operate across all accessible households or render the household-specific control inside that household's own panel.

## API Design

Add authenticated current-user household endpoints:

- `GET /api/me`
  - Returns the app user profile and Clerk user ID.
- `GET /api/me/households`
  - Lists households the signed-in user can access with role.
- `POST /api/me/households`
  - Creates a household for the signed-in user and owner membership.

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

Replace household localStorage ownership with authenticated user-scoped household loading.

Signed-out state:

- Landing shows sign-in and sign-up actions.
- Workspace routes should show a sign-in prompt or redirect through Clerk UI.
- No household API calls should be made without an authenticated Clerk session.

Signed-in state:

- The app loads the current user profile and household list from authenticated `/api/me` endpoints.
- If the signed-in user has no households, Setup starts by creating the first authenticated household.
- If the signed-in user has households, pages render data across the accessible household list. Household-specific editing stays inside the relevant household panel.
- Today, Chores, Optimize, and Households should not depend on a selected household value.
- The app no longer restores ownership from `chore-helper:household-id` for signed-in users.
- Any existing localStorage household ID should be ignored after auth is introduced. It may be removed opportunistically after successful sign-in to avoid confusion.

Household navigation:

- Do not add a global household selector.
- If a page needs to distinguish households, render each household as its own section or panel and include the household name in the relevant details.
- Settings may later manage household membership or invitations, but that is outside this milestone.

## Data Flow

1. User opens the app.
2. Clerk determines signed-in or signed-out state.
3. Signed-out users see auth entry points.
4. Signed-in users call `/api/me` and `/api/me/households`.
5. The backend upserts the app `User` from the Clerk user ID.
6. The frontend loads all accessible households and related app data.
7. Setup creates or updates authenticated households without storing a selected household pointer.
8. Today, Chores, Optimize, and Households read data through membership-protected routes.

The React `HouseholdSetupProvider` should evolve into an authenticated app data provider. Its responsibility changes from "restore a localStorage household ID" to "load the signed-in user's accessible households and setup readiness from the server."

## Testing Strategy

Backend tests should cover:

- Unauthenticated household API requests return `401`.
- First authenticated request creates or resolves the app `User`.
- Authenticated user can create a household and receives owner membership.
- Authenticated user can list only their accessible households.
- Household baseline, chore, and recommendation routes reject access for non-members.
- Existing recommendation behavior still works for an authorized member.

Frontend tests should cover:

- Signed-out shell renders sign-in/sign-up entry points.
- Signed-in user with no household is sent into authenticated setup.
- Setup creates an authenticated household instead of relying on localStorage ownership.
- Signed-in user with households sees household-scoped data rendered without a selected household.
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
- Anonymous setup data is not migrated into authenticated accounts.
- The first implementation plan should keep schema and API changes incremental, preserving the existing household route names while adding authenticated current-user endpoints.
