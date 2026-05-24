import { useEffect, useMemo, useState } from "react";
import { type ChoreReviewState, type Chore, type Household, type Recommendation } from "@chore-helper/shared";
import {
  archiveChore,
  createChore,
  listAllChores,
  listAllRecommendations,
  restoreChore,
  updateChore
} from "../api";

// In older TS versions, this definition is generally less desirable than an enum
// But with the --erasableSyntaxOnly flag (tsconfig), this is recommended as it
// Allows the entire TS project to be run directly thru Node instead of having to
// Go through transpiling
type QueueSignal = "Duration concern" | "Cadence review" | "Ready";
type ChoreStatusTab = "all-active" | "unreviewed" | "recommendation-pending" | "reviewed" | "archived";

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

function getQueueSignal(chore: Chore): QueueSignal {
  const title = chore.title.toLowerCase();
  const broadCleaningAsk =
    title.includes("bathroom") ||
    title.includes("floor") ||
    title.includes("vacuum") ||
    title.includes("mop");

  if (broadCleaningAsk && chore.estimatedMinutes < 15) return "Duration concern";
  if (!["daily", "weekly", "biweekly", "monthly"].includes(chore.cadence.toLowerCase())) {
    return "Cadence review";
  }

  return "Ready";
}

function findRecommendationForChore(chore: Chore | undefined, recommendations: Recommendation[]) {
  if (!chore) return undefined;

  return recommendations.find((recommendation) =>
    recommendation.affectedChoreId === chore.id ||
    recommendation.title.toLowerCase().includes(chore.title.toLowerCase())
  );
}

function getChoreReviewState(chore: Chore, recommendations: Recommendation[]): ChoreReviewState {
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

function formatChoreHousehold(chore: Chore) {
  return chore.householdName ?? chore.householdId;
}

type ChoresPageProps = {
  households: Household[];
  householdsLoading: boolean;
};

export function ChoresPage({ households, householdsLoading }: ChoresPageProps) {
  const [chores, setChores] = useState<Chore[]>([]);
  const [archivedChores, setArchivedChores] = useState<Chore[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [expandedChoreId, setExpandedChoreId] = useState<string>();
  const [queueState, setQueueState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [status, setStatus] = useState("Ready to review existing chores.");
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<ChoreStatusTab>("all-active");
  const [editTitle, setEditTitle] = useState("");
  const [editCadence, setEditCadence] = useState("");
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState("");
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isCreatingChore, setIsCreatingChore] = useState(false);
  const [newHouseholdId, setNewHouseholdId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newCadence, setNewCadence] = useState("");
  const [newEstimatedMinutes, setNewEstimatedMinutes] = useState("");
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

  useEffect(() => {
    if (!expandedChore) return;

    // Similar to Angular ngOnChanges for an @Input, this copies the expanded chore
    // into local edit fields so typing can be cancelled or saved explicitly.
    setEditTitle(expandedChore.title);
    setEditCadence(expandedChore.cadence);
    setEditEstimatedMinutes(String(expandedChore.estimatedMinutes));
  }, [expandedChore]);

  function handleExpandChore(chore: Chore) {
    setExpandedChoreId((currentId) => (currentId === chore.id ? undefined : chore.id));
  }

  function handleCancelEdit() {
    setExpandedChoreId(undefined);
  }


  function handleOpenAddChore() {
    setNewHouseholdId("");
    setNewTitle("");
    setNewCadence("");
    setNewEstimatedMinutes("");
    setIsAddFormOpen(true);
  }

  function handleCancelAddChore() {
    setIsAddFormOpen(false);
  }

  async function handleCreateChore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newHouseholdId || isCreatingChore) return;

    setIsCreatingChore(true);
    setStatus("Adding chore...");
    try {
      const added = await createChore(newHouseholdId, {
        title: newTitle.trim(),
        cadence: newCadence.trim(),
        estimatedMinutes: Number(newEstimatedMinutes),
        source: "manual"
      });
      const householdName = households.find((household) => household.id === newHouseholdId)?.name;

      setChores((currentChores) => [...currentChores, { ...added, householdName }]);
      setRecommendations([]);
      setActiveTab("all-active");
      setIsAddFormOpen(false);
      setStatus("Chore added. Run review when you are ready.");
    } catch {
      setStatus("Could not add chore.");
    } finally {
      setIsCreatingChore(false);
    }
  }

  async function handleSaveSelectedChore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expandedChore) return;

    setStatus("Saving chore changes...");
    const updated = await updateChore(expandedChore.householdId, expandedChore.id, {
      title: editTitle,
      cadence: editCadence,
      estimatedMinutes: Number(editEstimatedMinutes),
      source: "manual"
    });

    setChores((currentChores) =>
      currentChores.map((chore) => (chore.id === updated.id ? updated : chore))
    );
    setRecommendations([]);
    setExpandedChoreId(undefined);
    setStatus("Chores changed. Run review again for updated recommendations.");
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

  async function handleRestoreChore(chore: Chore) {
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
                  onChange={(event) => setNewHouseholdId(event.target.value)}
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
            </div>
            <div className="form-actions">
              <button disabled={isCreatingChore} type="submit">Save chore</button>
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
                          {formatChoreHousehold(chore)} / {chore.cadence} / {chore.estimatedMinutes} min / {chore.source}
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
                      aria-expanded={isExpanded}
                      className="chore-row-summary"
                      onClick={() => handleExpandChore(chore)}
                      type="button"
                    >
                      <span>{formatReviewState(reviewState)}</span>
                      <strong>{chore.title}</strong>
                      <small>
                        {formatChoreHousehold(chore)} / {chore.cadence} / {chore.estimatedMinutes} min / {chore.source}
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
                          </div>
                          <div className="form-actions">
                            <button type="submit">Save chore changes</button>
                            <button onClick={handleArchiveSelectedChore} type="button">Archive chore</button>
                            <button className="secondary-action" onClick={handleCancelEdit} type="button">
                              Cancel edit
                            </button>
                          </div>
                        </form>
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
