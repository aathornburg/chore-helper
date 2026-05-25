# Scheduling And Calendar Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text chore cadence as schedule truth with app-owned timed schedules, materialized occurrences, assignment rules, calendar exceptions, and a household Calendar planner.

**Architecture:** Keep `Chore` as the catalog record and add schedule series plus immutable planned occurrences underneath it. Scheduling rules are stored in household-local terms and materialized into UTC occurrence instants using the household IANA time zone; edits change future unreported occurrences only, while single-occurrence edits are explicit exceptions. Express routes remain household-authorized, Prisma and in-memory stores expose the same contract, and React consumes range-query APIs for accessible month/week/day views.

**Tech Stack:** TypeScript, React/Vite, Express, Zod, Prisma/Postgres, Vitest/Supertest, `date-fns` and `date-fns-tz` for deterministic household-time-zone materialization.

---

## File Map

- Modify `shared/src/types.ts`: schedule, assignment, occurrence, exception, and calendar-query DTOs.
- Modify `server/prisma/schema.prisma`: `Chore` detail columns and schedule/assignee/occurrence persistence relations.
- Create `server/src/scheduling/materializeOccurrences.ts`: pure recurrence expansion and UTC conversion.
- Create `server/test/materializeOccurrences.test.ts`: time-zone, recurrence, and rotation unit tests.
- Modify `server/src/repositories/inMemoryStore.ts`: schedule and occurrence store contract plus deterministic local implementation.
- Modify `server/src/repositories/prismaStore.ts`: persistent schedule and occurrence implementation.
- Modify `server/src/routes/households.ts`: authorized schedule CRUD, occurrence range reads, and exception endpoints.
- Create `server/test/schedules.test.ts`: owner/member authorization and occurrence API behavior.
- Modify `server/test/prismaStore.test.ts`: persistent schedule/occurrence assertions for a disposable database.
- Modify `web/src/api.ts`: scheduling and calendar API functions.
- Modify `web/src/routes.ts` and `web/src/App.tsx`: primary Calendar route and navigation.
- Create `web/src/pages/CalendarPage.tsx`: planner and accessible occurrence editing surface.
- Modify `web/src/pages/ChoresPage.tsx`: definition fields and schedule setup entry point.
- Modify `web/src/App.css`: calendar and schedule editor layout.
- Modify `web/src/App.test.tsx`: Calendar navigation, range loading, filters, and owner edit flow tests.

## Task 1: Domain Contract And Persistent Schedule Records

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Test: `server/test/schedules.test.ts`
- Modify: `server/package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Write failing schedule creation and authorization tests**

Create `server/test/schedules.test.ts` using the invitation helper pattern from
`server/test/members.test.ts`. Cover an owner creating two schedules for one chore,
ordinary member creation denial, and schedule reads for household members:

```ts
const morning = await request(app)
  .post(`/api/households/${household.id}/chores/${chore.id}/schedules`)
  .set(auth("owner@example.com"))
  .send({
    recurrence: { frequency: "daily", interval: 1 },
    localStartTime: "07:00",
    startsOn: "2026-05-25",
    plannedMinutes: 15,
    assignment: { mode: "fixed", memberUserIds: [member.userId] }
  })
  .expect(201);

const evening = await request(app)
  .post(`/api/households/${household.id}/chores/${chore.id}/schedules`)
  .set(auth("owner@example.com"))
  .send({
    recurrence: { frequency: "weekly", interval: 1, weekDays: [1, 3, 5] },
    localStartTime: "19:00",
    startsOn: "2026-05-25",
    plannedMinutes: 20,
    assignment: { mode: "rotation", memberUserIds: [owner.userId, member.userId] }
  })
  .expect(201);

expect((await request(app)
  .get(`/api/households/${household.id}/chores/${chore.id}/schedules`)
  .set(auth("member@example.com"))
  .expect(200)).body).toEqual([
  expect.objectContaining({ id: morning.body.id }),
  expect.objectContaining({ id: evening.body.id })
]);
```

- [x] **Step 2: Run schedule tests and verify RED**

Run:

```powershell
npm.cmd test -w server -- schedules.test.ts
```

Expected: route-not-found failures for `/schedules`, proving no schedule API exists yet.

- [x] **Step 3: Add shared schedule and occurrence types**

Extend `shared/src/types.ts` with this public contract:

```ts
export type RecurrenceFrequency = "one_time" | "daily" | "weekly" | "monthly";
export type ChoreScheduleRecurrence = {
  frequency: RecurrenceFrequency;
  interval: number;
  weekDays?: number[];
  monthlyDay?: number;
};
export type ChoreScheduleAssignment = {
  mode: "fixed" | "rotation";
  memberUserIds: string[];
};
export type ChoreSchedule = {
  id: string;
  householdId: string;
  choreId: string;
  recurrence: ChoreScheduleRecurrence;
  localStartTime: string;
  startsOn: string;
  endsOn?: string;
  plannedMinutes: number;
  assignment: ChoreScheduleAssignment;
  archivedAt?: string;
};
export type OccurrenceExceptionType = "none" | "rescheduled" | "resized" | "reassigned" | "skipped";
export type ChoreOccurrence = {
  id: string;
  householdId: string;
  choreId: string;
  scheduleId: string;
  sequence: number;
  plannedStartAt: string;
  plannedEndAt: string;
  assignedUserId: string;
  exceptionType: OccurrenceExceptionType;
  status: "planned" | "skipped";
};
```

Extend `Chore` with `instructions?: string` and `tags?: string[]`. Keep `cadence`
and `estimatedMinutes` through this release for existing assistant screens, but do not
use `cadence` to create occurrences.

- [x] **Step 4: Add Prisma schedule persistence**

Add the Prisma relations and records:

```prisma
model Chore {
  // existing columns remain
  instructions String?
  tags         String @default("[]")
  schedules    ChoreSchedule[]
  occurrences  ChoreOccurrence[]
}

model ChoreSchedule {
  id             String   @id @default(cuid())
  householdId    String
  household      Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  choreId        String
  chore          Chore    @relation(fields: [choreId], references: [id], onDelete: Cascade)
  frequency      String
  interval       Int
  weekDays       String   @default("[]")
  monthlyDay     Int?
  localStartTime String
  startsOn       String
  endsOn         String?
  plannedMinutes Int
  assignmentMode String
  assignees      ChoreScheduleAssignee[]
  occurrences    ChoreOccurrence[]
  archivedAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model ChoreScheduleAssignee {
  scheduleId String
  schedule   ChoreSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  userId     String
  user       User @relation(fields: [userId], references: [id], onDelete: Cascade)
  position   Int

  @@id([scheduleId, userId])
  @@unique([scheduleId, position])
}

model ChoreOccurrence {
  id               String @id @default(cuid())
  householdId      String
  household        Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  choreId          String
  chore            Chore @relation(fields: [choreId], references: [id], onDelete: Cascade)
  scheduleId       String
  schedule         ChoreSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  sequence         Int
  plannedStartAt   DateTime
  plannedEndAt     DateTime
  assignedUserId   String
  assignedUser     User @relation(fields: [assignedUserId], references: [id], onDelete: Restrict)
  exceptionType    String @default("none")
  status           String @default("planned")
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([scheduleId, sequence])
  @@index([householdId, plannedStartAt])
}
```

Add reciprocal `schedules`/`occurrences` relations to `Household` and assigned schedule
and occurrence relations to `User`.

- [x] **Step 5: Add schedule store methods and create/list routes**

Add store methods with the same signatures in both stores:

```ts
createSchedule(schedule: Omit<ChoreSchedule, "id" | "archivedAt">): StoreResult<ChoreSchedule>;
listSchedules(householdId: string, choreId?: string): StoreResult<ChoreSchedule[]>;
updateSchedule(
  householdId: string,
  scheduleId: string,
  update: Omit<ChoreSchedule, "id" | "householdId" | "choreId" | "archivedAt">
): StoreResult<ChoreSchedule | undefined>;
archiveSchedule(householdId: string, scheduleId: string): StoreResult<ChoreSchedule | undefined>;
```

In `server/src/routes/households.ts`, validate payloads using:

```ts
const scheduleSchema = z.object({
  recurrence: z.object({
    frequency: z.enum(["one_time", "daily", "weekly", "monthly"]),
    interval: z.number().int().positive(),
    weekDays: z.array(z.number().int().min(0).max(6)).optional(),
    monthlyDay: z.number().int().min(1).max(31).optional()
  }),
  localStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  startsOn: z.string().date(),
  endsOn: z.string().date().optional(),
  plannedMinutes: z.number().int().positive(),
  assignment: z.object({
    mode: z.enum(["fixed", "rotation"]),
    memberUserIds: z.array(z.string().min(1)).min(1)
  })
});
```

Mount owner-only create/update/archive routes and member-readable list routes:

```text
GET  /api/households/:householdId/chores/:choreId/schedules
POST /api/households/:householdId/chores/:choreId/schedules
PUT  /api/households/:householdId/schedules/:scheduleId
POST /api/households/:householdId/schedules/:scheduleId/archive
```

Before saving, confirm every assignee has household membership and reject an unknown
assignee with `400 { error: "Schedule assignee must be a household member" }`.

- [x] **Step 6: Verify and commit schedule records**

Run:

```powershell
npm.cmd run db:generate -w server
npm.cmd test -w server -- schedules.test.ts auth.test.ts members.test.ts
npm.cmd run typecheck -w shared
npm.cmd run typecheck -w server
git add shared/src/types.ts server/prisma/schema.prisma server/src/repositories server/src/routes/households.ts server/test/schedules.test.ts server/package.json package-lock.json
git commit -m "Add chore schedule records and APIs"
git push origin main
```

Expected: tests and typechecks pass; the first Release 2 backend checkpoint is on `main`.

## Task 2: Time-Zone Occurrence Materialization And Rotation

**Files:**
- Create: `server/src/scheduling/materializeOccurrences.ts`
- Create: `server/test/materializeOccurrences.test.ts`
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Modify: `server/src/routes/households.ts`
- Modify: `server/test/schedules.test.ts`

- [x] **Step 1: Write failing recurrence and rotation unit tests**

Test one-time, daily, weekday weekly, monthly, DST, and alternating rotation:

```ts
const occurrences = materializeOccurrences({
  schedule: {
    id: "schedule-1",
    householdId: "household-1",
    choreId: "chore-1",
    recurrence: { frequency: "daily", interval: 1 },
    localStartTime: "07:00",
    startsOn: "2026-03-07",
    plannedMinutes: 30,
    assignment: { mode: "rotation", memberUserIds: ["user-a", "user-b"] }
  },
  householdTimeZone: "America/New_York",
  rangeStart: "2026-03-07",
  rangeEnd: "2026-03-10"
});

expect(occurrences.map((occurrence) => occurrence.assignedUserId)).toEqual([
  "user-a", "user-b", "user-a", "user-b"
]);
expect(occurrences[1].plannedStartAt).toBe("2026-03-08T11:00:00.000Z");
```

- [x] **Step 2: Run unit tests and verify RED**

Run:

```powershell
npm.cmd test -w server -- materializeOccurrences.test.ts
```

Expected: import failure because the pure generator module does not exist.

- [x] **Step 3: Implement pure occurrence expansion**

Install the time-zone utilities before creating the generator:

```powershell
npm.cmd install date-fns date-fns-tz -w server
```

Create `materializeOccurrences.ts` exporting:

```ts
export type MaterializeInput = {
  schedule: ChoreSchedule;
  householdTimeZone: string;
  rangeStart: string;
  rangeEnd: string;
};

export function materializeOccurrences(input: MaterializeInput): ChoreOccurrence[] {
  // Expand local calendar dates matching recurrence, convert local start/end to UTC
  // with fromZonedTime, and choose fixed/rotation assignees by absolute sequence.
}
```

Use `date-fns` local date iteration and `fromZonedTime` from `date-fns-tz`. Determine
`sequence` from the schedule start date rather than from the query window so a
rotation does not reset when a caller requests a later range. For a monthly rule whose
day does not exist in a month, emit no occurrence in that month.

- [x] **Step 4: Persist materialized occurrences idempotently**

Add:

```ts
materializeScheduleOccurrences(
  householdId: string,
  scheduleId: string,
  occurrences: ChoreOccurrence[]
): StoreResult<ChoreOccurrence[]>;
listOccurrences(
  householdId: string,
  range: { startAt: string; endAt: string; assignedUserId?: string }
): StoreResult<ChoreOccurrence[]>;
```

The Prisma implementation upserts on `[scheduleId, sequence]`; the in-memory
implementation stores the first generated occurrence and does not overwrite an
existing exception. In the schedule creation and update route, materialize the next
90 local days. Add:

```text
GET /api/households/:householdId/occurrences?startAt=<ISO>&endAt=<ISO>&assignedUserId=<optional>
```

- [x] **Step 5: Verify occurrence behavior and commit**

Run:

```powershell
npm.cmd test -w server -- materializeOccurrences.test.ts schedules.test.ts
npm.cmd run typecheck -w server
git add server/src/scheduling server/src/repositories server/src/routes/households.ts server/test/materializeOccurrences.test.ts server/test/schedules.test.ts
git commit -m "Materialize timed chore occurrences"
git push origin main
```

Expected: recurrence, DST, rotation, and range-query assertions pass.

## Task 3: Future-Series Edits And Single-Occurrence Exceptions

**Files:**
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Modify: `server/src/routes/households.ts`
- Modify: `server/test/schedules.test.ts`

- [x] **Step 1: Write failing exception and history tests**

Cover reschedule, resize, reassignment, skip, and a series update preserving elapsed
occurrences:

```ts
await request(app)
  .put(`/api/households/${household.id}/occurrences/${occurrence.id}`)
  .set(auth("owner@example.com"))
  .send({
    plannedStartAt: "2026-05-26T14:00:00.000Z",
    plannedEndAt: "2026-05-26T14:45:00.000Z",
    assignedUserId: member.userId
  })
  .expect(200)
  .expect((response) => {
    expect(response.body.exceptionType).toBe("rescheduled");
  });

await request(app)
  .post(`/api/households/${household.id}/occurrences/${occurrence.id}/skip`)
  .set(auth("owner@example.com"))
  .expect(200)
  .expect((response) => {
    expect(response.body.status).toBe("skipped");
  });
```

- [x] **Step 2: Run schedule tests and verify RED**

Run:

```powershell
npm.cmd test -w server -- schedules.test.ts
```

Expected: missing exception endpoints fail.

- [x] **Step 3: Implement exception mutations and future-only series regeneration**

Add:

```ts
updateOccurrenceException(
  householdId: string,
  occurrenceId: string,
  update: { plannedStartAt: string; plannedEndAt: string; assignedUserId: string }
): StoreResult<ChoreOccurrence | undefined>;
skipOccurrence(householdId: string, occurrenceId: string): StoreResult<ChoreOccurrence | undefined>;
```

Add owner-only endpoints:

```text
PUT  /api/households/:householdId/occurrences/:occurrenceId
POST /api/households/:householdId/occurrences/:occurrenceId/skip
```

For schedule series updates, retain occurrences whose `plannedStartAt` is before the
request instant or whose `exceptionType` is not `none`; delete and rematerialize only
future untouched occurrences for that schedule.

- [x] **Step 4: Verify and commit exception support**

Run:

```powershell
npm.cmd test -w server -- schedules.test.ts materializeOccurrences.test.ts
npm.cmd run typecheck -w server
git add server/src/repositories server/src/routes/households.ts server/test/schedules.test.ts
git commit -m "Add calendar occurrence exceptions"
git push origin main
```

Expected: owners can alter planned future work without mutating historical occurrence rows.

## Task 4: Calendar Page And Accessible Planner Actions

**Files:**
- Modify: `web/src/api.ts`
- Modify: `web/src/routes.ts`
- Modify: `web/src/App.tsx`
- Create: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`
- Modify: `web/src/App.test.tsx`

- [x] **Step 1: Write failing Calendar UI tests**

Add tests that Calendar is primary navigation, loads occurrences for a visible date
range, switches view and member filter, gives owners form-based edit controls, and
submits the same occurrence update when a timed card is dragged or resized:

```tsx
renderAt("/calendar");
await waitFor(() => expect(screen.getByRole("heading", { name: "Calendar" })).toBeTruthy());
expect(screen.getByRole("button", { name: "Month" })).toBeTruthy();
fireEvent.click(screen.getByRole("button", { name: "Week" }));
expect(screen.getByText("Clean bathrooms")).toBeTruthy();
fireEvent.click(screen.getByRole("button", { name: "Edit Clean bathrooms" }));
fireEvent.change(screen.getByLabelText("Planned duration"), { target: { value: "45" } });
fireEvent.click(screen.getByRole("button", { name: "Save occurrence" }));
fireEvent.dragStart(screen.getByLabelText("Scheduled Clean bathrooms"));
fireEvent.drop(screen.getByLabelText("10:00 time slot"));
await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
  expect.stringContaining(`/occurrences/${occurrence.id}`),
  expect.objectContaining({ method: "PUT" })
));
```

- [x] **Step 2: Run web tests and verify RED**

Run:

```powershell
npm.cmd test -w web -- App.test.tsx
```

Expected: missing Calendar navigation/page/API failures.

- [x] **Step 3: Add calendar API helpers and route**

In `web/src/api.ts`, add:

```ts
export async function listOccurrences(
  householdId: string,
  range: { startAt: string; endAt: string; assignedUserId?: string }
): Promise<ChoreOccurrence[]>;
export async function updateOccurrence(
  householdId: string,
  occurrenceId: string,
  update: { plannedStartAt: string; plannedEndAt: string; assignedUserId: string }
): Promise<ChoreOccurrence>;
export async function skipOccurrence(householdId: string, occurrenceId: string): Promise<ChoreOccurrence>;
```

Add `"/calendar"` to `web/src/routes.ts`; add `{ label: "Calendar", path: "/calendar" }`
after Today in the primary navigation; render `<CalendarPage households={households}
isLoading={isLoading} />` from `AppRoutes`.

- [x] **Step 4: Implement the calendar planner**

Create `CalendarPage.tsx` with:

```ts
type CalendarView = "month" | "week" | "day";
type CalendarFilters = { householdId?: string; assignedUserId?: string; status?: string };
```

Render:

- A hero with `Calendar` heading and view toggle buttons.
- Household/member/status filters.
- Month grid cards or week/day timed agenda rows from `ChoreOccurrence`.
- Occurrence labels using chore title, planned local time, duration, assignee, and status.
- For an owner, an `Edit <title>` button opening an inline form with start time,
  duration, assignee, `Save occurrence`, and `Skip occurrence` controls.
- In week and day timed views, owner-only draggable occurrence cards and a resize
  handle that snap to 15-minute slots and submit the same `updateOccurrence` payload
  used by the inline form.

Use `Intl.DateTimeFormat` with each household’s `timeZone` for displayed times. The
inline form is the keyboard/mobile alternative for every drag/resize operation.

- [x] **Step 5: Style, verify, and commit Calendar**

Run:

```powershell
npm.cmd test -w web -- App.test.tsx
npm.cmd run typecheck -w web
npm.cmd run web:build
git add web/src/api.ts web/src/routes.ts web/src/App.tsx web/src/pages/CalendarPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Build household calendar planner"
git push origin main
```

Expected: page interaction tests, typing, and production build pass. Use the Browser
workflow to inspect desktop and narrow-width Calendar renders and verify that drag,
resize, and the equivalent inline edit form reach the same updated occurrence state.

## Task 5: Chore Schedule Setup And Release Verification

**Files:**
- Modify: `web/src/pages/ChoresPage.tsx`
- Modify: `web/src/api.ts`
- Modify: `web/src/App.css`
- Modify: `web/src/App.test.tsx`
- Modify: `server/test/prismaStore.test.ts`
- Modify: `docs/local-postgres-docker-setup.md`

- [x] **Step 1: Write failing chore schedule editor tests**

Cover definition details and a schedule form from an expanded chore row:

```tsx
fireEvent.click(screen.getByRole("button", { name: "Expand Clean bathrooms" }));
fireEvent.change(screen.getByLabelText("Instructions"), {
  target: { value: "Clean sink, toilet, mirror, and floor." }
});
fireEvent.click(screen.getByRole("button", { name: "Add schedule" }));
fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "09:00" } });
fireEvent.change(screen.getByLabelText("Planned duration"), { target: { value: "30" } });
fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
await waitFor(() => expect(screen.getByText("09:00 / 30 min")).toBeTruthy());
```

- [x] **Step 2: Run web tests and verify RED**

Run:

```powershell
npm.cmd test -w web -- App.test.tsx
```

Expected: missing schedule editor controls fail.

- [x] **Step 3: Implement chore definition and schedule setup UI**

Extend API functions for chore instructions/tags and `createSchedule`/`listSchedules`.
In `ChoresPage`, keep existing chore catalog behavior and add an expanded `Schedule`
section with:

- Instructions text area and comma-separated tag input.
- Existing schedule cards showing recurrence, time, duration, and assignment.
- Owner form fields for frequency, weekdays/monthly day when applicable, local start
  time, duration, start/end dates, assignment mode, and household member selection.
- A link/button to open `/calendar` after successful schedule creation.

Do not add check-in controls or assistant schedule recommendations here; those belong
to later releases.

- [x] **Step 4: Add persistent-store schedule verification**

Extend `server/test/prismaStore.test.ts` under the safe disposable-database block:

```ts
const schedule = await firstStore.createSchedule({
  householdId: household.id,
  choreId: chore.id,
  recurrence: { frequency: "daily", interval: 1 },
  localStartTime: "09:00",
  startsOn: "2026-05-25",
  plannedMinutes: 30,
  assignment: { mode: "fixed", memberUserIds: [owner.id] }
});
await firstStore.materializeScheduleOccurrences(household.id, schedule.id, occurrences);
expect(await secondStore.listOccurrences(household.id, range)).toHaveLength(7);
```

Update the Postgres setup documentation to state that schedule/occurrence persistence
tests require the same dedicated `chore_helper_test` database.

- [x] **Step 5: Run release verification and push**

Run:

```powershell
npm.cmd run db:generate -w server
npm.cmd test
npm.cmd run typecheck
npm.cmd run web:build
npm.cmd run test:db -w server
git add shared/src/types.ts server web docs/local-postgres-docker-setup.md package-lock.json
git commit -m "Complete calendar scheduling planner"
git push origin main
```

Expected: all regular checks pass; when the disposable Postgres database is available,
all Prisma schedule/occurrence persistence checks execute and pass before Release 2 is
declared complete.

## Self-Review

- Spec coverage: This plan covers chore details, multiple schedules per chore, fixed
  and rotating assignments, durable timed occurrences, recurrence/time-zone behavior,
  exceptions, Calendar month/week/day views, filters, owner controls, and accessible
  form editing. Outcomes, Today check-ins, and AI evidence reviews remain deliberately
  scoped to Releases 3 and 4.
- Placeholder scan: Tasks specify files, concrete APIs, payload shapes, tests,
  verification commands, and commit checkpoints without implementation placeholders.
- Type consistency: `ChoreSchedule`, `ChoreOccurrence`, recurrence, assignment, and
  exception payload names are used consistently across backend and frontend tasks.
