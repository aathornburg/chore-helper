import { useEffect, useMemo, useState } from "react";
import { type ChoreReviewState, type Chore, type HouseholdBaseline, type Recommendation } from "@chore-helper/shared";
import {
  applyRecommendationDecisions,
  archiveChore,
  createChore,
  generateRecommendations,
  listArchivedChores,
  listChores,
  listRecommendations,
  restoreChore,
  updateRecommendationDecision,
  updateChore
} from "../api";

type PlanReviewProps = {
  householdId?: string;
  householdName?: string;
  baseline?: HouseholdBaseline;
};

// In older TS versions, this definition is generally less desirable than an enum
// But with the --erasableSyntaxOnly flag (tsconfig), this is recommended as it
// Allows the entire TS project to be run directly thru Node instead of having to
// Go through transpiling
type QueueSignal = "Duration concern" | "Cadence review" | "Ready";
type ChoreStatusTab = "all-active" | "unreviewed" | "recommendation-pending" | "reviewed" | "archived";

const ChoreStatusTabs: { key: ChoreStatusTab; label: string }[] = [
  { key: "all-active", label: "All active" },
  { key: "unreviewed", label: "Unreviewed" },
  { key: "recommendation-pending", label: "Recommendation pending" },
  { key: "reviewed", label: "Reviewed" },
  { key: "archived", label: "Archived" }
];

function formatBaselineSummary(baseline?: HouseholdBaseline) {
  if (!baseline) return "Household context is not complete yet.";

  return `${baseline.homeType} / ${baseline.rooms.length} rooms / ${baseline.flooring.join(", ")} / ${
    baseline.hasPets ? "pets" : "no pets"
  } / ${baseline.hasOutdoorSpace ? "outdoor space" : "no outdoor space"}`;
}

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

function formatUnreviewedSummary(count: number) {
  return count === 1
    ? "1 chore has not been reviewed yet"
    : `${count} chores have not been reviewed yet`;
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

function renderStatus(status: string) {
  if (status !== "Could not load chores.") return status;

  return (
    <>
      <span>Could not load </span>
      <span>chores.</span>
    </>
  );
}

export function ChoresPage({
  householdId,
  householdName = "Home",
  baseline
}: PlanReviewProps) {
  const [chores, setChores] = useState<Chore[]>([]);
  const [archivedChores, setArchivedChores] = useState<Chore[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [selectedChoreId, setSelectedChoreId] = useState<string>();
  const [queueState, setQueueState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [status, setStatus] = useState("Ready to review existing chores.");
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<ChoreStatusTab>("all-active");
  const [reviewFlowOpen, setReviewFlowOpen] = useState(false);
  const [reviewStep, setReviewStep] = useState<"select" | "decide">("select");
  const [selectedReviewChoreIds, setSelectedReviewChoreIds] = useState<string[]>([]);
  const [reviewRecommendations, setReviewRecommendations] = useState<Recommendation[]>([]);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [choreTitle, setChoreTitle] = useState("");
  const [choreCadence, setChoreCadence] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editCadence, setEditCadence] = useState("");
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState("");
  const choreSource = "manual";
  const selectedChore = chores.find((chore) => chore.id === selectedChoreId) ?? chores[0];
  const selectedRecommendation = findRecommendationForChore(selectedChore, recommendations);
  const unreviewedCount = useMemo(
    () => chores.filter((chore) => getChoreReviewState(chore, recommendations) === "unreviewed").length,
    [chores, recommendations]
  );
  const visibleChores = useMemo(() => {
    if (activeTab === "all-active") return chores;
    if (activeTab === "archived") return archivedChores;
    return chores.filter((chore) => getChoreReviewState(chore, recommendations) === activeTab);
  }, [activeTab, archivedChores, chores, recommendations]);

  useEffect(() => {
    if (!householdId) return;
    const activeHouseholdId = householdId;

    let cancelled = false;

    async function loadQueue() {
      // Like Angular component state plus ngOnInit/ngOnChanges work, this effect drives
      // render state from the current householdId and cleans up stale async updates.
      setQueueState("loading");
      setStatus("Loading chores...");

      try {
        const [nextChores, nextRecommendations] = await Promise.all([
          listChores(activeHouseholdId),
          listRecommendations(activeHouseholdId)
        ]);
        if (cancelled) return;

        setChores(nextChores);
        setRecommendations(nextRecommendations);
        setSelectedChoreId(nextChores[0]?.id);
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
  }, [householdId]);

  useEffect(() => {
    if (!selectedChore) return;

    // Similar to Angular ngOnChanges for an @Input, this copies the selected chore
    // into local edit fields so typing can be cancelled or saved explicitly.
    setEditTitle(selectedChore.title);
    setEditCadence(selectedChore.cadence);
    setEditEstimatedMinutes(String(selectedChore.estimatedMinutes));
  }, [selectedChore]);

  async function handleAddChore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdId) return;

    setStatus("Adding chore to queue...");
    const created = await createChore(householdId, {
      title: choreTitle,
      cadence: choreCadence,
      estimatedMinutes: Number(estimatedMinutes),
      source: choreSource
    });

    setChores((currentChores) => [...currentChores, created]);
    setSelectedChoreId(created.id);
    setChoreTitle("");
    setChoreCadence("");
    setEstimatedMinutes("");
    setAddFormOpen(false);
    setActiveTab("all-active");
    setRecommendations([]);
    setStatus("Manual acceptance only");
  }

  function handleStartReviewFlow() {
    const defaultIds = chores
      .filter((chore) => getChoreReviewState(chore, recommendations) === "unreviewed")
      .map((chore) => chore.id);

    setSelectedReviewChoreIds(defaultIds.length > 0 ? defaultIds : chores.map((chore) => chore.id));
    setReviewRecommendations([]);
    setReviewStep("select");
    setReviewFlowOpen(true);
  }

  async function handleGenerateSelectedReview() {
    if (!householdId) return;

    setStatus("Reviewing selected chores...");
    const nextRecommendations = await generateRecommendations(
      householdId,
      "Review the selected chores and suggest practical improvements.",
      selectedReviewChoreIds
    );
    setReviewRecommendations(nextRecommendations);
    setRecommendations(nextRecommendations);
    setReviewStep("decide");
    setStatus("Review ready.");
  }

  async function handleDecisionChange(
    recommendation: Recommendation,
    decision: Recommendation["decision"]
  ) {
    if (!householdId || !decision) return;

    const updated = await updateRecommendationDecision(householdId, recommendation.id, decision);
    setReviewRecommendations((currentRecommendations) =>
      currentRecommendations.map((candidate) => (candidate.id === updated.id ? updated : candidate))
    );
    setRecommendations((currentRecommendations) =>
      currentRecommendations.map((candidate) => (candidate.id === updated.id ? updated : candidate))
    );
  }

  async function handleApplyDecisions() {
    if (!householdId) return;

    setStatus("Applying recommendation decisions...");
    await applyRecommendationDecisions(householdId);
    const [nextChores, nextRecommendations] = await Promise.all([
      listChores(householdId),
      listRecommendations(householdId)
    ]);
    setChores(nextChores);
    setRecommendations(nextRecommendations);
    setReviewRecommendations([]);
    setReviewFlowOpen(false);
    setStatus("Recommendation decisions applied.");
  }

  async function handleSaveSelectedChore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdId || !selectedChore) return;

    setStatus("Saving chore changes...");
    const updated = await updateChore(householdId, selectedChore.id, {
      title: editTitle,
      cadence: editCadence,
      estimatedMinutes: Number(editEstimatedMinutes),
      source: "manual"
    });

    setChores((currentChores) =>
      currentChores.map((chore) => (chore.id === updated.id ? updated : chore))
    );
    setRecommendations([]);
    setStatus("Chores changed. Run review again for updated recommendations.");
  }

  async function handleArchiveSelectedChore() {
    if (!householdId || !selectedChore) return;

    setStatus("Archiving chore...");
    const archived = await archiveChore(householdId, selectedChore.id);
    setChores((currentChores) => currentChores.filter((chore) => chore.id !== archived.id));
    setArchivedChores((currentChores) => [archived, ...currentChores]);
    setSelectedChoreId(undefined);
    setRecommendations([]);
    setStatus("Chores changed. Run review again for updated recommendations.");
  }

  async function handleLoadArchivedChores() {
    if (!householdId) return;

    setArchivedChores(await listArchivedChores(householdId));
    setArchivedLoaded(true);
  }

  async function handleRestoreChore(choreId: string) {
    if (!householdId) return;

    setStatus("Restoring chore...");
    const restored = await restoreChore(householdId, choreId);
    setArchivedChores((currentChores) =>
      currentChores.filter((chore) => chore.id !== restored.id)
    );
    setChores((currentChores) => [...currentChores, restored]);
    setSelectedChoreId(restored.id);
    setRecommendations([]);
    setActiveTab("all-active");
    setStatus("Chores changed. Run review again for updated recommendations.");
  }

  if (!householdId) {
    return (
      <section className="placeholder-page">
        <p className="eyebrow">Chores</p>
        <h1>Household chores</h1>
        <p className="lede">Set up a household before reviewing existing chores.</p>
      </section>
    );
  }

  return (
    <div className="plan-review">
      <header className="workspace-hero compact-hero">
        <div>
          <h1>Household chores</h1>
          <p className="lede">
            Add, edit, archive, and track your chores all in one place.
          </p>
          <p className="supporting-copy">
            <span><strong>{householdName}</strong> / {formatBaselineSummary(baseline)}</span>
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
          <span className="confidence" role="status">{renderStatus(status)}</span>
        </div>

        {unreviewedCount > 0 ? (
          <section className="review-entry-panel" aria-label="Review entry point">
            <div>
              <strong>{formatUnreviewedSummary(unreviewedCount)}</strong>
              <p>Choose which chores the assistant should review. You can include already-reviewed chores if you want a second pass.</p>
            </div>
            <button className="secondary-action" onClick={handleStartReviewFlow} type="button">
              Start review flow
            </button>
          </section>
        ) : null}

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

        <div className="chore-list-actions">
          <button className="secondary-action" onClick={() => setAddFormOpen((isOpen) => !isOpen)} type="button">
            {addFormOpen ? "Cancel add chore" : "Add chore"}
          </button>
        </div>

        {addFormOpen ? (
          <form className="manual-chore-form compact-chore-form" onSubmit={handleAddChore}>
            <div className="field-grid">
              <label>
                Chore title
                <input
                  placeholder="Clean bathrooms"
                  required
                  value={choreTitle}
                  onChange={(event) => setChoreTitle(event.target.value)}
                />
              </label>
              <label>
                Cadence
                <input
                  placeholder="weekly"
                  required
                  value={choreCadence}
                  onChange={(event) => setChoreCadence(event.target.value)}
                />
              </label>
              <label>
                Estimated minutes
                <input
                  min="1"
                  placeholder="5"
                  required
                  type="number"
                  value={estimatedMinutes}
                  onChange={(event) => setEstimatedMinutes(event.target.value)}
                />
              </label>
              <label>
                Source
                <select value={choreSource} onChange={() => undefined}>
                  <option value="manual">Manual</option>
                </select>
              </label>
            </div>
            <button type="submit">Save chore</button>
          </form>
        ) : null}

        {reviewFlowOpen ? (
          <section className="dashboard-section review-flow-section" aria-label="Review flow">
            {reviewStep === "select" ? (
              <>
                <h2>Choose chores to review</h2>
                <p>Unreviewed chores are selected by default. You can add reviewed chores if you want another pass.</p>
                <div className="review-checkbox-list">
                  {chores.map((chore) => (
                    <label className="review-checkbox-row" key={chore.id}>
                      <input
                        checked={selectedReviewChoreIds.includes(chore.id)}
                        onChange={(event) => {
                          setSelectedReviewChoreIds((currentIds) =>
                            event.target.checked
                              ? [...currentIds, chore.id]
                              : currentIds.filter((id) => id !== chore.id)
                          );
                        }}
                        type="checkbox"
                      />
                      <span>{chore.title}</span>
                    </label>
                  ))}
                </div>
                <div className="form-actions">
                  <button className="secondary-action" onClick={() => setReviewFlowOpen(false)} type="button">Cancel</button>
                  <button onClick={handleGenerateSelectedReview} type="button">Review selected chores</button>
                </div>
              </>
            ) : (
              <>
                <h2>Decide on recommendations</h2>
                <div className="recommendation-list">
                  {reviewRecommendations.map((recommendation) => (
                    <article className="recommendation" key={recommendation.id}>
                      <div>
                        <span className="recommendation-type">Recommendation</span>
                        <h3>{recommendation.title}</h3>
                        <p>{recommendation.rationale}</p>
                      </div>
                      <div className="decision-toggle" role="group" aria-label={`Decision for ${recommendation.title}`}>
                        <button
                          aria-pressed={recommendation.decision === "accepted"}
                          onClick={() => handleDecisionChange(recommendation, "accepted")}
                          type="button"
                        >
                          Accept {recommendation.title}
                        </button>
                        <button
                          aria-pressed={recommendation.decision === "declined"}
                          onClick={() => handleDecisionChange(recommendation, "declined")}
                          type="button"
                        >
                          Decline {recommendation.title}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="context-support">
                  <strong>Recommendations not adding up?</strong>
                  <p>Make sure your household context is correct for more accurate recommendations.</p>
                  <button className="secondary-action" onClick={() => setReviewFlowOpen(false)} type="button">
                    Review household context
                  </button>
                </div>
                <div className="form-actions">
                  <button className="secondary-action" onClick={() => setReviewStep("select")} type="button">Back</button>
                  <button onClick={handleApplyDecisions} type="button">Apply decisions</button>
                </div>
              </>
            )}
          </section>
        ) : null}

        {queueState === "error" ? (
          <div className="empty-state">{renderStatus(status)}</div>
        ) : null}

        {queueState === "ready" ? (
          visibleChores.length === 0 ? (
            <div className="empty-state">
              {getEmptyChoreMessage(activeTab)}
            </div>
          ) : (
            <div className="plan-review-grid">
              <div className="queue-list" aria-label="Existing chores">
                {visibleChores.map((chore) => {
                  const reviewState = getChoreReviewState(chore, recommendations);

                  if (activeTab === "archived") {
                    return (
                      <article className="queue-card" key={chore.id}>
                        <span>Archived</span>
                        <strong>{chore.title}</strong>
                        <small>{chore.cadence} / {chore.estimatedMinutes} min / {chore.source}</small>
                        <button type="button" onClick={() => handleRestoreChore(chore.id)}>
                          Restore {chore.title}
                        </button>
                      </article>
                    );
                  }

                  return (
                  <button
                    aria-pressed={selectedChore?.id === chore.id}
                    className={`queue-card chore-card-${reviewState}`}
                    key={chore.id}
                    onClick={() => setSelectedChoreId(chore.id)}
                    type="button"
                  >
                    <span>{formatReviewState(reviewState)}</span>
                    <strong>{chore.title}</strong>
                    <small>{chore.cadence} / {chore.estimatedMinutes} min / {chore.source}</small>
                  </button>
                  );
                })}
              </div>

              {activeTab !== "archived" ? (
                <aside className="detail-panel" aria-label="Selected chore review">
                {selectedChore ? (
                  <>
                    <p className="eyebrow">{getQueueSignal(selectedChore)}</p>
                    <h3>{selectedChore.title}</h3>
                    <form className="manual-chore-form" onSubmit={handleSaveSelectedChore}>
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
                      </div>
                    </form>
                    {selectedRecommendation ? (
                      <article className="recommendation">
                        <div>
                          <span className="recommendation-type">Recommendation</span>
                          <h3>{selectedRecommendation.title}</h3>
                          <p>{selectedRecommendation.rationale}</p>
                        </div>
                        <span className="confidence">Confidence: {selectedRecommendation.confidence}</span>
                      </article>
                    ) : (
                      <div className="empty-state">
                        No recommendation for this chore yet.
                      </div>
                    )}
                  </>
                ) : null}
                </aside>
              ) : null}
            </div>
          )
        ) : null}
      </section>
    </div>
  );
}
