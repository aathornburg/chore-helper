import {
  differenceInCalendarDays,
  differenceInCalendarMonths,
  eachDayOfInterval,
  format,
  getDay,
  parseISO
} from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { ChoreOccurrence, ChoreSchedule, FlexibleChoreSchedule, TimedChoreSchedule } from "@chore-helper/shared";

export type MaterializeInput = {
  schedule: ChoreSchedule;
  householdTimeZone: string;
  rangeStart: string;
  rangeEnd: string;
};

function isScheduledDate(schedule: ChoreSchedule, date: Date, startDate: Date) {
  const recurrence = schedule.recurrence;

  if (recurrence.frequency === "one_time") {
    return differenceInCalendarDays(date, startDate) === 0;
  }

  if (recurrence.frequency === "daily") {
    return differenceInCalendarDays(date, startDate) % recurrence.interval === 0;
  }

  if (recurrence.frequency === "weekly") {
    const weeksSinceStart = Math.floor(differenceInCalendarDays(date, startDate) / 7);
    return (
      weeksSinceStart % recurrence.interval === 0 &&
      Boolean(recurrence.weekDays?.includes(getDay(date)))
    );
  }

  const monthsSinceStart = differenceInCalendarMonths(date, startDate);
  return (
    monthsSinceStart % recurrence.interval === 0 &&
    date.getDate() === recurrence.monthlyDay
  );
}

function assigneeFor(schedule: ChoreSchedule, sequence: number) {
  return schedule.assignment.mode === "fixed"
    ? schedule.assignment.memberUserIds[0]
    : schedule.assignment.memberUserIds[sequence % schedule.assignment.memberUserIds.length];
}

function timedDurationMinutes(schedule: TimedChoreSchedule) {
  const [startHour, startMinute] = schedule.localStartTime.split(":").map(Number);
  const [endHour, endMinute] = schedule.localEndTime.split(":").map(Number);
  return (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
}

function createTimedOccurrence(
  schedule: TimedChoreSchedule,
  localDate: string,
  sequence: number,
  householdTimeZone: string
): ChoreOccurrence {
  const plannedStart = fromZonedTime(
    `${localDate}T${schedule.localStartTime}:00`,
    householdTimeZone
  );
  const plannedEnd = fromZonedTime(
    `${localDate}T${schedule.localEndTime}:00`,
    householdTimeZone
  );
  const estimatedMinutes = timedDurationMinutes(schedule);

  return {
    id: `${schedule.id}:${sequence}`,
    householdId: schedule.householdId,
    choreId: schedule.choreId,
    scheduleId: schedule.id,
    sequence,
    planningMode: "timed",
    plannedStartAt: plannedStart.toISOString(),
    plannedEndAt: plannedEnd.toISOString(),
    estimatedMinutes,
    eligibleStartOn: localDate,
    eligibleEndOn: localDate,
    assignedUserId: assigneeFor(schedule, sequence),
    exceptionType: "none",
    status: "planned"
  };
}

function createFlexibleOccurrence(
  schedule: FlexibleChoreSchedule,
  eligibleStartOn: string,
  eligibleEndOn: string,
  sequence: number
): ChoreOccurrence {
  return {
    id: `${schedule.id}:${sequence}`,
    householdId: schedule.householdId,
    choreId: schedule.choreId,
    scheduleId: schedule.id,
    sequence,
    planningMode: "flexible",
    estimatedMinutes: schedule.estimatedMinutes,
    eligibleStartOn,
    eligibleEndOn,
    assignedUserId: assigneeFor(schedule, sequence),
    exceptionType: "none",
    status: "planned"
  };
}

function flexibleWindows(schedule: FlexibleChoreSchedule, eligibleDates: string[]) {
  if (schedule.flexibleWindowRule === "each_selected_day") {
    return eligibleDates.map((date) => ({ startOn: date, endOn: date }));
  }

  const windows: Array<{ startOn: string; endOn: string }> = [];
  for (const date of eligibleDates) {
    const current = windows.at(-1);
    if (
      current &&
      differenceInCalendarDays(parseISO(date), parseISO(current.endOn)) === 1
    ) {
      current.endOn = date;
    } else {
      windows.push({ startOn: date, endOn: date });
    }
  }
  return windows;
}

export function materializeOccurrences({
  schedule,
  householdTimeZone,
  rangeStart,
  rangeEnd
}: MaterializeInput): ChoreOccurrence[] {
  const lastDate = schedule.endsOn && schedule.endsOn < rangeEnd ? schedule.endsOn : rangeEnd;
  if (lastDate < schedule.startsOn || rangeEnd < rangeStart) return [];

  const startDate = parseISO(schedule.startsOn);
  const eligibleDates: string[] = [];

  for (const date of eachDayOfInterval({ start: startDate, end: parseISO(lastDate) })) {
    if (!isScheduledDate(schedule, date, startDate)) continue;
    eligibleDates.push(format(date, "yyyy-MM-dd"));
  }

  if (schedule.planningMode === "flexible") {
    return flexibleWindows(schedule, eligibleDates)
      .map((window, sequence) => createFlexibleOccurrence(schedule, window.startOn, window.endOn, sequence))
      .filter((occurrence) =>
        occurrence.eligibleEndOn >= rangeStart && occurrence.eligibleStartOn <= rangeEnd
      );
  }

  const occurrences: ChoreOccurrence[] = [];
  let sequence = 0;

  for (const localDate of eligibleDates) {
    if (localDate >= rangeStart) {
      occurrences.push(createTimedOccurrence(schedule, localDate, sequence, householdTimeZone));
    }

    sequence += 1;
  }

  return occurrences;
}
