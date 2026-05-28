import { useEffect, useMemo, useState } from "react";
import {
  type ChoreReviewState,
  type Chore,
  type ChoreDefinitionInput,
  type ChoreSchedule,
  type Household,
  type HouseholdMemberSummary,
  type Recommendation,
  type ScheduleInput
} from "@chore-helper/shared";
import {
  archiveChore,
  createSchedule,
  createScheduledChore,
  getCurrentUser,
  listAllChores,
  listAllRecommendations,
  listHouseholdMembers,
  listSchedules,
  restoreChore,
  updateChore
} from "../api";

// In older TS versions, this definition is generally less desirable than an enum
// But with the --erasableSyntaxOnly flag (tsconfig), this is recommended as it
// Allows the entire TS project to be run directly thru Node instead of having to
// Go through transpiling
type QueueSignal = "Duration concern" | "Cadence review" | "Ready";
type ChoreStatusTab = "all-active" | "unreviewed" | "recommendation-pending" | "reviewed" | "archived";
type LegacyChore = Chore & { cadence?: string; estimatedMinutes?: number };
type LegacyChoreSchedule = ChoreSchedule & { localStartTime?: string; plannedMinutes?: number };

const ChoreStatusTabs: { key: ChoreStatusTab; label: string }[] = [
  { key: "all-active", label: "All active" },
  { key: "unreviewed", label: "Unreviewed" },
  { key: "recommendation-pending", label: "Pending" },
  { key: "reviewed", label: "Reviewed" },
  { key: "archived", label: "Archived" }
];

/*
  ChoresPage is similar to an Angular component that consumes a service.
  It keeps UI state local and delegates network requests to the API module,
  similar to how Angular components call service methods instead of
  performing HTTP logic directly.
*/

function getQueueSignal(chore: LegacyChore): QueueSignal {
  const title = chore.title.toLowerCase();
  const cadence = chore.cadence ?? "";
  const estimatedMinutes = chore.estimatedMinutes ?? 0;
  const broadCleaningAsk =
    title.includes("bathroom") ||
    title.includes("floor") ||
    title.includes("vacuum") ||
    title.includes("mop");

  if (broadCleaningAsk && estimatedMinutes < 15) return "Duration concern";
  if (!["daily", "weekly", "biweekly", "monthly"].includes(cadence.toLowerCase())) {
    return "Cadence review";
  }

  return "Ready";
}

function findRecommendationForChore(chore: LegacyChore | undefined, recommendations: Recommendation[]) {
  if (!chore) return undefined;

  return recommendations.find((recommendation) =>
    recommendation.affectedChoreId === chore.id ||
    recommendation.title.toLowerCase().includes(chore.title.toLowerCase())
  );
}

function getChoreReviewState(chore: LegacyChore, recommendations: Recommendation[]): ChoreReviewState {
  const recommendation = findRecommendationForChore(chore, recommendations);
  if (!recommendation) return "unreviewed";
  if (recommendation.decision === "applied") return "reviewed";
  return "recommendation-pending";
}

function formatReviewState(state: ChoreReviewState) {
  if (state === "recommendation-pending") return "Recommendation pending";
  if (state === "reviewed") return "Reviewed";
  return "Unreviewed";
}

function getEmptyChoreMessage(activeTab: ChoreStatusTab) {
  if (activeTab === "unreviewed") {
    return "No unreviewed chores. New or changed chores will appear here before review.";
  }
  if (activeTab === "recommendation-pending") {
    return "No chores have pending recommendations.";
  }
  if (activeTab === "reviewed") {
    return "No reviewed chores yet. Applied recommendations will move chores here.";
  }
  if (activeTab === "archived") {
    return "No archived chores yet.";
  }

  return "No active chores yet. Add a chore to start building the household routine.";
}

function formatChoreHousehold(chore: LegacyChore) {
  return chore.householdName ?? chore.householdId;
}

function formatScheduleRecurrence(schedule: ChoreSchedule) {
  if (schedule.recurrence.frequency === "one_time") return "Once";
  if (schedule.recurrence.frequency === "weekly") return "Weekly";
  if (schedule.recurrence.frequency === "monthly") return "Monthly";
  return "Daily";
}

function formatLegacyCadence(chore: LegacyChore) {
  return chore.cadence ?? "scheduled";
}

function formatLegacyEstimatedMinutes(chore: LegacyChore) {
  return chore.estimatedMinutes ?? 0;
}

function addMinutesToLocalTime(localStartTime: string, durationMinutes: number) {
  const [hours = 0, minutes = 0] = localStartTime.split(":").map(Number);
  const totalMinutes = ((hours * 60 + minutes + durationMinutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
}

function getSchedulePlannedMinutes(schedule: LegacyChoreSchedule) {
  if (typeof schedule.plannedMinutes === "number") return schedule.plannedMinutes;
  if ("estimatedMinutes" in schedule) return schedule.estimatedMinutes;
  const [startHours = 0, startMinutes = 0] = schedule.localStartTime.split(":").map(Number);
  const [endHours = 0, endMinutes = 0] = schedule.localEndTime.split(":").map(Number);
  const startTotal = startHours * 60 + startMinutes;
  const endTotal = endHours * 60 + endMinutes;
  return (endTotal - startTotal + 24 * 60) % (24 * 60);
}

function buildTimedScheduleInput({
  frequency,
  interval,
  weekDays,
  monthlyDay,
  localStartTime,
  plannedMinutes,
  startsOn,
  endsOn,
  assignmentMode,
  assignees
}: {
  frequency: ChoreSchedule["recurrence"]["frequency"];
  interval: string;
  weekDays: string;
  monthlyDay: string;
  localStartTime: string;
  plannedMinutes: string;
  startsOn: string;
  endsOn: string;
  assignmentMode: ChoreSchedule["assignment"]["mode"];
  assignees: string[];
}): ScheduleInput {
  const recurrence: ChoreSchedule["recurrence"] = {
    frequency,
    interval: Number(interval),
    ...(frequency === "weekly"
      ? { weekDays: weekDays.split(",").map((day) => Number(day.trim())).filter((day) => !Number.isNaN(day)) }
      : {}),
    ...(frequency === "monthly" ? { monthlyDay: Number(monthlyDay) } : {})
  };
  const durationMinutes = Number(plannedMinutes);

  return {
    planningMode: "timed",
    recurrence,
    localStartTime,
    localEndTime: addMinutesToLocalTime(localStartTime, durationMinutes),
    startsOn,
    ...(endsOn ? { endsOn } : {}),
    assignment: { mode: assignmentMode, memberUserIds: assignees }
  };
}

type ChoresPageProps = {
  households: Household[];
  householdsLoading: boolean;
  onNavigate: (path: string) => void;
};

export function ChoresPage({ households, householdsLoading, onNavigate }: ChoresPageProps) {
  const [chores, setChores] = useState<LegacyChore[]>([]);
  const [archivedChores, setArchivedChores] = useState<LegacyChore[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [expandedChoreId, setExpandedChoreId] = useState<string>();
  const [queueState, setQueueState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [status, setStatus] = useState("Ready to review existing chores.");
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<ChoreStatusTab>("all-active");
  const [editTitle, setEditTitle] = useState("");
  const [editCadence, setEditCadence] = useState("");
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editTags, setEditTags] = useState("");
  const [schedules, setSchedules] = useState<LegacyChoreSchedule[]>([]);
  const [scheduleMembers, setScheduleMembers] = useState<HouseholdMemberSummary[]>([]);
  const [canManageSchedules, setCanManageSchedules] = useState(false);
  const [scheduleLoadState, setScheduleLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isScheduleFormOpen, setIsScheduleFormOpen] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState<ChoreSchedule["recurrence"]["frequency"]>("daily");
  const [scheduleInterval, setScheduleInterval] = useState("1");
  const [scheduleWeekDays, setScheduleWeekDays] = useState("1");
  const [scheduleMonthlyDay, setScheduleMonthlyDay] = useState("1");
  const [scheduleStartTime, setScheduleStartTime] = useState("09:00");
  const [schedulePlannedMinutes, setSchedulePlannedMinutes] = useState("30");
  const [scheduleStartsOn, setScheduleStartsOn] = useState("2026-05-25");
  const [scheduleEndsOn, setScheduleEndsOn] = useState("");
  const [scheduleAssignmentMode, setScheduleAssignmentMode] = useState<ChoreSchedule["assignment"]["mode"]>("fixed");
  const [scheduleAssignees, setScheduleAssignees] = useState<string[]>([]);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isCreatingChore, setIsCreatingChore] = useState(false);
  const [newHouseholdId, setNewHouseholdId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newCadence, setNewCadence] = useState("");
  const [newEstimatedMinutes, setNewEstimatedMinutes] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newScheduleMembers, setNewScheduleMembers] = useState<HouseholdMemberSummary[]>([]);
  const [newCanManageSchedules, setNewCanManageSchedules] = useState(false);
  const [newScheduleLoadState, setNewScheduleLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [newHasInitialSchedule, setNewHasInitialSchedule] = useState(false);
  const [newScheduleFrequency, setNewScheduleFrequency] = useState<ChoreSchedule["recurrence"]["frequency"]>("daily");
  const [newScheduleInterval, setNewScheduleInterval] = useState("1");
  const [newScheduleWeekDays, setNewScheduleWeekDays] = useState("1");
  const [newScheduleMonthlyDay, setNewScheduleMonthlyDay] = useState("1");
  const [newScheduleStartTime, setNewScheduleStartTime] = useState("09:00");
  const [newSchedulePlannedMinutes, setNewSchedulePlannedMinutes] = useState("30");
  const [newScheduleStartsOn, setNewScheduleStartsOn] = useState("2026-05-25");
  const [newScheduleEndsOn, setNewScheduleEndsOn] = useState("");
  const [newScheduleAssignmentMode, setNewScheduleAssignmentMode] = useState<ChoreSchedule["assignment"]["mode"]>("fixed");
  const [newScheduleAssignees, setNewScheduleAssignees] = useState<string[]>([]);
  // Like an Angular accordion item keyed by id, only the expanded row owns the edit form.
  const expandedChore = chores.find((chore) => chore.id === expandedChoreId);
  const expandedRecommendation = findRecommendationForChore(expandedChore, recommendations);
  const visibleChores = useMemo(() => {
    if (activeTab === "all-active") return chores;
    if (activeTab === "archived") return archivedChores;
    return chores.filter((chore) => getChoreReviewState(chore, recommendations) === activeTab);
  }, [activeTab, archivedChores, chores, recommendations]);

  useEffect(() => {
    let cancelled = false;

    async function loadQueue() {
      // Like Angular component state plus ngOnInit/ngOnChanges work, this effect drives
      // render state from the current aggregate queue and cleans up stale async updates.
      setQueueState("loading");
      setStatus("Loading chores...");

      try {
        const [nextChores, nextRecommendations] = await Promise.all([
          listAllChores(),
          listAllRecommendations()
        ]);
        if (cancelled) return;

        setChores(nextChores);
        setRecommendations(nextRecommendations);
        setQueueState("ready");
        setStatus("Manual acceptance only");
      } catch {
        if (!cancelled) {
          setQueueState("error");
          setStatus("Could not load chores.");
        }
      }
    }

    void loadQueue();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleExpandChore(chore: Chore) {
    if (expandedChoreId === chore.id) {
      setExpandedChoreId(undefined);
      return;
    }

    setEditTitle(chore.title);
    setEditCadence(formatLegacyCadence(chore));
    setEditEstimatedMinutes(String(formatLegacyEstimatedMinutes(chore)));
    setEditInstructions(chore.instructions ?? "");
    setEditTags((chore.tags ?? []).join(", "));
    setExpandedChoreId(chore.id);
    setIsScheduleFormOpen(false);
    setScheduleLoadState("loading");
    try {
      const [loadedSchedules, members, user] = await Promise.all([
        listSchedules(chore.householdId, chore.id),
        listHouseholdMembers(chore.householdId),
        getCurrentUser()
      ]);
      setSchedules(loadedSchedules);
      setScheduleMembers(members);
      setCanManageSchedules(members.some((member) => member.userId === user.id && member.role === "owner"));
      setScheduleAssignees(members[0] ? [members[0].userId] : []);
      setScheduleLoadState("ready");
    } catch {
      setScheduleLoadState("error");
    }
  }

  function handleCancelEdit() {
    setExpandedChoreId(undefined);
  }


  function handleOpenAddChore() {
    setNewHouseholdId("");
    setNewTitle("");
    setNewCadence("");
    setNewEstimatedMinutes("");
    setNewInstructions("");
    setNewTags("");
    setNewScheduleMembers([]);
    setNewCanManageSchedules(false);
    setNewScheduleLoadState("idle");
    setNewHasInitialSchedule(true);
    setNewScheduleFrequency("daily");
    setNewScheduleInterval("1");
    setNewScheduleWeekDays("1");
    setNewScheduleMonthlyDay("1");
    setNewScheduleStartTime("09:00");
    setNewSchedulePlannedMinutes("30");
    setNewScheduleStartsOn("2026-05-25");
    setNewScheduleEndsOn("");
    setNewScheduleAssignmentMode("fixed");
    setNewScheduleAssignees([]);
    setIsAddFormOpen(true);
  }

  function handleCancelAddChore() {
    setIsAddFormOpen(false);
  }

  async function handleNewHouseholdChange(householdId: string) {
    setNewHouseholdId(householdId);
    setNewHasInitialSchedule(false);
    setNewScheduleMembers([]);
    setNewCanManageSchedules(false);
    setNewScheduleAssignees([]);
    if (!householdId) {
      setNewScheduleLoadState("idle");
      return;
    }

    setNewScheduleLoadState("loading");
    try {
      const [members, user] = await Promise.all([
        listHouseholdMembers(householdId),
        getCurrentUser()
      ]);
      const canManage = members.some((member) => member.userId === user.id && member.role === "owner");
      setNewScheduleMembers(members);
      setNewCanManageSchedules(canManage);
      setNewHasInitialSchedule(canManage);
      setNewScheduleAssignees(members[0] ? [members[0].userId] : []);
      setNewScheduleLoadState("ready");
    } catch {
      setNewScheduleLoadState("error");
    }
  }

  function toggleNewScheduleAssignee(userId: string) {
    if (newScheduleAssignmentMode === "fixed") {
      setNewScheduleAssignees([userId]);
      return;
    }
    setNewScheduleAssignees((current) =>
      current.includes(userId) ? current.filter((candidate) => candidate !== userId) : [...current, userId]
    );
  }

  async function handleCreateChore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newHouseholdId || isCreatingChore || !newCanManageSchedules || newScheduleAssignees.length === 0) return;

    setIsCreatingChore(true);
    setStatus("Adding chore...");
    let added: LegacyChore;
    try {
      const created = await createScheduledChore(newHouseholdId, {
        chore: {
          title: newTitle.trim(),
          source: "manual",
          instructions: newInstructions.trim() || undefined,
          tags: newTags.split(",").map((tag) => tag.trim()).filter(Boolean)
        },
        schedules: [buildTimedScheduleInput({
          frequency: newScheduleFrequency,
          interval: newScheduleInterval,
          weekDays: newScheduleWeekDays,
          monthlyDay: newScheduleMonthlyDay,
          localStartTime: newScheduleStartTime,
          plannedMinutes: newSchedulePlannedMinutes,
          startsOn: newScheduleStartsOn,
          endsOn: newScheduleEndsOn,
          assignmentMode: newScheduleAssignmentMode,
          assignees: newScheduleAssignees
        })]
      });
      added = {
        ...created.chore,
        title: newTitle.trim(),
        cadence: newCadence.trim(),
        estimatedMinutes: Number(newEstimatedMinutes),
        householdName: households.find((household) => household.id === newHouseholdId)?.name
      };
    } catch {
      setStatus("Could not add chore.");
      setIsCreatingChore(false);
      return;
    }

    setChores((currentChores) => [...currentChores, added]);
    setRecommendations([]);
    setActiveTab("all-active");
    setStatus("Chore and schedule added. Open Calendar to review planned occurrences.");

    setIsAddFormOpen(false);
    setIsCreatingChore(false);
  }

  async function handleSaveSelectedChore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expandedChore) return;

    setStatus("Saving chore changes...");
    const update: ChoreDefinitionInput = {
      title: editTitle,
      source: "manual",
      instructions: editInstructions.trim() || undefined,
      tags: editTags.split(",").map((tag) => tag.trim()).filter(Boolean)
    };
    const updated = await updateChore(expandedChore.householdId, expandedChore.id, update);

    setChores((currentChores) =>
      currentChores.map((chore) => (chore.id === updated.id ? updated : chore))
    );
    setRecommendations([]);
    setExpandedChoreId(undefined);
    setStatus("Chores changed. Run review again for updated recommendations.");
  }

  function handleOpenScheduleForm() {
    setScheduleFrequency("daily");
    setScheduleInterval("1");
    setScheduleWeekDays("1");
    setScheduleMonthlyDay("1");
    setScheduleStartTime("09:00");
    setSchedulePlannedMinutes("30");
    setScheduleStartsOn("2026-05-25");
    setScheduleEndsOn("");
    setScheduleAssignmentMode("fixed");
    setScheduleAssignees(scheduleMembers[0] ? [scheduleMembers[0].userId] : []);
    setIsScheduleFormOpen(true);
  }

  function toggleScheduleAssignee(userId: string) {
    if (scheduleAssignmentMode === "fixed") {
      setScheduleAssignees([userId]);
      return;
    }
    setScheduleAssignees((current) =>
      current.includes(userId) ? current.filter((candidate) => candidate !== userId) : [...current, userId]
    );
  }

  async function handleCreateSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expandedChore || scheduleAssignees.length === 0) return;

    const created = await createSchedule(expandedChore.householdId, expandedChore.id, buildTimedScheduleInput({
      frequency: scheduleFrequency,
      interval: scheduleInterval,
      weekDays: scheduleWeekDays,
      monthlyDay: scheduleMonthlyDay,
      localStartTime: scheduleStartTime,
      plannedMinutes: schedulePlannedMinutes,
      startsOn: scheduleStartsOn,
      endsOn: scheduleEndsOn,
      assignmentMode: scheduleAssignmentMode,
      assignees: scheduleAssignees
    }));
    setSchedules((current) => [...current, created]);
    setIsScheduleFormOpen(false);
    setStatus("Schedule added. Open Calendar to review planned occurrences.");
  }

  async function handleArchiveSelectedChore() {
    if (!expandedChore) return;

    setStatus("Archiving chore...");
    const archived = await archiveChore(expandedChore.householdId, expandedChore.id);
    setChores((currentChores) => currentChores.filter((chore) => chore.id !== archived.id));
    setArchivedChores((currentChores) => [archived, ...currentChores]);
    setExpandedChoreId(undefined);
    setRecommendations([]);
    setStatus("Chores changed. Run review again for updated recommendations.");
  }

  async function handleLoadArchivedChores() {
    setArchivedChores(await listAllChores({ status: "archived" }));
    setArchivedLoaded(true);
  }

  async function handleRestoreChore(chore: LegacyChore) {
    setStatus("Restoring chore...");
    const restored = await restoreChore(chore.householdId, chore.id);
    setArchivedChores((currentChores) =>
      currentChores.filter((chore) => chore.id !== restored.id)
    );
    setChores((currentChores) => [...currentChores, restored]);
    setExpandedChoreId(undefined);
    setRecommendations([]);
    setActiveTab("all-active");
    setStatus("Chores changed. Run review again for updated recommendations.");
  }

  return (
    <div className="chores-page">
      <header className="workspace-hero compact-hero">
        <div>
          <h1>Chores</h1>
          <p className="lede">
            Add, edit, archive, and track your chores all in one place.
          </p>
        </div>
        <button className="secondary-action" onClick={() => onNavigate("/settings#calendar")} type="button">
          Import calendar events
        </button>
      </header>

      <section className="dashboard-section plan-queue-section" aria-labelledby="review-queue-heading">
        <div className="section-heading">
          <div className="section-title">
            <div>
              <h2 id="review-queue-heading">Chore list</h2>
              <p>Manage active and archived chores, review state, and recommendation decisions.</p>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button
            disabled={householdsLoading || households.length === 0 || isCreatingChore}
            onClick={handleOpenAddChore}
            type="button"
          >
            Add chore
          </button>
        </div>

        {!householdsLoading && households.length === 0 ? (
          <div className="empty-state">Add a household before creating chores.</div>
        ) : null}

        {isAddFormOpen ? (
          <form className="manual-chore-form compact-chore-form" onSubmit={handleCreateChore}>
            <div className="field-grid">
              <label>
                Household
                <select
                  disabled={isCreatingChore}
                  required
                  value={newHouseholdId}
                  onChange={(event) => void handleNewHouseholdChange(event.target.value)}
                >
                  <option value="">Select household</option>
                  {households.map((household) => (
                    <option key={household.id} value={household.id}>{household.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Chore title
                <input
                  disabled={isCreatingChore}
                  required
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                />
              </label>
              <label>
                Cadence
                <input
                  disabled={isCreatingChore}
                  required
                  value={newCadence}
                  onChange={(event) => setNewCadence(event.target.value)}
                />
              </label>
              <label>
                Estimated minutes
                <input
                  disabled={isCreatingChore}
                  min="1"
                  required
                  type="number"
                  value={newEstimatedMinutes}
                  onChange={(event) => setNewEstimatedMinutes(event.target.value)}
                />
              </label>
              <label>
                Source
                <select disabled value="manual" onChange={() => undefined}>
                  <option value="manual">Manual</option>
                </select>
              </label>
              <label>
                Instructions
                <textarea
                  disabled={isCreatingChore}
                  value={newInstructions}
                  onChange={(event) => setNewInstructions(event.target.value)}
                />
              </label>
              <label>
                Tags
                <input
                  disabled={isCreatingChore}
                  placeholder="bathroom, weekly"
                  value={newTags}
                  onChange={(event) => setNewTags(event.target.value)}
                />
              </label>
            </div>
            {newScheduleLoadState === "loading" ? <p className="section-summary">Loading household members...</p> : null}
            {newCanManageSchedules ? (
              <label className="checkbox-field initial-schedule-toggle">
                <input
                  checked={newHasInitialSchedule}
                  disabled
                  onChange={() => undefined}
                  type="checkbox"
                />
                Add initial schedule
              </label>
            ) : null}
            {newHasInitialSchedule ? (
              <section className="schedule-form initial-schedule-form" aria-label="Initial schedule">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Optional timing</p>
                    <h3>Initial schedule</h3>
                  </div>
                </div>
                <div className="field-grid">
                  <label>
                    Frequency
                    <select value={newScheduleFrequency} onChange={(event) => setNewScheduleFrequency(event.target.value as ChoreSchedule["recurrence"]["frequency"])}>
                      <option value="one_time">One time</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </label>
                  <label>
                    Repeat every
                    <input min="1" type="number" value={newScheduleInterval} onChange={(event) => setNewScheduleInterval(event.target.value)} />
                  </label>
                  {newScheduleFrequency === "weekly" ? (
                    <label>
                      Weekdays (0-6)
                      <input value={newScheduleWeekDays} onChange={(event) => setNewScheduleWeekDays(event.target.value)} />
                    </label>
                  ) : null}
                  {newScheduleFrequency === "monthly" ? (
                    <label>
                      Day of month
                      <input min="1" max="31" type="number" value={newScheduleMonthlyDay} onChange={(event) => setNewScheduleMonthlyDay(event.target.value)} />
                    </label>
                  ) : null}
                  <label>
                    Start time
                    <input type="time" value={newScheduleStartTime} onChange={(event) => setNewScheduleStartTime(event.target.value)} />
                  </label>
                  <label>
                    Planned duration
                    <input min="1" type="number" value={newSchedulePlannedMinutes} onChange={(event) => setNewSchedulePlannedMinutes(event.target.value)} />
                  </label>
                  <label>
                    Starts on
                    <input type="date" value={newScheduleStartsOn} onChange={(event) => setNewScheduleStartsOn(event.target.value)} />
                  </label>
                  <label>
                    Ends on
                    <input type="date" value={newScheduleEndsOn} onChange={(event) => setNewScheduleEndsOn(event.target.value)} />
                  </label>
                  <label>
                    Assignment mode
                    <select value={newScheduleAssignmentMode} onChange={(event) => {
                      const mode = event.target.value as ChoreSchedule["assignment"]["mode"];
                      setNewScheduleAssignmentMode(mode);
                      if (mode === "fixed" && newScheduleAssignees[0]) setNewScheduleAssignees([newScheduleAssignees[0]]);
                    }}>
                      <option value="fixed">Fixed</option>
                      <option value="rotation">Rotation</option>
                    </select>
                  </label>
                </div>
                <fieldset className="schedule-assignees">
                  <legend>Assignees</legend>
                  {newScheduleMembers.map((member) => (
                    <label className="checkbox-field" key={member.userId}>
                      <input
                        checked={newScheduleAssignees.includes(member.userId)}
                        name="new-schedule-assignee"
                        onChange={() => toggleNewScheduleAssignee(member.userId)}
                        type={newScheduleAssignmentMode === "fixed" ? "radio" : "checkbox"}
                      />
                      {member.displayName ?? member.primaryEmail ?? member.clerkUserId}
                    </label>
                  ))}
                </fieldset>
              </section>
            ) : null}
            <div className="form-actions">
              <button
                disabled={
                  isCreatingChore ||
                  newScheduleLoadState !== "ready" ||
                  !newCanManageSchedules ||
                  newScheduleAssignees.length === 0
                }
                type="submit"
              >
                Save chore
              </button>
              <button
                className="secondary-action"
                disabled={isCreatingChore}
                onClick={handleCancelAddChore}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {queueState === "loading" ? (
          <div className="empty-state">Loading chores...</div>
        ) : null}

        {queueState === "error" ? (
          <div className="empty-state">Could not load chores.</div>
        ) : null}

        {queueState === "ready" && !householdsLoading && households.length !== 0 ? (
          <div className="chore-list-toolbar">
            <div className="status-tabs" role="tablist" aria-label="Chore status filters">
              {ChoreStatusTabs.map(({ key, label }) => (
                <button
                  aria-selected={activeTab === key}
                  key={key}
                  onClick={() => {
                    setActiveTab(key as ChoreStatusTab);
                    if (key === "archived" && !archivedLoaded) void handleLoadArchivedChores();
                  }}
                  role="tab"
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="chore-list-actions" />
          </div>
        ) : null}

        {queueState === "ready" && status !== "Manual acceptance only" ? (
          <div className="empty-state">{status}</div>
        ) : null}

        {queueState === "ready" ? (
          !householdsLoading && households.length !== 0 && visibleChores.length === 0 ? (
            <div className="empty-state">
              {getEmptyChoreMessage(activeTab)}
            </div>
          ) : (
            <div className="queue-list chore-row-list" aria-label="Existing chores">
              {visibleChores.map((chore) => {
                const reviewState = getChoreReviewState(chore, recommendations);
                const isExpanded = expandedChoreId === chore.id;

                if (activeTab === "archived") {
                  return (
                    <article className="queue-card chore-row" key={chore.id}>
                      <div className="chore-row-summary">
                        <span>Archived</span>
                        <strong>{chore.title}</strong>
                        <small>
                          {formatChoreHousehold(chore)} / {formatLegacyCadence(chore)} / {formatLegacyEstimatedMinutes(chore)} min / {chore.source}
                        </small>
                      </div>
                      <div className="archived-chore-actions">
                        <button type="button" onClick={() => handleRestoreChore(chore)}>
                          Restore {chore.title}
                        </button>
                      </div>
                    </article>
                  );
                }

                return (
                  <article className={`queue-card chore-row chore-card-${reviewState}`} key={chore.id}>
                    <button
                      aria-label={`Expand ${chore.title}`}
                      aria-expanded={isExpanded}
                      className="chore-row-summary"
                      onClick={() => void handleExpandChore(chore)}
                      type="button"
                    >
                      <span>{formatReviewState(reviewState)}</span>
                      <strong>{chore.title}</strong>
                      <small>
                        {formatChoreHousehold(chore)} / {formatLegacyCadence(chore)} / {formatLegacyEstimatedMinutes(chore)} min / {chore.source}
                      </small>
                    </button>

                    {isExpanded ? (
                      <div className="chore-row-editor">
                        <p className="eyebrow">{getQueueSignal(chore)}</p>
                        <p className="supporting-copy">Household: {formatChoreHousehold(chore)}</p>
                        <form className="manual-chore-form inline-chore-form" onSubmit={handleSaveSelectedChore}>
                          <div className="field-grid">
                            <label>
                              Selected chore title
                              <input
                                required
                                value={editTitle}
                                onChange={(event) => setEditTitle(event.target.value)}
                              />
                            </label>
                            <label>
                              Selected chore cadence
                              <input
                                required
                                value={editCadence}
                                onChange={(event) => setEditCadence(event.target.value)}
                              />
                            </label>
                            <label>
                              Selected chore estimated minutes
                              <input
                                min="1"
                                required
                                type="number"
                                value={editEstimatedMinutes}
                                onChange={(event) => setEditEstimatedMinutes(event.target.value)}
                              />
                            </label>
                            <label>
                              Selected chore source
                              <select value="manual" onChange={() => undefined}>
                                <option value="manual">Manual</option>
                              </select>
                            </label>
                            <label>
                              Instructions
                              <textarea
                                value={editInstructions}
                                onChange={(event) => setEditInstructions(event.target.value)}
                              />
                            </label>
                            <label>
                              Tags
                              <input
                                placeholder="bathroom, weekly"
                                value={editTags}
                                onChange={(event) => setEditTags(event.target.value)}
                              />
                            </label>
                          </div>
                          <div className="form-actions">
                            <button type="submit">Save chore changes</button>
                            <button onClick={handleArchiveSelectedChore} type="button">Archive chore</button>
                            <button className="secondary-action" onClick={handleCancelEdit} type="button">
                              Cancel edit
                            </button>
                          </div>
                        </form>
                        <section className="schedule-editor" aria-label={`${chore.title} schedules`}>
                          <div className="panel-heading">
                            <div>
                              <p className="eyebrow">Timing and assignments</p>
                              <h3>Schedules</h3>
                            </div>
                            {canManageSchedules ? (
                              <button onClick={handleOpenScheduleForm} type="button">Add schedule</button>
                            ) : null}
                          </div>
                          {scheduleLoadState === "loading" ? <p>Loading schedules...</p> : null}
                          {scheduleLoadState === "error" ? <p>Could not load schedules.</p> : null}
                          {scheduleLoadState === "ready" && schedules.length === 0 ? <p>No schedules yet.</p> : null}
                          <div className="schedule-card-list">
                            {schedules.map((schedule) => (
                              <article className="schedule-card" key={schedule.id}>
                                <strong>{formatScheduleRecurrence(schedule)}</strong>
                                <span>{schedule.localStartTime} / {getSchedulePlannedMinutes(schedule)} min</span>
                                <span>{schedule.assignment.mode === "rotation" ? "Rotates assignments" : "Fixed assignment"}</span>
                              </article>
                            ))}
                          </div>
                          {isScheduleFormOpen ? (
                            <form className="schedule-form" onSubmit={(event) => void handleCreateSchedule(event)}>
                              <div className="field-grid">
                                <label>
                                  Frequency
                                  <select value={scheduleFrequency} onChange={(event) => setScheduleFrequency(event.target.value as ChoreSchedule["recurrence"]["frequency"])}>
                                    <option value="one_time">One time</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                  </select>
                                </label>
                                <label>
                                  Repeat every
                                  <input min="1" type="number" value={scheduleInterval} onChange={(event) => setScheduleInterval(event.target.value)} />
                                </label>
                                {scheduleFrequency === "weekly" ? (
                                  <label>
                                    Weekdays (0-6)
                                    <input value={scheduleWeekDays} onChange={(event) => setScheduleWeekDays(event.target.value)} />
                                  </label>
                                ) : null}
                                {scheduleFrequency === "monthly" ? (
                                  <label>
                                    Day of month
                                    <input min="1" max="31" type="number" value={scheduleMonthlyDay} onChange={(event) => setScheduleMonthlyDay(event.target.value)} />
                                  </label>
                                ) : null}
                                <label>
                                  Start time
                                  <input type="time" value={scheduleStartTime} onChange={(event) => setScheduleStartTime(event.target.value)} />
                                </label>
                                <label>
                                  Planned duration
                                  <input min="1" type="number" value={schedulePlannedMinutes} onChange={(event) => setSchedulePlannedMinutes(event.target.value)} />
                                </label>
                                <label>
                                  Starts on
                                  <input type="date" value={scheduleStartsOn} onChange={(event) => setScheduleStartsOn(event.target.value)} />
                                </label>
                                <label>
                                  Ends on
                                  <input type="date" value={scheduleEndsOn} onChange={(event) => setScheduleEndsOn(event.target.value)} />
                                </label>
                                <label>
                                  Assignment mode
                                  <select value={scheduleAssignmentMode} onChange={(event) => {
                                    const mode = event.target.value as ChoreSchedule["assignment"]["mode"];
                                    setScheduleAssignmentMode(mode);
                                    if (mode === "fixed" && scheduleAssignees[0]) setScheduleAssignees([scheduleAssignees[0]]);
                                  }}>
                                    <option value="fixed">Fixed</option>
                                    <option value="rotation">Rotation</option>
                                  </select>
                                </label>
                              </div>
                              <fieldset className="schedule-assignees">
                                <legend>Assignees</legend>
                                {scheduleMembers.map((member) => (
                                  <label className="checkbox-field" key={member.userId}>
                                    <input
                                      checked={scheduleAssignees.includes(member.userId)}
                                      name="schedule-assignee"
                                      onChange={() => toggleScheduleAssignee(member.userId)}
                                      type={scheduleAssignmentMode === "fixed" ? "radio" : "checkbox"}
                                    />
                                    {member.displayName ?? member.primaryEmail ?? member.clerkUserId}
                                  </label>
                                ))}
                              </fieldset>
                              <div className="form-actions">
                                <button type="submit">Save schedule</button>
                                <button className="secondary-action" onClick={() => setIsScheduleFormOpen(false)} type="button">Cancel schedule</button>
                              </div>
                            </form>
                          ) : null}
                          {schedules.length > 0 ? (
                            <button className="section-action" onClick={() => onNavigate("/calendar")} type="button">Open Calendar</button>
                          ) : null}
                        </section>
                        {expandedRecommendation ? (
                          <article className="recommendation inline-recommendation">
                            <div>
                              <span className="recommendation-type">Recommendation</span>
                              <h3>{expandedRecommendation.title}</h3>
                              <p>{expandedRecommendation.rationale}</p>
                            </div>
                            <span className="confidence">Confidence: {expandedRecommendation.confidence}</span>
                          </article>
                        ) : (
                          <div className="empty-state">
                            No recommendation for this chore yet.
                          </div>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )
        ) : null}
      </section>
    </div>
  );
}
