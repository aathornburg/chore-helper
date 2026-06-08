# Calendar Sync Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the durable calendar sync governance foundation, owner/member Settings surfaces, and owner-only Calendar import queue UI for Clenella without implementing live Google OAuth synchronization in this batch.

**Architecture:** Add provider-agnostic calendar sync types to `shared`, persist sync governance in Prisma, mirror the same behavior in the in-memory store for tests, expose owner-only and member-owned REST endpoints, then consume those endpoints from Settings and Calendar. Google connection actions remain product-ready mock states until the OAuth provider execution plan is implemented.

**Tech Stack:** React 19, Vite, TypeScript, Express, Prisma/Postgres, Vitest, Supertest, Testing Library.

---

## File Structure

- Modify: `shared/src/types.ts`
  - Add calendar sync enums and DTOs shared by server and web.
- Modify: `server/prisma/schema.prisma`
  - Add calendar connection, calendar preference, internal event, queue, and provider link models.
- Modify: `server/src/repositories/inMemoryStore.ts`
  - Extend `HouseholdStore` with calendar sync methods and implement them for tests/local mock behavior.
- Modify: `server/src/repositories/prismaStore.ts`
  - Implement the same calendar sync methods against Prisma.
- Create: `server/src/routes/calendar.ts`
  - Add owner-only household routes and member-owned `/api/me/calendar/*` routes.
- Modify: `server/src/app.ts`
  - Mount the calendar router.
- Create: `server/test/calendarSync.test.ts`
  - Cover permissions, policy updates, queue approval, and member preference behavior.
- Modify: `web/src/api.ts`
  - Add calendar sync API service functions.
- Modify: `web/src/pages/SettingsPage.tsx`
  - Replace the simple Google Calendar card with owner governance and member personal sync panels.
- Modify: `web/src/App.tsx`
  - Pass household data into Settings so ownership and selected-household sync state can be resolved.
- Modify: `web/src/pages/CalendarPage.tsx`
  - Add owner-only import queue above the calendar controls.
- Modify: `web/src/App.css`
  - Add styling for Settings sync panels and Calendar queue C.
- Modify: `web/src/App.test.tsx`
  - Add frontend coverage for owner/non-owner Settings and Calendar queue visibility.

## Scope Boundaries

This plan intentionally does not call Google OAuth, fetch Google events, or write to Google Calendar. It creates the API, schema, permission model, and UI contract that the provider execution plan will use. The Connect Google Calendar action can set a local product-ready status message or call a stub endpoint, but it must not pretend that live provider sync is complete.

---

### Task 1: Shared Calendar Sync Types

**Files:**
- Modify: `shared/src/types.ts`

- [ ] **Step 1: Add failing shared type usage through server/web tests**

Add imports in the new tests from follow-up tasks using these names so TypeScript fails before the types exist:

```ts
import type {
  CalendarConnectionSummary,
  CalendarImportPolicy,
  CalendarImportQueueItem,
  CalendarPreferences,
  CalendarSyncMode
} from "@chore-helper/shared";
```

Run:

```powershell
npm.cmd run typecheck -w shared
```

Expected: FAIL until the types below are added.

- [ ] **Step 2: Add the shared calendar sync types**

Append this block to `shared/src/types.ts` after the existing exported types:

```ts
export type CalendarProvider = "google";
export type CalendarConnectionStatus = "connected" | "expired" | "revoked" | "error";
export type CalendarSyncMode = "off" | "manual" | "auto";
export type CalendarExportMode = "off" | "review" | "auto";
export type CalendarContentMode = "chores" | "commitments" | "both";
export type CalendarDetailLevel = "busy_only" | "full_details";
export type CleanlyCalendarEventType = "chore" | "commitment";
export type CalendarQueueStatus = "pending" | "approved" | "rejected" | "auto_added" | "needs_member";
export type CalendarExportQueueStatus = "pending" | "approved" | "rejected" | "exported";

export type CalendarConnectionSummary = {
  id: string;
  provider: CalendarProvider;
  providerAccountEmail: string;
  status: CalendarConnectionStatus;
  scopes: string[];
  tokenExpiresAt?: string;
  lastSyncedAt?: string;
};

export type ExternalCalendarSummary = {
  id: string;
  connectionId: string;
  providerCalendarId: string;
  name: string;
  color?: string;
  timezone?: string;
  accessRole?: string;
  isSelectedForImport: boolean;
  isSelectedForExport: boolean;
};

export type CalendarImportPolicy = {
  householdId: string;
  memberId: string;
  memberName: string;
  memberEmail?: string;
  importQueueMode: CalendarSyncMode;
  importContentMode: CalendarContentMode;
};

export type CalendarPreferences = {
  householdId: string;
  defaultDetailLevel: CalendarDetailLevel;
  selectedSourceCalendarIds: string[];
  exportMode: CalendarExportMode;
  exportContentMode: CalendarContentMode;
  destinationExternalCalendarId?: string;
};

export type CalendarImportQueueItem = {
  id: string;
  householdId: string;
  submittedByUserId: string;
  submittedByName: string;
  proposedType: CleanlyCalendarEventType;
  detailLevel: CalendarDetailLevel;
  title: string;
  privacyTitle: string;
  startsAt: string;
  endsAt: string;
  queueStatus: CalendarQueueStatus;
  createdCleanlyEventId?: string;
  createdAt: string;
};

export type CalendarImportQueueDecisionInput = {
  decision: "approve" | "reject";
  proposedType?: CleanlyCalendarEventType;
};
```

- [ ] **Step 3: Verify shared typecheck passes**

Run:

```powershell
npm.cmd run typecheck -w shared
```

Expected: PASS.

- [ ] **Step 4: Commit shared types**

```powershell
git add shared/src/types.ts
git commit -m "feat: add calendar sync shared types"
```

---

### Task 2: Prisma Calendar Sync Schema

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Add failing Prisma generation expectation**

Run:

```powershell
npm.cmd run db:generate -w server
```

Expected before schema edits: PASS, but generated Prisma client has no calendar sync models. This establishes the baseline.

- [ ] **Step 2: Add relations to existing models**

In `model Household`, add:

```prisma
  calendarPolicies CalendarImportPolicy[]
  calendarSharingPreferences CalendarSharingPreference[]
  calendarExportPreferences CalendarExportPreference[]
  cleanlyCalendarEvents CleanlyCalendarEvent[]
  calendarImportQueueItems CalendarImportQueueItem[]
  calendarExportQueueItems CalendarExportQueueItem[]
```

In `model User`, add:

```prisma
  calendarConnections CalendarConnection[]
  calendarPolicies CalendarImportPolicy[]
  calendarSharingPreferences CalendarSharingPreference[]
  calendarExportPreferences CalendarExportPreference[]
  submittedCalendarImportQueueItems CalendarImportQueueItem[] @relation("SubmittedImportQueueItems")
  decidedCalendarImportQueueItems CalendarImportQueueItem[] @relation("DecidedImportQueueItems")
  calendarExportQueueItems CalendarExportQueueItem[]
  cleanlyCalendarEvents CleanlyCalendarEvent[]
```

- [ ] **Step 3: Add new Prisma models**

Append these models after `Recommendation`:

```prisma
model CalendarConnection {
  id                    String             @id @default(cuid())
  userId                String
  user                  User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider              String
  providerAccountEmail  String
  status                String
  scopes                String             @default("[]")
  accessTokenEncrypted  String?
  refreshTokenEncrypted String?
  tokenExpiresAt        DateTime?
  lastSyncedAt          DateTime?
  calendars             ExternalCalendar[]
  eventLinks            ExternalCalendarEventLink[]
  importQueueItems      CalendarImportQueueItem[]
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  @@index([userId, provider])
}

model ExternalCalendar {
  id                  String                      @id @default(cuid())
  connectionId        String
  connection          CalendarConnection          @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  providerCalendarId  String
  name                String
  color               String?
  timezone            String?
  accessRole          String?
  isSelectedForImport Boolean                     @default(false)
  isSelectedForExport Boolean                     @default(false)
  importQueueItems    CalendarImportQueueItem[]
  exportPreferences   CalendarExportPreference[]
  exportQueueItems    CalendarExportQueueItem[]
  eventLinks          ExternalCalendarEventLink[]
  createdAt           DateTime                    @default(now())
  updatedAt           DateTime                    @updatedAt

  @@unique([connectionId, providerCalendarId])
}

model CalendarImportPolicy {
  id                String    @id @default(cuid())
  householdId       String
  household         Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  memberId          String
  member            User      @relation(fields: [memberId], references: [id], onDelete: Cascade)
  importQueueMode   String    @default("manual")
  importContentMode String    @default("both")
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@unique([householdId, memberId])
}

model CalendarSharingPreference {
  id                        String    @id @default(cuid())
  userId                    String
  user                      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  householdId               String
  household                 Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  defaultDetailLevel        String    @default("busy_only")
  selectedSourceCalendarIds String    @default("[]")
  createdAt                 DateTime  @default(now())
  updatedAt                 DateTime  @updatedAt

  @@unique([userId, householdId])
}

model CalendarExportPreference {
  id                            String            @id @default(cuid())
  userId                        String
  user                          User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  householdId                   String
  household                     Household         @relation(fields: [householdId], references: [id], onDelete: Cascade)
  exportMode                    String            @default("off")
  exportContentMode             String            @default("chores")
  destinationExternalCalendarId String?
  destinationExternalCalendar   ExternalCalendar? @relation(fields: [destinationExternalCalendarId], references: [id], onDelete: SetNull)
  createdAt                     DateTime          @default(now())
  updatedAt                     DateTime          @updatedAt

  @@unique([userId, householdId])
}

model CleanlyCalendarEvent {
  id               String                      @id @default(cuid())
  householdId      String
  household        Household                   @relation(fields: [householdId], references: [id], onDelete: Cascade)
  createdByUserId  String
  createdByUser    User                        @relation(fields: [createdByUserId], references: [id], onDelete: Restrict)
  type             String
  title            String
  privacyTitle     String
  detailLevel      String
  description      String?
  location         String?
  startsAt         DateTime
  endsAt           DateTime
  timezone         String
  source           String
  status           String                      @default("active")
  importQueueItems CalendarImportQueueItem[]
  exportQueueItems CalendarExportQueueItem[]
  eventLinks       ExternalCalendarEventLink[]
  createdAt        DateTime                    @default(now())
  updatedAt        DateTime                    @updatedAt

  @@index([householdId, startsAt])
  @@index([householdId, type])
}

model CalendarImportQueueItem {
  id                       String                @id @default(cuid())
  householdId              String
  household                Household             @relation(fields: [householdId], references: [id], onDelete: Cascade)
  submittedByUserId        String
  submittedByUser          User                  @relation("SubmittedImportQueueItems", fields: [submittedByUserId], references: [id], onDelete: Cascade)
  sourceConnectionId       String?
  sourceConnection         CalendarConnection?   @relation(fields: [sourceConnectionId], references: [id], onDelete: SetNull)
  sourceExternalCalendarId String?
  sourceExternalCalendar   ExternalCalendar?     @relation(fields: [sourceExternalCalendarId], references: [id], onDelete: SetNull)
  providerEventId          String?
  proposedType             String
  detailLevel              String
  title                    String
  privacyTitle             String
  startsAt                 DateTime
  endsAt                   DateTime
  timezone                 String
  allowedPayloadJson       String                @default("{}")
  queueStatus              String                @default("pending")
  ownerDecisionByUserId    String?
  ownerDecisionByUser      User?                 @relation("DecidedImportQueueItems", fields: [ownerDecisionByUserId], references: [id], onDelete: SetNull)
  ownerDecisionAt          DateTime?
  createdCleanlyEventId    String?
  createdCleanlyEvent      CleanlyCalendarEvent? @relation(fields: [createdCleanlyEventId], references: [id], onDelete: SetNull)
  createdAt                DateTime              @default(now())
  updatedAt                DateTime              @updatedAt

  @@index([householdId, queueStatus, createdAt])
  @@index([submittedByUserId, createdAt])
}

model CalendarExportQueueItem {
  id                            String               @id @default(cuid())
  userId                        String
  user                          User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  householdId                   String
  household                     Household            @relation(fields: [householdId], references: [id], onDelete: Cascade)
  cleanlyCalendarEventId        String
  cleanlyCalendarEvent          CleanlyCalendarEvent  @relation(fields: [cleanlyCalendarEventId], references: [id], onDelete: Cascade)
  destinationExternalCalendarId String?
  destinationExternalCalendar   ExternalCalendar?     @relation(fields: [destinationExternalCalendarId], references: [id], onDelete: SetNull)
  queueStatus                   String                @default("pending")
  createdAt                     DateTime              @default(now())
  updatedAt                     DateTime              @updatedAt

  @@index([userId, queueStatus, createdAt])
}

model ExternalCalendarEventLink {
  id                     String               @id @default(cuid())
  cleanlyCalendarEventId String
  cleanlyCalendarEvent   CleanlyCalendarEvent @relation(fields: [cleanlyCalendarEventId], references: [id], onDelete: Cascade)
  connectionId           String
  connection             CalendarConnection   @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  externalCalendarId     String
  externalCalendar       ExternalCalendar     @relation(fields: [externalCalendarId], references: [id], onDelete: Cascade)
  providerEventId        String
  direction              String
  createdAt              DateTime             @default(now())
  updatedAt              DateTime             @updatedAt

  @@unique([connectionId, externalCalendarId, providerEventId, direction])
}
```

- [ ] **Step 4: Generate Prisma client**

Run:

```powershell
npm.cmd run db:generate -w server
```

Expected: PASS.

- [ ] **Step 5: Commit Prisma schema**

```powershell
git add server/prisma/schema.prisma
git commit -m "feat: add calendar sync schema"
```

---

### Task 3: Store Contract and In-Memory Implementation

**Files:**
- Modify: `server/src/repositories/inMemoryStore.ts`
- Test: `server/test/calendarSync.test.ts`

- [ ] **Step 1: Write failing store-focused tests**

Create `server/test/calendarSync.test.ts` with this first test group:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";

describe("calendar sync governance", () => {
  it("lets a household owner list default import policies for members", async () => {
    const store = createInMemoryStore();
    const app = createApp({ store, authMode: "test" });
    const owner = await store.upsertUser({ clerkUserId: "owner", primaryEmail: "owner@example.com", displayName: "Owner" });
    const member = await store.upsertUser({ clerkUserId: "member", primaryEmail: "member@example.com", displayName: "Member" });
    const household = await store.createHouseholdForUser(owner.id, "New household");
    await store.addHouseholdMember(household.id, member.id, "member");

    const response = await request(app)
      .get(`/api/households/${household.id}/calendar/import-policies`)
      .set("X-Test-Clerk-User-Id", "owner");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        householdId: household.id,
        memberId: owner.id,
        importQueueMode: "manual",
        importContentMode: "both"
      }),
      expect.objectContaining({
        householdId: household.id,
        memberId: member.id,
        importQueueMode: "manual",
        importContentMode: "both"
      })
    ]);
  });

  it("blocks non-owners from listing household import policies", async () => {
    const store = createInMemoryStore();
    const app = createApp({ store, authMode: "test" });
    const owner = await store.upsertUser({ clerkUserId: "owner", primaryEmail: "owner@example.com", displayName: "Owner" });
    const member = await store.upsertUser({ clerkUserId: "member", primaryEmail: "member@example.com", displayName: "Member" });
    const household = await store.createHouseholdForUser(owner.id, "New household");
    await store.addHouseholdMember(household.id, member.id, "member");

    const response = await request(app)
      .get(`/api/households/${household.id}/calendar/import-policies`)
      .set("X-Test-Clerk-User-Id", "member");

    expect(response.status).toBe(403);
  });
});
```

Run:

```powershell
npm.cmd run test -w server -- calendarSync.test.ts
```

Expected: FAIL because calendar routes and store methods do not exist.

- [ ] **Step 2: Extend `HouseholdStore`**

Add these methods to the exported `HouseholdStore` type in `server/src/repositories/inMemoryStore.ts`:

```ts
  listCalendarImportPolicies(householdId: string): Promise<CalendarImportPolicy[]>;
  updateCalendarImportPolicy(
    householdId: string,
    memberId: string,
    update: Pick<CalendarImportPolicy, "importQueueMode" | "importContentMode">
  ): Promise<CalendarImportPolicy>;
  listCalendarConnections(userId: string): Promise<CalendarConnectionSummary[]>;
  listExternalCalendars(userId: string): Promise<ExternalCalendarSummary[]>;
  getCalendarPreferences(userId: string, householdId: string): Promise<CalendarPreferences>;
  updateCalendarPreferences(userId: string, householdId: string, update: CalendarPreferences): Promise<CalendarPreferences>;
  listCalendarImportQueue(householdId: string): Promise<CalendarImportQueueItem[]>;
  createCalendarImportQueueItem(input: Omit<CalendarImportQueueItem, "id" | "createdAt" | "queueStatus">): Promise<CalendarImportQueueItem>;
  decideCalendarImportQueueItem(
    householdId: string,
    queueItemId: string,
    ownerUserId: string,
    input: CalendarImportQueueDecisionInput
  ): Promise<CalendarImportQueueItem>;
```

Import the shared types at the top of the file:

```ts
  CalendarConnectionSummary,
  CalendarImportPolicy,
  CalendarImportQueueDecisionInput,
  CalendarImportQueueItem,
  CalendarPreferences,
  ExternalCalendarSummary
```

- [ ] **Step 3: Add in-memory state**

Inside `createInMemoryStore`, add:

```ts
  const calendarImportPolicies = new Map<string, CalendarImportPolicy>();
  const calendarPreferences = new Map<string, CalendarPreferences>();
  const calendarImportQueueItems = new Map<string, CalendarImportQueueItem>();
  const calendarConnections = new Map<string, CalendarConnectionSummary[]>();
  const externalCalendars = new Map<string, ExternalCalendarSummary[]>();
```

Add helpers near the other local helper functions:

```ts
  function calendarPolicyKey(householdId: string, memberId: string) {
    return `${householdId}:${memberId}`;
  }

  function calendarPreferenceKey(userId: string, householdId: string) {
    return `${userId}:${householdId}`;
  }

  function defaultCalendarPreference(userId: string, householdId: string): CalendarPreferences {
    return {
      householdId,
      defaultDetailLevel: "busy_only",
      selectedSourceCalendarIds: [],
      exportMode: "off",
      exportContentMode: "chores",
      destinationExternalCalendarId: undefined
    };
  }

  function memberDisplay(member: HouseholdMemberSummary) {
    return member.displayName ?? member.primaryEmail ?? member.clerkUserId;
  }
```

- [ ] **Step 4: Implement in-memory methods**

Add these properties to the returned store object:

```ts
    async listCalendarImportPolicies(householdId) {
      const members = await this.listHouseholdMembers(householdId);
      return members.map((member) => {
        const existing = calendarImportPolicies.get(calendarPolicyKey(householdId, member.userId));
        if (existing) return existing;
        return {
          householdId,
          memberId: member.userId,
          memberName: memberDisplay(member),
          memberEmail: member.primaryEmail,
          importQueueMode: "manual",
          importContentMode: "both"
        };
      });
    },

    async updateCalendarImportPolicy(householdId, memberId, update) {
      const members = await this.listHouseholdMembers(householdId);
      const member = members.find((item) => item.userId === memberId);
      if (!member) throw new Error("Household member not found");
      const policy = {
        householdId,
        memberId,
        memberName: memberDisplay(member),
        memberEmail: member.primaryEmail,
        importQueueMode: update.importQueueMode,
        importContentMode: update.importContentMode
      };
      calendarImportPolicies.set(calendarPolicyKey(householdId, memberId), policy);
      return policy;
    },

    async listCalendarConnections(userId) {
      return calendarConnections.get(userId) ?? [];
    },

    async listExternalCalendars(userId) {
      return externalCalendars.get(userId) ?? [];
    },

    async getCalendarPreferences(userId, householdId) {
      return calendarPreferences.get(calendarPreferenceKey(userId, householdId)) ?? defaultCalendarPreference(userId, householdId);
    },

    async updateCalendarPreferences(userId, householdId, update) {
      const preference = { ...update, householdId };
      calendarPreferences.set(calendarPreferenceKey(userId, householdId), preference);
      return preference;
    },

    async listCalendarImportQueue(householdId) {
      return Array.from(calendarImportQueueItems.values())
        .filter((item) => item.householdId === householdId)
        .sort((first, second) => first.createdAt.localeCompare(second.createdAt));
    },

    async createCalendarImportQueueItem(input) {
      const item = {
        ...input,
        id: `calendar-import-${calendarImportQueueItems.size + 1}`,
        queueStatus: "pending" as const,
        createdAt: new Date().toISOString()
      };
      calendarImportQueueItems.set(item.id, item);
      return item;
    },

    async decideCalendarImportQueueItem(householdId, queueItemId, _ownerUserId, input) {
      const item = calendarImportQueueItems.get(queueItemId);
      if (!item || item.householdId !== householdId) throw new Error("Calendar import queue item not found");
      const updated = {
        ...item,
        proposedType: input.proposedType ?? item.proposedType,
        queueStatus: input.decision === "approve" ? "approved" as const : "rejected" as const,
        createdCleanlyEventId: input.decision === "approve" ? `cleanly-event-${queueItemId}` : item.createdCleanlyEventId
      };
      calendarImportQueueItems.set(queueItemId, updated);
      return updated;
    },
```

- [ ] **Step 5: Run the targeted test**

Run:

```powershell
npm.cmd run test -w server -- calendarSync.test.ts
```

Expected: still FAIL until routes are added in Task 4.

- [ ] **Step 6: Commit store contract**

```powershell
git add server/src/repositories/inMemoryStore.ts server/test/calendarSync.test.ts
git commit -m "feat: add calendar sync store contract"
```

---

### Task 4: Calendar Routes and Permission Enforcement

**Files:**
- Create: `server/src/routes/calendar.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/calendarSync.test.ts`

- [ ] **Step 1: Add route permission tests**

Extend `server/test/calendarSync.test.ts` with:

```ts
  it("lets an owner update one member import policy", async () => {
    const store = createInMemoryStore();
    const app = createApp({ store, authMode: "test" });
    const owner = await store.upsertUser({ clerkUserId: "owner", primaryEmail: "owner@example.com", displayName: "Owner" });
    const member = await store.upsertUser({ clerkUserId: "member", primaryEmail: "member@example.com", displayName: "Member" });
    const household = await store.createHouseholdForUser(owner.id, "New household");
    await store.addHouseholdMember(household.id, member.id, "member");

    const response = await request(app)
      .patch(`/api/households/${household.id}/calendar/import-policies/${member.id}`)
      .set("X-Test-Clerk-User-Id", "owner")
      .send({ importQueueMode: "auto", importContentMode: "commitments" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      memberId: member.id,
      importQueueMode: "auto",
      importContentMode: "commitments"
    }));
  });

  it("lets a member update personal calendar preferences", async () => {
    const store = createInMemoryStore();
    const app = createApp({ store, authMode: "test" });
    const owner = await store.upsertUser({ clerkUserId: "owner", primaryEmail: "owner@example.com", displayName: "Owner" });
    const household = await store.createHouseholdForUser(owner.id, "New household");

    const response = await request(app)
      .patch("/api/me/calendar/preferences")
      .set("X-Test-Clerk-User-Id", "owner")
      .send({
        householdId: household.id,
        defaultDetailLevel: "full_details",
        selectedSourceCalendarIds: ["google-primary"],
        exportMode: "review",
        exportContentMode: "both",
        destinationExternalCalendarId: "google-cleanly"
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      householdId: household.id,
      defaultDetailLevel: "full_details",
      exportMode: "review",
      exportContentMode: "both",
      destinationExternalCalendarId: "google-cleanly"
    }));
  });
```

Run:

```powershell
npm.cmd run test -w server -- calendarSync.test.ts
```

Expected: FAIL because routes do not exist.

- [ ] **Step 2: Create validation helpers**

Create `server/src/routes/calendar.ts` with:

```ts
import { Router } from "express";
import type {
  CalendarContentMode,
  CalendarDetailLevel,
  CalendarExportMode,
  CalendarImportQueueDecisionInput,
  CalendarSyncMode
} from "@chore-helper/shared";
import type { AuthMode } from "../auth/currentUser.js";
import { resolveCurrentUser } from "../auth/currentUser.js";
import type { HouseholdStore } from "../repositories/inMemoryStore.js";

const importQueueModes: CalendarSyncMode[] = ["off", "manual", "auto"];
const exportModes: CalendarExportMode[] = ["off", "review", "auto"];
const contentModes: CalendarContentMode[] = ["chores", "commitments", "both"];
const detailLevels: CalendarDetailLevel[] = ["busy_only", "full_details"];

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.includes(value as T);
}

async function requireHouseholdOwner(store: HouseholdStore, householdId: string, userId: string) {
  const members = await store.listHouseholdMembers(householdId);
  return members.some((member) => member.userId === userId && member.role === "owner");
}
```

- [ ] **Step 3: Add owner household routes**

Continue `server/src/routes/calendar.ts`:

```ts
export function createCalendarRouter(store: HouseholdStore, authMode: AuthMode) {
  const router = Router();

  router.get("/households/:householdId/calendar/import-policies", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    if (!await requireHouseholdOwner(store, req.params.householdId, user.id)) {
      return res.status(403).json({ error: "Only household owners can manage calendar import policies." });
    }
    return res.status(200).json(await store.listCalendarImportPolicies(req.params.householdId));
  });

  router.patch("/households/:householdId/calendar/import-policies/:memberId", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    if (!await requireHouseholdOwner(store, req.params.householdId, user.id)) {
      return res.status(403).json({ error: "Only household owners can manage calendar import policies." });
    }
    if (!isOneOf(req.body.importQueueMode, importQueueModes) || !isOneOf(req.body.importContentMode, contentModes)) {
      return res.status(400).json({ error: "Invalid calendar import policy." });
    }
    try {
      const policy = await store.updateCalendarImportPolicy(req.params.householdId, req.params.memberId, {
        importQueueMode: req.body.importQueueMode,
        importContentMode: req.body.importContentMode
      });
      return res.status(200).json(policy);
    } catch {
      return res.status(404).json({ error: "Household member not found." });
    }
  });

  router.get("/households/:householdId/calendar/import-queue", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    if (!await requireHouseholdOwner(store, req.params.householdId, user.id)) {
      return res.status(403).json({ error: "Only household owners can review calendar imports." });
    }
    return res.status(200).json(await store.listCalendarImportQueue(req.params.householdId));
  });

  router.patch("/households/:householdId/calendar/import-queue/:queueItemId", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    if (!await requireHouseholdOwner(store, req.params.householdId, user.id)) {
      return res.status(403).json({ error: "Only household owners can review calendar imports." });
    }
    if (req.body.decision !== "approve" && req.body.decision !== "reject") {
      return res.status(400).json({ error: "Decision must be approve or reject." });
    }
    const input: CalendarImportQueueDecisionInput = {
      decision: req.body.decision,
      proposedType: req.body.proposedType
    };
    try {
      return res.status(200).json(await store.decideCalendarImportQueueItem(req.params.householdId, req.params.queueItemId, user.id, input));
    } catch {
      return res.status(404).json({ error: "Calendar import queue item not found." });
    }
  });
```

- [ ] **Step 4: Add member `/api/me/calendar` routes**

Continue inside `createCalendarRouter` before `return router`:

```ts
  router.get("/me/calendar/connections", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    return res.status(200).json(await store.listCalendarConnections(user.id));
  });

  router.post("/me/calendar/google/connect", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    return res.status(202).json({
      provider: "google",
      status: "not_configured",
      message: "Google OAuth is ready to be wired to this endpoint."
    });
  });

  router.get("/me/calendar/preferences", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    const householdId = String(req.query.householdId ?? "");
    if (!householdId) return res.status(400).json({ error: "householdId is required." });
    return res.status(200).json(await store.getCalendarPreferences(user.id, householdId));
  });

  router.patch("/me/calendar/preferences", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    if (
      typeof req.body.householdId !== "string" ||
      !isOneOf(req.body.defaultDetailLevel, detailLevels) ||
      !Array.isArray(req.body.selectedSourceCalendarIds) ||
      !isOneOf(req.body.exportMode, exportModes) ||
      !isOneOf(req.body.exportContentMode, contentModes)
    ) {
      return res.status(400).json({ error: "Invalid calendar preferences." });
    }
    return res.status(200).json(await store.updateCalendarPreferences(user.id, req.body.householdId, {
      householdId: req.body.householdId,
      defaultDetailLevel: req.body.defaultDetailLevel,
      selectedSourceCalendarIds: req.body.selectedSourceCalendarIds,
      exportMode: req.body.exportMode,
      exportContentMode: req.body.exportContentMode,
      destinationExternalCalendarId: typeof req.body.destinationExternalCalendarId === "string"
        ? req.body.destinationExternalCalendarId
        : undefined
    }));
  });

  return router;
}
```

- [ ] **Step 5: Mount the router**

In `server/src/app.ts`, add:

```ts
import { createCalendarRouter } from "./routes/calendar.js";
```

Then mount it before the household router:

```ts
  app.use("/api", createCalendarRouter(store, authMode));
```

- [ ] **Step 6: Verify route tests pass**

Run:

```powershell
npm.cmd run test -w server -- calendarSync.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit routes**

```powershell
git add server/src/routes/calendar.ts server/src/app.ts server/test/calendarSync.test.ts
git commit -m "feat: add calendar sync governance routes"
```

---

### Task 5: Prisma Store Implementation

**Files:**
- Modify: `server/src/repositories/prismaStore.ts`
- Test: `server/test/prismaStore.test.ts`

- [ ] **Step 1: Add Prisma store tests**

In `server/test/prismaStore.test.ts`, add tests mirroring the in-memory route behavior at the store level:

```ts
it("persists calendar import policy changes", async () => {
  const store = createPrismaStore(prisma);
  const owner = await store.upsertUser({ clerkUserId: "owner-policy", primaryEmail: "owner-policy@example.com", displayName: "Owner" });
  const member = await store.upsertUser({ clerkUserId: "member-policy", primaryEmail: "member-policy@example.com", displayName: "Member" });
  const household = await store.createHouseholdForUser(owner.id, "Calendar household");
  await store.addHouseholdMember(household.id, member.id, "member");

  await store.updateCalendarImportPolicy(household.id, member.id, {
    importQueueMode: "auto",
    importContentMode: "commitments"
  });

  const policies = await store.listCalendarImportPolicies(household.id);
  expect(policies).toContainEqual(expect.objectContaining({
    memberId: member.id,
    importQueueMode: "auto",
    importContentMode: "commitments"
  }));
});

it("persists member calendar preferences", async () => {
  const store = createPrismaStore(prisma);
  const owner = await store.upsertUser({ clerkUserId: "owner-preferences", primaryEmail: "owner-preferences@example.com", displayName: "Owner" });
  const household = await store.createHouseholdForUser(owner.id, "Calendar household");

  const preference = await store.updateCalendarPreferences(owner.id, household.id, {
    householdId: household.id,
    defaultDetailLevel: "full_details",
    selectedSourceCalendarIds: ["calendar-a"],
    exportMode: "review",
    exportContentMode: "both",
    destinationExternalCalendarId: undefined
  });

  expect(preference).toEqual(expect.objectContaining({
    defaultDetailLevel: "full_details",
    selectedSourceCalendarIds: ["calendar-a"],
    exportMode: "review",
    exportContentMode: "both"
  }));
});
```

Run:

```powershell
npm.cmd run test:db -w server -- prismaStore.test.ts
```

Expected: FAIL until Prisma store methods exist.

- [ ] **Step 2: Add Prisma mappers**

In `server/src/repositories/prismaStore.ts`, add helper mappers near existing mapper functions:

```ts
function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function memberNameForPolicy(member: { user: { displayName: string | null; primaryEmail: string | null; clerkUserId: string } }) {
  return member.user.displayName ?? member.user.primaryEmail ?? member.user.clerkUserId;
}
```

- [ ] **Step 3: Implement policy and preference Prisma methods**

Add methods to the Prisma store object:

```ts
    async listCalendarImportPolicies(householdId) {
      const members = await prisma.householdMember.findMany({
        where: { householdId },
        include: { user: true },
        orderBy: { createdAt: "asc" }
      });
      const policies = await prisma.calendarImportPolicy.findMany({ where: { householdId } });
      const policyByMember = new Map(policies.map((policy) => [policy.memberId, policy]));
      return members.map((member) => {
        const policy = policyByMember.get(member.userId);
        return {
          householdId,
          memberId: member.userId,
          memberName: memberNameForPolicy(member),
          memberEmail: member.user.primaryEmail ?? undefined,
          importQueueMode: (policy?.importQueueMode ?? "manual") as CalendarSyncMode,
          importContentMode: (policy?.importContentMode ?? "both") as CalendarContentMode
        };
      });
    },

    async updateCalendarImportPolicy(householdId, memberId, update) {
      const member = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId, userId: memberId } },
        include: { user: true }
      });
      if (!member) throw new Error("Household member not found");
      const policy = await prisma.calendarImportPolicy.upsert({
        where: { householdId_memberId: { householdId, memberId } },
        update,
        create: { householdId, memberId, ...update }
      });
      return {
        householdId,
        memberId,
        memberName: memberNameForPolicy(member),
        memberEmail: member.user.primaryEmail ?? undefined,
        importQueueMode: policy.importQueueMode as CalendarSyncMode,
        importContentMode: policy.importContentMode as CalendarContentMode
      };
    },

    async getCalendarPreferences(userId, householdId) {
      const [sharing, exportPreference] = await Promise.all([
        prisma.calendarSharingPreference.findUnique({ where: { userId_householdId: { userId, householdId } } }),
        prisma.calendarExportPreference.findUnique({ where: { userId_householdId: { userId, householdId } } })
      ]);
      return {
        householdId,
        defaultDetailLevel: (sharing?.defaultDetailLevel ?? "busy_only") as CalendarDetailLevel,
        selectedSourceCalendarIds: parseJsonArray(sharing?.selectedSourceCalendarIds ?? "[]"),
        exportMode: (exportPreference?.exportMode ?? "off") as CalendarExportMode,
        exportContentMode: (exportPreference?.exportContentMode ?? "chores") as CalendarContentMode,
        destinationExternalCalendarId: exportPreference?.destinationExternalCalendarId ?? undefined
      };
    },

    async updateCalendarPreferences(userId, householdId, update) {
      await prisma.calendarSharingPreference.upsert({
        where: { userId_householdId: { userId, householdId } },
        update: {
          defaultDetailLevel: update.defaultDetailLevel,
          selectedSourceCalendarIds: JSON.stringify(update.selectedSourceCalendarIds)
        },
        create: {
          userId,
          householdId,
          defaultDetailLevel: update.defaultDetailLevel,
          selectedSourceCalendarIds: JSON.stringify(update.selectedSourceCalendarIds)
        }
      });
      await prisma.calendarExportPreference.upsert({
        where: { userId_householdId: { userId, householdId } },
        update: {
          exportMode: update.exportMode,
          exportContentMode: update.exportContentMode,
          destinationExternalCalendarId: update.destinationExternalCalendarId
        },
        create: {
          userId,
          householdId,
          exportMode: update.exportMode,
          exportContentMode: update.exportContentMode,
          destinationExternalCalendarId: update.destinationExternalCalendarId
        }
      });
      return this.getCalendarPreferences(userId, householdId);
    },
```

- [ ] **Step 4: Implement connection, calendar, and queue Prisma methods**

Add:

```ts
    async listCalendarConnections(userId) {
      const connections = await prisma.calendarConnection.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
      return connections.map((connection) => ({
        id: connection.id,
        provider: connection.provider as CalendarProvider,
        providerAccountEmail: connection.providerAccountEmail,
        status: connection.status as CalendarConnectionStatus,
        scopes: parseJsonArray(connection.scopes),
        tokenExpiresAt: connection.tokenExpiresAt?.toISOString(),
        lastSyncedAt: connection.lastSyncedAt?.toISOString()
      }));
    },

    async listExternalCalendars(userId) {
      const calendars = await prisma.externalCalendar.findMany({
        where: { connection: { userId } },
        orderBy: { name: "asc" }
      });
      return calendars.map((calendar) => ({
        id: calendar.id,
        connectionId: calendar.connectionId,
        providerCalendarId: calendar.providerCalendarId,
        name: calendar.name,
        color: calendar.color ?? undefined,
        timezone: calendar.timezone ?? undefined,
        accessRole: calendar.accessRole ?? undefined,
        isSelectedForImport: calendar.isSelectedForImport,
        isSelectedForExport: calendar.isSelectedForExport
      }));
    },

    async listCalendarImportQueue(householdId) {
      const items = await prisma.calendarImportQueueItem.findMany({
        where: { householdId },
        include: { submittedByUser: true },
        orderBy: { createdAt: "asc" }
      });
      return items.map((item) => ({
        id: item.id,
        householdId: item.householdId,
        submittedByUserId: item.submittedByUserId,
        submittedByName: item.submittedByUser.displayName ?? item.submittedByUser.primaryEmail ?? item.submittedByUser.clerkUserId,
        proposedType: item.proposedType as CleanlyCalendarEventType,
        detailLevel: item.detailLevel as CalendarDetailLevel,
        title: item.title,
        privacyTitle: item.privacyTitle,
        startsAt: item.startsAt.toISOString(),
        endsAt: item.endsAt.toISOString(),
        queueStatus: item.queueStatus as CalendarQueueStatus,
        createdCleanlyEventId: item.createdCleanlyEventId ?? undefined,
        createdAt: item.createdAt.toISOString()
      }));
    },
```

Then implement queue creation and decisions:

```ts
    async createCalendarImportQueueItem(input) {
      const item = await prisma.calendarImportQueueItem.create({
        data: {
          ...input,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          queueStatus: "pending"
        },
        include: { submittedByUser: true }
      });
      return {
        id: item.id,
        householdId: item.householdId,
        submittedByUserId: item.submittedByUserId,
        submittedByName: item.submittedByUser.displayName ?? item.submittedByUser.primaryEmail ?? item.submittedByUser.clerkUserId,
        proposedType: item.proposedType as CleanlyCalendarEventType,
        detailLevel: item.detailLevel as CalendarDetailLevel,
        title: item.title,
        privacyTitle: item.privacyTitle,
        startsAt: item.startsAt.toISOString(),
        endsAt: item.endsAt.toISOString(),
        queueStatus: item.queueStatus as CalendarQueueStatus,
        createdCleanlyEventId: item.createdCleanlyEventId ?? undefined,
        createdAt: item.createdAt.toISOString()
      };
    },

    async decideCalendarImportQueueItem(householdId, queueItemId, ownerUserId, input) {
      const item = await prisma.calendarImportQueueItem.findFirst({
        where: { id: queueItemId, householdId },
        include: { submittedByUser: true }
      });
      if (!item) throw new Error("Calendar import queue item not found");
      const cleanlyEvent = input.decision === "approve"
        ? await prisma.cleanlyCalendarEvent.create({
            data: {
              householdId,
              createdByUserId: item.submittedByUserId,
              type: input.proposedType ?? item.proposedType,
              title: item.title,
              privacyTitle: item.privacyTitle,
              detailLevel: item.detailLevel,
              startsAt: item.startsAt,
              endsAt: item.endsAt,
              timezone: item.timezone,
              source: "google",
              status: "active"
            }
          })
        : undefined;
      const updated = await prisma.calendarImportQueueItem.update({
        where: { id: queueItemId },
        data: {
          proposedType: input.proposedType ?? item.proposedType,
          queueStatus: input.decision === "approve" ? "approved" : "rejected",
          ownerDecisionByUserId: ownerUserId,
          ownerDecisionAt: new Date(),
          createdCleanlyEventId: cleanlyEvent?.id
        },
        include: { submittedByUser: true }
      });
      return {
        id: updated.id,
        householdId: updated.householdId,
        submittedByUserId: updated.submittedByUserId,
        submittedByName: updated.submittedByUser.displayName ?? updated.submittedByUser.primaryEmail ?? updated.submittedByUser.clerkUserId,
        proposedType: updated.proposedType as CleanlyCalendarEventType,
        detailLevel: updated.detailLevel as CalendarDetailLevel,
        title: updated.title,
        privacyTitle: updated.privacyTitle,
        startsAt: updated.startsAt.toISOString(),
        endsAt: updated.endsAt.toISOString(),
        queueStatus: updated.queueStatus as CalendarQueueStatus,
        createdCleanlyEventId: updated.createdCleanlyEventId ?? undefined,
        createdAt: updated.createdAt.toISOString()
      };
    },
```

- [ ] **Step 5: Run Prisma store database tests**

Run:

```powershell
npm.cmd run test:db -w server -- prismaStore.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Prisma store**

```powershell
git add server/src/repositories/prismaStore.ts server/test/prismaStore.test.ts
git commit -m "feat: persist calendar sync governance"
```

---

### Task 6: Web API Calendar Sync Service

**Files:**
- Modify: `web/src/api.ts`

- [ ] **Step 1: Add shared imports**

Add these to the existing `@chore-helper/shared` import list:

```ts
  CalendarConnectionSummary,
  CalendarImportPolicy,
  CalendarImportQueueDecisionInput,
  CalendarImportQueueItem,
  CalendarPreferences
```

- [ ] **Step 2: Add calendar API functions**

Append these functions near the other API functions:

```ts
export async function listCalendarImportPolicies(householdId: string): Promise<CalendarImportPolicy[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/calendar/import-policies`);
  if (!response.ok) throw new Error("Failed to fetch calendar import policies");
  return response.json();
}

export async function updateCalendarImportPolicy(
  householdId: string,
  memberId: string,
  update: Pick<CalendarImportPolicy, "importQueueMode" | "importContentMode">
): Promise<CalendarImportPolicy> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/calendar/import-policies/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update)
  });
  if (!response.ok) throw new Error("Failed to update calendar import policy");
  return response.json();
}

export async function listCalendarImportQueue(householdId: string): Promise<CalendarImportQueueItem[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/calendar/import-queue`);
  if (!response.ok) throw new Error("Failed to fetch calendar import queue");
  return response.json();
}

export async function decideCalendarImportQueueItem(
  householdId: string,
  queueItemId: string,
  input: CalendarImportQueueDecisionInput
): Promise<CalendarImportQueueItem> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/calendar/import-queue/${queueItemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error("Failed to update calendar import queue item");
  return response.json();
}

export async function listCalendarConnections(): Promise<CalendarConnectionSummary[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/calendar/connections`);
  if (!response.ok) throw new Error("Failed to fetch calendar connections");
  return response.json();
}

export async function startGoogleCalendarConnection(): Promise<{ provider: "google"; status: string; message: string }> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/calendar/google/connect`, { method: "POST" });
  if (!response.ok) throw new Error("Failed to start Google Calendar connection");
  return response.json();
}

export async function getCalendarPreferences(householdId: string): Promise<CalendarPreferences> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/calendar/preferences?householdId=${encodeURIComponent(householdId)}`);
  if (!response.ok) throw new Error("Failed to fetch calendar preferences");
  return response.json();
}

export async function updateCalendarPreferences(input: CalendarPreferences): Promise<CalendarPreferences> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/calendar/preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error("Failed to update calendar preferences");
  return response.json();
}
```

- [ ] **Step 3: Verify web typecheck**

Run:

```powershell
npm.cmd run typecheck -w web
```

Expected: PASS.

- [ ] **Step 4: Commit API functions**

```powershell
git add web/src/api.ts
git commit -m "feat: add calendar sync web api"
```

---

### Task 7: Settings Owner and Member Sync UI

**Files:**
- Modify: `web/src/pages/SettingsPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing Settings tests**

In `web/src/App.test.tsx`, add tests that mock the new API calls and assert:

```ts
expect(await screen.findByRole("heading", { name: "Calendar sync" })).toBeInTheDocument();
expect(screen.getByText("Family import controls")).toBeInTheDocument();
expect(screen.getByText("Export is personal. Each member chooses where Clenella writes calendar updates.")).toBeInTheDocument();
```

Add a non-owner variant that expects:

```ts
expect(await screen.findByText("Personal sync center")).toBeInTheDocument();
expect(screen.queryByText("Family import controls")).not.toBeInTheDocument();
```

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t Settings
```

Expected: FAIL because the UI has not been added.

- [ ] **Step 2: Add Settings state and imports**

In `SettingsPage.tsx`, replace the current `useState` import with:

```ts
import { useEffect, useMemo, useState } from "react";
```

Import API helpers:

```ts
import {
  getCalendarPreferences,
  getCurrentUser,
  listCalendarConnections,
  listCalendarImportPolicies,
  listHouseholdMembers,
  startGoogleCalendarConnection,
  updateCalendarImportPolicy,
  updateCalendarPreferences
} from "../api";
```

Import shared types:

```ts
import type { CalendarImportPolicy, CalendarPreferences, HouseholdAppData, HouseholdMemberSummary } from "@chore-helper/shared";
```

Extend props:

```ts
type SettingsPageProps = {
  households: HouseholdAppData[];
  onWeekStartDayChange: (weekStartDay: WeekStartDay) => void;
  weekStartDay: WeekStartDay;
};
```

Update the call site in `web/src/App.tsx` so `SettingsPage` receives `households={households}`.

- [ ] **Step 3: Add Settings data loading**

Inside `SettingsPage`, add:

```ts
  const selectedHousehold = households[0];
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [members, setMembers] = useState<HouseholdMemberSummary[]>([]);
  const [connections, setConnections] = useState<CalendarConnectionSummary[]>([]);
  const [policies, setPolicies] = useState<CalendarImportPolicy[]>([]);
  const [preferences, setPreferences] = useState<CalendarPreferences>();
  const [calendarStatus, setCalendarStatus] = useState<string>();
  const isOwner = useMemo(
    () => members.some((member) => member.userId === currentUserId && member.role === "owner"),
    [currentUserId, members]
  );

  useEffect(() => {
    if (!selectedHousehold) return;
    let cancelled = false;
    void Promise.all([
      getCurrentUser(),
      listHouseholdMembers(selectedHousehold.id),
      listCalendarConnections(),
      getCalendarPreferences(selectedHousehold.id)
    ]).then(([user, loadedMembers, loadedConnections, loadedPreferences]) => {
      if (cancelled) return;
      setCurrentUserId(user.id);
      setMembers(loadedMembers);
      setConnections(loadedConnections);
      setPreferences(loadedPreferences);
    }).catch(() => {
      if (!cancelled) setCalendarStatus("Could not load calendar sync settings.");
    });
    return () => {
      cancelled = true;
    };
  }, [selectedHousehold?.id]);

  useEffect(() => {
    if (!selectedHousehold || !isOwner) return;
    let cancelled = false;
    void listCalendarImportPolicies(selectedHousehold.id)
      .then((loadedPolicies) => {
        if (!cancelled) setPolicies(loadedPolicies);
      })
      .catch(() => {
        if (!cancelled) setCalendarStatus("Could not load family import controls.");
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, selectedHousehold?.id]);
```

- [ ] **Step 4: Render owner/member panels**

Replace the current Google Calendar integration card with:

```tsx
      <section className="dashboard-section calendar-sync-section" aria-labelledby="calendar-sync-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Connections</p>
            <h2 id="calendar-sync-heading">Calendar sync</h2>
          </div>
        </div>
        <div className="sync-board">
          <article className="sync-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{connections.length ? "Connected" : "Not connected"}</p>
                <h3>{isOwner ? "Your calendar connection" : "Personal sync center"}</h3>
              </div>
            </div>
            <p>
              Choose what you share with Clenella and where Clenella exports your calendar updates. Export does not require importing personal events.
            </p>
            <button onClick={() => void startGoogleCalendarConnection().then((result) => setCalendarStatus(result.message))} type="button">
              Connect Google Calendar
            </button>
            {preferences ? (
              <div className="sync-preference-grid">
                <label>
                  Privacy default
                  <select
                    value={preferences.defaultDetailLevel}
                    onChange={(event) => void updateCalendarPreferences({
                      ...preferences,
                      defaultDetailLevel: event.target.value as CalendarPreferences["defaultDetailLevel"]
                    }).then(setPreferences)}
                  >
                    <option value="busy_only">Busy only</option>
                    <option value="full_details">Full details</option>
                  </select>
                </label>
                <label>
                  Export mode
                  <select
                    value={preferences.exportMode}
                    onChange={(event) => void updateCalendarPreferences({
                      ...preferences,
                      exportMode: event.target.value as CalendarPreferences["exportMode"]
                    }).then(setPreferences)}
                  >
                    <option value="off">Off</option>
                    <option value="review">Review first</option>
                    <option value="auto">Auto</option>
                  </select>
                </label>
              </div>
            ) : null}
            <p className="section-summary">Export is personal. Each member chooses where Clenella writes calendar updates.</p>
          </article>

          {isOwner ? (
            <article className="sync-panel wide-sync-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Owner controls</p>
                  <h3>Family import controls</h3>
                </div>
              </div>
              <p>Control how each member can send calendar events into the shared Clenella calendar.</p>
              <div className="sync-policy-table">
                {policies.map((policy) => (
                  <div className="sync-policy-row" key={policy.memberId}>
                    <span>{policy.memberName}</span>
                    <select
                      aria-label={`${policy.memberName} import mode`}
                      value={policy.importQueueMode}
                      onChange={(event) => void updateCalendarImportPolicy(selectedHousehold.id, policy.memberId, {
                        importQueueMode: event.target.value as CalendarImportPolicy["importQueueMode"],
                        importContentMode: policy.importContentMode
                      }).then((updated) => setPolicies((current) => current.map((item) => item.memberId === updated.memberId ? updated : item)))}
                    >
                      <option value="off">Off</option>
                      <option value="manual">Review first</option>
                      <option value="auto">Auto-add</option>
                    </select>
                    <select
                      aria-label={`${policy.memberName} content mode`}
                      value={policy.importContentMode}
                      onChange={(event) => void updateCalendarImportPolicy(selectedHousehold.id, policy.memberId, {
                        importQueueMode: policy.importQueueMode,
                        importContentMode: event.target.value as CalendarImportPolicy["importContentMode"]
                      }).then((updated) => setPolicies((current) => current.map((item) => item.memberId === updated.memberId ? updated : item)))}
                    >
                      <option value="chores">Chores</option>
                      <option value="commitments">Commitments</option>
                      <option value="both">Both</option>
                    </select>
                  </div>
                ))}
              </div>
            </article>
          ) : (
            <article className="sync-panel">
              <div className="panel-heading">
                <h3>Your household policy</h3>
              </div>
              <p>Your household owner controls whether shared events are auto-added, reviewed first, or turned off for the shared Clenella calendar.</p>
            </article>
          )}
        </div>
        {calendarStatus ? <p role="status" className="section-summary">{calendarStatus}</p> : null}
      </section>
```

- [ ] **Step 5: Add Settings styles**

In `web/src/App.css`, add:

```css
.calendar-sync-section {
  position: relative;
}

.sync-board {
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
}

.sync-panel {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid var(--line);
  box-shadow: -6px 6px 0 rgba(19, 106, 129, 0.16);
  padding: 22px;
}

.wide-sync-panel {
  min-height: 280px;
}

.sync-preference-grid,
.sync-policy-row {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sync-policy-table {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.sync-policy-row {
  align-items: center;
  border-top: 1px solid var(--line);
  grid-template-columns: minmax(160px, 1fr) 150px 150px;
  padding-top: 10px;
}

@media (max-width: 760px) {
  .sync-board,
  .sync-preference-grid,
  .sync-policy-row {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: Verify Settings tests**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t Settings
```

Expected: PASS.

- [ ] **Step 7: Commit Settings UI**

```powershell
git add web/src/pages/SettingsPage.tsx web/src/App.css web/src/App.test.tsx web/src/App.tsx
git commit -m "feat: add calendar sync settings"
```

---

### Task 8: Calendar Owner Import Queue UI

**Files:**
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing Calendar queue tests**

In `web/src/App.test.tsx`, mock `listCalendarImportQueue` for an owner and assert:

```ts
expect(await screen.findByRole("heading", { name: "Calendar import queue" })).toBeInTheDocument();
expect(screen.getByText("Dentist appointment")).toBeInTheDocument();
expect(screen.getByRole("button", { name: /approve dentist appointment/i })).toBeInTheDocument();
```

Add a non-owner variant:

```ts
expect(screen.queryByRole("heading", { name: "Calendar import queue" })).not.toBeInTheDocument();
```

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t Calendar
```

Expected: FAIL until the queue UI exists.

- [ ] **Step 2: Import queue API helpers**

In `CalendarPage.tsx`, add imports:

```ts
import type { CalendarImportQueueItem } from "@chore-helper/shared";
import { decideCalendarImportQueueItem, listCalendarImportQueue } from "../api";
```

Merge with the existing imports instead of duplicating import lines.

- [ ] **Step 3: Add queue state and loading**

Inside `CalendarPage`, add:

```ts
  const [importQueueItems, setImportQueueItems] = useState<CalendarImportQueueItem[]>([]);
  const [selectedQueueItemId, setSelectedQueueItemId] = useState<string>();
  const selectedQueueItem = importQueueItems.find((item) => item.id === selectedQueueItemId) ?? importQueueItems[0];
```

Add this effect after the owner detection:

```ts
  useEffect(() => {
    if (!selectedHousehold || !isOwner) {
      setImportQueueItems([]);
      return;
    }
    let cancelled = false;
    void listCalendarImportQueue(selectedHousehold.id)
      .then((items) => {
        if (!cancelled) {
          setImportQueueItems(items);
          setSelectedQueueItemId(items[0]?.id);
        }
      })
      .catch(() => {
        if (!cancelled) setImportQueueItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, selectedHousehold?.id]);
```

Add a decision handler:

```ts
  async function decideQueueItem(item: CalendarImportQueueItem, decision: "approve" | "reject") {
    if (!selectedHousehold) return;
    const updated = await decideCalendarImportQueueItem(selectedHousehold.id, item.id, {
      decision,
      proposedType: item.proposedType
    });
    setImportQueueItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
  }
```

- [ ] **Step 4: Render Queue C above Calendar controls**

Before the existing calendar/list workspace panel, render:

```tsx
      {isOwner ? (
        <section className="calendar-import-queue" aria-labelledby="calendar-import-queue-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Owner review</p>
              <h2 id="calendar-import-queue-heading">Calendar import queue</h2>
            </div>
            <span>{importQueueItems.filter((item) => item.queueStatus === "pending").length} pending</span>
          </div>
          {importQueueItems.length ? (
            <div className="calendar-queue-layout">
              <div className="calendar-queue-table" role="list">
                {importQueueItems.map((item) => (
                  <button
                    className="calendar-queue-row"
                    key={item.id}
                    onClick={() => setSelectedQueueItemId(item.id)}
                    type="button"
                  >
                    <span>{item.privacyTitle}</span>
                    <span>{item.submittedByName}</span>
                    <span>{item.proposedType}</span>
                    <span>{item.queueStatus}</span>
                  </button>
                ))}
              </div>
              {selectedQueueItem ? (
                <aside className="calendar-queue-detail">
                  <p className="eyebrow">{selectedQueueItem.detailLevel === "busy_only" ? "Busy only" : "Full details"}</p>
                  <h3>{selectedQueueItem.privacyTitle}</h3>
                  <p>{selectedQueueItem.submittedByName} shared this as a {selectedQueueItem.proposedType}.</p>
                  <div className="calendar-queue-actions">
                    <button
                      aria-label={`Approve ${selectedQueueItem.privacyTitle}`}
                      disabled={selectedQueueItem.queueStatus !== "pending"}
                      onClick={() => void decideQueueItem(selectedQueueItem, "approve")}
                      type="button"
                    >
                      Approve
                    </button>
                    <button
                      aria-label={`Reject ${selectedQueueItem.privacyTitle}`}
                      className="section-action"
                      disabled={selectedQueueItem.queueStatus !== "pending"}
                      onClick={() => void decideQueueItem(selectedQueueItem, "reject")}
                      type="button"
                    >
                      Reject
                    </button>
                  </div>
                </aside>
              ) : null}
            </div>
          ) : (
            <p className="empty-state">No imported calendar events are waiting for review.</p>
          )}
        </section>
      ) : null}
```

- [ ] **Step 5: Add queue styles**

In `web/src/App.css`, add:

```css
.calendar-import-queue {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid var(--line);
  box-shadow: -6px 6px 0 rgba(19, 106, 129, 0.16);
  margin-bottom: 24px;
  padding: 20px;
}

.calendar-queue-layout {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
}

.calendar-queue-table {
  border-top: 1px solid var(--line);
}

.calendar-queue-row {
  align-items: center;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  display: grid;
  font: inherit;
  gap: 12px;
  grid-template-columns: minmax(180px, 1fr) 140px 110px 100px;
  padding: 12px 0;
  text-align: left;
  width: 100%;
}

.calendar-queue-row:hover,
.calendar-queue-row:focus-visible {
  background: rgba(218, 242, 246, 0.44);
  outline: none;
}

.calendar-queue-detail {
  border-left: 4px solid var(--teal);
  padding-left: 18px;
}

.calendar-queue-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

@media (max-width: 860px) {
  .calendar-queue-layout,
  .calendar-queue-row {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: Verify Calendar tests**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t Calendar
```

Expected: PASS.

- [ ] **Step 7: Commit Calendar queue UI**

```powershell
git add web/src/pages/CalendarPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "feat: add owner calendar import queue"
```

---

### Task 9: Final Verification and Roadmap Note

**Files:**
- Modify: `docs/product-roadmap.md`

- [ ] **Step 1: Update roadmap milestone 6**

In `docs/product-roadmap.md`, update milestone 6 to say:

```md
- Calendar sync governance separates owner import controls from member-owned import/export preferences.
- Owners review member-submitted commitments through an owner-only import queue before items enter the shared Clenella calendar, unless that member is configured for auto-add.
- Members control export mode and destination calendar independently from import.
```

- [ ] **Step 2: Run server tests**

Run:

```powershell
npm.cmd run test -w server -- calendarSync.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run web targeted tests**

Run:

```powershell
npm.cmd run test -w web -- App.test.tsx -t "Settings|Calendar"
```

Expected: PASS.

- [ ] **Step 4: Run full build**

Run:

```powershell
npm.cmd run build -w web
```

Expected: PASS.

- [ ] **Step 5: Run server typecheck**

Run:

```powershell
npm.cmd run typecheck -w server
```

Expected: PASS.

- [ ] **Step 6: Commit roadmap and verification fixes**

```powershell
git add docs/product-roadmap.md
git commit -m "docs: update roadmap for calendar sync governance"
```

---

## Visual Verification Checklist

After implementation, start the web app and verify these views in the browser:

- Owner Settings shows both `Your calendar connection` and `Family import controls`.
- Non-owner Settings shows `Personal sync center` and no per-member owner controls.
- Owner Calendar shows the import queue near the top on desktop.
- Non-owner Calendar does not show the owner queue.
- Calendar queue uses a compact table/detail rail and does not create another heavy nested card stack.
- Copy clearly states that export is personal and does not require importing personal calendar events.

## Self-Review

- Spec coverage: The plan covers shared types, data model, API, owner/member Settings UX, owner Calendar queue UX, permissions, and roadmap tracking.
- Scope: Live Google OAuth/provider sync is intentionally outside this implementation batch and remains represented by a stub endpoint plus UI copy.
- Completeness scan: The plan contains no incomplete tasks or unspecified implementation steps.
- Type consistency: The shared DTO names are reused consistently across server, API, and UI tasks.
