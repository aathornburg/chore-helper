import { describe, expect, it } from "vitest";
import type { ChoreSchedule } from "@chore-helper/shared";
import { materializeOccurrences } from "../src/scheduling/materializeOccurrences.js";

function createSchedule(update: Partial<ChoreSchedule> = {}): ChoreSchedule {
  return {
    id: "schedule-1",
    householdId: "household-1",
    choreId: "chore-1",
    recurrence: { frequency: "daily", interval: 1 },
    localStartTime: "07:00",
    startsOn: "2026-03-07",
    plannedMinutes: 30,
    assignment: { mode: "rotation", memberUserIds: ["user-a", "user-b"] },
    ...update
  };
}

describe("materializeOccurrences", () => {
  it("keeps daily rotation sequence stable while converting local start times across DST", () => {
    const occurrences = materializeOccurrences({
      schedule: createSchedule(),
      householdTimeZone: "America/New_York",
      rangeStart: "2026-03-07",
      rangeEnd: "2026-03-10"
    });

    expect(occurrences.map((occurrence) => occurrence.sequence)).toEqual([0, 1, 2, 3]);
    expect(occurrences.map((occurrence) => occurrence.assignedUserId)).toEqual([
      "user-a",
      "user-b",
      "user-a",
      "user-b"
    ]);
    expect(occurrences[0].plannedStartAt).toBe("2026-03-07T12:00:00.000Z");
    expect(occurrences[1].plannedStartAt).toBe("2026-03-08T11:00:00.000Z");
    expect(occurrences[1].plannedEndAt).toBe("2026-03-08T11:30:00.000Z");
  });

  it("emits one fixed-assignee occurrence only when its date is in range", () => {
    const schedule = createSchedule({
      recurrence: { frequency: "one_time", interval: 1 },
      startsOn: "2026-05-25",
      assignment: { mode: "fixed", memberUserIds: ["user-a"] }
    });

    expect(materializeOccurrences({
      schedule,
      householdTimeZone: "America/New_York",
      rangeStart: "2026-05-24",
      rangeEnd: "2026-05-26"
    })).toEqual([
      expect.objectContaining({ sequence: 0, assignedUserId: "user-a" })
    ]);
    expect(materializeOccurrences({
      schedule,
      householdTimeZone: "America/New_York",
      rangeStart: "2026-05-26",
      rangeEnd: "2026-05-27"
    })).toEqual([]);
  });

  it("counts occurrences before a later weekly query window for rotation", () => {
    const occurrences = materializeOccurrences({
      schedule: createSchedule({
        recurrence: { frequency: "weekly", interval: 2, weekDays: [1, 3] },
        startsOn: "2026-05-25"
      }),
      householdTimeZone: "America/New_York",
      rangeStart: "2026-06-08",
      rangeEnd: "2026-06-10"
    });

    expect(occurrences.map((occurrence) => ({
      sequence: occurrence.sequence,
      assignedUserId: occurrence.assignedUserId
    }))).toEqual([
      { sequence: 2, assignedUserId: "user-a" },
      { sequence: 3, assignedUserId: "user-b" }
    ]);
  });

  it("skips months that do not contain the configured monthly date", () => {
    const occurrences = materializeOccurrences({
      schedule: createSchedule({
        recurrence: { frequency: "monthly", interval: 1, monthlyDay: 31 },
        startsOn: "2026-01-31"
      }),
      householdTimeZone: "America/New_York",
      rangeStart: "2026-01-01",
      rangeEnd: "2026-03-31"
    });

    expect(occurrences.map((occurrence) => occurrence.sequence)).toEqual([0, 1]);
    expect(occurrences.map((occurrence) => occurrence.plannedStartAt)).toEqual([
      "2026-01-31T12:00:00.000Z",
      "2026-03-31T11:00:00.000Z"
    ]);
  });
});
