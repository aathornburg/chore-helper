import { addDays, addMinutes, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { useEffect, useMemo, useState } from "react";
import type { CalendarImportQueueItem, ChoreOccurrence, ChoreSchedule, CleanlyCalendarEvent, CompletionCheckInInput, HouseholdAppData, HouseholdMemberSummary, ScheduleInput } from "@chore-helper/shared";
import { completeOccurrence, createScheduledChore, decideCalendarImportQueueItem, exportCleanlyCalendarEvents, getCurrentUser, listCalendarImportQueue, listCleanlyCalendarEvents, listHouseholdMembers, listOccurrences, listSchedules, skipOccurrence, updateOccurrence, updateSchedule as updateScheduleApi } from "../api";
import type { Navigate } from "../types";

type WorkspaceView = "calendar" | "list";
type CalendarScale = "month" | "week" | "day";
type CalendarFilters = { householdId?: string; assignedUserId?: string; status?: string; planningMode?: string };
type EditorMode = "closed" | "create" | "view" | "edit";
type OccurrenceCardDensity = "title" | "summary";
type ScheduleDraft = ScheduleInput & { key: string };
type EditorDraft = {
  choreId?: string;
  title: string;
  instructions: string;
  tags: string;
  startTime: string;
  schedules: ScheduleDraft[];
};

type CompletionCheckInDraft = Required<Pick<CompletionCheckInInput, "completedOnTime" | "durationAccurate" | "rebaseFutureOccurrences">>;

type CalendarPageProps = {
  households: HouseholdAppData[];
  isLoading: boolean;
  onNavigate: Navigate;
};

const scaleOptions: CalendarScale[] = ["month", "week", "day"];
const weekdays = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 }
];
const timedSlots = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

function memberLabel(member: HouseholdMemberSummary) {
  return member.displayName ?? member.primaryEmail ?? member.clerkUserId;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function durationInMinutes(occurrence: ChoreOccurrence) {
  return occurrence.estimatedMinutes;
}

function rangeForView(date: Date, view: CalendarScale, timeZone: string) {
  const startDate = view === "month"
    ? startOfMonth(date)
    : view === "week"
      ? startOfWeek(date, { weekStartsOn: 0 })
      : date;
  const endDate = view === "month"
    ? endOfMonth(date)
    : view === "week"
      ? endOfWeek(date, { weekStartsOn: 0 })
      : date;
  const startOn = format(startDate, "yyyy-MM-dd");
  const endOn = format(endDate, "yyyy-MM-dd");
  return {
    startAt: fromZonedTime(`${startOn}T00:00:00`, timeZone).toISOString(),
    endAt: fromZonedTime(`${endOn}T23:59:59`, timeZone).toISOString(),
    startOn,
    endOn
  };
}

function listRange(timeZone: string) {
  const startOn = format(new Date(), "yyyy-MM-dd");
  const endOn = format(addDays(new Date(), 30), "yyyy-MM-dd");
  return {
    startAt: fromZonedTime(`${startOn}T00:00:00`, timeZone).toISOString(),
    endAt: fromZonedTime(`${endOn}T23:59:59`, timeZone).toISOString(),
    startOn,
    endOn
  };
}

function displayDates(occurrence: ChoreOccurrence) {
  if (occurrence.status === "completed" && occurrence.completedAt) {
    return [parseISO(occurrence.completedAt)];
  }
  if (occurrence.planningMode === "flexible" && occurrence.status === "planned") {
    return eachDayOfInterval({ start: parseISO(occurrence.eligibleStartOn), end: parseISO(occurrence.eligibleEndOn) });
  }
  return [parseISO(occurrence.eligibleStartOn)];
}

function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function longDateLabel(date: Date) {
  return format(date, "EEEE, MMM d");
}

function createEmptyTimedScheduleDraft(): ScheduleDraft {
  return {
    key: crypto.randomUUID(),
    planningMode: "timed",
    recurrence: { frequency: "weekly", interval: 1, weekDays: [1] },
    localStartTime: "09:00",
    localEndTime: "10:00",
    startsOn: format(new Date(), "yyyy-MM-dd"),
    assignment: { mode: "fixed", memberUserIds: [] }
  };
}

function createEmptyFlexibleScheduleDraft(): ScheduleDraft {
  return {
    key: crypto.randomUUID(),
    planningMode: "flexible",
    recurrence: { frequency: "weekly", interval: 1, weekDays: [6, 0] },
    flexibleWindowRule: "once_within_selected_days",
    estimatedMinutes: 60,
    startsOn: format(new Date(), "yyyy-MM-dd"),
    assignment: { mode: "fixed", memberUserIds: [] }
  };
}

function createDefaultOneTimeScheduleDraft(): ScheduleDraft {
  return {
    key: crypto.randomUUID(),
    planningMode: "flexible",
    recurrence: { frequency: "one_time", interval: 1 },
    flexibleWindowRule: "each_selected_day",
    estimatedMinutes: 60,
    startsOn: format(new Date(), "yyyy-MM-dd"),
    assignment: { mode: "fixed", memberUserIds: [] }
  };
}

function timeAfterMinutes(startTime: string, minutes: number) {
  const [hour, minute] = startTime.split(":").map(Number);
  const totalMinutes = hour * 60 + minute + minutes;
  const endHour = Math.floor(totalMinutes / 60);
  const endMinute = totalMinutes % 60;
  return `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
}

function timeSlotLabel(slot: string) {
  const [hour, minute] = slot.split(":").map(Number);
  const period = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function orderCompletedLast(occurrencesForDay: ChoreOccurrence[]) {
  const completedOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status === "completed");
  const activeOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status !== "completed");
  return [...activeOccurrences, ...completedOccurrences];
}

function ChevronIcon({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20">
      <path
        d={direction === "previous" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function minutesBetween(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  return Math.max(1, endTotal >= startTotal ? endTotal - startTotal : endTotal + 24 * 60 - startTotal);
}

function ordinal(value: number) {
  if (value === -1) return "last";
  return ["first", "second", "third", "fourth"][value - 1] ?? `${value}th`;
}

function weekOfMonth(dateValue: string) {
  return Math.ceil(parseISO(dateValue).getDate() / 7);
}

function monthlyWeekdayLabel(dateValue: string) {
  return `${ordinal(weekOfMonth(dateValue))} ${format(parseISO(dateValue), "EEEE")}`;
}

function weekdayIndex(dateValue: string) {
  return parseISO(dateValue).getDay();
}

function tagsFromText(value: string) {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function scheduleToDraft(schedule: ChoreSchedule): ScheduleDraft {
  return {
    ...schedule,
    key: schedule.id
  };
}

export function CalendarPage({ households, isLoading, onNavigate }: CalendarPageProps) {
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("calendar");
  const [calendarScale, setCalendarScale] = useState<CalendarScale>("month");
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [filters, setFilters] = useState<CalendarFilters>({});
  const [members, setMembers] = useState<HouseholdMemberSummary[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [occurrences, setOccurrences] = useState<ChoreOccurrence[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [editorMode, setEditorMode] = useState<EditorMode>("closed");
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string>();
  const [editorDraft, setEditorDraft] = useState<EditorDraft>();
  const [editorStatus, setEditorStatus] = useState<string>();
  const [scheduleAccordionOpen, setScheduleAccordionOpen] = useState(false);
  const [completionCheckIn, setCompletionCheckIn] = useState<CompletionCheckInDraft>();
  const [draggingId, setDraggingId] = useState<string>();
  const [createdChoreTitles, setCreatedChoreTitles] = useState(() => new Map<string, string>());
  const [importQueueItems, setImportQueueItems] = useState<CalendarImportQueueItem[]>([]);
  const [cleanlyCalendarEvents, setCleanlyCalendarEvents] = useState<CleanlyCalendarEvent[]>([]);
  const [selectedQueueItemId, setSelectedQueueItemId] = useState<string>();
  const [queueTypeDrafts, setQueueTypeDrafts] = useState(() => new Map<string, CalendarImportQueueItem["proposedType"]>());
  const [calendarSyncStatus, setCalendarSyncStatus] = useState<string>();

  const selectedHousehold = households.find((household) => household.id === filters.householdId) ?? households[0];
  const timeZone = selectedHousehold?.timeZone ?? "UTC";
  const isOwner = members.some((member) => member.userId === currentUserId && member.role === "owner");
  const visibleOccurrences = occurrences.filter((occurrence) =>
    (!filters.status || filters.status === "all" || occurrence.status === filters.status) &&
    (!filters.planningMode || filters.planningMode === "all" || occurrence.planningMode === filters.planningMode)
  );
  const selectedOccurrence = occurrences.find((occurrence) => occurrence.id === selectedOccurrenceId);
  const selectedQueueItem = importQueueItems.find((item) => item.id === selectedQueueItemId) ?? importQueueItems[0];

  useEffect(() => {
    if (!selectedHousehold) return;
    setFilters((current) => current.householdId ? current : { ...current, householdId: selectedHousehold.id });
  }, [selectedHousehold]);

  useEffect(() => {
    if (!selectedHousehold) return;
    let cancelled = false;
    void Promise.all([getCurrentUser(), listHouseholdMembers(selectedHousehold.id)])
      .then(([user, householdMembers]) => {
        if (!cancelled) {
          setCurrentUserId(user.id);
          setMembers(householdMembers);
        }
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedHousehold?.id]);

  useEffect(() => {
    if (!selectedHousehold || !isOwner) {
      setImportQueueItems([]);
      setSelectedQueueItemId(undefined);
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

  useEffect(() => {
    if (!selectedHousehold) return;
    let cancelled = false;
    setLoadState("loading");
    const range = workspaceView === "list" ? listRange(timeZone) : rangeForView(focusDate, calendarScale, timeZone);
    void listOccurrences(selectedHousehold.id, {
      ...range,
      ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {})
    }).then((loaded) => {
      if (!cancelled) {
        setOccurrences(loaded);
        setLoadState("ready");
      }
    }).catch(() => {
      if (!cancelled) setLoadState("error");
    });
    return () => {
      cancelled = true;
    };
  }, [calendarScale, filters.assignedUserId, focusDate, selectedHousehold?.id, timeZone, workspaceView]);

  useEffect(() => {
    if (!selectedHousehold) return;
    let cancelled = false;
    const range = workspaceView === "list" ? listRange(timeZone) : rangeForView(focusDate, calendarScale, timeZone);
    void listCleanlyCalendarEvents(selectedHousehold.id, { startAt: range.startAt, endAt: range.endAt })
      .then((events) => {
        if (!cancelled) setCleanlyCalendarEvents(events);
      })
      .catch(() => {
        if (!cancelled) setCleanlyCalendarEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [calendarScale, focusDate, selectedHousehold?.id, timeZone, workspaceView]);

  const choreTitles = useMemo(() => new Map(
    [...(selectedHousehold?.chores ?? []).map((chore) => [chore.id, chore.title] as const), ...createdChoreTitles]
  ), [createdChoreTitles, selectedHousehold]);

  const occurrenceDateBuckets = useMemo(() => {
    const groups = new Map<string, ChoreOccurrence[]>();
    for (const occurrence of visibleOccurrences) {
      for (const date of displayDates(occurrence)) {
        const key = dateKey(date);
        groups.set(key, [...(groups.get(key) ?? []), occurrence]);
      }
    }
    return groups;
  }, [visibleOccurrences]);

  const cleanlyEventDateBuckets = useMemo(() => {
    const groups = new Map<string, CleanlyCalendarEvent[]>();
    for (const event of cleanlyCalendarEvents) {
      const key = formatInTimeZone(event.startsAt, timeZone, "yyyy-MM-dd");
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return groups;
  }, [cleanlyCalendarEvents, timeZone]);

  const listGroups = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return Array.from(occurrenceDateBuckets.entries())
      .filter(([date]) => date >= today)
      .sort(([first], [second]) => first.localeCompare(second));
  }, [occurrenceDateBuckets]);

  const listStatusCounts = useMemo(() => {
    const listOccurrences = listGroups.flatMap(([, dateOccurrences]) => dateOccurrences);
    return {
      planned: listOccurrences.filter((occurrence) => occurrence.status === "planned").length,
      completed: listOccurrences.filter((occurrence) => occurrence.status === "completed").length,
      skipped: listOccurrences.filter((occurrence) => occurrence.status === "skipped").length
    };
  }, [listGroups]);

  const monthDates = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(focusDate), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(focusDate), { weekStartsOn: 0 })
  }), [focusDate]);

  const weekDates = useMemo(() => eachDayOfInterval({
    start: startOfWeek(focusDate, { weekStartsOn: 0 }),
    end: endOfWeek(focusDate, { weekStartsOn: 0 })
  }), [focusDate]);

  const periodLabel = calendarScale === "month"
    ? formatInTimeZone(focusDate, timeZone, "MMMM yyyy")
    : calendarScale === "week"
      ? `${format(weekDates[0], "MMM d")} - ${format(weekDates[weekDates.length - 1], "MMM d, yyyy")}`
      : format(focusDate, "EEEE, MMM d, yyyy");

  const periodUnit = calendarScale;

  function moveFocusDate(direction: -1 | 1) {
    setFocusDate((date) =>
      calendarScale === "month"
        ? addMonths(date, direction)
        : calendarScale === "week"
          ? addWeeks(date, direction)
          : addDays(date, direction)
    );
  }

  function occurrenceTitle(occurrence: ChoreOccurrence) {
    return choreTitles.get(occurrence.choreId) ?? "Scheduled chore";
  }

  function assignedMemberLabel(occurrence: ChoreOccurrence) {
    const member = members.find((item) =>
      item.userId === occurrence.assignedUserId || item.clerkUserId === occurrence.assignedUserId
    );
    if (member) return memberLabel(member);
    if (occurrence.assignedUserId === currentUserId) return "You";
    return occurrence.assignedUserId ? "Unknown member" : "Unassigned";
  }

  function seedDraftAssignees(draft: ScheduleDraft): ScheduleDraft {
    const firstMember = members[0]?.userId ?? currentUserId ?? "";
    return {
      ...draft,
      assignment: {
        ...draft.assignment,
        memberUserIds: draft.assignment.memberUserIds.length ? draft.assignment.memberUserIds : [firstMember].filter(Boolean)
      }
    };
  }

  function openCreateEditor() {
    setSelectedOccurrenceId(undefined);
    setEditorStatus(undefined);
    setScheduleAccordionOpen(false);
    setCompletionCheckIn(undefined);
    setEditorDraft({
      title: "",
      instructions: "",
      tags: "",
      startTime: "",
      schedules: [seedDraftAssignees(createDefaultOneTimeScheduleDraft())]
    });
    setEditorMode("create");
  }

  function draftFromOccurrence(occurrence: ChoreOccurrence): EditorDraft {
    const chore = selectedHousehold?.chores.find((item) => item.id === occurrence.choreId);
    const scheduleDraft = (occurrence.planningMode === "flexible"
      ? {
          ...createEmptyFlexibleScheduleDraft(),
          key: occurrence.scheduleId,
          recurrence: { frequency: "one_time", interval: 1 },
          flexibleWindowRule: "each_selected_day",
          startsOn: occurrence.eligibleStartOn,
          estimatedMinutes: occurrence.estimatedMinutes,
          assignment: { mode: "fixed", memberUserIds: [occurrence.assignedUserId] }
        }
      : {
          ...createEmptyTimedScheduleDraft(),
          key: occurrence.scheduleId,
          recurrence: { frequency: "one_time", interval: 1 },
          startsOn: occurrence.eligibleStartOn,
          localStartTime: occurrence.plannedStartAt ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "HH:mm") : "09:00",
          localEndTime: occurrence.plannedEndAt ? formatInTimeZone(occurrence.plannedEndAt, timeZone, "HH:mm") : "10:00",
          assignment: { mode: "fixed", memberUserIds: [occurrence.assignedUserId] }
        }) as ScheduleDraft;
    return {
      choreId: occurrence.choreId,
      title: occurrenceTitle(occurrence),
      instructions: chore?.instructions ?? "",
      tags: chore?.tags?.join(", ") ?? "",
      startTime: occurrence.plannedStartAt ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "HH:mm") : "",
      schedules: [seedDraftAssignees(scheduleDraft)]
    };
  }

  function loadScheduleDetailsForEditor(occurrence: ChoreOccurrence) {
    if (!selectedHousehold) return;

    void listSchedules(selectedHousehold.id, occurrence.choreId)
      .then((loadedSchedules) => {
        setEditorDraft((current) => current?.choreId === occurrence.choreId ? {
          ...current,
          schedules: loadedSchedules.map(scheduleToDraft)
        } : current);
      })
      .catch(() => setEditorStatus("Could not load schedule details."));
  }

  function openViewEditor(occurrence: ChoreOccurrence) {
    setSelectedOccurrenceId(occurrence.id);
    setEditorStatus(undefined);
    setScheduleAccordionOpen(false);
    setCompletionCheckIn(undefined);
    setEditorDraft(draftFromOccurrence(occurrence));
    loadScheduleDetailsForEditor(occurrence);
    setEditorMode("view");
  }

  function openEditEditor(occurrence: ChoreOccurrence) {
    setSelectedOccurrenceId(occurrence.id);
    setEditorStatus(undefined);
    setScheduleAccordionOpen(false);
    setCompletionCheckIn(undefined);
    setEditorDraft(draftFromOccurrence(occurrence));
    loadScheduleDetailsForEditor(occurrence);
    setEditorMode("edit");
  }

  function updateScheduleDraft(index: number, update: Partial<ScheduleDraft>) {
    setEditorDraft((current) => current ? {
      ...current,
      schedules: current.schedules.map((schedule, scheduleIndex) =>
        scheduleIndex === index ? ({ ...schedule, ...update } as ScheduleDraft) : schedule
      )
    } : current);
  }

  function updatePrimarySchedule(update: Partial<ScheduleDraft>) {
    updateScheduleDraft(0, update);
  }

  function updatePrimaryRecurrenceFrequency(frequency: ScheduleInput["recurrence"]["frequency"]) {
    if (!editorDraft?.schedules[0]) return;
    const schedule = editorDraft.schedules[0];
    updatePrimarySchedule({
      recurrence: {
        ...schedule.recurrence,
        frequency,
        weekDays: frequency === "weekly" ? (schedule.recurrence.weekDays ?? [parseISO(schedule.startsOn).getDay()]) : undefined,
        monthlyPattern: frequency === "monthly" ? (schedule.recurrence.monthlyPattern ?? "day_of_month") : undefined,
        monthlyDay: frequency === "monthly" ? (schedule.recurrence.monthlyDay ?? parseISO(schedule.startsOn).getDate()) : undefined,
        monthlyWeek: frequency === "monthly" ? (schedule.recurrence.monthlyWeek ?? weekOfMonth(schedule.startsOn)) : undefined,
        monthlyWeekday: frequency === "monthly" ? (schedule.recurrence.monthlyWeekday ?? weekdayIndex(schedule.startsOn)) : undefined
      }
    });
  }

  async function saveCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedHousehold || !editorDraft) return;
    try {
      const schedules = editorDraft.schedules.map(({ key: _key, ...schedule }) => {
        if (editorDraft.startTime.trim() && schedule.planningMode === "flexible") {
          return {
            planningMode: "timed" as const,
            recurrence: schedule.recurrence,
            startsOn: schedule.startsOn,
            ...(schedule.endsOn ? { endsOn: schedule.endsOn } : {}),
            assignment: schedule.assignment,
            localStartTime: editorDraft.startTime,
            localEndTime: timeAfterMinutes(editorDraft.startTime, schedule.estimatedMinutes)
          };
        }
        return schedule;
      });
      const created = await createScheduledChore(selectedHousehold.id, {
        chore: {
          title: editorDraft.title,
          source: "manual",
          ...(editorDraft.instructions.trim() ? { instructions: editorDraft.instructions.trim() } : {}),
          tags: tagsFromText(editorDraft.tags)
        },
        schedules
      });
      selectedHousehold.chores.push({ ...created.chore, recommendations: [] });
      setCreatedChoreTitles((current) => new Map(current).set(created.chore.id, created.chore.title));
      await reloadOccurrences();
      setEditorMode("closed");
      setEditorDraft(undefined);
      setEditorStatus("Chore saved.");
    } catch {
      setEditorStatus("Could not save chore.");
    }
  }

  async function saveUpdate(occurrence: ChoreOccurrence, localStart: string, minutes: number, assignedUserId: string) {
    if (!selectedHousehold || !occurrence.plannedStartAt) return;
    const plannedStart = fromZonedTime(localStart, timeZone);
    const updated = await updateOccurrence(selectedHousehold.id, occurrence.id, {
      plannedStartAt: plannedStart.toISOString(),
      plannedEndAt: addMinutes(plannedStart, minutes).toISOString(),
      assignedUserId
    });
    setOccurrences((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  async function reloadOccurrences() {
    if (!selectedHousehold) return;
    const range = workspaceView === "list" ? listRange(timeZone) : rangeForView(focusDate, calendarScale, timeZone);
    const loaded = await listOccurrences(selectedHousehold.id, {
      ...range,
      ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {})
    });
    setOccurrences(loaded);
  }

  async function handleScheduleSeriesSave() {
    if (!selectedHousehold || !editorDraft) return;
    try {
      const savedSchedules = await Promise.all(editorDraft.schedules.map(({ key, ...schedule }) =>
        updateScheduleApi(selectedHousehold.id, key, schedule)
      ));
      setEditorDraft((current) => current ? {
        ...current,
        schedules: savedSchedules.map(scheduleToDraft)
      } : current);
      await reloadOccurrences();
      setEditorStatus("Schedule saved.");
    } catch {
      setEditorStatus("Could not save schedule.");
    }
  }

  async function handleSkip() {
    if (!selectedHousehold || !selectedOccurrence) return;
    const updated = await skipOccurrence(selectedHousehold.id, selectedOccurrence.id);
    setOccurrences((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  async function handleComplete(occurrence: ChoreOccurrence, checkIn?: CompletionCheckInInput) {
    if (!selectedHousehold) return;
    const updated = await completeOccurrence(selectedHousehold.id, occurrence.id, checkIn);
    setOccurrences((current) =>
      current.map((item) => item.id === updated.id ? updated : item)
    );
    if (selectedOccurrenceId === occurrence.id) {
      setEditorMode("closed");
      setSelectedOccurrenceId(undefined);
    }
  }

  async function decideQueueItem(item: CalendarImportQueueItem, decision: "approve" | "reject") {
    if (!selectedHousehold) return;
    const updated = await decideCalendarImportQueueItem(selectedHousehold.id, item.id, {
      decision,
      proposedType: queueTypeDrafts.get(item.id) ?? item.proposedType
    });
    setImportQueueItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
  }

  async function handleDrop(slot: string) {
    const occurrence = occurrences.find((item) => item.id === draggingId);
    if (!occurrence?.plannedStartAt) return;
    const date = formatInTimeZone(occurrence.plannedStartAt, timeZone, "yyyy-MM-dd");
    await saveUpdate(occurrence, `${date}T${slot}`, durationInMinutes(occurrence), occurrence.assignedUserId);
    setDraggingId(undefined);
  }

  function occurrenceDateLine(occurrence: ChoreOccurrence) {
    if (occurrence.planningMode === "flexible") {
      return `Anytime / ${durationInMinutes(occurrence)} min`;
    }
    return `${occurrence.plannedStartAt ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "h:mm a") : "Anytime"} / ${durationInMinutes(occurrence)} min`;
  }

  function occurrenceStatusLabel(occurrence: ChoreOccurrence) {
    return occurrence.status === "completed" ? "Completed" : occurrence.status === "skipped" ? "Skipped" : "Planned";
  }

  function occurrenceCompletionLine(occurrence: ChoreOccurrence) {
    return occurrence.completedAt
      ? `Completed ${formatInTimeZone(occurrence.completedAt, timeZone, "h:mm a")}`
      : occurrenceStatusLabel(occurrence);
  }

  function isFlexibleOverdue(occurrence: ChoreOccurrence) {
    return occurrence.planningMode === "flexible" &&
      occurrence.status === "planned" &&
      occurrence.eligibleEndOn < format(new Date(), "yyyy-MM-dd");
  }

  function occurrencePrimaryDate(occurrence: ChoreOccurrence) {
    if (occurrence.status === "completed" && occurrence.completedAt) {
      return formatInTimeZone(occurrence.completedAt, timeZone, "yyyy-MM-dd");
    }
    return occurrence.plannedStartAt
      ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "yyyy-MM-dd")
      : occurrence.eligibleStartOn;
  }

  function relatedOccurrences(status: "upcoming" | "history") {
    if (!selectedOccurrence) return [];
    return occurrences
      .filter((occurrence) =>
        occurrence.choreId === selectedOccurrence.choreId &&
        occurrence.scheduleId === selectedOccurrence.scheduleId &&
        (status === "upcoming" ? occurrence.status === "planned" : occurrence.status !== "planned")
      )
      .sort((first, second) => occurrencePrimaryDate(first).localeCompare(occurrencePrimaryDate(second)));
  }

  function relatedOccurrenceDateRows(status: "upcoming" | "history") {
    return relatedOccurrences(status)
      .flatMap((occurrence) => displayDates(occurrence).map((date) => ({ occurrence, date })))
      .sort((first, second) => dateKey(first.date).localeCompare(dateKey(second.date)));
  }

  function selectedOccurrenceCanRebaseFuture() {
    const selectedSchedule = editorDraft?.schedules.find((schedule) => schedule.key === selectedOccurrence?.scheduleId);
    return Boolean(
      selectedSchedule &&
      selectedSchedule.recurrence.frequency !== "one_time" &&
      selectedSchedule.recurrence.frequency !== "daily"
    );
  }

  function renderChoreViewDetailSections() {
    if (!selectedOccurrence || !editorDraft) return null;

    return (
      <>
        <div className="chore-view-summary">
          <span>{occurrenceDateLine(selectedOccurrence)}</span>
          <span>{assignedMemberLabel(selectedOccurrence)}</span>
          <span>{format(parseISO(occurrencePrimaryDate(selectedOccurrence)), "EEEE, MMM d")}</span>
        </div>
        {editorDraft.instructions ? (
          <section className="schedule-card">
            <strong>Instructions</strong>
            <span>{editorDraft.instructions}</span>
          </section>
        ) : null}
        {editorDraft.tags ? (
          <section className="schedule-card">
            <strong>Tags</strong>
            <span>{editorDraft.tags}</span>
          </section>
        ) : null}
        <section className="schedule-occurrence-section" aria-label="Upcoming occurrences">
          <h3>Upcoming Occurrences</h3>
          <div className="schedule-occurrence-list">
            {relatedOccurrenceDateRows("upcoming").slice(0, 4).map(({ occurrence, date }) => (
              <article className="schedule-occurrence-row" key={`${occurrence.id}-${dateKey(date)}`}>
                <span>{format(date, "EEEE, MMM d")}</span>
                <span>{occurrenceDateLine(occurrence)}</span>
              </article>
            ))}
          </div>
        </section>
        <section className="schedule-occurrence-section" aria-label="Historical occurrences">
          <h3>History</h3>
          <div className="schedule-occurrence-list">
            {relatedOccurrenceDateRows("history").slice(0, 4).map(({ occurrence, date }) => (
              <article className="schedule-occurrence-row" key={`${occurrence.id}-${dateKey(date)}`}>
                <span>{format(date, "EEEE, MMM d")}</span>
                <span>{capitalize(occurrence.status)}</span>
              </article>
            ))}
          </div>
        </section>
      </>
    );
  }

  function startCompletionCheckIn() {
    setScheduleAccordionOpen(false);
    setCompletionCheckIn({
      completedOnTime: true,
      durationAccurate: true,
      rebaseFutureOccurrences: false
    });
  }

  function renderOccurrenceCompact(occurrence: ChoreOccurrence, date: Date, density: OccurrenceCardDensity) {
    const title = occurrenceTitle(occurrence);
    return (
      <button
        aria-label={`View ${title}`}
        className={`calendar-work-item calendar-chore-row is-chore ${density === "summary" ? "is-summary" : ""} ${occurrence.status === "completed" ? "is-completed" : ""} ${occurrence.status === "skipped" ? "is-skipped" : ""}`}
        draggable={isOwner && calendarScale !== "month" && occurrence.status === "planned" && occurrence.planningMode === "timed"}
        key={`${occurrence.id}-${dateKey(date)}`}
        onClick={() => openViewEditor(occurrence)}
        onDragStart={() => setDraggingId(occurrence.id)}
        title={title}
        type="button"
      >
        {occurrence.status === "completed" ? (
          <span className="calendar-status-icon" aria-hidden="true">✓</span>
        ) : null}
        <span className="calendar-chore-main">
          <span className="calendar-chore-title">{title}</span>
          {density === "summary" ? (
            <>
            <span className="calendar-chore-detail">{`${occurrenceDateLine(occurrence)} · ${assignedMemberLabel(occurrence)}`}</span>
            {isFlexibleOverdue(occurrence) ? <span className="occurrence-overdue-badge">Overdue</span> : null}
            </>
          ) : null}
        </span>
      </button>
    );
  }

  function renderMonthOccurrence(occurrence: ChoreOccurrence, date: Date) {
    const title = occurrenceTitle(occurrence);
    return (
      <button
        aria-label={`View ${title}`}
        className={`calendar-work-item calendar-chore-row is-chore ${occurrence.status === "completed" ? "is-completed" : ""} ${occurrence.status === "skipped" ? "is-skipped" : ""}`}
        key={`${occurrence.id}-${dateKey(date)}`}
        onClick={() => openViewEditor(occurrence)}
        title={title}
        type="button"
      >
        {occurrence.status === "completed" ? (
          <span className="calendar-status-icon" aria-hidden="true">✓</span>
        ) : null}
        <span className="calendar-chore-main">
          <span className="calendar-chore-title">{title}</span>
        </span>
      </button>
    );
  }

  function renderAgendaOccurrence(occurrence: ChoreOccurrence, date: Date) {
    const title = occurrenceTitle(occurrence);
    return (
      <button
        aria-label={`View ${title}`}
        className={`calendar-work-item calendar-chore-row calendar-agenda-row is-chore is-${occurrence.status}`}
        key={`${occurrence.id}-${dateKey(date)}`}
        onClick={() => openViewEditor(occurrence)}
        title={title}
        type="button"
      >
        {occurrence.status === "completed" ? (
          <span className="calendar-status-icon" aria-hidden="true">✓</span>
        ) : null}
        <span className="calendar-chore-main">
          <span className="calendar-chore-title">{title}</span>
          <span className="calendar-chore-detail">{occurrence.status === "completed" ? occurrenceCompletionLine(occurrence) : occurrenceDateLine(occurrence)}</span>
        </span>
        <span className="calendar-chore-meta">
          <span>{assignedMemberLabel(occurrence)}</span>
          <span>{durationInMinutes(occurrence)} min</span>
        </span>
        <span className={`agenda-status-chip is-${occurrence.status}`}>{occurrenceStatusLabel(occurrence)}</span>
      </button>
    );
  }

  function renderCleanlyCalendarEvent(event: CleanlyCalendarEvent, compact = true) {
    return (
      <div
        className={`calendar-work-item calendar-chore-row calendar-cleanly-event is-${event.type}`}
        key={event.id}
        title={event.privacyTitle}
      >
        <span className="calendar-chore-main">
          <span className="calendar-chore-title">{event.privacyTitle}</span>
          {!compact ? (
            <span className="calendar-chore-detail">
              {formatInTimeZone(event.startsAt, timeZone, "MMM d, h:mm a")} - {formatInTimeZone(event.endsAt, timeZone, "h:mm a")}
            </span>
          ) : null}
        </span>
      </div>
    );
  }

  function handleExportCleanlyEvents() {
    if (!selectedHousehold) return;
    void exportCleanlyCalendarEvents(selectedHousehold.id, cleanlyCalendarEvents.map((event) => event.id))
      .then((result) => setCalendarSyncStatus(`${result.exported} calendar event${result.exported === 1 ? "" : "s"} exported.`))
      .catch(() => setCalendarSyncStatus("Could not export calendar events. Choose an export destination in Settings first."));
  }

  function renderMonthCalendar() {
    const rangeLabel = format(focusDate, "MMMM yyyy");
    const monthWeeks = Array.from({ length: Math.ceil(monthDates.length / 7) }, (_item, index) =>
      monthDates.slice(index * 7, index * 7 + 7)
    );
    return (
      <section className="calendar-month-panel">
        <div className="calendar-month-grid" role="grid" aria-label={`${rangeLabel} month calendar`}>
          <div className="calendar-month-week calendar-month-week-header" role="row">
            {weekdays.map((weekday) => (
              <div className="calendar-weekday-header" key={weekday.value} role="columnheader">{weekday.label}</div>
            ))}
          </div>
          {monthWeeks.map((weekDatesInMonth) => (
            <div className="calendar-month-week" key={dateKey(weekDatesInMonth[0])} role="row">
              {weekDatesInMonth.map((date) => {
                const key = dateKey(date);
                const isCurrentMonth = format(date, "yyyy-MM") === format(focusDate, "yyyy-MM");
                const occurrencesForDay = occurrenceDateBuckets.get(key) ?? [];
                const cleanlyEventsForDay = cleanlyEventDateBuckets.get(key) ?? [];
                const completedOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status === "completed");
                const activeOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status !== "completed");
                const orderedOccurrences = [...activeOccurrences, ...completedOccurrences];
                const hasAllCompleted = occurrencesForDay.length > 0 && activeOccurrences.length === 0;
                return (
                  <article
                    aria-label={longDateLabel(date)}
                    className={`calendar-day-cell ${isCurrentMonth ? "" : "is-outside-month"} ${hasAllCompleted ? "is-all-completed" : ""} ${key === format(new Date(), "yyyy-MM-dd") ? "is-today" : ""}`}
                    key={key}
                    role="gridcell"
                  >
                    <div className="calendar-day-cell-header">
                      <span>{format(date, "d")}</span>
                      {key === format(new Date(), "yyyy-MM-dd") ? <strong>Today</strong> : null}
                    </div>
                    <div className="calendar-day-active-events">
                      {cleanlyEventsForDay.map((event) => renderCleanlyCalendarEvent(event))}
                      {orderedOccurrences.map((occurrence) => renderMonthOccurrence(occurrence, date))}
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderCalendarColumns(dates: Date[], label: string, density: OccurrenceCardDensity) {
    return (
      <section className={`calendar-column-grid ${dates.length > 1 ? "has-time-rail" : ""}`} aria-label={label} role="grid">
        {dates.length > 1 ? (
          <div className="calendar-time-rail" aria-hidden="true">
            <span className="calendar-time-rail-header-spacer" />
            <span className="calendar-time-rail-anytime-label">Anytime</span>
            <span className="calendar-time-rail-separator" />
            {timedSlots.map((slot, index) => <span key={slot} style={{ gridRow: index + 4 }}>{timeSlotLabel(slot)}</span>)}
          </div>
        ) : null}
        {dates.map((date) => renderCalendarDayColumn(date, density, dates.length === 1))}
      </section>
    );
  }

  function renderCalendarDayColumn(date: Date, density: OccurrenceCardDensity, showSlotLabels: boolean) {
    const key = dateKey(date);
    const occurrencesForDay = occurrenceDateBuckets.get(key) ?? [];
    const completedOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status === "completed");
    const activeOccurrences = occurrencesForDay.filter((occurrence) => occurrence.status !== "completed");
    const orderedOccurrences = [...activeOccurrences, ...completedOccurrences];
    const flexibleOccurrences = orderedOccurrences.filter((occurrence) => occurrence.planningMode === "flexible");
    const cleanlyEventsForDay = cleanlyEventDateBuckets.get(key) ?? [];
    return (
      <section className="calendar-column" key={key}>
        <h3 aria-label={longDateLabel(date)} role="columnheader">{showSlotLabels ? longDateLabel(date) : format(date, "EEE, MMM d")}</h3>
        <div className={`calendar-column-anytime ${showSlotLabels ? "has-slot-label" : ""}`}>
          {showSlotLabels ? <span className="calendar-column-anytime-label">Anytime</span> : null}
          <div className="calendar-column-anytime-main">
            {cleanlyEventsForDay.map((event) => renderCleanlyCalendarEvent(event, false))}
            {flexibleOccurrences.map((occurrence) => renderOccurrenceCompact(occurrence, date, density))}
          </div>
        </div>
        <div className="calendar-column-hour-separator has-top-divider" aria-hidden="true" />
        <div className="calendar-column-slots">
          {timedSlots.map((slot) => {
            const timedOccurrences = activeOccurrences.filter((occurrence) =>
              occurrence.plannedStartAt &&
              formatInTimeZone(occurrence.plannedStartAt, timeZone, "HH:mm").startsWith(slot.slice(0, 2))
            );
            const completedTimedOccurrences = completedOccurrences.filter((occurrence) =>
              occurrence.plannedStartAt &&
              formatInTimeZone(occurrence.plannedStartAt, timeZone, "HH:mm").startsWith(slot.slice(0, 2))
            );
            const orderedTimedOccurrences = [...timedOccurrences, ...completedTimedOccurrences];
            return (
              <div
                aria-label={`${longDateLabel(date)} ${slot} time slot`}
                className={`calendar-time-slot ${showSlotLabels ? "" : "hide-slot-label"}`}
                key={`${key}-${slot}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void handleDrop(slot)}
              >
                {showSlotLabels ? <span>{timeSlotLabel(slot)}</span> : null}
                <div>
                  {orderedTimedOccurrences.map((occurrence) => renderOccurrenceCompact(occurrence, date, density))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function renderCalendarImportQueue() {
    if (!isOwner) return null;
    const pendingCount = importQueueItems.filter((item) => item.queueStatus === "pending").length;
    const selectedQueueType = selectedQueueItem ? queueTypeDrafts.get(selectedQueueItem.id) ?? selectedQueueItem.proposedType : "commitment";

    return (
      <section className="calendar-import-queue" aria-labelledby="calendar-import-queue-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Owner review</p>
            <h2 id="calendar-import-queue-heading">Calendar import queue</h2>
          </div>
          <span>{pendingCount} pending</span>
        </div>
        {importQueueItems.length ? (
          <div className="calendar-queue-layout">
            <div className="calendar-queue-table" role="list">
              <div className="calendar-queue-header" aria-hidden="true">
                <span>Event</span>
                <span>Submitted by</span>
                <span>Type</span>
                <span>Time</span>
                <span>Detail</span>
                <span>Status</span>
              </div>
              {importQueueItems.map((item) => (
                <button
                  className={`calendar-queue-row ${item.id === selectedQueueItem?.id ? "is-selected" : ""}`}
                  key={item.id}
                  onClick={() => setSelectedQueueItemId(item.id)}
                  type="button"
                >
                  <span>{item.privacyTitle}</span>
                  <span>{item.submittedByName}</span>
                  <span>{item.proposedType}</span>
                  <span>{formatInTimeZone(item.startsAt, timeZone, "MMM d, h:mm a")}</span>
                  <span>{item.detailLevel === "busy_only" ? "Busy only" : "Full details"}</span>
                  <span>{item.queueStatus}</span>
                </button>
              ))}
            </div>
            {selectedQueueItem ? (
              <aside className="calendar-queue-detail">
                <p className="eyebrow">{selectedQueueItem.detailLevel === "busy_only" ? "Busy only" : "Full details"}</p>
                <h3>{selectedQueueItem.privacyTitle}</h3>
                <p>{selectedQueueItem.submittedByName} shared this as a {selectedQueueItem.proposedType}.</p>
                <label>
                  Type
                  <select
                    value={selectedQueueType}
                    onChange={(event) => setQueueTypeDrafts((current) => new Map(current).set(
                      selectedQueueItem.id,
                      event.target.value as CalendarImportQueueItem["proposedType"]
                    ))}
                  >
                    <option value="commitment">Commitment</option>
                    <option value="chore">Chore</option>
                  </select>
                </label>
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
    );
  }

  if (isLoading) return <div className="calendar-page operational-page"><p>Loading calendar...</p></div>;

  return (
    <div className="calendar-page operational-page">
      <header className="page-command-header">
        <div>
          <h1>Calendar</h1>
          <div className="command-metrics" aria-label="Calendar status summary">
            <span>{selectedHousehold?.name ?? "No household"}</span>
            <span>{periodLabel}</span>
            <span>{visibleOccurrences.filter((occurrence) => occurrence.status !== "completed").length} open</span>
            <span>{visibleOccurrences.filter((occurrence) => occurrence.status === "completed").length} completed</span>
          </div>
        </div>
        <button onClick={openCreateEditor} type="button">Add chore</button>
      </header>
      {renderCalendarImportQueue()}

      <section className="calendar-integration-strip" aria-label="Google Calendar setup">
        <div>
          <p className="eyebrow">Calendar integration</p>
          <h2>Google Calendar</h2>
          <p>Connect Google Calendar to review imported commitments and export Cleanly calendar updates when you choose.</p>
          {calendarSyncStatus ? <p role="status" className="section-summary">{calendarSyncStatus}</p> : null}
        </div>
        <div className="calendar-integration-actions">
          <button className="secondary-action" onClick={() => onNavigate("/settings#calendar")} type="button">
            Set up Google Calendar
          </button>
          <button
            className="secondary-action"
            disabled={!cleanlyCalendarEvents.length}
            onClick={handleExportCleanlyEvents}
            type="button"
          >
            Export visible events
          </button>
        </div>
      </section>

      {!selectedHousehold ? <section className="panel">Add a household to begin scheduling chores.</section> : (
        <>
          <section className="calendar-workspace-shell has-external-tabs" aria-label="Calendar workspace">
            <div className="calendar-workspace-panel-header">
              <nav className="calendar-workspace-tabs" role="tablist" aria-label="Workspace view">
                {(["calendar", "list"] as WorkspaceView[]).map((option) => (
                  <button
                    aria-selected={workspaceView === option}
                    key={option}
                    onClick={() => setWorkspaceView(option)}
                    role="tab"
                    type="button"
                  >
                    {capitalize(option)}
                  </button>
                ))}
              </nav>
            </div>

            <div className="panel calendar-workspace-panel">
            <section className="calendar-control-panel" aria-label="Calendar controls">
              {workspaceView === "calendar" ? (
                <div className="calendar-command-row">
                  <section className="calendar-view-toggle" aria-label="Calendar scale">
                    {scaleOptions.map((option) => (
                      <button aria-pressed={calendarScale === option} key={option} onClick={() => setCalendarScale(option)} type="button">
                        {capitalize(option)}
                      </button>
                    ))}
                  </section>
                  <div className="calendar-period-controls">
                    <button aria-label={`Previous ${periodUnit}`} className="section-action calendar-period-button" onClick={() => moveFocusDate(-1)} type="button">
                      <ChevronIcon direction="previous" />
                    </button>
                    <strong>{periodLabel}</strong>
                    <button aria-label={`Next ${periodUnit}`} className="section-action calendar-period-button" onClick={() => moveFocusDate(1)} type="button">
                      <ChevronIcon direction="next" />
                    </button>
                  </div>
                </div>
              ) : null}

              <section className="calendar-work-legend" aria-label="Calendar item types">
                <span className="calendar-legend-item is-chore">
                  <span aria-hidden="true" />
                  Chores
                </span>
                <span className="calendar-legend-item is-commitment">
                  <span aria-hidden="true" />
                  Commitments
                </span>
              </section>

              <section className="calendar-filter-card" aria-label="Calendar filters">
                <h2>Filters</h2>
                <div className="calendar-filter-panel">
                  <label>
                    Household
                    <select value={selectedHousehold.id} onChange={(event) => setFilters((current) => ({ ...current, householdId: event.target.value, assignedUserId: undefined }))}>
                      {households.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Member
                    <select value={filters.assignedUserId ?? ""} onChange={(event) => setFilters((current) => ({ ...current, assignedUserId: event.target.value || undefined }))}>
                      <option value="">Everyone</option>
                      {members.map((member) => <option key={member.userId} value={member.userId}>{memberLabel(member)}</option>)}
                    </select>
                  </label>
                  <label>
                    Status
                    <select value={filters.status ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                      <option value="all">All work</option>
                      <option value="planned">Planned</option>
                      <option value="completed">Completed</option>
                      <option value="skipped">Skipped</option>
                    </select>
                  </label>
                  <label>
                    Planning mode
                    <select value={filters.planningMode ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, planningMode: event.target.value }))}>
                      <option value="all">All</option>
                      <option value="timed">Timed</option>
                      <option value="flexible">Anytime</option>
                    </select>
                  </label>
                </div>
              </section>
            </section>

            {loadState === "error" ? <section className="calendar-empty-state">Could not load scheduled chores.</section> : null}

            {workspaceView === "calendar" && loadState === "ready" ? (
              <div className="calendar-workspace-content">
                {calendarScale === "month" ? (
                  renderMonthCalendar()
                ) : calendarScale === "week" ? (
                  renderCalendarColumns(weekDates, `Week of ${format(weekDates[0], "MMM d, yyyy")}`, "title")
                ) : (
                  renderCalendarColumns([focusDate], `${longDateLabel(focusDate)} day calendar`, "summary")
                )}
              </div>
            ) : null}

            {workspaceView === "list" ? (
              <section className="calendar-list-group calendar-agenda" aria-label="Chore agenda">
              <div className="agenda-header">
                <div>
                  <p className="eyebrow">Agenda</p>
                  <h2>Upcoming and completed work</h2>
                </div>
                <div className="agenda-summary" aria-label="Agenda summary">
                  <span>{listStatusCounts.planned} planned</span>
                  <span>{listStatusCounts.completed} completed</span>
                  <span>{listStatusCounts.skipped} skipped</span>
                </div>
              </div>
              {listGroups.map(([date, dateOccurrences]) => (
                <section className="calendar-list-day" key={date}>
                  <h3>{format(parseISO(date), "EEEE, MMM d")}</h3>
                  <div className="calendar-list-day-items">
                    {orderCompletedLast(dateOccurrences)
                      .map((occurrence) => renderAgendaOccurrence(occurrence, parseISO(date)))}
                  </div>
                </section>
              ))}
              </section>
            ) : null}
            </div>
          </section>

          {editorMode !== "closed" && editorDraft ? (
            <div className="chore-editor-backdrop" role="presentation">
              <form
                className="chore-editor-modal"
                onSubmit={(event) => {
                  if (editorMode === "create") {
                    void saveCreate(event);
                    return;
                  }
                  if (editorMode === "edit") {
                    event.preventDefault();
                    void handleScheduleSeriesSave();
                    return;
                  }
                  event.preventDefault();
                }}
              >
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{editorMode === "create" ? "New chore" : editorMode === "view" ? "Chore details" : "Edit chore"}</p>
                    <h2>{editorMode === "create" ? "Chore Details" : editorDraft.title}</h2>
                  </div>
                  <button aria-label="Close dialog" className="icon-button modal-close-button" onClick={() => setEditorMode("closed")} type="button" />
                </div>
                {editorMode === "view" && selectedOccurrence ? (
                  <section className="chore-view-details">
                    {completionCheckIn ? (
                      <>
                        <section className="completion-check-in" aria-label="Completion check-in">
                          <h3>Before completing</h3>
                          <label className="checkbox-field">
                            <input
                              checked={completionCheckIn.completedOnTime}
                              onChange={(event) => setCompletionCheckIn({ ...completionCheckIn, completedOnTime: event.target.checked })}
                              type="checkbox"
                            />
                            This was done on time
                          </label>
                          <label className="checkbox-field">
                            <input
                              checked={completionCheckIn.durationAccurate}
                              onChange={(event) => setCompletionCheckIn({ ...completionCheckIn, durationAccurate: event.target.checked })}
                              type="checkbox"
                            />
                            The estimated duration still feels accurate
                          </label>
                          {selectedOccurrenceCanRebaseFuture() ? (
                            <label className="checkbox-field">
                              <input
                                checked={completionCheckIn.rebaseFutureOccurrences}
                                onChange={(event) => setCompletionCheckIn({ ...completionCheckIn, rebaseFutureOccurrences: event.target.checked })}
                                type="checkbox"
                              />
                              Base future occurrences on this completion date
                            </label>
                          ) : null}
                        </section>
                        <section className="schedule-accordion">
                          <button
                            aria-expanded={scheduleAccordionOpen}
                            className="schedule-accordion-summary"
                            onClick={() => setScheduleAccordionOpen((isOpen) => !isOpen)}
                            type="button"
                          >
                            <span>
                              <strong>Chore details</strong>
                              <span>{`${editorDraft.title} · ${occurrenceDateLine(selectedOccurrence)} · ${assignedMemberLabel(selectedOccurrence)}`}</span>
                            </span>
                            <span>{scheduleAccordionOpen ? "Hide details" : "Show details"}</span>
                          </button>
                          {scheduleAccordionOpen ? (
                            <div className="schedule-accordion-body chore-details-drawer-body">
                              {renderChoreViewDetailSections()}
                            </div>
                          ) : null}
                        </section>
                      </>
                    ) : (
                      renderChoreViewDetailSections()
                    )}
                  </section>
                ) : null}
                {editorMode !== "view" ? (
                  <>
                <div className="field-grid aligned-field-grid">
                  <label className="aligned-field">
                    Chore title
                    <input disabled={editorMode === "edit"} value={editorDraft.title} onChange={(event) => setEditorDraft({ ...editorDraft, title: event.target.value })} required />
                    {editorMode === "create" || editorMode === "edit" ? <span className="field-help-placeholder" aria-hidden="true" /> : null}
                  </label>
                  <label className="aligned-field">
                    Tags
                    <input
                      aria-describedby={editorMode === "create" ? "chore-tags-help" : undefined}
                      disabled={editorMode === "edit"}
                      value={editorDraft.tags}
                      onChange={(event) => setEditorDraft({ ...editorDraft, tags: event.target.value })}
                    />
                    {editorMode === "create" ? (
                      <span className="field-help" id="chore-tags-help">Optional labels like bathroom, outdoor, or deep clean. Tags help group chores and give optimization more context.</span>
                    ) : null}
                  </label>
                </div>
                <label>
                  Instructions
                  <textarea
                    aria-describedby={editorMode === "create" ? "chore-instructions-help" : undefined}
                    disabled={editorMode === "edit"}
                    value={editorDraft.instructions}
                    onChange={(event) => setEditorDraft({ ...editorDraft, instructions: event.target.value })}
                  />
                  {editorMode === "create" ? (
                    <span className="field-help" id="chore-instructions-help">Add steps, scope, or preferences. This helps future optimization understand what the chore includes.</span>
                  ) : null}
                </label>
                {editorDraft.schedules[0] ? (
                  <section className="create-schedule-panel" aria-label="Chore schedule">
                    <div className="panel-heading">
                      <div>
                        <p className="eyebrow">Schedule</p>
                        <h3>When should this happen?</h3>
                        <p className="section-help">Choose the first date, optional timing, owner, and whether this chore repeats.</p>
                      </div>
                    </div>
                    <div className="field-grid aligned-field-grid">
                      <label className="aligned-field">
                        Date
                        <input
                          disabled={editorMode === "edit" && !isOwner}
                          type="date"
                          value={editorDraft.schedules[0].startsOn}
                          onChange={(event) => updatePrimarySchedule({
                            startsOn: event.target.value,
                            recurrence: {
                              ...editorDraft.schedules[0].recurrence,
                              ...(editorDraft.schedules[0].recurrence.frequency === "monthly"
                                ? {
                                    monthlyDay: parseISO(event.target.value).getDate(),
                                    monthlyWeek: weekOfMonth(event.target.value),
                                    monthlyWeekday: weekdayIndex(event.target.value)
                                  }
                                : {})
                            }
                          })}
                        />
                        <span className="field-help-placeholder" aria-hidden="true" />
                      </label>
                      <label className="aligned-field">
                        Assignee
                        <select
                          disabled={editorMode === "edit" && !isOwner}
                          value={editorDraft.schedules[0].assignment.memberUserIds[0] ?? ""}
                          onChange={(event) => updatePrimarySchedule({ assignment: { mode: "fixed", memberUserIds: [event.target.value] } })}
                        >
                          {members.map((member) => <option key={member.userId} value={member.userId}>{memberLabel(member)}</option>)}
                        </select>
                        <span className="field-help-placeholder" aria-hidden="true" />
                      </label>
                      <label className="aligned-field">
                        Start time (optional)
                        <input
                          aria-describedby="chore-start-time-help"
                          disabled={editorMode === "edit" && !isOwner}
                          type="time"
                          value={editorDraft.schedules[0].planningMode === "timed" ? editorDraft.schedules[0].localStartTime : editorDraft.startTime}
                          onChange={(event) => {
                            if (editorDraft.schedules[0].planningMode === "timed") {
                              updatePrimarySchedule({
                                localStartTime: event.target.value,
                                localEndTime: timeAfterMinutes(event.target.value, minutesBetween(editorDraft.schedules[0].localStartTime, editorDraft.schedules[0].localEndTime))
                              });
                            } else {
                              setEditorDraft({ ...editorDraft, startTime: event.target.value });
                            }
                          }}
                        />
                        <span className="field-help" id="chore-start-time-help">Leave blank if this can be done anytime on the selected day.</span>
                      </label>
                      <label className="aligned-field">
                        Estimated duration
                        <input
                          aria-describedby="chore-duration-help"
                          disabled={editorMode === "edit" && !isOwner}
                          min="1"
                          type="number"
                          value={editorDraft.schedules[0].planningMode === "flexible"
                            ? editorDraft.schedules[0].estimatedMinutes
                            : minutesBetween(editorDraft.schedules[0].localStartTime, editorDraft.schedules[0].localEndTime)}
                          onChange={(event) => {
                            const minutes = Number(event.target.value);
                            if (editorDraft.schedules[0].planningMode === "timed") {
                              updatePrimarySchedule({ localEndTime: timeAfterMinutes(editorDraft.schedules[0].localStartTime, minutes) });
                            } else {
                              updatePrimarySchedule({ estimatedMinutes: minutes });
                            }
                          }}
                        />
                        <span className="field-help" id="chore-duration-help">Used for flexible chores. If you add a start time, the end time is calculated from this duration.</span>
                      </label>
                    </div>
                    <div className="repeat-segmented-field">
                      <span className="sr-only">Repeat</span>
                      <div className="segmented-control" aria-label="Repeat">
                        <button
                          aria-pressed={editorDraft.schedules[0].recurrence.frequency === "one_time"}
                          disabled={editorMode === "edit" && !isOwner}
                          onClick={() => updatePrimaryRecurrenceFrequency("one_time")}
                          type="button"
                        >
                          Does not repeat
                        </button>
                        <button
                          aria-pressed={editorDraft.schedules[0].recurrence.frequency !== "one_time"}
                          disabled={editorMode === "edit" && !isOwner}
                          onClick={() => updatePrimaryRecurrenceFrequency(editorDraft.schedules[0].recurrence.frequency === "one_time" ? "daily" : editorDraft.schedules[0].recurrence.frequency)}
                          type="button"
                        >
                          Repeats
                        </button>
                      </div>
                    </div>
                  </section>
                ) : null}
                {editorDraft.schedules[0] && editorDraft.schedules[0].recurrence.frequency !== "one_time" ? (
                  <div className="recurrence-panel">
                    <div className="recurrence-sentence">
                      <span>Repeats every</span>
                      <label>
                        <span className="sr-only">Repeat interval</span>
                        <input
                          aria-label="Repeat interval"
                          disabled={editorMode === "edit" && !isOwner}
                          min="1"
                          type="number"
                          value={editorDraft.schedules[0].recurrence.interval}
                          onChange={(event) => updatePrimarySchedule({
                            recurrence: {
                              ...editorDraft.schedules[0].recurrence,
                              interval: Number(event.target.value)
                            }
                          })}
                        />
                      </label>
                      <label>
                        <span className="sr-only">Repeat unit</span>
                        <select
                          aria-label="Repeat unit"
                          disabled={editorMode === "edit" && !isOwner}
                          value={editorDraft.schedules[0].recurrence.frequency}
                          onChange={(event) => updatePrimaryRecurrenceFrequency(event.target.value as ScheduleInput["recurrence"]["frequency"])}
                        >
                          <option value="daily">day(s)</option>
                          <option value="weekly">week(s)</option>
                          <option value="monthly">month(s)</option>
                          <option value="yearly">year(s)</option>
                        </select>
                      </label>
                    </div>
                    {editorDraft.schedules[0].recurrence.frequency === "weekly" ? (
                      <fieldset className="schedule-assignees">
                        <legend>Days</legend>
                        {weekdays.map((weekday) => (
                          <label className="checkbox-field" key={weekday.value}>
                            <input
                              checked={Boolean(editorDraft.schedules[0].recurrence.weekDays?.includes(weekday.value))}
                              disabled={editorMode === "edit" && !isOwner}
                              onChange={(event) => {
                                const currentDays = editorDraft.schedules[0].recurrence.weekDays ?? [];
                                updatePrimarySchedule({
                                  recurrence: {
                                    ...editorDraft.schedules[0].recurrence,
                                    weekDays: event.target.checked
                                      ? [...new Set([...currentDays, weekday.value])].sort()
                                      : currentDays.filter((day) => day !== weekday.value)
                                  }
                                });
                              }}
                              type="checkbox"
                            />
                            {weekday.label}
                          </label>
                        ))}
                      </fieldset>
                    ) : null}
                    {editorDraft.schedules[0].recurrence.frequency === "monthly" ? (
                      <fieldset className="schedule-assignees">
                        <legend>Monthly pattern</legend>
                        <label className="checkbox-field">
                          <input
                            checked={(editorDraft.schedules[0].recurrence.monthlyPattern ?? "day_of_month") === "day_of_month"}
                            disabled={editorMode === "edit" && !isOwner}
                            name="monthly-pattern"
                            onChange={() => updatePrimarySchedule({
                              recurrence: {
                                ...editorDraft.schedules[0].recurrence,
                                monthlyPattern: "day_of_month",
                                monthlyDay: parseISO(editorDraft.schedules[0].startsOn).getDate(),
                                monthlyWeek: undefined,
                                monthlyWeekday: undefined
                              }
                            })}
                            type="radio"
                          />
                          On day {parseISO(editorDraft.schedules[0].startsOn).getDate()} of the month
                        </label>
                        <label className="checkbox-field">
                          <input
                            checked={editorDraft.schedules[0].recurrence.monthlyPattern === "weekday_of_month"}
                            disabled={editorMode === "edit" && !isOwner}
                            name="monthly-pattern"
                            onChange={() => updatePrimarySchedule({
                              recurrence: {
                                ...editorDraft.schedules[0].recurrence,
                                monthlyPattern: "weekday_of_month",
                                monthlyDay: undefined,
                                monthlyWeek: weekOfMonth(editorDraft.schedules[0].startsOn),
                                monthlyWeekday: weekdayIndex(editorDraft.schedules[0].startsOn)
                              }
                            })}
                            type="radio"
                          />
                          On the {monthlyWeekdayLabel(editorDraft.schedules[0].startsOn)}
                        </label>
                      </fieldset>
                    ) : null}
                  </div>
                ) : null}
                {editorMode === "edit" && !isOwner ? (
                  <p className="empty-state">Schedule details are available for review. Only household owners can change the schedule.</p>
                ) : null}
                  </>
                ) : null}
                {editorStatus ? <p role="status">{editorStatus}</p> : null}
                {editorMode === "view" && selectedOccurrence ? (
                  <div className="form-actions modal-actions">
                    <button className="section-action" onClick={() => setEditorMode("closed")} type="button">Close</button>
                    <div className="modal-action-group">
                      {completionCheckIn ? (
                        <button onClick={() => void handleComplete(selectedOccurrence, completionCheckIn)} type="button">Submit</button>
                      ) : (
                        <>
                          {selectedOccurrence.status === "planned" && selectedOccurrence.assignedUserId === currentUserId ? (
                          <button className="section-action" onClick={startCompletionCheckIn} type="button">Complete chore</button>
                          ) : null}
                          <button onClick={() => openEditEditor(selectedOccurrence)} type="button">Edit</button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="form-actions modal-actions">
                    <button className="section-action" onClick={() => setEditorMode("closed")} type="button">Cancel</button>
                    {editorMode === "create" || editorMode === "edit" ? <button type="submit">{editorMode === "create" ? "Add chore" : "Save changes"}</button> : null}
                    {editorMode === "edit" && selectedOccurrence ? <button className="section-action" onClick={() => void handleSkip()} type="button">Skip occurrence</button> : null}
                  </div>
                )}
              </form>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
