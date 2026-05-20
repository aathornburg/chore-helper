import { useEffect, useMemo, useState } from "react";
import type { Chore, HouseholdBaseline, Recommendation } from "@chore-helper/shared";
import {
  archiveChore,
  createChore,
  generateRecommendations,
  listArchivedChores,
  listChores,
  listRecommendations,
  restoreChore,
  updateChore
} from "./api";

type PlanReviewProps = {
  householdId?: string;
  householdName?: string;
  baseline?: HouseholdBaseline;
};

type QueueSignal = "Duration concern" | "Cadence review" | "Ready";

function formatBaselineSummary(baseline?: HouseholdBaseline) {
  if (!baseline) return "Household context is not complete yet.";

  return `${baseline.homeType} / ${baseline.rooms.length} rooms / ${baseline.flooring.join(", ")} / ${
    baseline.hasPets ? "pets" : "no pets"
  } / ${baseline.hasOutdoorSpace ? "outdoor space" : "no outdoor space"}`;
}

/*
  PlanReview is similar to an Angular component that consumes a service.
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
    recommendation.title.toLowerCase().includes(chore.title.toLowerCase())
  );
}

function renderStatus(status: string) {
  if (status !== "Could not load the review queue.") return status;

  return (
    <>
      <span>Could not load the </span>
      <span>review queue.</span>
    </>
  );
}

export function PlanReview({
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
  const [showArchived, setShowArchived] = useState(false);
  const [recommendationsStale, setRecommendationsStale] = useState(false);
  const [choreTitle, setChoreTitle] = useState("");
  const [choreCadence, setChoreCadence] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editCadence, setEditCadence] = useState("");
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState("");
  const choreSource = "manual";
  const selectedChore = chores.find((chore) => chore.id === selectedChoreId) ?? chores[0];
  const selectedRecommendation = findRecommendationForChore(selectedChore, recommendations);
  const pendingRecommendations = recommendations.filter(
    (recommendation) => recommendation.status === "pending" || !recommendation.status
  );
  const durationConcerns = useMemo(
    () => chores.filter((chore) => getQueueSignal(chore) === "Duration concern").length,
    [chores]
  );

  useEffect(() => {
    if (!householdId) return;
    const activeHouseholdId = householdId;

    let cancelled = false;

    async function loadQueue() {
      // Like Angular component state plus ngOnInit/ngOnChanges work, this effect drives
      // render state from the current householdId and cleans up stale async updates.
      setQueueState("loading");
      setStatus("Loading review queue...");

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
          setStatus("Could not load the review queue.");
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
    setRecommendations([]);
    setRecommendationsStale(true);
    setStatus("Manual acceptance only");
  }

  async function handleReview() {
    if (!householdId) return;

    setStatus("Asking the assistant to review your chore plan...");
    const nextRecommendations = await generateRecommendations(
      householdId,
      "Review my existing setup and suggest practical improvements."
    );
    setRecommendations(nextRecommendations);
    setRecommendationsStale(false);
    setStatus("Review complete.");
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
    setRecommendationsStale(true);
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
    setRecommendationsStale(true);
    setStatus("Chores changed. Run review again for updated recommendations.");
  }

  async function handleLoadArchivedChores() {
    if (!householdId) return;

    if (!showArchived) {
      setArchivedChores(await listArchivedChores(householdId));
    }
    setShowArchived((currentValue) => !currentValue);
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
    setRecommendationsStale(true);
    setStatus("Chores changed. Run review again for updated recommendations.");
  }

  if (!householdId) {
    return (
      <section className="placeholder-page">
        <p className="eyebrow">Plan</p>
        <h1>Plan</h1>
        <p className="lede">Set up a household before reviewing existing chores.</p>
      </section>
    );
  }

  return (
    <div className="plan-review">
      <header className="workspace-hero compact-hero">
        <div>
          <p className="eyebrow">Expert review workspace</p>
          <h1>Plan</h1>
          <p className="lede">
            Optimize existing chores with rationale-backed recommendations before accepting any
            changes.
          </p>
          <p className="supporting-copy">
            <strong>{householdName}</strong> / {formatBaselineSummary(baseline)}
          </p>
          <p className="section-summary">{formatBaselineSummary(baseline)}</p>
        </div>
        <div className="header-action">
          <p className="status" role="status">{renderStatus(status)}</p>
          <button onClick={handleReview} type="button">Review my chore plan</button>
        </div>
      </header>

      <section className="dashboard-section plan-queue-section" aria-labelledby="review-queue-heading">
        <div className="section-heading">
          <div className="section-title">
            <span>01</span>
            <div>
              <h2 id="review-queue-heading">Review Queue</h2>
              <p>Existing chores that may need cadence, duration, or coverage review.</p>
            </div>
          </div>
          <span className="confidence">Manual acceptance only</span>
        </div>

        <div className="metric-grid">
          <article className="metric-card good">
            <span>Tracked chores</span>
            <strong>{chores.length}</strong>
            <p>Manual and imported chores will share this queue.</p>
          </article>
          <article className="metric-card strong">
            <span>Duration concerns</span>
            <strong>{durationConcerns}</strong>
            <p>Broad chores with short estimates need a closer look.</p>
          </article>
          <article className="metric-card attention">
            <span>Pending recommendations</span>
            <strong>{pendingRecommendations.length}</strong>
            <p>Suggestions stay manual until accepted later.</p>
          </article>
        </div>

        {queueState === "error" ? (
          <div className="empty-state">Could not load the review queue.</div>
        ) : null}

        {queueState === "ready" ? (
          chores.length === 0 ? (
            <div className="plan-empty-grid">
              <div className="empty-state">
                {recommendationsStale ? "No active chores in the review queue." : "Add one existing chore manually to start the review queue."}
              </div>
              <form className="manual-chore-form" onSubmit={handleAddChore}>
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
                <button type="submit">Add chore to queue</button>
              </form>
            </div>
          ) : (
            <div className="plan-review-grid">
              <div className="queue-list" aria-label="Existing chores">
                {chores.map((chore) => (
                  <button
                    aria-pressed={selectedChore?.id === chore.id}
                    className="queue-card"
                    key={chore.id}
                    onClick={() => setSelectedChoreId(chore.id)}
                    type="button"
                  >
                    <span>{getQueueSignal(chore)}</span>
                    <strong>{chore.title}</strong>
                    <small>{chore.cadence} / {chore.estimatedMinutes} min / {chore.source}</small>
                  </button>
                ))}
              </div>

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
                        Run review to see rationale and confidence for this chore.
                      </div>
                    )}
                  </>
                ) : null}
              </aside>
            </div>
          )
        ) : null}

        {queueState === "ready" ? (
          <div className="archived-chores">
            <button onClick={handleLoadArchivedChores} type="button">
              {showArchived ? "Hide archived chores" : "Show archived chores"}
            </button>
            {showArchived ? (
              archivedChores.length > 0 ? (
                <div className="queue-list" aria-label="Archived chores">
                  {archivedChores.map((chore) => (
                    <article className="queue-card" key={chore.id}>
                      <span>Archived</span>
                      <strong>{chore.title}</strong>
                      <small>{chore.cadence} / {chore.estimatedMinutes} min / {chore.source}</small>
                      <button type="button" onClick={() => handleRestoreChore(chore.id)}>
                        Restore {chore.title}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">No archived chores yet.</div>
              )
            ) : null}
          </div>
        ) : null}
      </section>

      {recommendations.length > 0 ? (
        <section className="dashboard-section recommendations-section" aria-labelledby="recommendations-heading">
          <div className="section-heading">
            <div className="section-title">
              <span>02</span>
              <div>
                <h2 id="recommendations-heading">Recommendations</h2>
                <p>Suggestions appear with rationale and confidence for manual acceptance.</p>
              </div>
            </div>
          </div>
          <div className="recommendation-list">
            {recommendations.map((recommendation) => (
              <article key={recommendation.id} className="recommendation">
                <div>
                  <span className="recommendation-type">Recommendation</span>
                  <h3>{recommendation.title}</h3>
                  <p>{recommendation.rationale}</p>
                </div>
                <span className="confidence">Confidence: {recommendation.confidence}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
