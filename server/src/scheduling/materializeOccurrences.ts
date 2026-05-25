import {
  addMinutes,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  eachDayOfInterval,
  format,
  getDay,
  parseISO
} from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { ChoreOccurrence, ChoreSchedule } from "@chore-helper/shared";

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
    const weeksSinceStart = differenceInCalendarWeeks(date, startDate, { weekStartsOn: 0 });
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

export function materializeOccurrences({
  schedule,
  householdTimeZone,
  rangeStart,
  rangeEnd
}: MaterializeInput): ChoreOccurrence[] {
  const lastDate = schedule.endsOn && schedule.endsOn < rangeEnd ? schedule.endsOn : rangeEnd;
  if (lastDate < schedule.startsOn || rangeEnd < rangeStart) return [];

  const startDate = parseISO(schedule.startsOn);
  const occurrences: ChoreOccurrence[] = [];
  let sequence = 0;

  for (const date of eachDayOfInterval({ start: startDate, end: parseISO(lastDate) })) {
    if (!isScheduledDate(schedule, date, startDate)) continue;

    const localDate = format(date, "yyyy-MM-dd");
    if (localDate >= rangeStart) {
      const plannedStart = fromZonedTime(
        `${localDate}T${schedule.localStartTime}:00`,
        householdTimeZone
      );

      occurrences.push({
        id: `${schedule.id}:${sequence}`,
        householdId: schedule.householdId,
        choreId: schedule.choreId,
        scheduleId: schedule.id,
        sequence,
        plannedStartAt: plannedStart.toISOString(),
        plannedEndAt: addMinutes(plannedStart, schedule.plannedMinutes).toISOString(),
        assignedUserId: schedule.assignment.mode === "fixed"
          ? schedule.assignment.memberUserIds[0]
          : schedule.assignment.memberUserIds[sequence % schedule.assignment.memberUserIds.length],
        exceptionType: "none",
        status: "planned"
      });
    }

    sequence += 1;
  }

  return occurrences;
}
