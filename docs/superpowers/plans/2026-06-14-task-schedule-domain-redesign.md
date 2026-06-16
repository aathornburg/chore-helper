# Task Schedule Domain Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chore-centered domain with a task/schedule model that supports chores, commitments, a top-level Tasks page, Task inbox, Calendar workspace sections, import task-link decisions, and Optimize behavior that treats commitments as constraints.

**Architecture:** Do a hard rename from chore to task across shared types, Prisma, repositories, API routes, and React surfaces. Represent every scheduled item with a `Task` row; reusable library tasks use `libraryState = "saved"`, manual one-off scheduled work uses `libraryState = "one_time"`, and imported or suggested task candidates use `libraryState = "inbox"` until the user saves, links, or keeps them one-time.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Express, Zod, Prisma 7, PostgreSQL, Clerk auth.

---

## Reference Inputs

- Product spec: `docs/superpowers/specs/2026-06-14-task-schedule-domain-redesign.md`
- Production migration guide: `docs/production-prisma-migrations.md`
- Current schema: `server/prisma/schema.prisma`
- Shared contract: `shared/src/types.ts`
- Backend routes: `server/src/routes/households.ts`, `server/src/routes/calendar.ts`
- Stores: `server/src/repositories/inMemoryStore.ts`, `server/src/repositories/prismaStore.ts`
- Frontend API: `web/src/api.ts`
- Major UI surfaces: `web/src/App.tsx`, `web/src/pages/CalendarPage.tsx`, `web/src/pages/SettingsPage.tsx`, `web/src/pages/OptimizePage.tsx`, `web/src/pages/TodayDashboard.tsx`, `web/src/pages/FamilyPage.tsx`
- Main frontend tests: `web/src/App.test.tsx`
- Main backend tests: `server/test/households.test.ts`, `server/test/calendar.test.ts`, `server/test/prismaStore.test.ts`

## Target Data Model

Use these names consistently after Task 2:

```ts
export type TaskType = "chore" | "commitment";
export type TaskLibraryState = "saved" | "one_time" | "inbox";
export type TaskLibraryPermission = "view" | "manage";
export type TaskSource = "manual" | "google-calendar";
export type TaskInboxItemKind = "task" | "import_queue";
export type TaskInboxStatus = "needs_review" | "saved" | "linked" | "kept_one_time" | "dismissed";
export type TaskLinkStatus = "unreviewed" | "linked" | "saved" | "one_time";
export type ImportScope = "single" | "series" | "future_matching";
```

Prisma fields:

```prisma
model Task {
  id               String    @id
  householdId      String
  type             String    @default("chore")
  libraryState     String    @default("saved")
  source           String
  title            String
  instructions     String?
  tags             String    @default("[]")
  archivedAt       DateTime?
  schedules        TaskSchedule[]
  occurrences      TaskOccurrence[]
  completionCheckIns TaskCompletionCheckIn[]
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([householdId, libraryState])
  @@index([householdId, type])
}
```

`TaskSchedule`, `TaskOccurrence`, and `TaskCompletionCheckIn` keep the same scheduling fields as the current chore models, renamed from `choreId` to `taskId`. `CalendarImportQueueItem` gains `linkedTaskId`, `taskLinkStatus`, `taskMatchReason`, and `importScope`.

Security constraints:

- Server routes must continue to call `requireHouseholdAccess`.
- Library mutation and inbox save/link/keep endpoints must require household owner or `taskLibraryPermission = "manage"`.
- Calendar import decisions must continue to use existing import policy permissions.
- Return 404 for records outside the household.
- Use Zod schemas that whitelist accepted fields.

---

## Phase 0: Baseline And Branch Hygiene

### Task 0.1: Confirm Worktree And Test Baseline

**Files:**
- Read: `package.json`
- Read: `server/package.json`
- Read: `web/package.json`

- [ ] **Step 1: Check status**

Run: `git status --short`

Expected: no uncommitted tracked files, except this plan if it has not been committed.

- [ ] **Step 2: Run backend route tests**

Run: `npm.cmd run test -w server -- households.test.ts`

Expected: all tests pass.

- [ ] **Step 3: Run frontend smoke tests**

Run: `npm.cmd run test -w web -- App.test.tsx -t Settings`

Expected: all matching tests pass.

- [ ] **Step 4: Commit only if baseline creates no code changes**

Run:

```powershell
git add docs/superpowers/plans/2026-06-14-task-schedule-domain-redesign.md
git commit -m "Add task schedule implementation plan"
```

Expected: one docs-only commit, if the plan has not already been committed.

---

## Phase 1: Shared Types And Backend Domain Rename

### Task 1.1: Write Shared Type Contract Tests

**Files:**
- Create: `shared/src/task-domain.test.ts`
- Modify: `shared/package.json`

- [ ] **Step 1: Add a shared test script**

In `shared/package.json`, add:

```json
"test": "vitest run"
```

- [ ] **Step 2: Write the failing type/runtime contract tests**

Create `shared/src/task-domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  CalendarImportQueueDecisionInput,
  CreateScheduledTaskInput,
  Task,
  TaskInboxItem,
  TaskLibraryPermission,
  TaskSchedule
} from "./types";

describe("task domain shared contract", () => {
  it("models saved chores and saved commitments as tasks", () => {
    const permission: TaskLibraryPermission = "manage";
    const task: Task = {
      id: "task-1",
      householdId: "household-1",
      type: "commitment",
      libraryState: "saved",
      source: "manual",
      title: "Work",
      instructions: "Office day",
      tags: ["fixed-time"]
    };

    expect(permission).toBe("manage");
    expect(task.type).toBe("commitment");
    expect(task.libraryState).toBe("saved");
  });

  it("models one-time scheduled tasks without saving them to the library", () => {
    const input: CreateScheduledTaskInput = {
      task: {
        title: "Drop off donation",
        type: "commitment",
        source: "manual",
        instructions: "Only happens once",
        tags: [],
        libraryState: "one_time"
      },
      schedules: [
        {
          planningMode: "timed",
          recurrence: { frequency: "one_time", interval: 1 },
          startsOn: "2026-06-14",
          assignment: { mode: "fixed", memberUserIds: ["user-1"] },
          localStartTime: "11:00",
          localEndTime: "11:30"
        }
      ]
    };

    expect(input.task.libraryState).toBe("one_time");
    expect(input.schedules[0].planningMode).toBe("timed");
  });

  it("models task inbox items for pending imports and one-time scheduled tasks", () => {
    const item: TaskInboxItem = {
      id: "queue-1",
      kind: "import_queue",
      householdId: "household-1",
      status: "needs_review",
      title: "Busy",
      proposedType: "commitment",
      source: "google-calendar",
      badge: "Pending import",
      startsAt: "2026-06-14T12:00:00.000Z",
      endsAt: "2026-06-14T13:00:00.000Z",
      suggestedTaskId: "task-1",
      suggestedReason: "Matched by title"
    };

    expect(item.kind).toBe("import_queue");
    expect(item.status).toBe("needs_review");
  });

  it("keeps calendar import decisions separate from task link scope", () => {
    const decision: CalendarImportQueueDecisionInput = {
      decision: "approve",
      proposedType: "commitment",
      taskLinkStatus: "linked",
      linkedTaskId: "task-1",
      importScope: "single"
    };

    expect(decision.decision).toBe("approve");
    expect(decision.taskLinkStatus).toBe("linked");
  });

  it("uses taskId in schedules", () => {
    const schedule: TaskSchedule = {
      id: "schedule-1",
      householdId: "household-1",
      taskId: "task-1",
      planningMode: "flexible",
      recurrence: { frequency: "weekly", interval: 1, weekDays: [1, 3] },
      startsOn: "2026-06-14",
      assignment: { mode: "fixed", memberUserIds: ["user-1"] },
      estimatedMinutes: 45,
      flexibleWindowRule: "once_within_selected_days"
    };

    expect(schedule.taskId).toBe("task-1");
  });
});
```

- [ ] **Step 3: Run the test and verify it fails on missing types**

Run: `npm.cmd run test -w shared -- task-domain.test.ts`

Expected: FAIL with missing exported members such as `Task` and `CreateScheduledTaskInput`.

### Task 1.2: Rename Shared Types

**Files:**
- Modify: `shared/src/types.ts`
- Test: `shared/src/task-domain.test.ts`

- [ ] **Step 1: Replace chore contract exports**

In `shared/src/types.ts`, replace the chore-centered type block with these exports:

```ts
export type TaskLibraryPermission = "view" | "manage";
export type TaskType = "chore" | "commitment";
export type TaskSource = "manual" | "google-calendar";
export type TaskLibraryState = "saved" | "one_time" | "inbox";
export type TaskInboxStatus = "needs_review" | "saved" | "linked" | "kept_one_time" | "dismissed";
export type TaskInboxItemKind = "task" | "import_queue";
export type TaskLinkStatus = "unreviewed" | "linked" | "saved" | "one_time";
export type ImportScope = "single" | "series" | "future_matching";

export type HouseholdMemberSummary = {
  householdId: string;
  userId: string;
  clerkUserId: string;
  primaryEmail?: string;
  displayName?: string;
  role: "owner" | "member";
  taskLibraryPermission: TaskLibraryPermission;
};

export type TaskScheduleRecurrence = {
  frequency: RecurrenceFrequency;
  interval: number;
  weekDays?: number[];
  monthlyPattern?: "day_of_month" | "weekday_of_month";
  monthlyDay?: number;
  monthlyWeek?: number;
  monthlyWeekday?: number;
};

export type TaskScheduleAssignment = {
  mode: "fixed" | "rotation";
  memberUserIds: string[];
};

export type TaskScheduleBase = {
  id: string;
  householdId: string;
  taskId: string;
  planningMode: SchedulePlanningMode;
  recurrence: TaskScheduleRecurrence;
  startsOn: string;
  endsOn?: string;
  assignment: TaskScheduleAssignment;
  archivedAt?: string;
};

export type TimedTaskSchedule = TaskScheduleBase & {
  planningMode: "timed";
  localStartTime: string;
  localEndTime: string;
};

export type FlexibleTaskSchedule = TaskScheduleBase & {
  planningMode: "flexible";
  estimatedMinutes: number;
  flexibleWindowRule: FlexibleWindowRule;
};

export type TaskSchedule = TimedTaskSchedule | FlexibleTaskSchedule;

export type TaskOccurrence = {
  id: string;
  householdId: string;
  taskId: string;
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

export type Task = {
  id: string;
  householdId: string;
  householdName?: string;
  title: string;
  type: TaskType;
  libraryState: TaskLibraryState;
  source: TaskSource;
  instructions?: string;
  tags?: string[];
  archivedAt?: string;
};

export type TaskDefinitionInput = Omit<Task, "id" | "householdId" | "householdName" | "archivedAt">;
export type CreateTaskInput = TaskDefinitionInput;
export type ScheduleInput =
  | Omit<TimedTaskSchedule, "id" | "householdId" | "taskId" | "archivedAt">
  | Omit<FlexibleTaskSchedule, "id" | "householdId" | "taskId" | "archivedAt">;
export type CreateScheduledTaskInput = {
  task: TaskDefinitionInput;
  schedules: ScheduleInput[];
};
export type ScheduledTask = {
  task: Task;
  schedules: TaskSchedule[];
};
export type TaskCompletionCheckIn = {
  id: string;
  householdId: string;
  occurrenceId: string;
  completedByUserId: string;
  completedAt: string;
  completedOnTime: boolean;
  durationAccurate: boolean;
  keepAssignee: boolean;
  rebaseFutureOccurrences: boolean;
  createdAt: string;
  updatedAt: string;
};
export type TaskReviewState = "unreviewed" | "recommendation-pending" | "reviewed";
export type TaskAppData = Task & {
  recommendations: Recommendation[];
};
```

- [ ] **Step 2: Update household and calendar exports**

In `shared/src/types.ts`, change household app data and calendar queue/event exports to:

```ts
export type Recommendation = {
  id: string;
  householdId: string;
  affectedTaskId?: string;
  title: string;
  rationale: string;
  confidence: RecommendationConfidence;
  status: "pending" | "accepted" | "skipped";
  decision?: RecommendationDecision;
  proposedCadence?: string;
  proposedEstimatedMinutes?: number;
  staleAt?: string;
};

export type HouseholdAppData = Household & {
  structure: HouseholdStructure;
  tasks: TaskAppData[];
  recommendations: Recommendation[];
};

export type CalendarContentMode = "chores" | "commitments" | "both";
export type CleanlyCalendarEventType = TaskType;

export type CalendarImportQueueItem = {
  id: string;
  householdId: string;
  submittedByUserId: string;
  submittedByName: string;
  sourceExternalCalendarId?: string;
  providerEventId?: string;
  proposedType: CleanlyCalendarEventType;
  detailLevel: CalendarDetailLevel;
  title: string;
  privacyTitle: string;
  startsAt: string;
  endsAt: string;
  queueStatus: CalendarQueueStatus;
  createdCleanlyEventId?: string;
  linkedTaskId?: string;
  taskLinkStatus: TaskLinkStatus;
  taskMatchReason?: string;
  importScope: ImportScope;
  createdAt: string;
};

export type CalendarImportQueueDecisionInput = {
  decision: "approve" | "reject";
  proposedType?: CleanlyCalendarEventType;
  linkedTaskId?: string;
  taskLinkStatus?: TaskLinkStatus;
  taskMatchReason?: string;
  importScope?: ImportScope;
};

export type TaskInboxItem = {
  id: string;
  kind: TaskInboxItemKind;
  householdId: string;
  status: TaskInboxStatus;
  title: string;
  proposedType: TaskType;
  source: TaskSource;
  badge: "Pending import" | "Scheduled" | "Suggested link" | "Kept one-time";
  startsAt?: string;
  endsAt?: string;
  taskId?: string;
  importQueueItemId?: string;
  suggestedTaskId?: string;
  suggestedReason?: string;
};
```

- [ ] **Step 3: Run shared tests**

Run: `npm.cmd run test -w shared -- task-domain.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```powershell
git add shared/package.json shared/src/types.ts shared/src/task-domain.test.ts
git commit -m "Rename shared chore contract to tasks"
```

Expected: commit succeeds.

### Task 1.3: Write Backend API Rename Tests

**Files:**
- Modify: `server/test/households.test.ts`
- Modify: `server/test/calendar.test.ts`

- [ ] **Step 1: Add household route tests**

Append these tests in `server/test/households.test.ts` inside the existing authenticated household route suite:

```ts
it("creates saved chore and commitment tasks through the task endpoint", async () => {
  const choreResponse = await request(app)
    .post("/api/households/household-1/tasks")
    .set(authHeaders("user-1"))
    .send({
      task: {
        title: "Clean bathrooms",
        type: "chore",
        libraryState: "saved",
        source: "manual",
        instructions: "Counters and toilets",
        tags: ["bathroom"]
      }
    });

  expect(choreResponse.status).toBe(201);
  expect(choreResponse.body).toMatchObject({
    title: "Clean bathrooms",
    type: "chore",
    libraryState: "saved"
  });

  const commitmentResponse = await request(app)
    .post("/api/households/household-1/tasks")
    .set(authHeaders("user-1"))
    .send({
      task: {
        title: "Work",
        type: "commitment",
        libraryState: "saved",
        source: "manual",
        instructions: "Office block",
        tags: []
      }
    });

  expect(commitmentResponse.status).toBe(201);
  expect(commitmentResponse.body.type).toBe("commitment");
});

it("rejects old chore endpoints after the hard rename", async () => {
  const response = await request(app)
    .get("/api/households/household-1/chores")
    .set(authHeaders("user-1"));

  expect(response.status).toBe(404);
});

it("uses task library permission for member library management", async () => {
  const response = await request(app)
    .patch("/api/households/household-1/members/app-user-2/task-library-permission")
    .set(authHeaders("user-1"))
    .send({ taskLibraryPermission: "manage" });

  expect(response.status).toBe(200);
  expect(response.body.taskLibraryPermission).toBe("manage");
});
```

- [ ] **Step 2: Add scheduled task route test**

Append:

```ts
it("creates a one-time scheduled task without saving it to the library", async () => {
  const response = await request(app)
    .post("/api/households/household-1/tasks")
    .set(authHeaders("user-1"))
    .send({
      task: {
        title: "Drop off donation",
        type: "commitment",
        libraryState: "one_time",
        source: "manual",
        instructions: "",
        tags: []
      },
      schedules: [
        {
          planningMode: "timed",
          recurrence: { frequency: "one_time", interval: 1 },
          startsOn: "2026-06-14",
          assignment: { mode: "fixed", memberUserIds: ["user-1"] },
          localStartTime: "11:00",
          localEndTime: "11:30"
        }
      ]
    });

  expect(response.status).toBe(201);
  expect(response.body.task.libraryState).toBe("one_time");
  expect(response.body.schedules[0].taskId).toBe(response.body.task.id);
});
```

- [ ] **Step 3: Add calendar import task-link test**

Append in `server/test/calendar.test.ts`:

```ts
it("updates task-link metadata while deciding a calendar import", async () => {
  const queueResponse = await request(app)
    .get("/api/households/household-1/calendar/import-queue")
    .set(authHeaders("user-1"));
  const pending = queueResponse.body.find((item: { queueStatus: string }) => item.queueStatus === "pending");

  const response = await request(app)
    .patch(`/api/households/household-1/calendar/import-queue/${pending.id}`)
    .set(authHeaders("user-1"))
    .send({
      decision: "approve",
      proposedType: "commitment",
      linkedTaskId: "task-work",
      taskLinkStatus: "linked",
      taskMatchReason: "Matched by title",
      importScope: "single"
    });

  expect(response.status).toBe(200);
  expect(response.body.taskLinkStatus).toBe("linked");
  expect(response.body.linkedTaskId).toBe("task-work");
  expect(response.body.importScope).toBe("single");
});
```

- [ ] **Step 4: Run backend tests and verify they fail**

Run: `npm.cmd run test -w server -- households.test.ts calendar.test.ts`

Expected: FAIL with 404 for `/tasks`, missing `taskLibraryPermission`, or missing task-link fields.

### Task 1.4: Rename Store Interface And In-Memory Store

**Files:**
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/households.test.ts`
- Test: `server/test/calendar.test.ts`

- [ ] **Step 1: Rename interface methods and data maps**

In `server/src/repositories/inMemoryStore.ts`, rename:

```ts
updateChoreLibraryPermission -> updateTaskLibraryPermission
createChore -> createTask
createChoreWithSchedules -> createTaskWithSchedules
updateChore -> updateTask
archiveChore -> archiveTask
restoreChore -> restoreTask
listChores -> listTasks
listAllChores -> listAllTasks
ChoreListOptions -> TaskListOptions
ChoreUpdate -> TaskUpdate
NewScheduledChore -> NewScheduledTask
ChoreScheduleUpdate -> TaskScheduleUpdate
```

Replace stored maps:

```ts
const tasks = new Map<string, Task>();
const schedules = new Map<string, TaskSchedule>();
const occurrences = new Map<string, TaskOccurrence>();
const completionCheckIns = new Map<string, TaskCompletionCheckIn>();
```

- [ ] **Step 2: Set default task fields in factories**

In in-memory task creation, normalize input:

```ts
const task: Task = {
  id: `task-${tasks.size + 1}`,
  householdId,
  title: input.title,
  type: input.type,
  libraryState: input.libraryState,
  source: input.source,
  instructions: input.instructions,
  tags: input.tags ?? []
};
```

- [ ] **Step 3: Update app bootstrap**

In `server/src/app.ts`, replace `store.listChores` with `store.listTasks`, and return `household.tasks` instead of `household.chores`.

- [ ] **Step 4: Run targeted tests**

Run: `npm.cmd run test -w server -- households.test.ts calendar.test.ts`

Expected: still FAIL at routes or Prisma store, not at missing in-memory methods.

### Task 1.5: Rename Household Routes To Tasks

**Files:**
- Modify: `server/src/routes/households.ts`
- Test: `server/test/households.test.ts`

- [ ] **Step 1: Rename schemas and permissions**

In `server/src/routes/households.ts`, replace:

```ts
const taskTypes = ["chore", "commitment"] as const;
const taskLibraryStates = ["saved", "one_time", "inbox"] as const;
const taskLibraryPermissions = ["view", "manage"] as const;

const taskSchema = z.object({
  title: z.string().trim().min(1),
  type: z.enum(taskTypes),
  libraryState: z.enum(taskLibraryStates).default("saved"),
  source: z.enum(["manual", "google-calendar"]),
  instructions: z.string().trim().optional(),
  tags: z.array(z.string().trim().min(1)).default([])
});

const createScheduledTaskSchema = z.object({
  task: taskSchema,
  schedules: z.array(scheduleSchema).min(1)
});
```

- [ ] **Step 2: Replace permission helper**

Use:

```ts
async function requireTaskLibraryManage(req: Request, res: Response) {
  const access = await requireHouseholdAccess(req, res);
  if (!access) return undefined;

  const membership = await store.getMembership(access.user.id, access.household.id);
  if (!membership || (membership.role !== "owner" && membership.taskLibraryPermission !== "manage")) {
    res.status(403).json({ error: "Task library management requires permission." });
    return undefined;
  }

  return access;
}
```

- [ ] **Step 3: Rename endpoints**

Replace route paths with async handlers that follow the existing `requireHouseholdAccess` and `requireTaskLibraryManage` pattern:

```ts
router.patch("/:householdId/members/:userId/task-library-permission", async (req, res) => {
  const access = await requireHouseholdAccess(req, res);
  if (!access) return;
  const parsed = z.object({ taskLibraryPermission: z.enum(taskLibraryPermissions) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await store.updateTaskLibraryPermission(access.household.id, req.params.userId, parsed.data);
  return updated ? res.status(200).json(updated) : res.status(404).json({ error: "Member not found" });
});

router.post("/:householdId/tasks", async (req, res) => {
  const access = await requireTaskLibraryManage(req, res);
  if (!access) return;
  if ("task" in req.body && !("schedules" in req.body)) {
    const parsedTask = z.object({ task: taskSchema }).safeParse(req.body);
    if (!parsedTask.success) return res.status(400).json({ error: parsedTask.error.flatten() });
    return res.status(201).json(await store.createTask(access.household.id, parsedTask.data.task));
  }
  const parsed = createScheduledTaskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  return res.status(201).json(await store.createTaskWithSchedules({
    householdId: access.household.id,
    task: parsed.data.task,
    schedules: parsed.data.schedules
  }));
});

router.get("/:householdId/tasks", async (req, res) => {
  const access = await requireHouseholdAccess(req, res);
  if (!access) return;
  return res.status(200).json(await store.listTasks(access.household.id, { status: req.query.status === "archived" ? "archived" : undefined }));
});

router.get("/:householdId/tasks/:taskId/schedules", async (req, res) => {
  const access = await requireHouseholdAccess(req, res);
  if (!access) return;
  return res.status(200).json(await store.listSchedules(access.household.id, req.params.taskId));
});

router.post("/:householdId/tasks/:taskId/schedules", async (req, res) => {
  const access = await requireTaskLibraryManage(req, res);
  if (!access) return;
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  return res.status(201).json(await store.createSchedule({ householdId: access.household.id, taskId: req.params.taskId, ...parsed.data }));
});

router.patch("/:householdId/tasks/:taskId", async (req, res) => {
  const access = await requireTaskLibraryManage(req, res);
  if (!access) return;
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await store.updateTask(access.household.id, req.params.taskId, parsed.data);
  return updated ? res.status(200).json(updated) : res.status(404).json({ error: "Task not found" });
});

router.post("/:householdId/tasks/:taskId/archive", async (req, res) => {
  const access = await requireTaskLibraryManage(req, res);
  if (!access) return;
  const archived = await store.archiveTask(access.household.id, req.params.taskId);
  return archived ? res.status(200).json(archived) : res.status(404).json({ error: "Task not found" });
});

router.post("/:householdId/tasks/:taskId/restore", async (req, res) => {
  const access = await requireTaskLibraryManage(req, res);
  if (!access) return;
  const restored = await store.restoreTask(access.household.id, req.params.taskId);
  return restored ? res.status(200).json(restored) : res.status(404).json({ error: "Task not found" });
});
```

Remove all `/chores` household routes.

- [ ] **Step 4: Run tests**

Run: `npm.cmd run test -w server -- households.test.ts`

Expected: new `/tasks` tests pass; old `/chores` endpoint returns 404.

### Task 1.6: Rename Prisma Schema With Data-Preserving Migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_task_schedule_domain_rename/migration.sql`
- Test: `server/test/prismaStore.test.ts`

- [ ] **Step 1: Update Prisma models**

Rename models and relation fields:

```prisma
model Task
model TaskSchedule
model TaskScheduleAssignee
model TaskOccurrence
model TaskCompletionCheckIn
```

Rename columns:

```prisma
choreId -> taskId
choreLibraryPermission -> taskLibraryPermission
affectedChoreId -> affectedTaskId
```

Add columns:

```prisma
Task.type String @default("chore")
Task.libraryState String @default("saved")
CalendarImportQueueItem.linkedTaskId String?
CalendarImportQueueItem.taskLinkStatus String @default("unreviewed")
CalendarImportQueueItem.taskMatchReason String?
CalendarImportQueueItem.importScope String @default("single")
```

- [ ] **Step 2: Generate migration**

Run: `npm.cmd run db:migrate -w server -- --name task_schedule_domain_rename`

Expected: Prisma creates one migration folder and regenerates the client.

- [ ] **Step 3: Edit migration SQL so it renames instead of drops**

Open the generated `migration.sql` and ensure it uses rename statements like:

```sql
ALTER TABLE "Chore" RENAME TO "Task";
ALTER TABLE "ChoreSchedule" RENAME TO "TaskSchedule";
ALTER TABLE "ChoreScheduleAssignee" RENAME TO "TaskScheduleAssignee";
ALTER TABLE "ChoreOccurrence" RENAME TO "TaskOccurrence";
ALTER TABLE "ChoreCompletionCheckIn" RENAME TO "TaskCompletionCheckIn";

ALTER TABLE "HouseholdMember" RENAME COLUMN "choreLibraryPermission" TO "taskLibraryPermission";
ALTER TABLE "Recommendation" RENAME COLUMN "affectedChoreId" TO "affectedTaskId";
ALTER TABLE "TaskSchedule" RENAME COLUMN "choreId" TO "taskId";
ALTER TABLE "TaskOccurrence" RENAME COLUMN "choreId" TO "taskId";
ALTER TABLE "TaskCompletionCheckIn" RENAME COLUMN "choreId" TO "taskId";

ALTER TABLE "Task" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'chore';
ALTER TABLE "Task" ADD COLUMN "libraryState" TEXT NOT NULL DEFAULT 'saved';
ALTER TABLE "CalendarImportQueueItem" ADD COLUMN "linkedTaskId" TEXT;
ALTER TABLE "CalendarImportQueueItem" ADD COLUMN "taskLinkStatus" TEXT NOT NULL DEFAULT 'unreviewed';
ALTER TABLE "CalendarImportQueueItem" ADD COLUMN "taskMatchReason" TEXT;
ALTER TABLE "CalendarImportQueueItem" ADD COLUMN "importScope" TEXT NOT NULL DEFAULT 'single';
```

The migration must not contain `DROP TABLE "Chore"` or data-copy statements that omit existing rows.

- [ ] **Step 4: Add migration guard test**

In `server/test/prismaStore.test.ts`, add:

```ts
it("preserves existing migrated task rows as saved chores", async () => {
  const tasks = await store.listTasks("household-1");

  expect(tasks.length).toBeGreaterThan(0);
  expect(tasks.every((task) => task.type === "chore")).toBe(true);
  expect(tasks.every((task) => task.libraryState === "saved")).toBe(true);
});
```

- [ ] **Step 5: Run Prisma store tests**

Run: `npm.cmd run test:db -w server`

Expected: PASS against the local test database.

- [ ] **Step 6: Commit**

Run:

```powershell
git add server/prisma/schema.prisma server/prisma/migrations server/test/prismaStore.test.ts
git commit -m "Add task domain Prisma migration"
```

Expected: commit succeeds.

### Task 1.7: Rename Prisma Store

**Files:**
- Modify: `server/src/repositories/prismaStore.ts`
- Test: `server/test/prismaStore.test.ts`
- Test: `server/test/households.test.ts`
- Test: `server/test/calendar.test.ts`

- [ ] **Step 1: Rename mapper functions**

Rename:

```ts
toChore -> toTask
toChoreSchedule -> toTaskSchedule
toChoreOccurrence -> toTaskOccurrence
toChoreCompletionCheckIn -> toTaskCompletionCheckIn
toCalendarImportQueueItem
```

`toCalendarImportQueueItem` must return:

```ts
linkedTaskId: item.linkedTaskId ?? undefined,
taskLinkStatus: item.taskLinkStatus as TaskLinkStatus,
taskMatchReason: item.taskMatchReason ?? undefined,
importScope: item.importScope as ImportScope
```

- [ ] **Step 2: Rename Prisma calls**

Replace Prisma delegates:

```ts
prisma.chore -> prisma.task
prisma.choreSchedule -> prisma.taskSchedule
prisma.choreScheduleAssignee -> prisma.taskScheduleAssignee
prisma.choreOccurrence -> prisma.taskOccurrence
prisma.choreCompletionCheckIn -> prisma.taskCompletionCheckIn
```

- [ ] **Step 3: Preserve filtering semantics**

`listTasks(householdId, { status })` must default to:

```ts
where: {
  householdId,
  libraryState: "saved",
  archivedAt: status === "archived" ? { not: null } : null
}
```

Add `libraryState` and `type` filters to support the Tasks page.

- [ ] **Step 4: Run backend tests**

Run: `npm.cmd run test -w server -- households.test.ts calendar.test.ts prismaStore.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add server/src/repositories/prismaStore.ts server/src/repositories/inMemoryStore.ts server/src/routes/households.ts server/src/routes/calendar.ts server/src/app.ts server/test
git commit -m "Rename backend chore APIs to tasks"
```

Expected: commit succeeds.

---

## Phase 2: Frontend API Contract And Navigation

### Task 2.1: Write Frontend API Rename Tests

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add task API endpoint assertion**

Add a test near existing API tests:

```ts
it("creates scheduled tasks through the task endpoint", async () => {
  const fetchMock = mockFetchOnce({
    task: {
      id: "task-1",
      householdId: "household-1",
      title: "Clean bathrooms",
      type: "chore",
      libraryState: "saved",
      source: "manual",
      tags: []
    },
    schedules: []
  });

  await createScheduledTask("household-1", {
    task: {
      title: "Clean bathrooms",
      type: "chore",
      libraryState: "saved",
      source: "manual",
      instructions: "",
      tags: []
    },
    schedules: []
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/households/household-1/tasks",
    expect.objectContaining({ method: "POST" })
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm.cmd run test -w web -- App.test.tsx -t "creates scheduled tasks through the task endpoint"`

Expected: FAIL because `createScheduledTask` is not exported.

### Task 2.2: Rename Frontend API Client

**Files:**
- Modify: `web/src/api.ts`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Rename imports and functions**

In `web/src/api.ts`, replace exported functions:

```ts
createScheduledChore -> createScheduledTask
createChore -> createTask
listAllChores -> listAllTasks
listChores -> listTasks
updateChore -> updateTask
archiveChore -> archiveTask
restoreChore -> restoreTask
listArchivedChores -> listArchivedTasks
updateChoreLibraryPermission -> updateTaskLibraryPermission
```

Update routes to `/tasks` and `/task-library-permission`.

- [ ] **Step 2: Update import queue decision payload**

In `decideCalendarImportQueueItem`, pass through:

```ts
linkedTaskId,
taskLinkStatus,
taskMatchReason,
importScope
```

- [ ] **Step 3: Run API test**

Run: `npm.cmd run test -w web -- App.test.tsx -t "creates scheduled tasks through the task endpoint"`

Expected: PASS.

### Task 2.3: Add Top-Level Tasks Page Shell

**Files:**
- Create: `web/src/pages/TasksPage.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Write failing navigation test**

Add:

```ts
it("shows Tasks as a top-level navigation item", async () => {
  render(<App />);

  expect(await screen.findByRole("button", { name: "Tasks" })).toBeInTheDocument();
});
```

Run: `npm.cmd run test -w web -- App.test.tsx -t "shows Tasks as a top-level navigation item"`

Expected: FAIL because Tasks is not in navigation.

- [ ] **Step 2: Create Tasks page shell**

Create `web/src/pages/TasksPage.tsx`:

```tsx
import type { HouseholdAppData } from "@chore-helper/shared";

type TasksPageProps = {
  households: HouseholdAppData[];
  isLoading: boolean;
};

export function TasksPage({ households, isLoading }: TasksPageProps) {
  const selectedHousehold = households[0];

  return (
    <main className="page-shell tasks-page">
      <p className="eyebrow">Reusable work</p>
      <h1>Tasks</h1>
      <p className="lede">Manage saved chores, commitments, and task candidates that need review.</p>
      {isLoading ? <p className="empty-state">Loading tasks...</p> : null}
      {!isLoading && !selectedHousehold ? <p className="empty-state">Add or join a household before managing tasks.</p> : null}
      {selectedHousehold ? (
        <section className="settings-view-panel" aria-label="Task library">
          <p className="eyebrow">Task library</p>
          <h2>Saved tasks</h2>
          <p className="empty-state">Task library controls are moving here.</p>
        </section>
      ) : null}
    </main>
  );
}
```

- [ ] **Step 3: Wire navigation**

In `web/src/App.tsx`, import `TasksPage`, add `"Tasks"` to nav between Calendar and My Home, and render it at `/tasks`.

- [ ] **Step 4: Run navigation test**

Run: `npm.cmd run test -w web -- App.test.tsx -t "shows Tasks as a top-level navigation item"`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add web/src/api.ts web/src/App.tsx web/src/pages/TasksPage.tsx web/src/App.test.tsx web/src/App.css
git commit -m "Add task navigation and API client"
```

Expected: commit succeeds.

---

## Phase 3: Move Library CRUD From Settings To Tasks

### Task 3.1: Write Settings Removal And Tasks CRUD Tests

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add Settings removal test**

```ts
it("does not show Task library CRUD inside Settings", async () => {
  render(<App />);
  await navigateTo("Settings");

  expect(screen.queryByRole("heading", { name: "Chore library" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Task library" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Add Tasks page CRUD test**

```ts
it("shows task library CRUD on the Tasks page for managers", async () => {
  mockTasks([{ id: "task-1", householdId: "household-1", title: "Clean bathrooms", type: "chore", libraryState: "saved", source: "manual", tags: [] }]);

  render(<App />);
  await navigateTo("Tasks");

  expect(await screen.findByRole("heading", { name: "Task library" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add task" })).toBeInTheDocument();
  expect(screen.getByText("Clean bathrooms")).toBeInTheDocument();
  expect(screen.getByText("Chore")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run: `npm.cmd run test -w web -- App.test.tsx -t "Task library|Settings"`

Expected: FAIL because CRUD still lives in Settings and Tasks shell has no CRUD.

### Task 3.2: Move Task Library UI

**Files:**
- Modify: `web/src/pages/SettingsPage.tsx`
- Modify: `web/src/pages/TasksPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Remove library view from Settings**

In `SettingsPage.tsx`, remove the `"library"` section from the section selector and remove `renderChoreLibrary`. Keep Family permissions, renamed to Task library.

- [ ] **Step 2: Add task library state to Tasks page**

In `TasksPage.tsx`, add state:

```ts
const [libraryTasks, setLibraryTasks] = useState<Task[]>([]);
const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
const [librarySearch, setLibrarySearch] = useState("");
const [libraryType, setLibraryType] = useState<"all" | TaskType>("all");
const [libraryStatus, setLibraryStatus] = useState<"active" | "archived">("active");
const [editingTask, setEditingTask] = useState<Task | "new" | undefined>();
```

Load `listTasks` and `listArchivedTasks` for the selected household.

- [ ] **Step 3: Add task filters and rows**

Render:

```tsx
<div className="chore-library-toolbar task-library-toolbar">
  <input aria-label="Search Task library" placeholder="Search tasks" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} />
  <select aria-label="Task type" value={libraryType} onChange={(event) => setLibraryType(event.target.value as "all" | TaskType)}>
    <option value="all">All types</option>
    <option value="chore">Chores</option>
    <option value="commitment">Commitments</option>
  </select>
  <select aria-label="Task status" value={libraryStatus} onChange={(event) => setLibraryStatus(event.target.value as "active" | "archived")}>
    <option value="active">Active</option>
    <option value="archived">Archived</option>
  </select>
  {canManageTaskLibrary ? <button type="button" onClick={() => setEditingTask("new")}>Add task</button> : null}
</div>
```

Rows must show a text badge:

```tsx
<span className={`task-type-badge is-${task.type}`}>{task.type === "chore" ? "Chore" : "Commitment"}</span>
```

- [ ] **Step 4: Rename modal**

Move `ChoreLibraryModal` logic into `TasksPage.tsx` as `TaskLibraryModal`. Fields:

```tsx
<input aria-label="Task name" />
<select aria-label="Task type">
  <option value="chore">Chore</option>
  <option value="commitment">Commitment</option>
</select>
<textarea aria-label="Notes" />
<input aria-label="Tags" />
```

- [ ] **Step 5: Run tests**

Run: `npm.cmd run test -w web -- App.test.tsx -t "Task library|Settings"`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add web/src/pages/SettingsPage.tsx web/src/pages/TasksPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Move task library CRUD to Tasks"
```

Expected: commit succeeds.

---

## Phase 4: Schedule Task Flow

### Task 4.1: Write Schedule Task Behavior Tests

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add Calendar action wording test**

```ts
it("uses Schedule task as the primary Calendar creation action", async () => {
  render(<App />);
  await navigateTo("Calendar");

  expect(await screen.findByRole("button", { name: "Schedule task" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add chore" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add event" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Add default save-to-library test**

```ts
it("defaults new manually scheduled tasks to save to the Task library", async () => {
  render(<App />);
  await navigateTo("Calendar");
  await userEvent.click(await screen.findByRole("button", { name: "Schedule task" }));

  expect(screen.getByRole("checkbox", { name: "Save to Task library" })).toBeChecked();
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run: `npm.cmd run test -w web -- App.test.tsx -t "Schedule task|save to the Task library"`

Expected: FAIL because Calendar still has chore/event wording or no checkbox default.

### Task 4.2: Rename Calendar Editor To Schedule Task

**Files:**
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Rename editor state and labels**

In `CalendarPage.tsx`, replace user-facing copy:

```tsx
"New chore" -> "Schedule task"
"Chore details" -> "Scheduled task details"
"Edit chore" -> "Edit scheduled task"
"Chore saved." -> "Task scheduled."
"Could not save chore." -> "Could not schedule task."
```

- [ ] **Step 2: Add task type and save-state controls**

For create mode, add:

```tsx
<select
  aria-label="Task type"
  value={editorDraft.type}
  onChange={(event) => updateEditorDraft({ type: event.target.value as TaskType })}
>
  <option value="chore">Chore</option>
  <option value="commitment">Commitment</option>
</select>
<label className="checkbox-row">
  <input
    type="checkbox"
    checked={editorDraft.saveToLibrary}
    onChange={(event) => updateEditorDraft({ saveToLibrary: event.target.checked })}
  />
  <span>Save to Task library</span>
</label>
```

Default `saveToLibrary` to `true` for manual create mode. Submit `libraryState: editorDraft.saveToLibrary ? "saved" : "one_time"`.

- [ ] **Step 3: Use task API**

Replace `createScheduledChore` with `createScheduledTask`. Replace `choreId` state names with `taskId`.

- [ ] **Step 4: Run tests**

Run: `npm.cmd run test -w web -- App.test.tsx -t "Schedule task|save to the Task library"`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add web/src/pages/CalendarPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Update Calendar scheduling flow for tasks"
```

Expected: commit succeeds.

---

## Phase 5: Task Inbox

### Task 5.1: Write Task Inbox Backend Tests

**Files:**
- Modify: `server/test/households.test.ts`

- [ ] **Step 1: Add list test**

```ts
it("lists pending imports and one-time scheduled tasks in the task inbox", async () => {
  const response = await request(app)
    .get("/api/households/household-1/task-inbox")
    .set(authHeaders("user-1"));

  expect(response.status).toBe(200);
  expect(response.body.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "import_queue", badge: "Pending import" }),
      expect.objectContaining({ kind: "task", badge: "Scheduled" })
    ])
  );
});
```

- [ ] **Step 2: Add link action test**

```ts
it("links a pending import inbox item to an existing task without approving the calendar import", async () => {
  const response = await request(app)
    .post("/api/households/household-1/task-inbox/import_queue/queue-1/link")
    .set(authHeaders("user-1"))
    .send({ taskId: "task-clean-bathrooms", scope: "single" });

  expect(response.status).toBe(200);
  expect(response.body.queueStatus).toBe("pending");
  expect(response.body.taskLinkStatus).toBe("linked");
  expect(response.body.linkedTaskId).toBe("task-clean-bathrooms");
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run: `npm.cmd run test -w server -- households.test.ts -t "task inbox"`

Expected: FAIL because task inbox endpoints do not exist.

### Task 5.2: Add Task Inbox Store And Routes

**Files:**
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Modify: `server/src/routes/households.ts`
- Test: `server/test/households.test.ts`

- [ ] **Step 1: Add store methods**

Add to `HouseholdStore`:

```ts
listTaskInboxItems(householdId: string): StoreResult<{ items: TaskInboxItem[] }>;
linkTaskInboxItem(householdId: string, kind: TaskInboxItemKind, itemId: string, taskId: string, scope: ImportScope): StoreResult<CalendarImportQueueItem | Task | undefined>;
saveTaskInboxItem(householdId: string, kind: TaskInboxItemKind, itemId: string, task: TaskDefinitionInput, scope: ImportScope): StoreResult<CalendarImportQueueItem | Task | undefined>;
keepTaskInboxItemOneTime(householdId: string, kind: TaskInboxItemKind, itemId: string): StoreResult<CalendarImportQueueItem | Task | undefined>;
```

- [ ] **Step 2: Implement derived inbox list**

Return:

```ts
const pendingImports = calendarImportQueueItems
  .filter((item) => item.householdId === householdId && item.queueStatus === "pending")
  .map(toPendingImportInboxItem);

const oneTimeTasks = tasks
  .filter((task) => task.householdId === householdId && task.libraryState === "one_time" && !task.archivedAt)
  .map(toOneTimeTaskInboxItem);

return { items: [...pendingImports, ...oneTimeTasks] };
```

Suggest link by normalized title exact match against saved tasks. Set `suggestedReason = "Matched by title"` when matched.

- [ ] **Step 3: Add routes**

Add:

```ts
router.get("/:householdId/task-inbox", async (req, res) => {
  const access = await requireHouseholdAccess(req, res);
  if (!access) return;
  return res.status(200).json(await store.listTaskInboxItems(access.household.id));
});

router.post("/:householdId/task-inbox/:kind/:itemId/link", async (req, res) => {
  const access = await requireTaskLibraryManage(req, res);
  if (!access) return;
  const parsed = z.object({ taskId: z.string().min(1), scope: z.enum(["single", "series", "future_matching"]).default("single") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await store.linkTaskInboxItem(access.household.id, req.params.kind as TaskInboxItemKind, req.params.itemId, parsed.data.taskId, parsed.data.scope);
  return updated ? res.status(200).json(updated) : res.status(404).json({ error: "Task inbox item not found" });
});

router.post("/:householdId/task-inbox/:kind/:itemId/save", async (req, res) => {
  const access = await requireTaskLibraryManage(req, res);
  if (!access) return;
  const parsed = z.object({ task: taskSchema, scope: z.enum(["single", "series", "future_matching"]).default("single") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await store.saveTaskInboxItem(access.household.id, req.params.kind as TaskInboxItemKind, req.params.itemId, parsed.data.task, parsed.data.scope);
  return updated ? res.status(200).json(updated) : res.status(404).json({ error: "Task inbox item not found" });
});

router.post("/:householdId/task-inbox/:kind/:itemId/keep-one-time", async (req, res) => {
  const access = await requireTaskLibraryManage(req, res);
  if (!access) return;
  const updated = await store.keepTaskInboxItemOneTime(access.household.id, req.params.kind as TaskInboxItemKind, req.params.itemId);
  return updated ? res.status(200).json(updated) : res.status(404).json({ error: "Task inbox item not found" });
});
```

All mutation routes call `requireTaskLibraryManage`.

- [ ] **Step 4: Run backend task inbox tests**

Run: `npm.cmd run test -w server -- households.test.ts -t "task inbox"`

Expected: PASS.

### Task 5.3: Add Task Inbox UI

**Files:**
- Modify: `web/src/api.ts`
- Modify: `web/src/pages/TasksPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add API functions**

Add:

```ts
export async function listTaskInbox(householdId: string): Promise<{ items: TaskInboxItem[] }>;
export async function linkTaskInboxItem(householdId: string, kind: TaskInboxItemKind, itemId: string, taskId: string, scope: ImportScope): Promise<CalendarImportQueueItem | Task>;
export async function saveTaskInboxItem(householdId: string, kind: TaskInboxItemKind, itemId: string, task: TaskDefinitionInput, scope: ImportScope): Promise<CalendarImportQueueItem | Task>;
export async function keepTaskInboxItemOneTime(householdId: string, kind: TaskInboxItemKind, itemId: string): Promise<CalendarImportQueueItem | Task>;
```

- [ ] **Step 2: Add failing UI test**

```ts
it("shows Task inbox items with pending import and scheduled badges", async () => {
  mockTaskInbox([
    { id: "queue-1", kind: "import_queue", householdId: "household-1", status: "needs_review", title: "Busy", proposedType: "commitment", source: "google-calendar", badge: "Pending import" },
    { id: "task-1", kind: "task", householdId: "household-1", status: "needs_review", title: "Drop off donation", proposedType: "commitment", source: "manual", badge: "Scheduled" }
  ]);

  render(<App />);
  await navigateTo("Tasks");

  expect(await screen.findByRole("heading", { name: "Task inbox" })).toBeInTheDocument();
  expect(screen.getByText("Pending import")).toBeInTheDocument();
  expect(screen.getByText("Scheduled")).toBeInTheDocument();
});
```

- [ ] **Step 3: Implement Tasks page sections**

Use a settings-style selector with:

```ts
type TasksSection = "library" | "inbox";
```

Render Task inbox rows with actions:

```tsx
<button type="button">Save as task</button>
<button type="button">Link to existing task</button>
<button type="button">Keep one-time</button>
```

For `kind === "import_queue"`, also render:

```tsx
<button type="button" onClick={() => onNavigate("/calendar?section=import-queue")}>Open in Import queue</button>
```

- [ ] **Step 4: Run UI test**

Run: `npm.cmd run test -w web -- App.test.tsx -t "Task inbox"`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add server/src/repositories server/src/routes/households.ts server/test/households.test.ts web/src/api.ts web/src/pages/TasksPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Add Task inbox review lane"
```

Expected: commit succeeds.

---

## Phase 6: Calendar Workspace Sections

### Task 6.1: Write Calendar Section Tests

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add section selector test**

```ts
it("uses Calendar sections for schedule, list, import queue, import events, and export", async () => {
  render(<App />);
  await navigateTo("Calendar");

  expect(await screen.findByRole("button", { name: "Calendar" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "List" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Import queue/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Import events" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Add import queue badge test**

```ts
it("shows pending import count in the Calendar section selector", async () => {
  mockCalendarPageFetches([pendingImportQueueItem()]);

  render(<App />);
  await navigateTo("Calendar");

  expect(await screen.findByRole("button", { name: /Import queue 1/ })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run: `npm.cmd run test -w web -- App.test.tsx -t "Calendar sections|pending import count"`

Expected: FAIL because Calendar still uses the old layout.

### Task 6.2: Implement Calendar Section Selector

**Files:**
- Modify: `web/src/pages/CalendarPage.tsx`
- Modify: `web/src/App.css`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add section state**

In `CalendarPage.tsx`:

```ts
type CalendarSection = "calendar" | "list" | "import-queue" | "import-events" | "export";
const [activeSection, setActiveSection] = useState<CalendarSection>("calendar");
```

Parse `?section=import-queue` on mount to support Task inbox deep links.

- [ ] **Step 2: Render desktop and mobile selectors**

Desktop uses the Settings side selector style. Mobile uses the compact Settings selector style with outside-click close.

Buttons:

```tsx
{ label: "Calendar", value: "calendar" }
{ label: "List", value: "list" }
{ label: `Import queue ${pendingImportCount}`, value: "import-queue" }
{ label: "Import events", value: "import-events" }
{ label: "Export", value: "export" }
```

- [ ] **Step 3: Move flows into sections**

Render:

```tsx
{activeSection === "calendar" ? renderCalendarGrid() : null}
{activeSection === "list" ? renderCalendarList() : null}
{activeSection === "import-queue" ? renderCalendarImportQueue() : null}
{activeSection === "import-events" ? renderImportEventsSection() : null}
{activeSection === "export" ? renderExportSection() : null}
```

Remove the old calendar actions popover as the primary import/export path.

- [ ] **Step 4: Run tests**

Run: `npm.cmd run test -w web -- App.test.tsx -t "Calendar sections|pending import count"`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add web/src/pages/CalendarPage.tsx web/src/App.css web/src/App.test.tsx
git commit -m "Add Calendar workspace sections"
```

Expected: commit succeeds.

---

## Phase 7: Scheduled Task Details And Overrides

### Task 7.1: Write Detail Modal Tests

**Files:**
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Add linked task override test**

```ts
it("lets linked scheduled tasks keep custom details without unlinking", async () => {
  render(<App />);
  await navigateTo("Calendar");
  await openScheduledTask("Clean bathrooms");
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  await userEvent.clear(screen.getByLabelText("Notes"));
  await userEvent.type(screen.getByLabelText("Notes"), "Toilet only today");
  await userEvent.click(screen.getByRole("radio", { name: "This scheduled task only" }));
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect(await screen.findByText("Custom details for this scheduled task")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sync to saved task" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reset to saved task defaults" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Add one-time save test**

```ts
it("lets a one-time scheduled task be saved to the Task library from details", async () => {
  render(<App />);
  await navigateTo("Calendar");
  await openScheduledTask("Drop off donation");

  expect(await screen.findByRole("button", { name: "Save to Task library" })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run: `npm.cmd run test -w web -- App.test.tsx -t "custom details|one-time scheduled task"`

Expected: FAIL because detail override controls do not exist.

### Task 7.2: Add Scheduled Task Override State

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_scheduled_task_overrides/migration.sql`
- Modify: `shared/src/types.ts`
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Modify: `server/src/routes/households.ts`
- Modify: `web/src/pages/CalendarPage.tsx`
- Test: `server/test/households.test.ts`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Add override fields to TaskOccurrence**

Add nullable fields:

```prisma
customTitle       String?
customType        String?
customInstructions String?
customTags        String?
hasTaskOverrides  Boolean @default(false)
```

- [ ] **Step 2: Generate migration**

Run: `npm.cmd run db:migrate -w server -- --name scheduled_task_overrides`

Expected: Prisma creates a new migration and client.

- [ ] **Step 3: Add update endpoint**

Add:

```ts
router.patch("/:householdId/occurrences/:occurrenceId/task-details", async (req, res) => {
  const access = await requireHouseholdAccess(req, res);
  if (!access) return;
  const parsed = occurrenceTaskDetailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await store.updateOccurrenceTaskDetails(access.household.id, req.params.occurrenceId, parsed.data);
  return updated ? res.status(200).json(updated) : res.status(404).json({ error: "Scheduled task not found" });
});

router.post("/:householdId/occurrences/:occurrenceId/save-to-library", async (req, res) => {
  const access = await requireTaskLibraryManage(req, res);
  if (!access) return;
  const updated = await store.saveOccurrenceTaskToLibrary(access.household.id, req.params.occurrenceId);
  return updated ? res.status(200).json(updated) : res.status(404).json({ error: "Scheduled task not found" });
});

router.post("/:householdId/occurrences/:occurrenceId/sync-to-task", async (req, res) => {
  const access = await requireTaskLibraryManage(req, res);
  if (!access) return;
  const updated = await store.syncOccurrenceDetailsToTask(access.household.id, req.params.occurrenceId);
  return updated ? res.status(200).json(updated) : res.status(404).json({ error: "Scheduled task not found" });
});

router.post("/:householdId/occurrences/:occurrenceId/reset-task-overrides", async (req, res) => {
  const access = await requireHouseholdAccess(req, res);
  if (!access) return;
  const updated = await store.resetOccurrenceTaskOverrides(access.household.id, req.params.occurrenceId);
  return updated ? res.status(200).json(updated) : res.status(404).json({ error: "Scheduled task not found" });
});
```

All mutation routes require household access. Routes that mutate saved task records require `taskLibraryPermission = "manage"`.

- [ ] **Step 4: Update Calendar modal**

Render radio choices:

```tsx
<label><input type="radio" name="taskDetailScope" value="occurrence" /> This scheduled task only</label>
<label><input type="radio" name="taskDetailScope" value="saved-task" /> Sync to saved task</label>
```

For one-time tasks, render `Save to Task library`.

- [ ] **Step 5: Run detail tests**

Run: `npm.cmd run test -w web -- App.test.tsx -t "custom details|one-time scheduled task"`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add server/prisma server/src shared/src web/src server/test web/src/App.test.tsx
git commit -m "Add scheduled task detail overrides"
```

Expected: commit succeeds.

---

## Phase 8: Import Queue Scope And Task Links

### Task 8.1: Write Import Scope Tests

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `server/test/calendar.test.ts`

- [ ] **Step 1: Add UI scope test**

```ts
it("requires an import scope when approving an imported scheduled task", async () => {
  mockCalendarPageFetches([pendingImportQueueItem()]);

  render(<App />);
  await navigateTo("Calendar");
  await userEvent.click(await screen.findByRole("button", { name: /Import queue/ }));

  expect(screen.getByRole("radio", { name: "This imported item only" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "This repeating series" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Future matching imports" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Add backend scope persistence test**

```ts
it("stores import scope on queue decisions", async () => {
  const response = await request(app)
    .patch("/api/households/household-1/calendar/import-queue/queue-1")
    .set(authHeaders("user-1"))
    .send({
      decision: "approve",
      proposedType: "commitment",
      importScope: "future_matching",
      taskLinkStatus: "one_time"
    });

  expect(response.status).toBe(200);
  expect(response.body.importScope).toBe("future_matching");
  expect(response.body.taskLinkStatus).toBe("one_time");
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run: `npm.cmd run test -w web -- App.test.tsx -t "import scope"`

Expected: FAIL until scope controls exist.

Run: `npm.cmd run test -w server -- calendar.test.ts -t "import scope"`

Expected: FAIL until persistence exists.

### Task 8.2: Implement Import Scope Controls

**Files:**
- Modify: `server/src/routes/calendar.ts`
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Modify: `web/src/pages/CalendarPage.tsx`
- Test: `server/test/calendar.test.ts`
- Test: `web/src/App.test.tsx`

- [ ] **Step 1: Extend calendar decision schema**

In `server/src/routes/calendar.ts`:

```ts
const importScopes = ["single", "series", "future_matching"] as const;
const taskLinkStatuses = ["unreviewed", "linked", "saved", "one_time"] as const;

const queueDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  proposedType: z.enum(["chore", "commitment"]).optional(),
  linkedTaskId: z.string().min(1).optional(),
  taskLinkStatus: z.enum(taskLinkStatuses).optional(),
  taskMatchReason: z.string().trim().optional(),
  importScope: z.enum(importScopes).default("single")
});
```

- [ ] **Step 2: Update stores**

Persist the new fields when deciding queue items. Do not change `queueStatus` when Task inbox link/save calls update only task metadata.

- [ ] **Step 3: Render scope controls**

In `renderCalendarImportQueue`, add a radio group per row and selected bulk draft:

```tsx
<fieldset>
  <legend>Import scope</legend>
  <label><input type="radio" value="single" /> This imported item only</label>
  <label><input type="radio" value="series" /> This repeating series</label>
  <label><input type="radio" value="future_matching" /> Future matching imports</label>
</fieldset>
```

- [ ] **Step 4: Run tests**

Run: `npm.cmd run test -w server -- calendar.test.ts -t "import scope"`

Expected: PASS.

Run: `npm.cmd run test -w web -- App.test.tsx -t "import scope"`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add server/src/routes/calendar.ts server/src/repositories web/src/pages/CalendarPage.tsx server/test/calendar.test.ts web/src/App.test.tsx
git commit -m "Add import scope and task-link metadata"
```

Expected: commit succeeds.

---

## Phase 9: Today, Family, And Optimize Language

### Task 9.1: Write Optimize Behavior Tests

**Files:**
- Modify: `web/src/App.test.tsx`
- Modify: `server/test/households.test.ts`

- [ ] **Step 1: Add Optimize UI test**

```ts
it("optimizes chores while showing commitments as context", async () => {
  mockTasks([
    { id: "task-1", householdId: "household-1", title: "Clean bathrooms", type: "chore", libraryState: "saved", source: "manual", tags: [] },
    { id: "task-2", householdId: "household-1", title: "Work", type: "commitment", libraryState: "saved", source: "manual", tags: [] }
  ]);

  render(<App />);
  await navigateTo("Optimize");

  expect(await screen.findByRole("heading", { name: "Optimize household work" })).toBeInTheDocument();
  expect(screen.getByText("Choose chores to optimize")).toBeInTheDocument();
  expect(screen.getByText("Commitments are included as schedule context.")).toBeInTheDocument();
  expect(screen.getByLabelText("Clean bathrooms")).toBeChecked();
  expect(screen.queryByLabelText("Work")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Add backend recommendation input test**

```ts
it("accepts selected task ids for chore optimization", async () => {
  const response = await request(app)
    .post("/api/households/household-1/recommendations/review")
    .set(authHeaders("user-1"))
    .send({
      reviewPrompt: "Review work",
      selectedTaskIds: ["task-clean-bathrooms"]
    });

  expect(response.status).toBe(200);
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run: `npm.cmd run test -w web -- App.test.tsx -t "optimizes chores"`

Expected: FAIL on old Optimize copy or task filtering.

Run: `npm.cmd run test -w server -- households.test.ts -t "selected task ids"`

Expected: FAIL if backend still expects `selectedChoreIds`.

### Task 9.2: Rename Today, Family, And Optimize Surfaces

**Files:**
- Modify: `web/src/pages/TodayDashboard.tsx`
- Modify: `web/src/pages/FamilyPage.tsx`
- Modify: `web/src/pages/OptimizePage.tsx`
- Modify: `server/src/routes/households.ts`
- Modify: `server/src/repositories/inMemoryStore.ts`
- Modify: `server/src/repositories/prismaStore.ts`
- Test: `web/src/App.test.tsx`
- Test: `server/test/households.test.ts`

- [ ] **Step 1: Rename Optimize selection**

In `OptimizePage.tsx`, load `listTasks`, compute:

```ts
const activeChores = tasks.filter((task) => task.type === "chore" && !task.archivedAt);
const activeCommitments = tasks.filter((task) => task.type === "commitment" && !task.archivedAt);
```

Render selected chores only, plus context copy:

```tsx
<p>Commitments are included as schedule context.</p>
```

- [ ] **Step 2: Rename backend recommendation IDs**

In `server/src/routes/households.ts`, change schema:

```ts
const recommendationRequestSchema = z.object({
  reviewPrompt: z.string().trim().optional(),
  selectedTaskIds: z.array(z.string()).optional()
});
```

Only pass chore-type tasks to the agent recommendation prompt.

- [ ] **Step 3: Update Today and Family copy**

Use "tasks" where the list contains both chores and commitments. Use "chores" only for chore-only optimization or household work references.

- [ ] **Step 4: Run tests**

Run: `npm.cmd run test -w web -- App.test.tsx -t "optimizes chores"`

Expected: PASS.

Run: `npm.cmd run test -w server -- households.test.ts -t "selected task ids"`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add web/src/pages/TodayDashboard.tsx web/src/pages/FamilyPage.tsx web/src/pages/OptimizePage.tsx server/src/routes/households.ts server/src/repositories server/test/households.test.ts web/src/App.test.tsx
git commit -m "Update Optimize and daily views for tasks"
```

Expected: commit succeeds.

---

## Phase 10: Full Rename Cleanup

### Task 10.1: Remove Remaining Chore Identifiers Except Intentional Type Labels

**Files:**
- Modify: all files returned by the scans
- Test: all test suites

- [ ] **Step 1: Run identifier scan**

Run:

```powershell
rg -n "\bChore\b|\bchoreId\b|choreLibrary|createScheduledChore|listChores|chores:" shared server web
```

Expected: only intentional user-facing task type labels, CSS class names scheduled for rename, or historical migration names.

- [ ] **Step 2: Rename CSS classes where practical**

Rename high-signal CSS classes:

```text
.calendar-chore-row -> .calendar-task-row
.calendar-chore-title -> .calendar-task-title
.calendar-chore-detail -> .calendar-task-detail
.chore-editor-modal -> .task-editor-modal
.chore-editor-backdrop -> .task-editor-backdrop
.chore-library-* -> .task-library-*
```

Keep old classes only when replacing them creates large visual risk in this pass. Add no new old `chore-*` classes.

- [ ] **Step 3: Run typecheck**

Run: `npm.cmd run typecheck`

Expected: PASS for all workspaces.

- [ ] **Step 4: Run tests**

Run: `npm.cmd run test -w server`

Expected: PASS.

Run: `npm.cmd run test -w web`

Expected: PASS.

- [ ] **Step 5: Run builds**

Run: `npm.cmd run build -w server`

Expected: PASS.

Run: `npm.cmd run build -w web`

Expected: PASS, with only the existing Vite chunk-size warning if still present.

- [ ] **Step 6: Commit**

Run:

```powershell
git add shared server web
git commit -m "Clean up task terminology"
```

Expected: commit succeeds.

---

## Phase 11: Browser Verification And Production Migration Notes

### Task 11.1: Manual Browser Verification

**Files:**
- Read: `web/src/App.tsx`
- Read: `web/src/pages/TasksPage.tsx`
- Read: `web/src/pages/CalendarPage.tsx`

- [ ] **Step 1: Start app**

Run: `npm.cmd run dev -w web`

Expected: Vite starts and prints a localhost URL.

- [ ] **Step 2: Verify Tasks desktop**

Open the app and verify:

- Top nav includes Tasks.
- Tasks page has Library and Inbox sections.
- Add task modal can create chore and commitment tasks.
- Archive/restore task works for a manager.
- Non-manager sees clear permission messaging without assuming backend failure means no permission.

- [ ] **Step 3: Verify Tasks mobile**

At mobile width, verify:

- Section selector uses the compact Settings pattern.
- Open selector colors are legible.
- Selector closes on outside click.
- Task type badges are visible by text and color.

- [ ] **Step 4: Verify Calendar**

Verify:

- H1 is followed by Calendar/List selector on mobile.
- Calendar side selector shows Calendar, List, Import queue, Import events, Export.
- Import queue badge count updates.
- Schedule task flow defaults Save to Task library on for manual tasks.
- Save to Task library off creates a one-time task shown in Task inbox.
- Import queue task-link controls do not approve imports by themselves.

- [ ] **Step 5: Verify modals**

Verify:

- Calendar scheduled task modal, import modal, and task modal share width and vertical centering behavior.
- Outside click closes.
- Escape closes.
- Tabbing remains inside the modal.
- Close button has an accessible name.

### Task 11.2: Production Migration Reminder

**Files:**
- Modify: `docs/production-prisma-migrations.md`

- [ ] **Step 1: Add this release note**

Add a section:

```md
## Task/Schedule Domain Rename Release

This release contains Prisma migrations that rename chore tables/columns to task tables/columns and add task inbox/import-link fields. Do not use `prisma db push` in production for this release.

Deployment order:

1. Deploy code and committed migration files.
2. In Render Shell, run `npm run db:deploy -w server`.
3. Restart the web service if Render does not restart it automatically.

Preferred automation:

- Add Render Pre-Deploy Command: `npm run db:deploy -w server`
- Keep Build Command separate from database migration.
- Keep `DATABASE_URL` pointed at the production database for the service running the pre-deploy command.
```

- [ ] **Step 2: Commit**

Run:

```powershell
git add docs/production-prisma-migrations.md
git commit -m "Document task migration deployment"
```

Expected: commit succeeds.

---

## Final Verification Gate

- [ ] Run `git status --short`.

Expected: no uncommitted tracked files.

- [ ] Run `npm.cmd run typecheck`.

Expected: PASS.

- [ ] Run `npm.cmd run test -w server`.

Expected: PASS.

- [ ] Run `npm.cmd run test -w web`.

Expected: PASS.

- [ ] Run `npm.cmd run build -w server`.

Expected: PASS.

- [ ] Run `npm.cmd run build -w web`.

Expected: PASS, with only the existing Vite chunk-size warning if it remains.

- [ ] Push the branch after the user confirms review or asks for push.

Run:

```powershell
git push
```

Expected: branch is available remotely.

## Spec Coverage Checklist

- [ ] Hard rename DB/API/shared/UI from chore to task.
- [ ] Task type supports chores and commitments.
- [ ] Task library moves from Settings to Tasks.
- [ ] Task inbox shows pending imports and one-time scheduled tasks.
- [ ] Calendar and Tasks stay separate top-level pages.
- [ ] Calendar gains side/compact selector sections.
- [ ] Import queue and Task inbox decisions remain separate.
- [ ] Manual new schedule defaults Save to Task library on.
- [ ] Import scope controls exist.
- [ ] Scheduled task details support quiet overrides and save/sync/reset.
- [ ] Optimize recommends chores and uses commitments as constraints.
- [ ] Migrations preserve existing data and use `migrate deploy` in production.
