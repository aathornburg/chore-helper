import { useEffect, useMemo, useState } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { ChoreOccurrence, HouseholdAppData, HouseholdMemberSummary } from "@chore-helper/shared";
import { getCurrentUser, listHouseholdMembers, listOccurrences } from "../api";
import type { Navigate } from "../types";
import { formatHouseholdSummary } from "../utils/household";

type TodayDashboardProps = {
  households: HouseholdAppData[];
  isLoading: boolean;
  loadError?: string;
  onNavigate: Navigate;
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

export function TodayDashboard({ households, isLoading, loadError, onNavigate }: TodayDashboardProps) {
  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const stripDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(todayStart, index)),
    [todayStart]
  );
  const [selectedDateKey, setSelectedDateKey] = useState(() => format(todayStart, "yyyy-MM-dd"));
  const [viewMode, setViewMode] = useState<TodayViewMode>("merged");
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [membersByHousehold, setMembersByHousehold] = useState<Record<string, HouseholdMemberSummary[]>>({});
  const [occurrencesByHousehold, setOccurrencesByHousehold] = useState<Record<string, ChoreOccurrence[]>>({});
  const [todayDataStatus, setTodayDataStatus] = useState<TodayDataStatus>("idle");

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
        const rangeEnd = stripDates[stripDates.length - 1] ?? todayStart;

        await Promise.all(households.map(async (household) => {
          const [members, occurrences] = await Promise.all([
            listHouseholdMembers(household.id),
            listOccurrences(household.id, buildOccurrenceRange(todayStart, rangeEnd, household.timeZone))
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
  const memberCount = Object.values(membersByHousehold).reduce((total, members) => total + members.length, 0);

  function renderChoreRow(row: TodayOccurrenceRow, options: { showHousehold?: boolean; compact?: boolean } = {}) {
    const isCompleted = row.occurrence.status === "completed";
    const isSkipped = row.occurrence.status === "skipped";
    const canComplete = row.occurrence.status === "planned" && row.occurrence.assignedUserId === currentUserId;

    return (
      <article
        className={`today-chore-row ${isCompleted ? "is-completed" : ""} ${isSkipped ? "is-skipped" : ""}`}
        key={row.occurrence.id}
      >
        <div className="today-chore-status" aria-hidden="true">{isCompleted ? "Completed" : isSkipped ? "Skip" : "Due"}</div>
        <div className="today-chore-main">
          <strong>{row.title}</strong>
          <span className="today-chore-meta">
            {options.showHousehold ? `${row.household.name} / ` : ""}
            {timeLabel(row.occurrence, row.household.timeZone)} / {durationLabel(row.occurrence)} / {row.assigneeLabel}
          </span>
        </div>
        {!options.compact && canComplete ? (
          <button className="section-action" type="button">Complete {row.title}</button>
        ) : null}
        {!options.compact && isCompleted ? (
          <button className="section-action" type="button">Improve future suggestions</button>
        ) : null}
      </article>
    );
  }

  function renderStatusGroup(label: string, rows: TodayOccurrenceRow[]) {
    return (
      <section className="today-status-group" aria-label={`${label} chores`}>
        <div className="today-status-heading">
          <h3>{label}</h3>
          <span>{rows.length}</span>
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
      <header className="workspace-hero first-time-hero">
        <div>
          <p className="eyebrow">Home command center</p>
          <h1>Today</h1>
          <p className="lede">
            {households.length === 0
              ? "Set up your first household to start organizing routines."
              : `Keep ${households.length} household${households.length === 1 ? "" : "s"} moving with clear next actions.`}
          </p>
        </div>
        {households.length === 0 ? (
          <button onClick={() => onNavigate("/households")} type="button">Set up household</button>
        ) : (
          <button onClick={() => onNavigate("/calendar")} type="button">Manage chores</button>
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
          <section aria-label="Seven day chore strip" className="panel today-date-strip">
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
                  <span>{format(date, "EEE")}</span>
                  <strong>{format(date, "d")}</strong>
                  <small>{dueCount} due</small>
                </button>
              );
            })}
          </section>

          <section aria-label="Selected day chores" className="panel today-selected-day">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Today dashboard</p>
                <h2>{format(new Date(`${selectedDateKey}T00:00:00`), "EEEE, MMM d")}</h2>
              </div>
              <div className="today-view-toggle" role="group" aria-label="Today chore grouping">
                <button aria-pressed={viewMode === "merged"} onClick={() => setViewMode("merged")} type="button">
                  Merged
                </button>
                <button aria-pressed={viewMode === "grouped"} onClick={() => setViewMode("grouped")} type="button">
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
            <div className="today-household-chip-row">
              <span>{households.length} household{households.length === 1 ? "" : "s"}</span>
              <span>{viewMode === "merged" ? "Merged schedule" : "Grouped by household"}</span>
            </div>
            <div className="overview-stat-grid today-status-summary">
              <div><span>Ready</span><strong>{selectedDatePlannedCount}</strong></div>
              <div><span>Completed</span><strong>{selectedDateCompletedCount}</strong></div>
              <div><span>Missed</span><strong>{selectedDateSkippedCount}</strong></div>
            </div>
            <div className="today-dashboard-grid">
              <div className="today-selected-list">
                {viewMode === "merged" ? renderSelectedRows(selectedRows) : (
                  <div className="today-household-sections">
                    {households.map((household) => {
                      const householdRows = selectedRows.filter((row) => row.household.id === household.id);
                      return (
                        <section aria-label={`${household.name} chores`} className="today-household-section" key={household.id}>
                          <div className="today-status-heading">
                            <h3>{household.name}</h3>
                            <span>{householdRows.length}</span>
                          </div>
                          {householdRows.length > 0 ? renderSelectedRows(householdRows) : <p className="empty-state">No chores due.</p>}
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section aria-label="Upcoming chores" className="panel today-upcoming-panel">
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

          <section className="today-household-grid" aria-label="Household overview">
            {households.map((household) => {
              const profileComplete = isProfileComplete(household);
              const reviewReady = profileComplete && household.chores.length > 0;
              return (
                <article className="panel today-household-card" key={household.id}>
                  <div className="panel-heading">
                    <h2>{household.name}</h2>
                    <span>{reviewReady ? "Ready to optimize" : profileComplete ? "Ready for chores" : "Needs setup"}</span>
                  </div>
                  <p>{formatHouseholdSummary(household)}</p>
                  <div className="overview-stat-grid">
                    <div><span>Chores</span><strong>{household.chores.length}</strong></div>
                    <div><span>Recommendations</span><strong>{household.recommendations.length}</strong></div>
                  </div>
                  <div className="form-actions">
                    {!profileComplete ? (
                      <button onClick={() => onNavigate("/households")} type="button">Complete profile</button>
                    ) : household.chores.length === 0 ? (
                      <button onClick={() => onNavigate("/calendar")} type="button">Add chores</button>
                    ) : (
                      <button onClick={() => onNavigate("/optimize")} type="button">Optimize plan</button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}

      <section className="panel integration-callout" aria-labelledby="today-calendar-heading">
        <div>
          <p className="eyebrow">Next integration</p>
          <h2 id="today-calendar-heading">Google Calendar</h2>
          <p>Connect your calendar to import routines and review approved schedule changes.</p>
        </div>
        <button className="secondary-action" onClick={() => onNavigate("/settings#calendar")} type="button">
          Set up Calendar
        </button>
      </section>
    </div>
  );
}
