import { addDays, addMinutes, addMonths, addWeeks, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { useEffect, useMemo, useState } from "react";
import type { ChoreOccurrence, HouseholdAppData, HouseholdMemberSummary } from "@chore-helper/shared";
import { getCurrentUser, listHouseholdMembers, listOccurrences, skipOccurrence, updateOccurrence } from "../api";

type CalendarView = "month" | "week" | "day";
type CalendarFilters = { householdId?: string; assignedUserId?: string; status?: string };

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

const viewOptions: CalendarView[] = ["month", "week", "day"];
const timedSlots = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

function memberLabel(member: HouseholdMemberSummary) {
  return member.displayName ?? member.primaryEmail ?? member.clerkUserId;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function durationInMinutes(occurrence: ChoreOccurrence) {
  return Math.round((Date.parse(occurrence.plannedEndAt) - Date.parse(occurrence.plannedStartAt)) / 60000);
}

function rangeForView(date: Date, view: CalendarView, timeZone: string) {
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
  return {
    startAt: fromZonedTime(`${format(startDate, "yyyy-MM-dd")}T00:00:00`, timeZone).toISOString(),
    endAt: fromZonedTime(`${format(endDate, "yyyy-MM-dd")}T23:59:59`, timeZone).toISOString()
  };
}

function localInputValue(instant: string, timeZone: string) {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd'T'HH:mm");
}

export function CalendarPage({ households, isLoading }: CalendarPageProps) {
  const [view, setView] = useState<CalendarView>("month");
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [filters, setFilters] = useState<CalendarFilters>({});
  const [members, setMembers] = useState<HouseholdMemberSummary[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [occurrences, setOccurrences] = useState<ChoreOccurrence[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [editState, setEditState] = useState<EditState>();
  const [draggingId, setDraggingId] = useState<string>();

  const selectedHousehold = households.find((household) => household.id === filters.householdId) ?? households[0];
  const timeZone = selectedHousehold?.timeZone ?? "UTC";
  const isOwner = members.some((member) => member.userId === currentUserId && member.role === "owner");
  const visibleOccurrences = occurrences.filter((occurrence) =>
    !filters.status || filters.status === "all" || occurrence.status === filters.status
  );

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
    const range = rangeForView(focusDate, view, timeZone);
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
  }, [filters.assignedUserId, focusDate, selectedHousehold?.id, timeZone, view]);

  const choreTitles = useMemo(() => new Map(
    (selectedHousehold?.chores ?? []).map((chore) => [chore.id, chore.title])
  ), [selectedHousehold]);

  function occurrenceTitle(occurrence: ChoreOccurrence) {
    return choreTitles.get(occurrence.choreId) ?? "Scheduled chore";
  }

  function openEditor(occurrence: ChoreOccurrence) {
    setEditState({
      occurrenceId: occurrence.id,
      localStart: localInputValue(occurrence.plannedStartAt, timeZone),
      plannedMinutes: String(durationInMinutes(occurrence)),
      assignedUserId: occurrence.assignedUserId
    });
  }

  async function saveUpdate(occurrence: ChoreOccurrence, localStart: string, minutes: number, assignedUserId: string) {
    if (!selectedHousehold) return;
    const plannedStart = fromZonedTime(localStart, timeZone);
    const updated = await updateOccurrence(selectedHousehold.id, occurrence.id, {
      plannedStartAt: plannedStart.toISOString(),
      plannedEndAt: addMinutes(plannedStart, minutes).toISOString(),
      assignedUserId
    });
    setOccurrences((current) => current.map((item) => item.id === updated.id ? updated : item));
    setEditState((current) => current?.occurrenceId === updated.id ? {
      occurrenceId: updated.id,
      localStart: localInputValue(updated.plannedStartAt, timeZone),
      plannedMinutes: String(durationInMinutes(updated)),
      assignedUserId: updated.assignedUserId
    } : current);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!editState) return;
    const occurrence = occurrences.find((item) => item.id === editState.occurrenceId);
    if (!occurrence) return;
    await saveUpdate(occurrence, editState.localStart, Number(editState.plannedMinutes), editState.assignedUserId);
  }

  async function handleSkip() {
    if (!selectedHousehold || !editState) return;
    const updated = await skipOccurrence(selectedHousehold.id, editState.occurrenceId);
    setOccurrences((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  async function handleDrop(slot: string) {
    const occurrence = occurrences.find((item) => item.id === draggingId);
    if (!occurrence) return;
    const date = formatInTimeZone(occurrence.plannedStartAt, timeZone, "yyyy-MM-dd");
    await saveUpdate(occurrence, `${date}T${slot}`, durationInMinutes(occurrence), occurrence.assignedUserId);
    setDraggingId(undefined);
  }

  function renderOccurrence(occurrence: ChoreOccurrence) {
    const title = occurrenceTitle(occurrence);
    return (
      <article
        aria-label={`Scheduled ${title}`}
        className={`calendar-event ${occurrence.status === "skipped" ? "is-skipped" : ""}`}
        draggable={isOwner && view !== "month"}
        key={occurrence.id}
        onDragStart={() => setDraggingId(occurrence.id)}
      >
        <strong>{title}</strong>
        <span>{formatInTimeZone(occurrence.plannedStartAt, timeZone, "EEE, MMM d / h:mm a")} / {durationInMinutes(occurrence)} min</span>
        <span>{members.find((member) => member.userId === occurrence.assignedUserId)?.displayName ?? "Assigned member"}</span>
        {occurrence.status === "skipped" ? <span className="calendar-status">Skipped</span> : null}
        {isOwner ? (
          <button className="section-action" onClick={() => openEditor(occurrence)} type="button">
            Edit {title}
          </button>
        ) : null}
      </article>
    );
  }

  if (isLoading) return <div className="calendar-page"><p>Loading calendar...</p></div>;

  return (
    <div className="calendar-page">
      <header className="workspace-hero compact-hero">
        <div>
          <p className="eyebrow">Household planner</p>
          <h1>Calendar</h1>
          <p className="lede">Review planned chores, rotate assignments, and adjust individual occurrences.</p>
        </div>
        <div className="calendar-view-toggle" aria-label="Calendar view">
          {viewOptions.map((option) => (
            <button aria-pressed={view === option} key={option} onClick={() => setView(option)} type="button">
              {capitalize(option)}
            </button>
          ))}
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
                <option value="skipped">Skipped</option>
              </select>
            </label>
            <div className="calendar-period-controls">
              <button className="section-action" onClick={() => setFocusDate((date) => view === "month" ? addMonths(date, -1) : view === "week" ? addWeeks(date, -1) : addDays(date, -1))} type="button">Previous</button>
              <strong>{formatInTimeZone(focusDate, timeZone, "MMMM yyyy")}</strong>
              <button className="section-action" onClick={() => setFocusDate((date) => view === "month" ? addMonths(date, 1) : view === "week" ? addWeeks(date, 1) : addDays(date, 1))} type="button">Next</button>
            </div>
          </section>

          {loadState === "error" ? <section className="panel">Could not load scheduled chores.</section> : null}
          {loadState === "ready" && visibleOccurrences.length === 0 ? <section className="panel">No planned chores in this range.</section> : null}
          {view === "month" && visibleOccurrences.length > 0 ? (
            <section className="calendar-month-grid" aria-label="Monthly occurrences">
              {visibleOccurrences.map(renderOccurrence)}
            </section>
          ) : null}
          {view !== "month" ? (
            <section className="panel calendar-agenda" aria-label={`${capitalize(view)} agenda`}>
              {timedSlots.map((slot) => (
                <div
                  aria-label={`${slot} time slot`}
                  className="calendar-time-slot"
                  key={slot}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => void handleDrop(slot)}
                >
                  <span>{slot}</span>
                  {visibleOccurrences.filter((occurrence) =>
                    formatInTimeZone(occurrence.plannedStartAt, timeZone, "HH:mm").startsWith(slot.slice(0, 2))
                  ).map(renderOccurrence)}
                </div>
              ))}
            </section>
          ) : null}

          {isOwner && editState ? (
            <form className="panel calendar-edit-form" onSubmit={(event) => void handleSubmit(event)}>
              <h2>Edit occurrence</h2>
              <label>
                Planned start
                <input type="datetime-local" value={editState.localStart} onChange={(event) => setEditState({ ...editState, localStart: event.target.value })} />
              </label>
              <label>
                Planned duration
                <input min="1" type="number" value={editState.plannedMinutes} onChange={(event) => setEditState({ ...editState, plannedMinutes: event.target.value })} />
              </label>
              <label>
                Assignee
                <select value={editState.assignedUserId} onChange={(event) => setEditState({ ...editState, assignedUserId: event.target.value })}>
                  {members.map((member) => <option key={member.userId} value={member.userId}>{memberLabel(member)}</option>)}
                </select>
              </label>
              <div className="form-actions">
                <button type="submit">Save occurrence</button>
                <button className="section-action" onClick={() => void handleSkip()} type="button">Skip occurrence</button>
              </div>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}
