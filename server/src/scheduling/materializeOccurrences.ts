import {
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarYears,
  eachDayOfInterval,
  format,
  getDay,
  parseISO
} from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { FlexibleTaskSchedule, TaskOccurrence, TaskSchedule, TimedTaskSchedule } from "@chore-helper/shared";

export type MaterializeInput = {
  schedule: TaskSchedule;
  householdTimeZone: string;
  rangeStart: string;
  rangeEnd: string;
};

function isScheduledDate(schedule: TaskSchedule, date: Date, startDate: Date) {
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

  if (recurrence.frequency === "yearly") {
    const yearsSinceStart = differenceInCalendarYears(date, startDate);
    return (
      yearsSinceStart % recurrence.interval === 0 &&
      date.getMonth() === startDate.getMonth() &&
      date.getDate() === startDate.getDate()
    );
  }

  const monthsSinceStart = differenceInCalendarMonths(date, startDate);
  if (monthsSinceStart % recurrence.interval !== 0) return false;

  if (recurrence.monthlyPattern === "weekday_of_month") {
    const weekOfMonth = Math.ceil(date.getDate() / 7);
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const isLastMatchingWeekday = date.getDate() + 7 > lastDayOfMonth;
    return (
      getDay(date) === recurrence.monthlyWeekday &&
      (recurrence.monthlyWeek === -1 ? isLastMatchingWeekday : weekOfMonth === recurrence.monthlyWeek)
    );
  }

  return (
    date.getDate() === recurrence.monthlyDay
  );
}

function assigneeFor(schedule: TaskSchedule, sequence: number) {
  return schedule.assignment.mode === "fixed"
    ? schedule.assignment.memberUserIds[0]
    : schedule.assignment.memberUserIds[sequence % schedule.assignment.memberUserIds.length];
}

function timedDurationMinutes(schedule: TimedTaskSchedule) {
  const [startHour, startMinute] = schedule.localStartTime.split(":").map(Number);
  const [endHour, endMinute] = schedule.localEndTime.split(":").map(Number);
  return (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
}

function recurrenceIdentity(schedule: TaskSchedule) {
  const recurrence = schedule.recurrence;
  return [
    schedule.planningMode,
    schedule.startsOn,
    recurrence.frequency,
    recurrence.interval,
    (recurrence.weekDays ?? []).join("."),
    recurrence.monthlyPattern ?? "",
    recurrence.monthlyDay ?? "",
    recurrence.monthlyWeek ?? "",
    recurrence.monthlyWeekday ?? ""
  ].join(":");
}

function timedOccurrenceId(schedule: TimedTaskSchedule, localDate: string) {
  return [
    schedule.id,
    recurrenceIdentity(schedule),
    localDate
  ].join(":");
}

function flexibleOccurrenceId(schedule: FlexibleTaskSchedule, eligibleStartOn: string, eligibleEndOn: string) {
  return [
    schedule.id,
    recurrenceIdentity(schedule),
    eligibleStartOn,
    eligibleEndOn
  ].join(":");
}

function createTimedOccurrence(
  schedule: TimedTaskSchedule,
  localDate: string,
  sequence: number,
  householdTimeZone: string
): TaskOccurrence {
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
    id: timedOccurrenceId(schedule, localDate),
    householdId: schedule.householdId,
    taskId: schedule.taskId,
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
  schedule: FlexibleTaskSchedule,
  eligibleStartOn: string,
  eligibleEndOn: string,
  sequence: number
): TaskOccurrence {
  return {
    id: flexibleOccurrenceId(schedule, eligibleStartOn, eligibleEndOn),
    householdId: schedule.householdId,
    taskId: schedule.taskId,
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

function flexibleWindows(schedule: FlexibleTaskSchedule, eligibleDates: string[]) {
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
}: MaterializeInput): TaskOccurrence[] {
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

  const occurrences: TaskOccurrence[] = [];
  let sequence = 0;

  for (const localDate of eligibleDates) {
    if (localDate >= rangeStart) {
      occurrences.push(createTimedOccurrence(schedule, localDate, sequence, householdTimeZone));
    }

    sequence += 1;
  }

  return occurrences;
}
