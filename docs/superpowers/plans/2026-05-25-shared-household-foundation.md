# Shared Household Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add household time-zone settings, real member visibility and administration, and email invitation acceptance so later chore schedules can be assigned to authenticated people.

**Architecture:** Keep Clerk responsible for authentication and retain app-owned `HouseholdMember` authorization in Prisma. Expand the existing household route/store boundary with time-zone and membership operations, then add invitation records and an injected mail sender so production can use Resend while tests stay deterministic. Replace the Family placeholder with household-scoped collaboration controls after backend permissions are proven.

**Tech Stack:** TypeScript, Express, Zod, Prisma/Postgres, React, Vitest/Supertest, Clerk, Resend.

---

## Public Contract

- `Household` gains `timeZone: string`, defaulting to `America/New_York` for new households until an owner changes it.
- `HouseholdMemberSummary` initially exposes member id, app user id, authentication id, and `owner | member` role; invitation work enriches app users with verified email and display name for Family UI.
- `HouseholdInvitation` exposes invite id, recipient email, intended member role, status, expiry, inviter, and household identity; raw token values appear only in acceptance links and deterministic test delivery capture.
- Owners alone may update settings, invite members, cancel pending invitations, promote members, or remove members.
- Any member may list current members and pending invitations for a household.
- Invitation acceptance requires authentication and recipient email matching the invitation email; it creates an ordinary member membership.

## Task 1: Household Time Zone And Member Read Model

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Modify: `server/src/routes/households.ts`
- Test: `server/test/auth.test.ts`

- [ ] **Step 1: Write failing API tests for default time zone, owner updates, and member listing**

Add tests expressing the intended route contract:

```ts
it("creates households with a default scheduling time zone", async () => {
  const created = await request(app)
    .post("/api/households")
    .set(auth("test-user-a"))
    .send({ name: "Home" })
    .expect(201);

  expect(created.body.timeZone).toBe("America/New_York");
});

it("allows an owner to update household scheduling settings", async () => {
  const created = await createHouseholdAs("test-user-a");
  const updated = await request(app)
    .put(`/api/households/${created.id}/settings`)
    .set(auth("test-user-a"))
    .send({ timeZone: "America/Chicago" })
    .expect(200);

  expect(updated.body.timeZone).toBe("America/Chicago");
});

it("lists an owner as the first household member", async () => {
  const created = await createHouseholdAs("test-user-a");
  const response = await request(app)
    .get(`/api/households/${created.id}/members`)
    .set(auth("test-user-a"))
    .expect(200);

  expect(response.body).toEqual([
    expect.objectContaining({ role: "owner", clerkUserId: "test-user-a" })
  ]);
});
```

- [ ] **Step 2: Run the backend tests and verify RED**

Run:

```powershell
npm.cmd test -w server -- auth.test.ts
```

Expected: failures because `Household.timeZone`, `/settings`, and `/members` are not implemented.

- [ ] **Step 3: Extend types, schema, stores, and authenticated routes**

Use the shared DTO shape:

```ts
export type Household = {
  id: string;
  name: string;
  timeZone: string;
  profile?: HouseholdProfile;
};

export type HouseholdMemberSummary = {
  householdId: string;
  userId: string;
  clerkUserId: string;
  role: "owner" | "member";
};
```

Add `timeZone String @default("America/New_York")` to `Household`, store methods:

```ts
updateHouseholdSettings(householdId: string, update: { timeZone: string }): StoreResult<Household | undefined>;
getMembership(userId: string, householdId: string): StoreResult<HouseholdMembership | undefined>;
listHouseholdMembers(householdId: string): StoreResult<HouseholdMemberSummary[]>;
```

Add owner-guarded `PUT /api/households/:householdId/settings` with:

```ts
const householdSettingsSchema = z.object({
  timeZone: z.string().trim().min(1).refine(
    (timeZone) => {
      try { Intl.DateTimeFormat(undefined, { timeZone }); return true; }
      catch { return false; }
    },
    { message: "Invalid IANA time zone" }
  )
});
```

Add member-accessible `GET /api/households/:householdId/members`.

- [ ] **Step 4: Run verification for the first increment**

Run:

```powershell
npm.cmd test -w server -- auth.test.ts households.test.ts
npm.cmd run typecheck -w shared
npm.cmd run typecheck -w server
```

Expected: all listed commands pass.

- [ ] **Step 5: Commit and push the usable backend increment**

```powershell
git add shared/src/types.ts server/prisma/schema.prisma server/src/repositories/inMemoryStore.ts server/src/repositories/prismaStore.ts server/src/routes/households.ts server/test/auth.test.ts server/test/prismaStore.test.ts
git commit -m "Add household time zones and member read model"
git push origin main
```

## Task 2: Invitations And Mail Delivery Boundary

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/auth/currentUser.ts`
- Create: `server/src/invitations/InvitationMailer.ts`
- Create: `server/src/invitations/ResendInvitationMailer.ts`
- Create: `server/src/routes/invitations.ts`
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Modify: `server/src/routes/households.ts`
- Modify: `server/src/app.ts`
- Modify: `server/package.json`
- Modify: `server/.env.example`
- Test: `server/test/invitations.test.ts`

- [ ] **Step 1: Write failing invitation lifecycle tests**

Cover owner creation, member denial, cancellation, expiration, single-use acceptance,
wrong recipient rejection, and deterministic delivered link capture:

```ts
const mailer = createCapturingInvitationMailer();
const app = createApp({ store: createInMemoryStore(), authMode: "test", invitationMailer: mailer });

const invitation = await request(app)
  .post(`/api/households/${householdId}/invitations`)
  .set(auth("owner@example.com"))
  .send({ email: "member@example.com" })
  .expect(201);

expect(mailer.messages[0].acceptUrl).toContain(invitation.body.id);
```

- [ ] **Step 2: Run the invitation tests and verify RED**

Run:

```powershell
npm.cmd test -w server -- invitations.test.ts
```

Expected: failure because invitation records and mailers do not exist.

- [ ] **Step 3: Implement persisted invitations and injected mail delivery**

Extend `User` with `primaryEmail` and optional `displayName`. In Clerk mode,
`resolveCurrentUser` loads the authenticated Backend User with
`clerkClient.users.getUser(userId)` and upserts its verified primary email and display
name into the app-owned user record. In `test` auth mode, treat the bearer identity as
the email address when it contains `@`, so invitation recipient tests use real matching
semantics without Clerk network calls.

Store only a SHA-256 digest of the acceptance token, with `pending | accepted | cancelled | expired`
status derived from persisted timestamps and expiry. Implement:

```ts
type InvitationMailer = {
  sendInvitation(message: {
    to: string;
    householdName: string;
    invitedBy: string;
    acceptUrl: string;
    idempotencyKey: string;
  }): Promise<void>;
};
```

Add routes:

```text
GET    /api/households/:householdId/invitations
POST   /api/households/:householdId/invitations
POST   /api/households/:householdId/invitations/:invitationId/cancel
POST   /api/invitations/:token/accept
```

Use a deterministic capture sender in tests/local configuration and a Resend sender
when `RESEND_API_KEY`, `INVITATION_FROM_EMAIL`, and `APP_BASE_URL` are configured.
Mount token acceptance from `server/src/routes/invitations.ts`, because it must be
reachable before a recipient belongs to the invited household.

- [ ] **Step 4: Verify invitation behavior and types**

Run:

```powershell
npm.cmd test -w server -- invitations.test.ts auth.test.ts
npm.cmd run typecheck -w shared
npm.cmd run typecheck -w server
```

Expected: all commands pass.

- [ ] **Step 5: Commit and push invitations**

```powershell
git add shared/src/types.ts server/prisma/schema.prisma server/src/auth/currentUser.ts server/src/invitations server/src/repositories server/src/routes/households.ts server/src/routes/invitations.ts server/src/app.ts server/package.json package-lock.json server/.env.example server/test/invitations.test.ts
git commit -m "Add household member invitations"
git push origin main
```

## Task 3: Owner Role Administration

**Files:**
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Modify: `server/src/routes/households.ts`
- Test: `server/test/members.test.ts`

- [ ] **Step 1: Write failing role and removal authorization tests**

Specify promotion, ordinary member denial, removal, and last-owner rejection:

```ts
await request(app)
  .put(`/api/households/${householdId}/members/${memberUserId}/role`)
  .set(auth("owner@example.com"))
  .send({ role: "owner" })
  .expect(200);

await request(app)
  .delete(`/api/households/${householdId}/members/${lastOwnerUserId}`)
  .set(auth("last-owner@example.com"))
  .expect(409);
```

- [ ] **Step 2: Run member tests and verify RED**

Run:

```powershell
npm.cmd test -w server -- members.test.ts
```

Expected: route-not-found or missing-operation failures.

- [ ] **Step 3: Implement owner-only role and removal endpoints**

Add:

```text
PUT    /api/households/:householdId/members/:userId/role
DELETE /api/households/:householdId/members/:userId
```

Return `403` for non-owner actions, `404` for inaccessible/missing members, and
`409` when a requested removal would remove the final owner.

- [ ] **Step 4: Verify backend member administration**

Run:

```powershell
npm.cmd test -w server -- auth.test.ts invitations.test.ts members.test.ts
npm.cmd run typecheck -w server
```

Expected: all commands pass.

- [ ] **Step 5: Commit and push owner administration**

```powershell
git add server/src/repositories server/src/routes/households.ts server/test/members.test.ts
git commit -m "Add household owner role administration"
git push origin main
```

## Task 4: Family Collaboration UI

**Files:**
- Modify: `web/src/api.ts`
- Modify: `web/src/pages/FamilyPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing Family UI tests**

Test that Family is in navigation, loads members and invitations, lets an owner submit
an email invitation, and exposes promotion/removal actions only when owner data allows:

```tsx
renderAt("/family");
await waitFor(() => expect(screen.getByRole("heading", { name: "Family" })).toBeTruthy());
expect(screen.getByText("Owner")).toBeTruthy();
fireEvent.change(screen.getByLabelText("Invite by email"), { target: { value: "member@example.com" } });
fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
```

- [ ] **Step 2: Run web tests and verify RED**

Run:

```powershell
npm.cmd test -w web -- App.test.tsx
```

Expected: failure because Family remains a placeholder and has no API helpers.

- [ ] **Step 3: Implement Family page and API helpers**

Pass household app data into `FamilyPage`, render one management section per household,
and add API helpers corresponding to membership/invitation routes. Keep save/loading/error
state scoped to each household card and show pending invitation expiry and cancellation.

- [ ] **Step 4: Verify Family UI**

Run:

```powershell
npm.cmd test -w web -- App.test.tsx
npm.cmd run typecheck -w web
```

Expected: all commands pass.

- [ ] **Step 5: Commit and push Family UI**

```powershell
git add web/src/api.ts web/src/pages/FamilyPage.tsx web/src/App.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Build household family management UI"
git push origin main
```

## Task 5: Persistence And Release Verification

**Files:**
- Modify: `server/test/prismaStore.test.ts`
- Modify: `docs/local-postgres-docker-setup.md`

- [ ] **Step 1: Add Prisma integration assertions for membership and invitation persistence**

Assert settings survive store recreation, accepted invitations create membership once,
role changes persist, and final-owner removal remains rejected through the persistent
store.

- [ ] **Step 2: Run database-backed tests with a safe local test database**

Run:

```powershell
npm.cmd run db:push -w server
npm.cmd run test:db -w server
```

Expected: persistence tests pass against the configured disposable development database.

- [ ] **Step 3: Document configuration and local invitation behavior**

Document:

```dotenv
RESEND_API_KEY=""
INVITATION_FROM_EMAIL="Cleanly <invites@example.com>"
APP_BASE_URL="http://localhost:5173"
```

Explain that local/test mode captures acceptance links without sending outbound mail
and that a verified Resend sender is required for deployed email delivery.

- [ ] **Step 4: Run full Release 1 verification**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build -w web
```

Expected: all tests, type checks, and the production web build pass.

- [ ] **Step 5: Commit and push Release 1 documentation and persistence verification**

```powershell
git add server/test/prismaStore.test.ts docs/local-postgres-docker-setup.md
git commit -m "Verify shared household foundation persistence"
git push origin main
```
