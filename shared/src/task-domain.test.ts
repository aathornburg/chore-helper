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
    const pendingImport: TaskInboxItem = {
      id: "queue-1",
      kind: "import_queue",
      householdId: "household-1",
      status: "needs_review",
      title: "Busy",
      proposedType: "commitment",
      source: "google-calendar",
      badge: "Pending import",
      importQueueItemId: "queue-1",
      startsAt: "2026-06-14T12:00:00.000Z",
      endsAt: "2026-06-14T13:00:00.000Z",
      suggestedTaskId: "task-1",
      suggestedReason: "Matched by title"
    };
    const oneTimeScheduledTask: TaskInboxItem = {
      id: "task-2",
      kind: "task",
      householdId: "household-1",
      status: "needs_review",
      title: "Drop off donation",
      proposedType: "commitment",
      source: "manual",
      badge: "Scheduled",
      startsAt: "2026-06-14T15:00:00.000Z",
      endsAt: "2026-06-14T15:30:00.000Z",
      taskId: "task-2"
    };

    expect(pendingImport.kind).toBe("import_queue");
    expect(pendingImport.status).toBe("needs_review");
    expect(oneTimeScheduledTask.kind).toBe("task");
    expect(oneTimeScheduledTask.badge).toBe("Scheduled");
  });

  it("keeps calendar import decisions separate from task link scope", () => {
    const decision: CalendarImportQueueDecisionInput = {
      decision: "approve",
      proposedType: "commitment",
      taskLinkStatus: "linked",
      linkedTaskId: "task-1",
      taskMatchReason: "Matched by title",
      importScope: "single"
    };

    expect(decision.decision).toBe("approve");
    expect(decision.taskLinkStatus).toBe("linked");
    expect(decision.taskMatchReason).toBe("Matched by title");
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
