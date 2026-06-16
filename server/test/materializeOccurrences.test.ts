import { describe, expect, it } from "vitest";
import type { FlexibleTaskSchedule, TimedTaskSchedule } from "@chore-helper/shared";
import { materializeOccurrences } from "../src/scheduling/materializeOccurrences.js";

function timedSchedule(update: Partial<TimedTaskSchedule> = {}): TimedTaskSchedule {
  return {
    id: "timed-schedule",
    householdId: "household-1",
    taskId: "task-1",
    planningMode: "timed",
    recurrence: { frequency: "daily", interval: 1 },
    localStartTime: "07:00",
    localEndTime: "07:30",
    startsOn: "2026-03-07",
    assignment: { mode: "rotation", memberUserIds: ["user-a", "user-b"] },
    ...update
  };
}

function flexibleSchedule(update: Partial<FlexibleTaskSchedule> = {}): FlexibleTaskSchedule {
  return {
    id: "flexible-schedule",
    householdId: "household-1",
    taskId: "task-1",
    planningMode: "flexible",
    recurrence: { frequency: "weekly", interval: 1, weekDays: [6, 0] },
    flexibleWindowRule: "once_within_selected_days",
    estimatedMinutes: 60,
    startsOn: "2026-05-30",
    assignment: { mode: "fixed", memberUserIds: ["user-a"] },
    ...update
  };
}

describe("materializeOccurrences", () => {
  it("keeps daily rotation sequence stable while converting local start times across DST", () => {
    const occurrences = materializeOccurrences({
      schedule: timedSchedule(),
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
    expect(occurrences[1].estimatedMinutes).toBe(30);
    expect(occurrences[1].planningMode).toBe("timed");
  });

  it("emits one fixed-assignee occurrence only when its date is in range", () => {
    const schedule = timedSchedule({
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
      schedule: timedSchedule({
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
      schedule: timedSchedule({
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

  it("materializes monthly schedules by ordinal weekday", () => {
    const occurrences = materializeOccurrences({
      schedule: timedSchedule({
        recurrence: {
          frequency: "monthly",
          interval: 1,
          monthlyPattern: "weekday_of_month",
          monthlyWeek: 3,
          monthlyWeekday: 3
        },
        startsOn: "2026-06-17"
      } as Partial<TimedTaskSchedule>),
      householdTimeZone: "America/New_York",
      rangeStart: "2026-06-01",
      rangeEnd: "2026-08-31"
    });

    expect(occurrences.map((occurrence) => occurrence.eligibleStartOn)).toEqual([
      "2026-06-17",
      "2026-07-15",
      "2026-08-19"
    ]);
  });

  it("materializes yearly schedules on the same month and day", () => {
    const occurrences = materializeOccurrences({
      schedule: timedSchedule({
        recurrence: { frequency: "yearly", interval: 2 },
        startsOn: "2026-09-15"
      } as Partial<TimedTaskSchedule>),
      householdTimeZone: "America/New_York",
      rangeStart: "2026-01-01",
      rangeEnd: "2031-12-31"
    });

    expect(occurrences.map((occurrence) => occurrence.eligibleStartOn)).toEqual([
      "2026-09-15",
      "2028-09-15",
      "2030-09-15"
    ]);
  });

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

  it("uses the configured local end time for spring-forward timed occurrences", () => {
    const occurrences = materializeOccurrences({
      schedule: timedSchedule({
        localStartTime: "01:30",
        localEndTime: "03:30",
        startsOn: "2026-03-08"
      }),
      householdTimeZone: "America/New_York",
      rangeStart: "2026-03-08",
      rangeEnd: "2026-03-08"
    });

    expect(occurrences[0]).toEqual(expect.objectContaining({
      plannedStartAt: "2026-03-08T06:30:00.000Z",
      plannedEndAt: "2026-03-08T07:30:00.000Z",
      estimatedMinutes: 120
    }));
  });

  it("uses the configured local end time for fall-back timed occurrences", () => {
    const occurrences = materializeOccurrences({
      schedule: timedSchedule({
        localStartTime: "00:30",
        localEndTime: "02:30",
        startsOn: "2026-11-01"
      }),
      householdTimeZone: "America/New_York",
      rangeStart: "2026-11-01",
      rangeEnd: "2026-11-01"
    });

    expect(occurrences[0]).toEqual(expect.objectContaining({
      plannedStartAt: "2026-11-01T04:30:00.000Z",
      plannedEndAt: "2026-11-01T07:30:00.000Z",
      estimatedMinutes: 120
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
      expect.objectContaining({
        sequence: 0,
        eligibleStartOn: "2026-05-30",
        eligibleEndOn: "2026-05-31",
        assignedUserId: "user-a"
      }),
      expect.objectContaining({
        sequence: 1,
        eligibleStartOn: "2026-06-06",
        eligibleEndOn: "2026-06-07",
        assignedUserId: "user-a"
      })
    ]);
    expect(occurrences.every((occurrence) => !("plannedStartAt" in occurrence))).toBe(true);
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

  it("anchors biweekly flexible weekend windows to the schedule start date", () => {
    const occurrences = materializeOccurrences({
      schedule: flexibleSchedule({
        recurrence: { frequency: "weekly", interval: 2, weekDays: [6, 0] },
        flexibleWindowRule: "once_within_selected_days",
        startsOn: "2026-05-30"
      }),
      householdTimeZone: "America/New_York",
      rangeStart: "2026-05-30",
      rangeEnd: "2026-06-14"
    });

    expect(occurrences.map((occurrence) => ({
      eligibleStartOn: occurrence.eligibleStartOn,
      eligibleEndOn: occurrence.eligibleEndOn
    }))).toEqual([
      { eligibleStartOn: "2026-05-30", eligibleEndOn: "2026-05-31" },
      { eligibleStartOn: "2026-06-13", eligibleEndOn: "2026-06-14" }
    ]);
  });

  it("rotates flexible assignments by obligation sequence rather than eligible day projection", () => {
    const occurrences = materializeOccurrences({
      schedule: flexibleSchedule({
        assignment: { mode: "rotation", memberUserIds: ["user-a", "user-b"] }
      }),
      householdTimeZone: "America/New_York",
      rangeStart: "2026-05-30",
      rangeEnd: "2026-06-07"
    });

    expect(occurrences.map((occurrence) => ({
      sequence: occurrence.sequence,
      assignedUserId: occurrence.assignedUserId
    }))).toEqual([
      { sequence: 0, assignedUserId: "user-a" },
      { sequence: 1, assignedUserId: "user-b" }
    ]);
  });
});
