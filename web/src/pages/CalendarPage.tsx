import { addDays, addMinutes, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { useEffect, useMemo, useState } from "react";
import type { ChoreOccurrence, HouseholdAppData, HouseholdMemberSummary, ScheduleInput } from "@chore-helper/shared";
import { completeOccurrence, createScheduledChore, getCurrentUser, listHouseholdMembers, listOccurrences, skipOccurrence, updateOccurrence } from "../api";

type WorkspaceView = "calendar" | "list";
type CalendarScale = "month" | "week" | "day";
type CalendarFilters = { householdId?: string; assignedUserId?: string; status?: string };
type EditorMode = "closed" | "create" | "edit";
type ScheduleDraft = ScheduleInput & { key: string };
type EditorDraft = {
  choreId?: string;
  title: string;
  instructions: string;
  tags: string;
  schedules: ScheduleDraft[];
};

type CalendarPageProps = {
  households: HouseholdAppData[];
  isLoading: boolean;
};

type EditState = {
  occurrenceId: string;
  localStart: string;
  plannedMinutes: string;
  assignedUserId: string;
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

function localInputValue(instant: string, timeZone: string) {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd'T'HH:mm");
}

function displayDates(occurrence: ChoreOccurrence) {
  if (occurrence.planningMode === "flexible" && occurrence.status === "planned") {
    return eachDayOfInterval({ start: parseISO(occurrence.eligibleStartOn), end: parseISO(occurrence.eligibleEndOn) });
  }
  return [parseISO(occurrence.eligibleStartOn)];
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

function tagsFromText(value: string) {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function isDraftDisabled(editorMode: EditorMode) {
  return editorMode === "edit";
}

export function CalendarPage({ households, isLoading }: CalendarPageProps) {
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
  const [editState, setEditState] = useState<EditState>();
  const [editorDraft, setEditorDraft] = useState<EditorDraft>();
  const [editorStatus, setEditorStatus] = useState<string>();
  const [draggingId, setDraggingId] = useState<string>();

  const selectedHousehold = households.find((household) => household.id === filters.householdId) ?? households[0];
  const timeZone = selectedHousehold?.timeZone ?? "UTC";
  const isOwner = members.some((member) => member.userId === currentUserId && member.role === "owner");
  const visibleOccurrences = occurrences.filter((occurrence) =>
    occurrence.status === "planned" &&
    (!filters.status || filters.status === "all" || occurrence.status === filters.status)
  );
  const selectedOccurrence = occurrences.find((occurrence) => occurrence.id === selectedOccurrenceId);

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

  const choreTitles = useMemo(() => new Map(
    (selectedHousehold?.chores ?? []).map((chore) => [chore.id, chore.title])
  ), [selectedHousehold]);

  const listGroups = useMemo(() => {
    const groups = new Map<string, ChoreOccurrence[]>();
    for (const occurrence of visibleOccurrences) {
      const key = occurrence.eligibleStartOn;
      groups.set(key, [...(groups.get(key) ?? []), occurrence]);
    }
    return Array.from(groups.entries()).sort(([first], [second]) => first.localeCompare(second));
  }, [visibleOccurrences]);

  function occurrenceTitle(occurrence: ChoreOccurrence) {
    return choreTitles.get(occurrence.choreId) ?? "Scheduled chore";
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
    setEditState(undefined);
    setEditorStatus(undefined);
    setEditorDraft({
      title: "",
      instructions: "",
      tags: "",
      schedules: [seedDraftAssignees(createEmptyTimedScheduleDraft())]
    });
    setEditorMode("create");
  }

  function openEditEditor(occurrence: ChoreOccurrence) {
    setSelectedOccurrenceId(occurrence.id);
    setEditorStatus(undefined);
    const chore = selectedHousehold?.chores.find((item) => item.id === occurrence.choreId);
    const scheduleDraft = (occurrence.planningMode === "flexible"
      ? {
          ...createEmptyFlexibleScheduleDraft(),
          key: occurrence.scheduleId,
          startsOn: occurrence.eligibleStartOn,
          estimatedMinutes: occurrence.estimatedMinutes,
          assignment: { mode: "fixed", memberUserIds: [occurrence.assignedUserId] }
        }
      : {
          ...createEmptyTimedScheduleDraft(),
          key: occurrence.scheduleId,
          startsOn: occurrence.eligibleStartOn,
          localStartTime: occurrence.plannedStartAt ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "HH:mm") : "09:00",
          localEndTime: occurrence.plannedEndAt ? formatInTimeZone(occurrence.plannedEndAt, timeZone, "HH:mm") : "10:00",
          assignment: { mode: "fixed", memberUserIds: [occurrence.assignedUserId] }
        }) as ScheduleDraft;
    setEditorDraft({
      choreId: occurrence.choreId,
      title: occurrenceTitle(occurrence),
      instructions: chore?.instructions ?? "",
      tags: chore?.tags?.join(", ") ?? "",
      schedules: [seedDraftAssignees(scheduleDraft)]
    });
    if (occurrence.plannedStartAt) {
      setEditState({
        occurrenceId: occurrence.id,
        localStart: localInputValue(occurrence.plannedStartAt, timeZone),
        plannedMinutes: String(durationInMinutes(occurrence)),
        assignedUserId: occurrence.assignedUserId
      });
    } else {
      setEditState(undefined);
    }
    setEditorMode("edit");
  }

  function updateSchedule(index: number, update: Partial<ScheduleDraft>) {
    setEditorDraft((current) => current ? {
      ...current,
      schedules: current.schedules.map((schedule, scheduleIndex) =>
        scheduleIndex === index ? ({ ...schedule, ...update } as ScheduleDraft) : schedule
      )
    } : current);
  }

  async function saveCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedHousehold || !editorDraft) return;
    try {
      const created = await createScheduledChore(selectedHousehold.id, {
        chore: {
          title: editorDraft.title,
          source: "manual",
          ...(editorDraft.instructions.trim() ? { instructions: editorDraft.instructions.trim() } : {}),
          tags: tagsFromText(editorDraft.tags)
        },
        schedules: editorDraft.schedules.map(({ key: _key, ...schedule }) => schedule)
      });
      selectedHousehold.chores.push({ ...created.chore, recommendations: [] });
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
    setEditState((current) => current?.occurrenceId === updated.id ? {
      occurrenceId: updated.id,
      localStart: updated.plannedStartAt ? localInputValue(updated.plannedStartAt, timeZone) : current.localStart,
      plannedMinutes: String(durationInMinutes(updated)),
      assignedUserId: updated.assignedUserId
    } : current);
  }

  async function handleOccurrenceSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!editState) return;
    const occurrence = occurrences.find((item) => item.id === editState.occurrenceId);
    if (!occurrence) return;
    await saveUpdate(occurrence, editState.localStart, Number(editState.plannedMinutes), editState.assignedUserId);
  }

  async function handleSkip() {
    if (!selectedHousehold || !selectedOccurrence) return;
    const updated = await skipOccurrence(selectedHousehold.id, selectedOccurrence.id);
    setOccurrences((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  async function handleComplete(occurrence: ChoreOccurrence) {
    if (!selectedHousehold) return;
    const updated = await completeOccurrence(selectedHousehold.id, occurrence.id);
    setOccurrences((current) =>
      updated.status === "completed"
        ? current.filter((item) => item.id !== updated.id)
        : current.map((item) => item.id === updated.id ? updated : item)
    );
  }

  async function handleDrop(slot: string) {
    const occurrence = occurrences.find((item) => item.id === draggingId);
    if (!occurrence?.plannedStartAt) return;
    const date = formatInTimeZone(occurrence.plannedStartAt, timeZone, "yyyy-MM-dd");
    await saveUpdate(occurrence, `${date}T${slot}`, durationInMinutes(occurrence), occurrence.assignedUserId);
    setDraggingId(undefined);
  }

  function occurrenceLine(occurrence: ChoreOccurrence, date?: Date) {
    if (occurrence.planningMode === "flexible") {
      const label = date
        ? format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
          ? "today"
          : format(date, "EEEE").toLowerCase()
        : "today";
      return `Anytime ${label} / ${durationInMinutes(occurrence)} min / Flexible`;
    }
    return `${occurrence.plannedStartAt ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "EEE, MMM d / h:mm a") : occurrence.eligibleStartOn} / ${durationInMinutes(occurrence)} min`;
  }

  function isFlexibleOverdue(occurrence: ChoreOccurrence) {
    return occurrence.planningMode === "flexible" &&
      occurrence.status === "planned" &&
      occurrence.eligibleEndOn < format(new Date(), "yyyy-MM-dd");
  }

  function renderOccurrence(occurrence: ChoreOccurrence, date?: Date) {
    const title = occurrenceTitle(occurrence);
    const assignedToCurrentUser = occurrence.assignedUserId === currentUserId;
    return (
      <article
        aria-label={`Scheduled ${title}`}
        className={`calendar-event ${occurrence.status === "skipped" ? "is-skipped" : ""}`}
        draggable={isOwner && calendarScale !== "month" && occurrence.planningMode === "timed"}
        key={`${occurrence.id}-${date ? format(date, "yyyy-MM-dd") : "row"}`}
        onDragStart={() => setDraggingId(occurrence.id)}
      >
        <strong>{title}</strong>
        <span>{occurrenceLine(occurrence, date)}</span>
        <span>{members.find((member) => member.userId === occurrence.assignedUserId)?.displayName ?? "Assigned member"}</span>
        {occurrence.planningMode === "flexible" ? <span className="occurrence-flexible-badge">Flexible</span> : null}
        {isFlexibleOverdue(occurrence) ? <span className="occurrence-overdue-badge">Overdue</span> : null}
        <div className="form-actions">
          <button className="section-action" onClick={() => openEditEditor(occurrence)} type="button">
            Edit {title}
          </button>
          {assignedToCurrentUser ? (
            <button className="section-action" onClick={() => void handleComplete(occurrence)} type="button">
              Complete {title}
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  function renderScheduleDraft(schedule: ScheduleDraft, index: number) {
    const disabled = isDraftDisabled(editorMode);
    return (
      <section className="schedule-form" key={schedule.key}>
        <div className="field-grid">
          <label>
            Planning mode
            <select
              aria-label="Planning mode"
              disabled={disabled}
              value={schedule.planningMode}
              onChange={(event) => updateSchedule(index, event.target.value === "flexible"
                ? seedDraftAssignees(createEmptyFlexibleScheduleDraft())
                : seedDraftAssignees(createEmptyTimedScheduleDraft()))}
            >
              <option value="timed">Timed</option>
              <option value="flexible">Flexible</option>
            </select>
          </label>
          {schedule.planningMode === "flexible" ? (
            <label className="checkbox-field">
              <input checked readOnly type="checkbox" />
              Flexible schedule
            </label>
          ) : (
            <label className="checkbox-field">
              <input checked readOnly type="checkbox" />
              Timed schedule
            </label>
          )}
        </div>
        <div className="field-grid">
          <label>
            Starts on
            <input disabled={disabled} type="date" value={schedule.startsOn} onChange={(event) => updateSchedule(index, { startsOn: event.target.value })} />
          </label>
          <label>
            Repeat
            <select
              disabled={disabled}
              value={schedule.recurrence.frequency}
              onChange={(event) => updateSchedule(index, {
                recurrence: {
                  ...schedule.recurrence,
                  frequency: event.target.value as ScheduleInput["recurrence"]["frequency"],
                  weekDays: event.target.value === "weekly" ? (schedule.recurrence.weekDays ?? [1]) : undefined
                }
              })}
            >
              <option value="one_time">One time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>
        {schedule.recurrence.frequency === "weekly" ? (
          <fieldset className="schedule-assignees">
            <legend>Days</legend>
            {weekdays.map((weekday) => (
              <label className="checkbox-field" key={weekday.value}>
                <input
                  checked={Boolean(schedule.recurrence.weekDays?.includes(weekday.value))}
                  disabled={disabled}
                  onChange={(event) => {
                    const currentDays = schedule.recurrence.weekDays ?? [];
                    updateSchedule(index, {
                      recurrence: {
                        ...schedule.recurrence,
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
        {schedule.planningMode === "timed" ? (
          <div className="field-grid">
            <label>
              Start time
              <input disabled={disabled} type="time" value={schedule.localStartTime} onChange={(event) => updateSchedule(index, { localStartTime: event.target.value })} />
            </label>
            <label>
              End time
              <input disabled={disabled} type="time" value={schedule.localEndTime} onChange={(event) => updateSchedule(index, { localEndTime: event.target.value })} />
            </label>
          </div>
        ) : (
          <div className="field-grid">
            <label>
              Estimated duration
              <input disabled={disabled} min="1" type="number" value={schedule.estimatedMinutes} onChange={(event) => updateSchedule(index, { estimatedMinutes: Number(event.target.value) })} />
            </label>
            <label>
              Flexible window
              <select disabled={disabled} value={schedule.flexibleWindowRule} onChange={(event) => updateSchedule(index, { flexibleWindowRule: event.target.value as "once_within_selected_days" | "each_selected_day" })}>
                <option value="once_within_selected_days">Once within selected days</option>
                <option value="each_selected_day">Each selected day</option>
              </select>
            </label>
          </div>
        )}
        <label>
          Assignee
          <select
            disabled={disabled}
            value={schedule.assignment.memberUserIds[0] ?? ""}
            onChange={(event) => updateSchedule(index, { assignment: { mode: "fixed", memberUserIds: [event.target.value] } })}
          >
            {members.map((member) => <option key={member.userId} value={member.userId}>{memberLabel(member)}</option>)}
          </select>
        </label>
      </section>
    );
  }

  if (isLoading) return <div className="calendar-page"><p>Loading calendar...</p></div>;

  return (
    <div className="calendar-page">
      <header className="workspace-hero compact-hero">
        <div>
          <p className="eyebrow">Household planner</p>
          <h1>Calendar</h1>
          <p className="lede">Plan chores as timed appointments or flexible work windows in one place.</p>
        </div>
        <div className="header-action">
          <div className="calendar-workspace-toggle" aria-label="Workspace view">
            {(["calendar", "list"] as WorkspaceView[]).map((option) => (
              <button aria-pressed={workspaceView === option} key={option} onClick={() => setWorkspaceView(option)} type="button">
                {capitalize(option)}
              </button>
            ))}
          </div>
          <button onClick={openCreateEditor} type="button">Add chore</button>
        </div>
      </header>

      {!selectedHousehold ? <section className="panel">Add a household to begin scheduling chores.</section> : (
        <>
          <section className="panel calendar-toolbar" aria-label="Calendar filters">
            <label>
              Household
              <select value={selectedHousehold.id} onChange={(event) => setFilters({ householdId: event.target.value })}>
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
                <option value="all">All planned work</option>
                <option value="planned">Planned</option>
              </select>
            </label>
            {workspaceView === "calendar" ? (
              <div className="calendar-period-controls">
                <button className="section-action" onClick={() => setFocusDate((date) => calendarScale === "month" ? addMonths(date, -1) : calendarScale === "week" ? addWeeks(date, -1) : addDays(date, -1))} type="button">Previous</button>
                <strong>{formatInTimeZone(focusDate, timeZone, "MMMM yyyy")}</strong>
                <button className="section-action" onClick={() => setFocusDate((date) => calendarScale === "month" ? addMonths(date, 1) : calendarScale === "week" ? addWeeks(date, 1) : addDays(date, 1))} type="button">Next</button>
              </div>
            ) : null}
          </section>

          {workspaceView === "calendar" ? (
            <section className="panel calendar-view-toggle" aria-label="Calendar scale">
              {scaleOptions.map((option) => (
                <button aria-pressed={calendarScale === option} key={option} onClick={() => setCalendarScale(option)} type="button">
                  {capitalize(option)}
                </button>
              ))}
            </section>
          ) : null}

          {loadState === "error" ? <section className="panel">Could not load scheduled chores.</section> : null}
          {loadState === "ready" && visibleOccurrences.length === 0 ? <section className="panel">No planned chores in this range.</section> : null}

          {workspaceView === "calendar" && visibleOccurrences.length > 0 ? (
            calendarScale === "month" ? (
              <section className="calendar-month-grid" aria-label="Monthly occurrences">
                {visibleOccurrences.flatMap((occurrence) => displayDates(occurrence).map((date) => renderOccurrence(occurrence, date)))}
              </section>
            ) : (
              <section className="panel calendar-agenda" aria-label={`${capitalize(calendarScale)} agenda`}>
                <div className="calendar-anytime-region">
                  {visibleOccurrences.filter((occurrence) => occurrence.planningMode === "flexible").map((occurrence) => renderOccurrence(occurrence, parseISO(occurrence.eligibleStartOn)))}
                </div>
                {timedSlots.map((slot) => (
                  <div
                    aria-label={`${slot} time slot`}
                    className="calendar-time-slot"
                    key={slot}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => void handleDrop(slot)}
                  >
                    <span>{slot}</span>
                    <div>
                      {visibleOccurrences.filter((occurrence) =>
                        occurrence.plannedStartAt &&
                        formatInTimeZone(occurrence.plannedStartAt, timeZone, "HH:mm").startsWith(slot.slice(0, 2))
                      ).map((occurrence) => renderOccurrence(occurrence))}
                    </div>
                  </div>
                ))}
              </section>
            )
          ) : null}

          {workspaceView === "list" ? (
            <section className="panel calendar-list-group" aria-label="Upcoming chore occurrences">
              <h2>Today</h2>
              {listGroups.map(([date, dateOccurrences]) => (
                <section className="calendar-list-day" key={date}>
                  <h3>{format(parseISO(date), "EEEE, MMM d")}</h3>
                  {dateOccurrences.map((occurrence) => renderOccurrence(occurrence, parseISO(date)))}
                </section>
              ))}
            </section>
          ) : null}

          {editorMode !== "closed" && editorDraft ? (
            <div className="chore-editor-backdrop" role="presentation">
              <form
                className="chore-editor-modal"
                onSubmit={(event) => {
                  if (editorMode === "create") {
                    void saveCreate(event);
                    return;
                  }
                  if (editState) {
                    void handleOccurrenceSubmit(event);
                    return;
                  }
                  event.preventDefault();
                }}
              >
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{editorMode === "create" ? "New chore" : "Selected occurrence"}</p>
                    <h2>{editorMode === "create" ? "Chore Details" : "Selected occurrence"}</h2>
                  </div>
                  <button className="section-action" onClick={() => setEditorMode("closed")} type="button">Close</button>
                </div>
                <div className="field-grid">
                  <label>
                    Chore title
                    <input disabled={editorMode === "edit"} value={editorDraft.title} onChange={(event) => setEditorDraft({ ...editorDraft, title: event.target.value })} required />
                  </label>
                  <label>
                    Tags
                    <input disabled={editorMode === "edit"} value={editorDraft.tags} onChange={(event) => setEditorDraft({ ...editorDraft, tags: event.target.value })} />
                  </label>
                </div>
                <label>
                  Instructions
                  <textarea disabled={editorMode === "edit"} value={editorDraft.instructions} onChange={(event) => setEditorDraft({ ...editorDraft, instructions: event.target.value })} />
                </label>
                {editorMode === "edit" ? (
                  <p className="empty-state">Schedule series details are shown for context. This release supports changing timed occurrence timing here; full series editing is coming with schedule mutation APIs.</p>
                ) : null}
                {selectedOccurrence ? (
                  <section className="schedule-card">
                    <strong>Selected occurrence</strong>
                    <span>{occurrenceLine(selectedOccurrence)}</span>
                  </section>
                ) : null}
                <section className="schedule-editor">
                  <div className="panel-heading">
                    <h3>Schedule Series</h3>
                    {editorMode === "create" ? (
                      <button
                        className="section-action"
                        onClick={() => setEditorDraft({
                          ...editorDraft,
                          schedules: [...editorDraft.schedules, seedDraftAssignees(createEmptyFlexibleScheduleDraft())]
                        })}
                        type="button"
                      >
                        Add schedule
                      </button>
                    ) : null}
                  </div>
                  {editorDraft.schedules.map(renderScheduleDraft)}
                </section>
                {editState ? (
                  <section className="schedule-form">
                    <h3>Occurrence timing</h3>
                    <div className="field-grid">
                      <label>
                        Planned start
                        <input type="datetime-local" value={editState.localStart} onChange={(event) => setEditState({ ...editState, localStart: event.target.value })} />
                      </label>
                      <label>
                        Planned duration
                        <input min="1" type="number" value={editState.plannedMinutes} onChange={(event) => setEditState({ ...editState, plannedMinutes: event.target.value })} />
                      </label>
                    </div>
                    <label>
                      Assignee
                      <select value={editState.assignedUserId} onChange={(event) => setEditState({ ...editState, assignedUserId: event.target.value })}>
                        {members.map((member) => <option key={member.userId} value={member.userId}>{memberLabel(member)}</option>)}
                      </select>
                    </label>
                  </section>
                ) : null}
                <section className="schedule-card-list" aria-label="Upcoming occurrences">
                  <h3>Upcoming Occurrences</h3>
                  {visibleOccurrences.slice(0, 4).map((occurrence) => (
                    <article className="schedule-card" key={occurrence.id}>
                      <strong>{occurrenceTitle(occurrence)}</strong>
                      <span>{occurrenceLine(occurrence)}</span>
                    </article>
                  ))}
                </section>
                <button aria-expanded="false" className="section-action" type="button">History</button>
                {editorStatus ? <p role="status">{editorStatus}</p> : null}
                <div className="form-actions">
                  {editorMode === "create" || editState ? <button type="submit">{editorMode === "create" ? "Save chore" : "Save occurrence"}</button> : null}
                  {editorMode === "edit" && selectedOccurrence ? <button className="section-action" onClick={() => void handleSkip()} type="button">Skip occurrence</button> : null}
                </div>
              </form>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
