# Unified Calendar Chore Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate chore catalog workflow with a Calendar-owned planning workspace supporting timed and flexible schedule series, audited completion, list/calendar occurrence views, and one shared create/edit modal.

**Architecture:** Keep `Chore` as descriptive identity only and move all recurrence and duration truth into `ChoreSchedule`. The server stores durable obligations as `ChoreOccurrence` rows, including flexible multi-day windows and completion audit state; the React Calendar page owns occurrence browsing and a shared editor for both schedule-backed creation and later edits. Existing development chore data is reset instead of migrated, and existing assistant cadence/duration application is removed because schedule-draft optimization requires its own approved contract.

**Tech Stack:** TypeScript, React 19, Vite/Vitest, Express, Zod, Prisma/PostgreSQL, date-fns/date-fns-tz, Clerk authorization

---

## File Structure

- Modify `shared/src/types.ts`: definition-only chores, timed/flexible schedules, occurrence status/audit/window DTOs, and atomic chore-create payload.
- Modify `server/prisma/schema.prisma`: remove chore recurrence/duration columns; add schedule mode/end-time/window behavior and occurrence completion/window persistence.
- Modify `server/src/repositories/inMemoryStore.ts`: atomic create contract, flexible occurrence storage/query behavior, completion mutation, and removal of obsolete recommendation-to-chore mutations.
- Modify `server/src/repositories/prismaStore.ts`: transactional atomic creation, new Prisma mappings, audited completion, and reset-compatible persistence behavior.
- Modify `server/src/scheduling/materializeOccurrences.ts`: deterministic timed and flexible obligation expansion.
- Modify `server/src/routes/households.ts`: validation, owner-only structural mutation, assigned-member completion, and schedule-backed chore creation.
- Modify `server/test/materializeOccurrences.test.ts`, `server/test/schedules.test.ts`, `server/test/prismaStore.test.ts`, and affected household/agent tests: backend contract and persistence coverage.
- Modify `server/src/agent/OpenAiChoreAgentProvider.ts`, `server/src/agent/MockChoreAgentProvider.ts`, and relevant tests: stop deriving or applying removed chore fields without introducing unapproved schedule recommendation drafts.
- Modify `web/src/api.ts`: atomic create/update/schedule/completion client methods and occurrence DTO usage.
- Modify `web/src/pages/CalendarPage.tsx`: Calendar/List views, shared modal/sheet, quick completion, flexible and history presentation.
- Delete `web/src/pages/ChoresPage.tsx`: obsolete separate workspace after Calendar owns those functions.
- Modify `web/src/App.tsx`, `web/src/routes.ts`, `web/src/pages/TodayDashboard.tsx`, `web/src/pages/OptimizePage.tsx`, and `web/src/App.css`: navigation consolidation and presentation.
- Modify `web/src/App.test.tsx`: UI contract, view, editor, completion, and removal-of-Chores coverage.
- Modify `docs/local-postgres-docker-setup.md`: document intentional chore/schedule/occurrence data reset and regeneration command.

## Task 1: Replace The Shared Scheduling Contract And Development Schema

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/test/prismaStore.test.ts`
- Modify: `docs/local-postgres-docker-setup.md`

- [ ] **Step 1: Write failing persistent-contract assertions**

In `server/test/prismaStore.test.ts`, replace legacy chore assertions with a schedule-backed
shape test and add completion/window persistence assertions:

```ts
const chore = await store.createChoreWithSchedules({
  householdId: household.id,
  chore: {
    title: "Clean bathrooms",
    source: "manual",
    instructions: "Sink, toilet, mirror, floor.",
    tags: ["bathroom"]
  },
  schedules: [{
    planningMode: "flexible",
    recurrence: { frequency: "weekly", interval: 1, weekDays: [6, 0] },
    startsOn: "2026-05-30",
    flexibleWindowRule: "once_within_selected_days",
    estimatedMinutes: 60,
    assignment: { mode: "fixed", memberUserIds: [owner.id] }
  }]
});

expect(chore.chore).toEqual(expect.objectContaining({
  title: "Clean bathrooms",
  instructions: "Sink, toilet, mirror, floor.",
  tags: ["bathroom"]
}));
expect(chore.chore).not.toHaveProperty("cadence");
expect(chore.chore).not.toHaveProperty("estimatedMinutes");
expect(chore.schedules[0]).toEqual(expect.objectContaining({
  planningMode: "flexible",
  flexibleWindowRule: "once_within_selected_days",
  estimatedMinutes: 60
}));
```

Add an occurrence round-trip assertion after materialization/completion:

```ts
expect(reloadedOccurrence).toEqual(expect.objectContaining({
  status: "completed",
  eligibleStartOn: "2026-05-30",
  eligibleEndOn: "2026-05-31",
  completedByUserId: owner.id,
  completedAt: "2026-05-30T16:00:00.000Z"
}));
```

- [ ] **Step 2: Run the Prisma-store test to verify RED**

Run:

```powershell
$env:DATABASE_URL='postgresql://chore_helper:chore_helper_password@localhost:5432/chore_helper_test?schema=public'; npm.cmd run test:db -w server
```

Expected: FAIL because `createChoreWithSchedules`, flexible schedule properties, and
completion audit persistence do not exist.

- [ ] **Step 3: Define shared type contracts**

In `shared/src/types.ts`, replace the current schedule, occurrence, and chore definitions
with these contract elements:

```ts
export type SchedulePlanningMode = "timed" | "flexible";
export type FlexibleWindowRule = "once_within_selected_days" | "each_selected_day";

export type ChoreScheduleBase = {
  id: string;
  householdId: string;
  choreId: string;
  planningMode: SchedulePlanningMode;
  recurrence: ChoreScheduleRecurrence;
  startsOn: string;
  endsOn?: string;
  assignment: ChoreScheduleAssignment;
  archivedAt?: string;
};

export type TimedChoreSchedule = ChoreScheduleBase & {
  planningMode: "timed";
  localStartTime: string;
  localEndTime: string;
};

export type FlexibleChoreSchedule = ChoreScheduleBase & {
  planningMode: "flexible";
  estimatedMinutes: number;
  flexibleWindowRule: FlexibleWindowRule;
};

export type ChoreSchedule = TimedChoreSchedule | FlexibleChoreSchedule;

export type ChoreOccurrence = {
  id: string;
  householdId: string;
  choreId: string;
  scheduleId: string;
  sequence: number;
  planningMode: SchedulePlanningMode;
  plannedStartAt?: string;
  plannedEndAt?: string;
  estimatedMinutes: number;
  eligibleStartOn: string;
  eligibleEndOn: string;
  assignedUserId: string;
  exceptionType: OccurrenceExceptionType;
  status: "planned" | "completed" | "skipped";
  completedAt?: string;
  completedByUserId?: string;
};

export type Chore = {
  id: string;
  householdId: string;
  householdName?: string;
  title: string;
  source: "manual" | "google-calendar";
  instructions?: string;
  tags?: string[];
  archivedAt?: string;
};

export type ChoreDefinitionInput = Omit<Chore, "id" | "householdId" | "householdName" | "archivedAt">;
export type ScheduleInput = Omit<ChoreSchedule, "id" | "householdId" | "choreId" | "archivedAt">;
export type CreateScheduledChoreInput = {
  chore: ChoreDefinitionInput;
  schedules: ScheduleInput[];
};
export type ScheduledChore = { chore: Chore; schedules: ChoreSchedule[] };
```

Retain existing recommendation properties temporarily for readable legacy recommendation
records, but no task below may apply them to `Chore`.

- [ ] **Step 4: Change Prisma fields for resettable development data**

In `server/prisma/schema.prisma`:

```prisma
model Chore {
  id           String    @id
  householdId  String
  household    Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  title        String
  source       String
  instructions String?
  tags         String    @default("[]")
  archivedAt   DateTime?
  schedules    ChoreSchedule[]
  occurrences  ChoreOccurrence[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model ChoreSchedule {
  id                 String                   @id @default(cuid())
  householdId        String
  household          Household                @relation(fields: [householdId], references: [id], onDelete: Cascade)
  choreId            String
  chore              Chore                    @relation(fields: [choreId], references: [id], onDelete: Cascade)
  planningMode       String
  frequency          String
  interval           Int
  weekDays           String                   @default("[]")
  monthlyDay         Int?
  localStartTime     String?
  localEndTime       String?
  estimatedMinutes   Int?
  flexibleWindowRule String?
  startsOn           String
  endsOn             String?
  assignmentMode     String
  assignees          ChoreScheduleAssignee[]
  occurrences        ChoreOccurrence[]
  archivedAt         DateTime?
  createdAt          DateTime                 @default(now())
  updatedAt          DateTime                 @updatedAt
}

model ChoreOccurrence {
  id                String        @id @default(cuid())
  householdId       String
  household         Household     @relation(fields: [householdId], references: [id], onDelete: Cascade)
  choreId           String
  chore             Chore         @relation(fields: [choreId], references: [id], onDelete: Cascade)
  scheduleId        String
  schedule          ChoreSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  sequence          Int
  planningMode      String
  plannedStartAt    DateTime?
  plannedEndAt      DateTime?
  estimatedMinutes  Int
  eligibleStartOn   String
  eligibleEndOn     String
  assignedUserId    String
  assignedUser      User          @relation("OccurrenceAssignee", fields: [assignedUserId], references: [id], onDelete: Restrict)
  exceptionType     String        @default("none")
  status            String        @default("planned")
  completedAt       DateTime?
  completedByUserId String?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  @@unique([scheduleId, sequence])
  @@index([householdId, eligibleStartOn, eligibleEndOn])
}
```

Document in `docs/local-postgres-docker-setup.md` that this feature intentionally drops
existing development chore planning rows and that local setup runs:

```powershell
npm.cmd run db:generate -w server
npm.cmd run db:push -w server -- --accept-data-loss
```

- [ ] **Step 5: Generate Prisma client and carry the contract into Task 2**

Run:

```powershell
npm.cmd run db:generate -w server
npm.cmd run typecheck -w server
```

Expected: typecheck still fails in store/routes/tests that use removed fields; this is
an intentional RED result proving the contract break is exposed. Do not commit this
intermediate broken state; Task 2 brings the repository implementation up to the new
contract and commits both tasks together.

## Task 2: Implement Atomic Schedule-Backed Chore Creation

**Files:**
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Modify: `server/src/routes/households.ts`
- Modify: `server/src/agent/OpenAiChoreAgentProvider.ts`
- Modify: `server/src/agent/MockChoreAgentProvider.ts`
- Modify: `server/test/schedules.test.ts`
- Modify: `server/test/households.test.ts`
- Modify: `server/test/openAiChoreAgentProvider.test.ts`
- Modify: `server/test/recommendationPrompt.test.ts`
- Modify: `server/test/prismaStore.test.ts`

- [ ] **Step 1: Replace chore-create route tests with atomic creation tests**

In `server/test/schedules.test.ts`, change `prepareHousehold` to create members before a
chore and add:

```ts
const created = await request(app)
  .post(`/api/households/${householdId}/chores`)
  .set(auth("owner@example.com"))
  .send({
    chore: { title: "Kitchen reset", source: "manual", tags: ["kitchen"] },
    schedules: [
      {
        planningMode: "timed",
        recurrence: { frequency: "daily", interval: 1 },
        localStartTime: "07:00",
        localEndTime: "07:20",
        startsOn: "2026-05-25",
        assignment: { mode: "fixed", memberUserIds: [memberId] }
      },
      {
        planningMode: "flexible",
        recurrence: { frequency: "weekly", interval: 1, weekDays: [6, 0] },
        estimatedMinutes: 60,
        flexibleWindowRule: "once_within_selected_days",
        startsOn: "2026-05-30",
        assignment: { mode: "fixed", memberUserIds: [memberId] }
      }
    ]
  })
  .expect(201);

expect(created.body.chore).toEqual(expect.objectContaining({ title: "Kitchen reset" }));
expect(created.body.schedules).toHaveLength(2);
```

Add tests for:

```ts
await request(app)
  .post(`/api/households/${householdId}/chores`)
  .set(auth("owner@example.com"))
  .send({ chore: { title: "Invalid", source: "manual" }, schedules: [] })
  .expect(400);

await request(app)
  .post(`/api/households/${householdId}/chores`)
  .set(auth("member@example.com"))
  .send({
    chore: { title: "Member-created chore", source: "manual" },
    schedules: [{
      planningMode: "timed",
      recurrence: { frequency: "one_time", interval: 1 },
      localStartTime: "07:00",
      localEndTime: "07:30",
      startsOn: "2026-05-25",
      assignment: { mode: "fixed", memberUserIds: [memberId] }
    }]
  })
  .expect(403);
```

Update affected chore CRUD assertions in `server/test/households.test.ts` to use
definition-only updates and owner authorization.

- [ ] **Step 2: Run the route tests to verify RED**

Run:

```powershell
npm.cmd test -w server -- schedules.test.ts households.test.ts
```

Expected: FAIL because the route accepts legacy single-chore input, permits ordinary
household access, and does not create schedules atomically.

- [ ] **Step 3: Add store operations for atomic create**

In `server/src/repositories/inMemoryStore.ts`, introduce:

```ts
export type NewScheduledChore = {
  householdId: string;
  chore: ChoreDefinitionInput;
  schedules: ScheduleInput[];
};

createChoreWithSchedules(input: NewScheduledChore): StoreResult<ScheduledChore>;
```

Implement the in-memory operation as one mutation after all IDs are prepared:

```ts
createChoreWithSchedules({ householdId, chore, schedules: inputs }) {
  const createdChore: Chore = { ...chore, householdId, id: crypto.randomUUID() };
  const createdSchedules = inputs.map((schedule) => ({
    ...schedule,
    householdId,
    choreId: createdChore.id,
    id: crypto.randomUUID()
  }));
  chores.set(householdId, [...(chores.get(householdId) ?? []), createdChore]);
  createdSchedules.forEach((schedule) => schedules.set(schedule.id, schedule));
  markStale(householdId);
  return { chore: createdChore, schedules: createdSchedules };
}
```

In `server/src/repositories/prismaStore.ts`, implement the same contract in a single
`prisma.$transaction`, using nested `schedules.create` and nested assignees creation;
return the created chore and mapped schedules from the transaction. Update `toChore`
and `toSchedule` to use the new shared fields.

- [ ] **Step 4: Replace route validation and authorization**

In `server/src/routes/households.ts`, define discriminated schedule validation:

```ts
const scheduleBaseSchema = z.object({
  recurrence: z.object({
    frequency: z.enum(["one_time", "daily", "weekly", "monthly"]),
    interval: z.number().int().positive(),
    weekDays: z.array(z.number().int().min(0).max(6)).optional(),
    monthlyDay: z.number().int().min(1).max(31).optional()
  }),
  startsOn: z.string().date(),
  endsOn: z.string().date().optional(),
  assignment: z.object({
    mode: z.enum(["fixed", "rotation"]),
    memberUserIds: z.array(z.string().min(1)).min(1)
  })
});
const timedScheduleSchema = scheduleBaseSchema.extend({
  planningMode: z.literal("timed"),
  localStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  localEndTime: z.string().regex(/^\d{2}:\d{2}$/)
});
const flexibleScheduleSchema = scheduleBaseSchema.extend({
  planningMode: z.literal("flexible"),
  estimatedMinutes: z.number().int().positive(),
  flexibleWindowRule: z.enum(["once_within_selected_days", "each_selected_day"])
});
const scheduleSchema = z.discriminatedUnion("planningMode", [
  timedScheduleSchema,
  flexibleScheduleSchema
]);
const createScheduledChoreSchema = z.object({
  chore: z.object({
    title: z.string().trim().min(1),
    source: z.enum(["manual"]),
    instructions: z.string().trim().optional(),
    tags: z.array(z.string().trim().min(1)).optional()
  }),
  schedules: z.array(scheduleSchema).min(1)
});
```

Add refinements ensuring timed end is after start, weekly schedules have weekdays,
monthly schedules have a day, fixed assignment has exactly one assignee, and flexible
`once_within_selected_days` is used only with two or more selected weekdays.

Change `POST /:householdId/chores` and chore definition mutation/archive routes to
`requireHouseholdOwner`; create calls `store.createChoreWithSchedules` and
materializes each returned schedule only after all validation/assignee checks pass.

- [ ] **Step 5: Remove invalid cadence/duration recommendation mutation**

Update `server/test/openAiChoreAgentProvider.test.ts` so prompt context describes
definition-only chores:

```ts
expect(input.prompt).toContain("Clean bathrooms");
expect(input.prompt).not.toContain("cadence=");
expect(input.prompt).not.toContain("estimatedMinutes=");
```

In the recommendation application test in `server/test/households.test.ts`, replace
the assertion that accepted recommendations edit chore cadence/duration with:

```ts
expect(applied.body.applied).toHaveLength(0);
expect(applied.body.requiresScheduleDraftDesign).toBe(true);
```

Run:

```powershell
npm.cmd test -w server -- openAiChoreAgentProvider.test.ts recommendationPrompt.test.ts households.test.ts
```

Expected: FAIL because the provider and apply path still access removed chore-level
schedule fields.

Update both agent providers to describe chore title/instructions/tags without
`cadence` or `estimatedMinutes`. Update `attachReviewMetadata` and
`applyRecommendationDecisions` so accepted legacy cadence/duration suggestions are
not written to a chore; instead return:

```ts
{
  applied: [],
  declined,
  requiresScheduleDraftDesign: accepted.length > 0
}
```

Add `requiresScheduleDraftDesign: boolean` to `ApplyRecommendationResult` in
`server/src/repositories/inMemoryStore.ts`. This preserves readable recommendations
while deferring schedule-draft application to its separately approved optimization
work.

- [ ] **Step 6: Implement Prisma transaction coverage and verify GREEN**

Complete the failing `server/test/prismaStore.test.ts` assertions so a failed nested
schedule write cannot persist its chore, then run:

```powershell
npm.cmd test -w server -- schedules.test.ts households.test.ts
$env:DATABASE_URL='postgresql://chore_helper:chore_helper_password@localhost:5432/chore_helper_test?schema=public'; npm.cmd run test:db -w server
```

Expected: PASS for atomic creation, no-schedule rejection, owner checks, and database
transaction persistence.

- [ ] **Step 7: Commit atomic creation and server fallout**

```powershell
git add shared/src/types.ts server/prisma/schema.prisma docs/local-postgres-docker-setup.md server/src/repositories/inMemoryStore.ts server/src/repositories/prismaStore.ts server/src/routes/households.ts server/src/agent server/test/schedules.test.ts server/test/households.test.ts server/test/prismaStore.test.ts server/test/openAiChoreAgentProvider.test.ts server/test/recommendationPrompt.test.ts
git commit -m "Require schedules when creating chores"
```

## Task 3: Materialize Timed And Flexible Obligations

**Files:**
- Modify: `server/src/scheduling/materializeOccurrences.ts`
- Modify: `server/test/materializeOccurrences.test.ts`
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Modify: `server/test/schedules.test.ts`

- [ ] **Step 1: Write failing materialization tests for both schedule modes**

Replace the schedule fixture in `server/test/materializeOccurrences.test.ts` with typed
timed and flexible factories. Add:

```ts
function timedSchedule(update: Partial<TimedChoreSchedule> = {}): TimedChoreSchedule {
  return {
    id: "timed-schedule",
    householdId: "household-1",
    choreId: "chore-1",
    planningMode: "timed",
    recurrence: { frequency: "daily", interval: 1 },
    localStartTime: "10:00",
    localEndTime: "11:00",
    startsOn: "2026-03-07",
    assignment: { mode: "fixed", memberUserIds: ["user-a"] },
    ...update
  };
}

function flexibleSchedule(update: Partial<FlexibleChoreSchedule> = {}): FlexibleChoreSchedule {
  return {
    id: "flexible-schedule",
    householdId: "household-1",
    choreId: "chore-1",
    planningMode: "flexible",
    recurrence: { frequency: "weekly", interval: 1, weekDays: [6, 0] },
    flexibleWindowRule: "once_within_selected_days",
    estimatedMinutes: 60,
    startsOn: "2026-05-30",
    assignment: { mode: "fixed", memberUserIds: ["user-a"] },
    ...update
  };
}

it("derives timed duration from its local time range across DST", () => {
  const occurrences = materializeOccurrences({
    schedule: timedSchedule({ localStartTime: "10:00", localEndTime: "11:00" }),
    householdTimeZone: "America/New_York",
    rangeStart: "2026-03-07",
    rangeEnd: "2026-03-08"
  });
  expect(occurrences[1]).toEqual(expect.objectContaining({
    planningMode: "timed",
    plannedStartAt: "2026-03-08T14:00:00.000Z",
    plannedEndAt: "2026-03-08T15:00:00.000Z",
    estimatedMinutes: 60
  }));
});

it("creates one flexible obligation covering selected weekend days", () => {
  const occurrences = materializeOccurrences({
    schedule: flexibleSchedule({
      recurrence: { frequency: "weekly", interval: 1, weekDays: [6, 0] },
      flexibleWindowRule: "once_within_selected_days",
      startsOn: "2026-05-30"
    }),
    householdTimeZone: "America/New_York",
    rangeStart: "2026-05-30",
    rangeEnd: "2026-06-07"
  });
  expect(occurrences).toEqual([
    expect.objectContaining({ sequence: 0, eligibleStartOn: "2026-05-30", eligibleEndOn: "2026-05-31", plannedStartAt: undefined }),
    expect.objectContaining({ sequence: 1, eligibleStartOn: "2026-06-06", eligibleEndOn: "2026-06-07", plannedStartAt: undefined })
  ]);
});

it("creates independent flexible obligations for each selected day", () => {
  const occurrences = materializeOccurrences({
    schedule: flexibleSchedule({ flexibleWindowRule: "each_selected_day" }),
    householdTimeZone: "America/New_York",
    rangeStart: "2026-05-30",
    rangeEnd: "2026-05-31"
  });
  expect(occurrences.map((item) => item.eligibleStartOn)).toEqual(["2026-05-30", "2026-05-31"]);
});
```

- [ ] **Step 2: Run the materializer test to verify RED**

Run:

```powershell
npm.cmd test -w server -- materializeOccurrences.test.ts
```

Expected: FAIL because all schedules currently require `localStartTime` and
`plannedMinutes` and generate one timed occurrence per selected date.

- [ ] **Step 3: Implement deterministic expansion**

Refactor `materializeOccurrences.ts` to calculate timed duration and flexible windows:

```ts
function timedDurationMinutes(schedule: TimedChoreSchedule) {
  const [startHour, startMinute] = schedule.localStartTime.split(":").map(Number);
  const [endHour, endMinute] = schedule.localEndTime.split(":").map(Number);
  return (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
}

function createTimedOccurrence(schedule: TimedChoreSchedule, localDate: string, sequence: number, zone: string): ChoreOccurrence {
  const start = fromZonedTime(`${localDate}T${schedule.localStartTime}:00`, zone);
  const minutes = timedDurationMinutes(schedule);
  return {
    id: `${schedule.id}:${sequence}`,
    householdId: schedule.householdId,
    choreId: schedule.choreId,
    scheduleId: schedule.id,
    sequence,
    planningMode: "timed",
    plannedStartAt: start.toISOString(),
    plannedEndAt: addMinutes(start, minutes).toISOString(),
    estimatedMinutes: minutes,
    eligibleStartOn: localDate,
    eligibleEndOn: localDate,
    assignedUserId: assigneeFor(schedule, sequence),
    exceptionType: "none",
    status: "planned"
  };
}
```

For `flexibleWindowRule === "once_within_selected_days"`, group adjacent scheduled
eligible dates within one recurrence week into one occurrence whose `eligibleStartOn`
and `eligibleEndOn` bound that window. For `each_selected_day`, emit one occurrence per
scheduled day. Assign rotation by obligation sequence, not by projected UI day.

- [ ] **Step 4: Make occurrence queries window-aware**

In both stores, update `listOccurrences` so flexible obligations are returned when
their eligible window overlaps the requested date range:

```ts
const inRange = occurrence.planningMode === "timed"
  ? Boolean(occurrence.plannedStartAt && occurrence.plannedStartAt >= range.startAt && occurrence.plannedStartAt <= range.endAt)
  : occurrence.eligibleEndOn >= range.startOn && occurrence.eligibleStartOn <= range.endOn;
```

Extend the server query contract to carry `startOn`/`endOn` derived from the
household-local Calendar range, while retaining ISO instants for timed filtering.
Add route assertions in `server/test/schedules.test.ts` proving one flexible
once-window occurrence is returned for both Saturday and Sunday range requests but
keeps one identical occurrence ID.

Use this store/query shape in `server/src/repositories/inMemoryStore.ts`:

```ts
export type OccurrenceRange = {
  startAt: string;
  endAt: string;
  startOn: string;
  endOn: string;
  assignedUserId?: string;
};

listOccurrences(householdId: string, range: OccurrenceRange): StoreResult<ChoreOccurrence[]>;
```

Extend `occurrenceRangeSchema` in `server/src/routes/households.ts` with:

```ts
startOn: z.string().date(),
endOn: z.string().date(),
```

- [ ] **Step 5: Verify and commit materialization**

Run:

```powershell
npm.cmd test -w server -- materializeOccurrences.test.ts schedules.test.ts
npm.cmd run typecheck -w server
```

Expected: PASS for timed duration, flexible window identity, independent each-day
obligations, and route range retrieval.

Commit:

```powershell
git add server/src/scheduling/materializeOccurrences.ts server/src/repositories/inMemoryStore.ts server/src/repositories/prismaStore.ts server/src/routes/households.ts server/test/materializeOccurrences.test.ts server/test/schedules.test.ts
git commit -m "Materialize timed and flexible chore work"
```

## Task 4: Add Completion Auditing And Preserve Historical Work

**Files:**
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Modify: `server/src/routes/households.ts`
- Modify: `server/test/schedules.test.ts`
- Modify: `server/test/prismaStore.test.ts`

- [ ] **Step 1: Write failing authorization and history tests**

In `server/test/schedules.test.ts`, add:

```ts
async function createAssignedFlexibleOccurrence() {
  const response = await request(app)
    .post(`/api/households/${householdId}/chores`)
    .set(auth("owner@example.com"))
    .send({
      chore: { title: "Clean bathrooms", source: "manual" },
      schedules: [{
        planningMode: "flexible",
        recurrence: { frequency: "weekly", interval: 1, weekDays: [6, 0] },
        estimatedMinutes: 60,
        flexibleWindowRule: "once_within_selected_days",
        startsOn: "2026-05-30",
        assignment: { mode: "fixed", memberUserIds: [memberId] }
      }]
    })
    .expect(201);
  const scheduleId = response.body.schedules[0].id;
  const occurrences = await request(app)
    .get(`/api/households/${householdId}/occurrences`)
    .query({
      startAt: "2026-05-30T00:00:00.000Z",
      endAt: "2026-05-31T23:59:59.999Z",
      startOn: "2026-05-30",
      endOn: "2026-05-31"
    })
    .set(auth("owner@example.com"))
    .expect(200);
  return occurrences.body.find((occurrence: ChoreOccurrence) => occurrence.scheduleId === scheduleId);
}

it("lets the assigned member complete planned work with audit identity and timestamp", async () => {
  vi.setSystemTime(new Date("2026-05-30T16:00:00.000Z"));
  const occurrence = await createAssignedFlexibleOccurrence();
  await request(app)
    .post(`/api/households/${householdId}/occurrences/${occurrence.id}/complete`)
    .set(auth("member@example.com"))
    .expect(200)
    .expect((response) => expect(response.body).toEqual(expect.objectContaining({
      status: "completed",
      completedAt: "2026-05-30T16:00:00.000Z",
      completedByUserId: memberId
    })));
});

it("does not let a different ordinary member complete assigned work", async () => {
  await request(app)
    .post(`/api/households/${householdId}/occurrences/${occurrence.id}/complete`)
    .set(auth("other-member@example.com"))
    .expect(403);
});
```

Extend the existing schedule-update test:

```ts
expect(afterSeriesEdit).toEqual(expect.arrayContaining([
  expect.objectContaining({ id: completed.id, status: "completed", completedByUserId: memberId }),
  expect.objectContaining({ id: skipped.id, status: "skipped" })
]));
```

- [ ] **Step 2: Run completion tests to verify RED**

Run:

```powershell
npm.cmd test -w server -- schedules.test.ts
```

Expected: FAIL with missing `/complete` route and missing completion audit methods.

- [ ] **Step 3: Add store completion operation and preservation rules**

In `server/src/repositories/inMemoryStore.ts` define:

```ts
completeOccurrence(
  householdId: string,
  occurrenceId: string,
  completedByUserId: string,
  completedAt: string
): StoreResult<ChoreOccurrence | undefined>;
```

Implement it only for `status === "planned"`, setting:

```ts
{ ...occurrence, status: "completed", completedAt, completedByUserId }
```

Implement the Prisma equivalent with `updateMany`/follow-up lookup constrained to
`householdId`, `id`, and `status: "planned"`.

Modify `clearFutureUntouchedOccurrences` in both stores so it deletes only future
occurrences having `status: "planned"` and `exceptionType: "none"`; completed and
skipped work remain durable history.

- [ ] **Step 4: Add completion route authorization**

In `server/src/routes/households.ts`, add:

```ts
router.post("/:householdId/occurrences/:occurrenceId/complete", async (req, res) => {
  const access = await requireHouseholdAccess(req, res);
  if (!access) return;
  const occurrence = await store.getOccurrence(access.household.id, req.params.occurrenceId);
  if (!occurrence) return res.status(404).json({ error: "Occurrence not found" });
  if (occurrence.assignedUserId !== access.user.id) {
    return res.status(403).json({ error: "Only the assigned member can complete this occurrence" });
  }
  const completed = await store.completeOccurrence(
    access.household.id,
    occurrence.id,
    access.user.id,
    new Date().toISOString()
  );
  if (!completed) return res.status(409).json({ error: "Occurrence is no longer planned" });
  return res.status(200).json(completed);
});
```

Add `getOccurrence(householdId, occurrenceId)` to both stores as a narrowly scoped
read method. Keep owner-only skip/reschedule routes unchanged.

- [ ] **Step 5: Verify in-memory and persistent history behavior**

Run:

```powershell
npm.cmd test -w server -- schedules.test.ts materializeOccurrences.test.ts
$env:DATABASE_URL='postgresql://chore_helper:chore_helper_password@localhost:5432/chore_helper_test?schema=public'; npm.cmd run test:db -w server
```

Expected: PASS for assigned-member completion, denial of non-assignees, completed and
skipped history preservation, and persisted audit fields.

- [ ] **Step 6: Commit completion behavior**

```powershell
git add server/src/repositories/inMemoryStore.ts server/src/repositories/prismaStore.ts server/src/routes/households.ts server/test/schedules.test.ts server/test/prismaStore.test.ts
git commit -m "Record chore occurrence completion"
```

## Task 5: Expose Unified Web APIs

**Files:**
- Modify: `web/src/api.ts`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing frontend API interaction tests**

Add mocked request expectations in `web/src/App.test.tsx` for the API operations that
Calendar will consume in Task 6:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  "http://localhost:3001/api/households/household-1/chores",
  expect.objectContaining({
    method: "POST",
    body: expect.stringContaining('"schedules"')
  })
);
expect(fetchMock).toHaveBeenCalledWith(
  "http://localhost:3001/api/households/household-1/occurrences/occurrence-1/complete",
  expect.objectContaining({ method: "POST" })
);
```

- [ ] **Step 2: Run the web test to verify RED**

Run:

```powershell
npm.cmd test -w web -- App.test.tsx
```

Expected: FAIL because the current frontend API exposes sequential legacy chore and
schedule operations and has no completion method.

- [ ] **Step 3: Implement unified frontend API functions**

In `web/src/api.ts`, replace legacy `createChore` with:

```ts
export async function createScheduledChore(
  householdId: string,
  input: CreateScheduledChoreInput
): Promise<ScheduledChore> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/chores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error("Failed to create scheduled chore");
  return response.json();
}

export async function completeOccurrence(householdId: string, occurrenceId: string): Promise<ChoreOccurrence> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/occurrences/${occurrenceId}/complete`,
    { method: "POST" }
  );
  if (!response.ok) throw new Error("Failed to complete occurrence");
  return response.json();
}
```

Update `updateChore` to submit `ChoreDefinitionInput` only, and update `listOccurrences`
to include household-local `startOn` and `endOn` parameters required for flexible
overlap queries.

- [ ] **Step 4: Carry the API into Calendar UI implementation**

Run:

```powershell
npm.cmd run typecheck -w web
```

Expected: type errors remain in obsolete `ChoresPage` and old Calendar call sites.
Do not commit this transitional frontend state; Task 6 incorporates the API functions
into the unified Calendar page and commits the UI together.

## Task 6: Build The Unified Calendar Workspace And Shared Editor

**Files:**
- Modify: `web/src/pages/CalendarPage.tsx`
- Delete: `web/src/pages/ChoresPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/routes.ts`
- Modify: `web/src/pages/TodayDashboard.tsx`
- Modify: `web/src/pages/OptimizePage.tsx`
- Modify: `web/src/App.css`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing navigation and view tests**

In `web/src/App.test.tsx`, replace `/chores` tests and extend Calendar tests:

```tsx
function mockCalendarWorkspaceFetches() {
  const flexibleOccurrence = {
    id: "occurrence-flexible",
    householdId: "household-1",
    choreId: "chore-1",
    scheduleId: "schedule-1",
    sequence: 0,
    planningMode: "flexible",
    estimatedMinutes: 60,
    eligibleStartOn: "2026-05-25",
    eligibleEndOn: "2026-05-26",
    assignedUserId: "app-user-1",
    exceptionType: "none",
    status: "planned"
  };
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/me")) return { ok: true, json: async () => ({ id: "app-user-1" }) };
    if (url.endsWith("/api/households")) return { ok: true, json: async () => [createHouseholdAppData()] };
    if (url.includes("/members")) return { ok: true, json: async () => [{ userId: "app-user-1", role: "owner", displayName: "Alex Owner" }] };
    if (url.includes("/occurrences?") && method === "GET") return { ok: true, json: async () => [flexibleOccurrence] };
    throw new Error(`Unhandled fetch ${method} ${url}`);
  });
}

it("uses Calendar as the only chore planning destination", async () => {
  vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
  renderAt("/calendar");
  expect(await screen.findByRole("heading", { name: "Calendar" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Chores" })).toBeNull();
  expect(screen.getByRole("button", { name: "Add chore" })).toBeTruthy();
});

it("switches between calendar and chronological list occurrences", async () => {
  vi.stubGlobal("fetch", mockCalendarWorkspaceFetches());
  renderAt("/calendar");
  fireEvent.click(await screen.findByRole("button", { name: "List" }));
  expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy();
  expect(screen.getByText("Anytime today / 60 min / Flexible")).toBeTruthy();
});
```

Ensure Today setup buttons now navigate to `/calendar`, and test that `/chores`
normalizes away rather than rendering a page.

- [ ] **Step 2: Write failing editor/create/completion tests**

Add tests with mocked scheduled chore, schedules, and occurrences:

```tsx
it("creates a chore with multiple schedule series in the shared modal", async () => {
  renderAt("/calendar");
  fireEvent.click(await screen.findByRole("button", { name: "Add chore" }));
  fireEvent.change(screen.getByLabelText("Chore title"), { target: { value: "Clean bathrooms" } });
  fireEvent.click(screen.getByRole("button", { name: "Add schedule" }));
  fireEvent.click(screen.getByLabelText("Flexible schedule", { selector: "input" }));
  fireEvent.change(screen.getByLabelText("Estimated duration"), { target: { value: "60" } });
  fireEvent.click(screen.getByRole("button", { name: "Save chore" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/households/household-1/chores",
    expect.objectContaining({ method: "POST", body: expect.stringContaining('"schedules"') })
  ));
});

it("opens a selected occurrence in the editor and displays collapsed history", async () => {
  renderAt("/calendar");
  fireEvent.click(await screen.findByRole("button", { name: "Edit Clean bathrooms" }));
  expect(screen.getByText("Selected occurrence")).toBeTruthy();
  expect(screen.getByRole("button", { name: "History" })).toHaveAttribute("aria-expanded", "false");
});

it("completes an assigned flexible obligation from its row and removes duplicate projections", async () => {
  renderAt("/calendar");
  fireEvent.click(await screen.findByRole("button", { name: "List" }));
  fireEvent.click(screen.getByRole("button", { name: "Complete Clean bathrooms" }));
  await waitFor(() => expect(screen.queryAllByText("Clean bathrooms")).toHaveLength(0));
});
```

- [ ] **Step 3: Run web tests to verify RED**

Run:

```powershell
npm.cmd test -w web -- App.test.tsx
```

Expected: FAIL because navigation still includes Chores, Calendar has no List mode,
and no shared modal/create/completion workflow exists.

- [ ] **Step 4: Consolidate navigation and page responsibility**

In `web/src/routes.ts`, remove `"/chores"`. In `web/src/App.tsx`, remove the
`ChoresPage` import/render and navigation item. In `web/src/pages/TodayDashboard.tsx`,
route both `Manage chores` and `Add chores` actions to `"/calendar"`.

Remove references to cadence/duration in `OptimizePage.tsx` copy, using:

```tsx
<p className="empty-state">Ask a question about chore scope, scheduling, or missing recurring work.</p>
```

Delete `web/src/pages/ChoresPage.tsx` after Calendar contains all replacement controls.

- [ ] **Step 5: Build Calendar/List rendering and quick completion**

Refactor `CalendarPage.tsx` state:

```ts
type WorkspaceView = "calendar" | "list";
type CalendarScale = "month" | "week" | "day";
const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("calendar");
const [calendarScale, setCalendarScale] = useState<CalendarScale>("month");
const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string>();
const [editorState, setEditorState] = useState<"closed" | "create" | "edit">("closed");
```

Render flexible obligations by date projection:

```ts
function displayDates(occurrence: ChoreOccurrence) {
  return occurrence.planningMode === "flexible" && occurrence.status === "planned"
    ? eachDayOfInterval({ start: parseISO(occurrence.eligibleStartOn), end: parseISO(occurrence.eligibleEndOn) })
    : [parseISO(occurrence.eligibleStartOn)];
}
```

Use one `occurrence.id` for projected rows/cards and remove every projection when the
completion response returns `status: "completed"`. Render `Overdue` when a planned
flexible window ends before the household-local current day.

- [ ] **Step 6: Build the shared modal/sheet and schedule form rows**

Inside `CalendarPage.tsx`, implement:

```ts
type ScheduleDraft = ScheduleInput & { key: string };
type EditorDraft = {
  choreId?: string;
  title: string;
  instructions: string;
  tags: string;
  schedules: ScheduleDraft[];
};
```

Opening `Add chore` seeds:

```ts
{
  title: "",
  instructions: "",
  tags: "",
  schedules: [createEmptyTimedScheduleDraft()]
}
```

The modal renders `Chore Details`, repeatable `Schedule Series`, `Upcoming
Occurrences`, and collapsed `History`. A schedule row exposes:

```tsx
<select aria-label="Planning mode">
  <option value="timed">Timed</option>
  <option value="flexible">Flexible</option>
</select>
```

Timed rows show start and end inputs; flexible rows show estimated duration and
`Once within selected days`/`Each selected day`. Save in create mode calls
`createScheduledChore`; edit mode calls definition/schedule mutation APIs and keeps
selected occurrence context if a request fails.

- [ ] **Step 7: Style modal, list, flexible/overdue signals, and narrow sheet**

In `web/src/App.css`, add focused classes:

```css
.calendar-workspace-toggle { display: flex; gap: 8px; }
.calendar-anytime-region { display: grid; gap: 8px; margin-bottom: 18px; }
.occurrence-flexible-badge, .occurrence-overdue-badge { border-radius: 999px; padding: 3px 8px; }
.chore-editor-backdrop { position: fixed; inset: 0; background: rgba(30, 38, 32, .32); }
.chore-editor-modal { max-width: 980px; max-height: calc(100vh - 48px); overflow: auto; }
.calendar-list-group { display: grid; gap: 10px; }
@media (max-width: 720px) {
  .chore-editor-modal { position: fixed; inset: 0; max-width: none; max-height: none; border-radius: 0; }
}
```

Preserve existing warm card/button visual language and accessible labels for all
form-based alternatives.

- [ ] **Step 8: Verify and commit the unified frontend**

Run:

```powershell
npm.cmd test -w web -- App.test.tsx
npm.cmd run typecheck -w web
npm.cmd run build -w web
```

Expected: PASS for Calendar-only navigation, Calendar/List view selection, shared
editor create/edit, flexible labels, quick completion, and production build.

Commit:

```powershell
git add web/src/api.ts web/src/pages/CalendarPage.tsx web/src/pages/ChoresPage.tsx web/src/App.tsx web/src/routes.ts web/src/pages/TodayDashboard.tsx web/src/pages/OptimizePage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Unify chore planning in Calendar"
```

## Task 7: Reset Development Data And Run Release Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-05-25-unified-calendar-chore-planning.md`
- Verify: all files changed in Tasks 1-6

- [ ] **Step 1: Reset the development schema explicitly**

Because the approved design permits data loss for current test data, run against the
local development database after reviewing `DATABASE_URL`:

```powershell
npm.cmd run db:generate -w server
npm.cmd run db:push -w server -- --accept-data-loss
```

Expected: Prisma accepts removal of legacy chore recurrence/duration columns and adds
the new schedule/occurrence fields.

- [ ] **Step 2: Run all automated verification**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run web:build
$env:DATABASE_URL='postgresql://chore_helper:chore_helper_password@localhost:5432/chore_helper_test?schema=public'; npm.cmd run test:db -w server
git diff --check
git status --short --branch
```

Expected: all workspace tests, both typecheck targets, web build, Prisma persistence
tests, and diff hygiene pass.

- [ ] **Step 3: Verify the workflow in Browser**

Use the Browser workflow against the running local web app at desktop width and a
narrow mobile width. Without changing unrelated household data, verify:

1. Primary navigation has Calendar and no Chores destination.
2. Calendar and List toggles show timed and flexible occurrence presentations.
3. `Add chore` opens the shared modal/sheet with one required schedule; adding a
   second series shows timed and flexible controls.
4. Selecting an occurrence opens the same editor with that item focused.
5. Quick completion for an assigned test occurrence updates all linked flexible
   projections; use seeded disposable test work only.
6. History exposes completed/skipped items and completion attribution.

- [ ] **Step 4: Mark completion and commit the verified plan record**

Mark every completed checkbox in this plan, then run:

```powershell
git add docs/superpowers/plans/2026-05-25-unified-calendar-chore-planning.md
git commit -m "Record unified calendar verification"
```

Expected: repository history records both implementation checkpoints and completed
release validation.

## Plan Self-Review

- **Spec coverage:** Tasks cover removal of the separate Chores destination, Calendar
  and List views, shared create/edit modal, multiple required schedules, timed and
  flexible work, once-within-window projections, overdue actionability, completion
  audit, permissions, atomic creation, resettable development data, and desktop/mobile
  validation.
- **Integration consequence:** Existing assistant code currently applies proposed
  cadence/duration changes directly to chores. Task 2 removes that invalid mutation
  while preserving readable recommendations; structured schedule recommendation
  application is not invented in this plan because it requires a later approved
  optimization design.
- **Placeholder scan:** No deferred implementation placeholder remains; all steps have
  concrete paths, API/type shapes, commands, and expected results.
- **Type consistency:** `planningMode`, `flexibleWindowRule`, `eligibleStartOn`,
  `eligibleEndOn`, `completedAt`, `completedByUserId`, `CreateScheduledChoreInput`,
  and `ScheduledChore` are introduced in Task 1 and used consistently thereafter.
