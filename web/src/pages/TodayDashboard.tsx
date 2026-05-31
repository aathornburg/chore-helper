import { useEffect, useMemo, useState } from "react";
import { addDays, addWeeks, format, startOfDay, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { ChoreOccurrence, CompletionCheckInInput, HouseholdAppData, HouseholdMemberSummary } from "@chore-helper/shared";
import { completeOccurrence, getCurrentUser, listHouseholdMembers, listOccurrences, updateCompletionCheckIn } from "../api";
import type { Navigate } from "../types";
import type { WeekStartDay } from "../types";
import { formatHouseholdSummary } from "../utils/household";
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleIcon,
  ClockIcon,
  HomeIcon,
  UsersIcon
} from "../components/AppIcons";

type TodayDashboardProps = {
  households: HouseholdAppData[];
  isLoading: boolean;
  loadError?: string;
  onNavigate: Navigate;
  weekStartDay: WeekStartDay;
};

function isProfileComplete(household: HouseholdAppData) {
  return Boolean(household.profile) && household.structure.floors.length > 0;
}

type TodayViewMode = "merged" | "grouped";
type TodayDataStatus = "idle" | "loading" | "ready" | "error";
type TodayOccurrenceRow = {
  occurrence: ChoreOccurrence;
  household: HouseholdAppData;
  title: string;
  assigneeLabel: string;
};
type CompletionCheckInDraft = Required<Pick<CompletionCheckInInput, "completedOnTime" | "durationAccurate" | "rebaseFutureOccurrences">>;

function occurrenceDateKey(occurrence: ChoreOccurrence, timeZone: string) {
  return occurrence.plannedStartAt
    ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "yyyy-MM-dd")
    : occurrence.eligibleStartOn;
}

function choreTitle(household: HouseholdAppData, occurrence: ChoreOccurrence) {
  return household.chores.find((chore) => chore.id === occurrence.choreId)?.title ?? "Scheduled chore";
}

function assigneeLabel(members: HouseholdMemberSummary[], userId: string) {
  const member = members.find((item) => item.userId === userId || item.clerkUserId === userId);
  return member?.displayName ?? member?.primaryEmail ?? "Unassigned";
}

function durationLabel(occurrence: ChoreOccurrence) {
  return `${occurrence.estimatedMinutes} min`;
}

function timeLabel(occurrence: ChoreOccurrence, timeZone: string) {
  return occurrence.plannedStartAt ? formatInTimeZone(occurrence.plannedStartAt, timeZone, "h:mm a") : "Anytime";
}

function buildOccurrenceRange(startDate: Date, endDate: Date, timeZone: string) {
  const startOn = format(startDate, "yyyy-MM-dd");
  const endOn = format(endDate, "yyyy-MM-dd");

  return {
    startAt: fromZonedTime(`${startOn}T00:00:00`, timeZone).toISOString(),
    endAt: fromZonedTime(`${endOn}T23:59:59`, timeZone).toISOString(),
    startOn,
    endOn
  };
}

export function TodayDashboard({ households, isLoading, loadError, onNavigate, weekStartDay }: TodayDashboardProps) {
  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const [weekOffset, setWeekOffset] = useState(0);
  const stripDates = useMemo(
    () => {
      const weekStart = addWeeks(
        startOfWeek(todayStart, { weekStartsOn: weekStartDay === "monday" ? 1 : 0 }),
        weekOffset
      );
      return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    },
    [todayStart, weekOffset, weekStartDay]
  );
  const [selectedDateKey, setSelectedDateKey] = useState(() => format(todayStart, "yyyy-MM-dd"));
  const [viewMode, setViewMode] = useState<TodayViewMode>("merged");
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [membersByHousehold, setMembersByHousehold] = useState<Record<string, HouseholdMemberSummary[]>>({});
  const [occurrencesByHousehold, setOccurrencesByHousehold] = useState<Record<string, ChoreOccurrence[]>>({});
  const [todayDataStatus, setTodayDataStatus] = useState<TodayDataStatus>("idle");
  const [toast, setToast] = useState<{ occurrenceId: string; title: string; row: TodayOccurrenceRow }>();
  const [checkInTarget, setCheckInTarget] = useState<TodayOccurrenceRow>();
  const [checkInDraft, setCheckInDraft] = useState<CompletionCheckInDraft>({
    completedOnTime: true,
    durationAccurate: true,
    rebaseFutureOccurrences: false
  });

  useEffect(() => {
    const visibleDateKeys = stripDates.map((date) => format(date, "yyyy-MM-dd"));
    if (!visibleDateKeys.includes(selectedDateKey)) {
      setSelectedDateKey(visibleDateKeys[0] ?? format(todayStart, "yyyy-MM-dd"));
    }
  }, [selectedDateKey, stripDates, todayStart]);

  useEffect(() => {
    if (isLoading || loadError || households.length === 0) {
      setMembersByHousehold({});
      setOccurrencesByHousehold({});
      setTodayDataStatus("idle");
      return;
    }

    let isCurrent = true;
    setTodayDataStatus("loading");

    async function loadTodayData() {
      try {
        const currentUser = await getCurrentUser();
        const nextMembersByHousehold: Record<string, HouseholdMemberSummary[]> = {};
        const nextOccurrencesByHousehold: Record<string, ChoreOccurrence[]> = {};
        const rangeStart = stripDates[0] ?? todayStart;
        const rangeEnd = stripDates[stripDates.length - 1] ?? rangeStart;

        await Promise.all(households.map(async (household) => {
          const [members, occurrences] = await Promise.all([
            listHouseholdMembers(household.id),
            listOccurrences(household.id, buildOccurrenceRange(rangeStart, rangeEnd, household.timeZone))
          ]);
          nextMembersByHousehold[household.id] = members;
          nextOccurrencesByHousehold[household.id] = occurrences;
        }));

        if (!isCurrent) return;
        setCurrentUserId(currentUser.id);
        setMembersByHousehold(nextMembersByHousehold);
        setOccurrencesByHousehold(nextOccurrencesByHousehold);
        setTodayDataStatus("ready");
      } catch {
        if (!isCurrent) return;
        setTodayDataStatus("error");
      }
    }

    void loadTodayData();

    return () => {
      isCurrent = false;
    };
  }, [households, isLoading, loadError, stripDates, todayStart]);

  const allRows = useMemo(
    () => households.flatMap((household) =>
      (occurrencesByHousehold[household.id] ?? []).map((occurrence) => ({
        occurrence,
        household,
        title: choreTitle(household, occurrence),
        assigneeLabel: assigneeLabel(membersByHousehold[household.id] ?? [], occurrence.assignedUserId)
      }))
    ),
    [households, membersByHousehold, occurrencesByHousehold]
  );
  const selectedRows = allRows.filter(
    (row) => occurrenceDateKey(row.occurrence, row.household.timeZone) === selectedDateKey
  );
  const upcomingRows = allRows.filter(
    (row) => occurrenceDateKey(row.occurrence, row.household.timeZone) >= selectedDateKey
  );
  const selectedDatePlannedCount = selectedRows.filter(
    (row) => row.occurrence.status === "planned"
  ).length;
  const selectedDateCompletedCount = selectedRows.filter(
    (row) => row.occurrence.status === "completed"
  ).length;
  const selectedDateSkippedCount = selectedRows.filter(
    (row) => row.occurrence.status === "skipped"
  ).length;
  const selectedDateRemainingMinutes = selectedRows
    .filter((row) => row.occurrence.status === "planned")
    .reduce((total, row) => total + row.occurrence.estimatedMinutes, 0);
  const memberCount = Object.values(membersByHousehold).reduce((total, members) => total + members.length, 0);
  const selectedDateLabel = format(new Date(`${selectedDateKey}T00:00:00`), "EEEE, MMM d");

  function remainingHoursLabel(minutes: number) {
    if (minutes === 0) return "0";
    const hours = minutes / 60;
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  }

  function renderChoreRow(row: TodayOccurrenceRow, options: { showHousehold?: boolean; compact?: boolean } = {}) {
    const isCompleted = row.occurrence.status === "completed";
    const isSkipped = row.occurrence.status === "skipped";
    const canComplete = row.occurrence.status === "planned" && row.occurrence.assignedUserId === currentUserId;
    const statusLabel = isCompleted ? "Completed" : isSkipped ? "Skipped" : "Due";

    return (
      <article
        className={`today-chore-row ${isCompleted ? "is-completed" : ""} ${isSkipped ? "is-skipped" : ""}`}
        key={row.occurrence.id}
      >
        <div className="today-chore-status" aria-label={statusLabel}>
          {isCompleted ? <CheckIcon /> : isSkipped ? "-" : <CircleIcon />}
        </div>
        <div className="today-chore-main">
          <strong>{row.title}</strong>
          <span className="today-chore-meta">
            {timeLabel(row.occurrence, row.household.timeZone)} / {durationLabel(row.occurrence)}
          </span>
        </div>
        {options.showHousehold ? <span className="today-household-chip">{row.household.name}</span> : null}
        {!options.compact ? <span className="today-row-assignee">{row.assigneeLabel}</span> : null}
        {!options.compact ? <span className="today-row-time">{durationLabel(row.occurrence)}</span> : null}
        {!options.compact && canComplete ? (
          <button className="today-row-complete" onClick={() => void completeFromToday(row)} type="button">
            <CheckIcon aria-hidden="true" />
            <span className="sr-only">Complete {row.title}</span>
          </button>
        ) : null}
        {!options.compact && isCompleted ? (
          <button
            aria-label={`Improve future suggestions for ${row.title}`}
            className="today-row-improve"
            onClick={() => openCheckInSheet(row)}
            type="button"
          >
            Improve future suggestions
          </button>
        ) : null}
      </article>
    );
  }

  async function completeFromToday(row: TodayOccurrenceRow) {
    const completed = await completeOccurrence(row.household.id, row.occurrence.id);
    const completedRow = { ...row, occurrence: completed };
    setOccurrencesByHousehold((current) => ({
      ...current,
      [row.household.id]: (current[row.household.id] ?? []).map((occurrence) =>
        occurrence.id === completed.id ? completed : occurrence
      )
    }));
    setToast({ occurrenceId: completed.id, title: row.title, row: completedRow });
  }

  function openCheckInSheet(row: TodayOccurrenceRow) {
    setCheckInDraft({
      completedOnTime: true,
      durationAccurate: true,
      rebaseFutureOccurrences: false
    });
    setCheckInTarget(row);
  }

  async function saveCheckInDetails() {
    if (!checkInTarget) return;
    await updateCompletionCheckIn(checkInTarget.household.id, checkInTarget.occurrence.id, checkInDraft);
    setCheckInTarget(undefined);
  }

  function renderStatusGroup(label: string, rows: TodayOccurrenceRow[]) {
    const headingLabel = `${label.toUpperCase()} (${rows.length})`;
    return (
      <section className="today-status-group" aria-label={`${label} chores`}>
        <div className="today-status-heading">
          <h3>{headingLabel}</h3>
        </div>
        {rows.length > 0 ? (
          <div className="today-chore-list">
            {rows.map((row) => renderChoreRow(row, { showHousehold: households.length > 1 }))}
          </div>
        ) : (
          <p className="empty-state">No chores here.</p>
        )}
      </section>
    );
  }

  function renderSelectedRows(rows: TodayOccurrenceRow[]) {
    return (
      <>
        {renderStatusGroup("To do", rows.filter((row) => row.occurrence.status === "planned"))}
        {renderStatusGroup("Done", rows.filter((row) => row.occurrence.status === "completed"))}
        {renderStatusGroup("Skipped", rows.filter((row) => row.occurrence.status === "skipped"))}
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="dashboard-page">
        <header className="workspace-hero first-time-hero">
          <div>
            <p className="eyebrow">Your home overview</p>
            <h1>Today</h1>
            <p className="lede">Loading your households and chore plans...</p>
          </div>
        </header>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="dashboard-page">
        <header className="workspace-hero first-time-hero">
          <div>
            <p className="eyebrow">Could not load</p>
            <h1>Today</h1>
            <p className="lede">{loadError}</p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="dashboard-page today-page">
      <header className="today-command-header">
        <div className="today-command-copy">
          <h1>Today</h1>
          {households.length === 0 ? (
            <p>Set up your first household to start organizing routines.</p>
          ) : (
            <>
              <div className="today-metric-row" aria-label="Today status summary">
                <span><CheckIcon /> <strong>{selectedDateCompletedCount}</strong> done</span>
                <span><CircleIcon /> <strong>{selectedDatePlannedCount}</strong> to do</span>
                <span><CalendarIcon /> <strong>{selectedDateSkippedCount}</strong> skipped</span>
                <span><ClockIcon /> <strong>{remainingHoursLabel(selectedDateRemainingMinutes)}</strong> hrs remaining</span>
              </div>
              <p>{selectedDatePlannedCount === 0 ? "You're all caught up! Keep it going." : `${selectedDatePlannedCount} chore${selectedDatePlannedCount === 1 ? "" : "s"} ready for ${selectedDateLabel}.`}</p>
            </>
          )}
        </div>
        {households.length === 0 ? (
          <button onClick={() => onNavigate("/households")} type="button">Set up household</button>
        ) : (
          <button className="today-calendar-link" onClick={() => onNavigate("/calendar")} type="button">
            View full calendar
            <ChevronRightIcon />
          </button>
        )}
      </header>

      {households.length === 0 ? (
        <section className="panel setup-focus-panel">
          <p className="eyebrow">Start here</p>
          <h2>Create a home profile</h2>
          <p>Add floors, rooms, pets, and notes so Cleanly can make useful chore recommendations.</p>
        </section>
      ) : (
        <>
          <section aria-label="Seven day chore strip" className="today-week-rail">
            <button
              aria-label="Previous week"
              className="today-rail-arrow"
              onClick={() => setWeekOffset((currentOffset) => currentOffset - 1)}
              type="button"
            >
              <ChevronLeftIcon />
            </button>
            <div className="today-date-strip">
              {stripDates.map((date) => {
                const dateKey = format(date, "yyyy-MM-dd");
                const dueCount = allRows.filter((row) => occurrenceDateKey(row.occurrence, row.household.timeZone) === dateKey).length;
                return (
                  <button
                    aria-label={`${format(date, "EEEE MMM d")} ${dueCount} due`}
                    aria-pressed={selectedDateKey === dateKey}
                    className="today-date-button"
                    key={dateKey}
                    onClick={() => setSelectedDateKey(dateKey)}
                    type="button"
                  >
                    <span className="today-date-weekday">{format(date, "EEE")}</span>
                    <span className="today-date-month">{format(date, "MMM")}</span>
                    <strong className="today-date-number">{format(date, "d")}</strong>
                    <span className="today-date-due-count">{dueCount} due</span>
                  </button>
                );
              })}
            </div>
            <button
              aria-label="Next week"
              className="today-rail-arrow"
              onClick={() => setWeekOffset((currentOffset) => currentOffset + 1)}
              type="button"
            >
              <ChevronRightIcon />
            </button>
          </section>

          <div className="today-operating-grid">
            <section aria-label="Selected day chores" className="today-agenda-panel">
              <div className="today-agenda-header">
                <h2>{selectedDateLabel}</h2>
                <div className="today-view-toggle" role="group" aria-label="Today chore grouping">
                  <button aria-pressed={viewMode === "merged"} onClick={() => setViewMode("merged")} type="button">
                    <UsersIcon />
                    Merged
                  </button>
                  <button aria-pressed={viewMode === "grouped"} onClick={() => setViewMode("grouped")} type="button">
                    <HomeIcon />
                    By household
                  </button>
                </div>
              </div>
              <p>
                {todayDataStatus === "error"
                  ? "We could not load the latest chore schedule."
                  : todayDataStatus === "loading"
                    ? "Loading chore schedule..."
                    : `${selectedDatePlannedCount} chore${selectedDatePlannedCount === 1 ? "" : "s"} ready to work.`}
              </p>
              {viewMode === "merged" ? renderSelectedRows(selectedRows) : (
                <div className="today-household-sections">
                  {households.map((household) => {
                    const householdRows = selectedRows.filter((row) => row.household.id === household.id);
                    return (
                      <section aria-label={`${household.name} chores`} className="today-household-section" key={household.id}>
                        <div className="today-status-heading">
                          <h3>{household.name}</h3>
                        </div>
                        {householdRows.length > 0 ? renderSelectedRows(householdRows) : <p className="empty-state">No chores due.</p>}
                      </section>
                    );
                  })}
                </div>
              )}
              <button className="today-day-link" type="button">View all for this day <ChevronRightIcon /></button>
            </section>

            <aside className="today-right-rail">
              <section aria-label="Upcoming chores" className="today-side-panel today-upcoming-panel">
                <div className="panel-heading">
                  <h2>Upcoming next 7 days</h2>
                  <span>{allRows.length} scheduled</span>
                </div>
                <p>
                  {memberCount} household member{memberCount === 1 ? "" : "s"} included in this view
                  {currentUserId ? `, including you.` : "."}
                </p>
                <div className="today-chore-list">
                  {upcomingRows.length > 0 ? (
                    upcomingRows.slice(0, 5).map((row) => renderChoreRow(row, { showHousehold: households.length > 1, compact: true }))
                  ) : (
                    <p className="empty-state">No chores scheduled in the next week.</p>
                  )}
                </div>
              </section>

              <section className="today-side-panel today-household-grid" aria-label="Household overview">
                <div className="panel-heading">
                  <h2>Households</h2>
                  <span>{households.length}</span>
                </div>
                {households.map((household) => {
                  const profileComplete = isProfileComplete(household);
                  const reviewReady = profileComplete && household.chores.length > 0;
                  const dueToday = selectedRows.filter((row) => row.household.id === household.id && row.occurrence.status === "planned").length;
                  return (
                    <article className="today-household-card" key={household.id}>
                      <div>
                        <h3>{household.name}</h3>
                        <p>{formatHouseholdSummary(household)}</p>
                      </div>
                      <div>
                        <strong>{dueToday} due today</strong>
                        <span>{reviewReady ? "Ready to optimize" : profileComplete ? "Ready for chores" : "Needs setup"}</span>
                      </div>
                      {!profileComplete ? (
                        <button onClick={() => onNavigate("/households")} type="button" aria-label={`Complete ${household.name} profile`}>
                          <ChevronRightIcon />
                        </button>
                      ) : household.chores.length === 0 ? (
                        <button onClick={() => onNavigate("/calendar")} type="button" aria-label={`Add ${household.name} chores`}>
                          <ChevronRightIcon />
                        </button>
                      ) : (
                        <button onClick={() => onNavigate("/optimize")} type="button" aria-label={`Optimize ${household.name} plan`}>
                          <ChevronRightIcon />
                        </button>
                      )}
                    </article>
                  );
                })}
              </section>
            </aside>
          </div>
        </>
      )}

      {toast ? (
        <aside className="today-toast" role="status">
          <strong>{toast.title} marked done</strong>
          <button className="section-action" onClick={() => openCheckInSheet(toast.row)} type="button">
            Add details
          </button>
          <button className="icon-button" onClick={() => setToast(undefined)} type="button" aria-label="Dismiss completion message" />
        </aside>
      ) : null}

      {checkInTarget ? (
        <div className="chore-editor-backdrop" role="presentation">
          <section className="chore-editor-modal today-check-in-sheet" aria-label="Improve future suggestions">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Completion details</p>
                <h2>Improve future suggestions</h2>
              </div>
              <button
                aria-label="Close completion details"
                className="icon-button modal-close-button"
                onClick={() => setCheckInTarget(undefined)}
                type="button"
              />
            </div>
            <p>{checkInTarget.title}</p>
            <label className="checkbox-field">
              <input
                checked={!checkInDraft.completedOnTime}
                onChange={(event) => setCheckInDraft({ ...checkInDraft, completedOnTime: !event.target.checked })}
                type="checkbox"
              />
              It happened later than planned
            </label>
            <label className="checkbox-field">
              <input
                checked={!checkInDraft.durationAccurate}
                onChange={(event) => setCheckInDraft({ ...checkInDraft, durationAccurate: !event.target.checked })}
                type="checkbox"
              />
              The time estimate was off
            </label>
            <label className="checkbox-field">
              <input
                checked={checkInDraft.rebaseFutureOccurrences}
                onChange={(event) => setCheckInDraft({ ...checkInDraft, rebaseFutureOccurrences: event.target.checked })}
                type="checkbox"
              />
              Base future occurrences on this completion date
            </label>
            <div className="form-actions">
              <button onClick={() => void saveCheckInDetails()} type="button">Save details</button>
              <button className="section-action" onClick={() => setCheckInTarget(undefined)} type="button">Cancel</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
