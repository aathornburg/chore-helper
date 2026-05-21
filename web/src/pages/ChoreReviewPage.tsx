import { useEffect, useMemo, useState } from "react";
import { type Chore, type Recommendation } from "@chore-helper/shared";
import {
  applyRecommendationDecisions,
  generateRecommendations,
  listChores,
  listRecommendations,
  updateRecommendationDecision
} from "../api";

type ReviewStep = "select" | "decide" | "complete";
type ReviewLoadState = "idle" | "loading" | "ready" | "error";

type ChoreReviewPageProps = {
  householdId?: string;
  householdName?: string;
  onBackToChores: () => void;
};

function findRecommendationForChore(chore: Chore, recommendations: Recommendation[]) {
  return recommendations.find((recommendation) =>
    recommendation.affectedChoreId === chore.id ||
    recommendation.title.toLowerCase().includes(chore.title.toLowerCase())
  );
}

function getReviewDefaultSelection(chores: Chore[], recommendations: Recommendation[]) {
  const unreviewedIds = chores
    .filter((chore) => {
      const recommendation = findRecommendationForChore(chore, recommendations);
      return !recommendation || recommendation.decision !== "applied";
    })
    .map((chore) => chore.id);

  return unreviewedIds.length > 0 ? unreviewedIds : chores.map((chore) => chore.id);
}

export function ChoreReviewPage({
  householdId,
  householdName = "Home",
  onBackToChores
}: ChoreReviewPageProps) {
  const [chores, setChores] = useState<Chore[]>([]);
  const [reviewRecommendations, setReviewRecommendations] = useState<Recommendation[]>([]);
  const [selectedChoreIds, setSelectedChoreIds] = useState<string[]>([]);
  const [reviewStep, setReviewStep] = useState<ReviewStep>("select");
  const [loadState, setLoadState] = useState<ReviewLoadState>("idle");
  const [status, setStatus] = useState("Choose chores for assistant review.");

  const activeChores = useMemo(
    () => chores.filter((chore) => !chore.archivedAt),
    [chores]
  );

  useEffect(() => {
    if (!householdId) return;
    const activeHouseholdId = householdId;

    let cancelled = false;

    async function loadReviewData() {
      // Like Angular's ngOnInit plus service calls, this effect reacts to
      // the current route inputs and stores async data in component state.
      setLoadState("loading");
      setStatus("Loading review queue...");

      try {
        const [nextChores, nextRecommendations] = await Promise.all([
          listChores(activeHouseholdId),
          listRecommendations(activeHouseholdId)
        ]);
        if (cancelled) return;

        const nextActiveChores = nextChores.filter((chore) => !chore.archivedAt);
        setChores(nextActiveChores);
        setSelectedChoreIds(getReviewDefaultSelection(nextActiveChores, nextRecommendations));
        setReviewRecommendations([]);
        setReviewStep("select");
        setLoadState("ready");
        setStatus("Choose chores for assistant review.");
      } catch {
        if (!cancelled) {
          setLoadState("error");
          setStatus("Could not load the review queue.");
        }
      }
    }

    void loadReviewData();

    return () => {
      cancelled = true;
    };
  }, [householdId]);

  async function refreshReviewData() {
    if (!householdId) return;

    const [nextChores, nextRecommendations] = await Promise.all([
      listChores(householdId),
      listRecommendations(householdId)
    ]);
    const nextActiveChores = nextChores.filter((chore) => !chore.archivedAt);
    setChores(nextActiveChores);
    setSelectedChoreIds(getReviewDefaultSelection(nextActiveChores, nextRecommendations));
  }

  async function handleGenerateSelectedReview() {
    if (!householdId || selectedChoreIds.length === 0) return;

    setStatus("Reviewing selected chores...");

    try {
      const nextRecommendations = await generateRecommendations(
        householdId,
        "Review the selected chores and suggest practical improvements.",
        selectedChoreIds
      );
      setReviewRecommendations(nextRecommendations);
      setReviewStep("decide");
      setStatus("Review ready.");
    } catch {
      setStatus("Could not review selected chores. Adjust the selection and try again.");
    }
  }

  async function handleDecisionChange(
    recommendation: Recommendation,
    decision: Recommendation["decision"]
  ) {
    if (!householdId || !decision) return;

    setStatus("Saving recommendation decision...");

    try {
      const updated = await updateRecommendationDecision(householdId, recommendation.id, decision);
      setReviewRecommendations((currentRecommendations) =>
        currentRecommendations.map((candidate) => (candidate.id === updated.id ? updated : candidate))
      );
      setStatus("Review ready.");
    } catch {
      setStatus("Could not save that recommendation decision.");
    }
  }

  async function handleApplyDecisions() {
    if (!householdId) return;

    setStatus("Applying recommendation decisions...");

    try {
      await applyRecommendationDecisions(householdId);
      await refreshReviewData();
      setReviewRecommendations([]);
      setReviewStep("complete");
      setStatus("Review complete.");
    } catch {
      setStatus("Could not apply recommendation decisions.");
    }
  }

  if (!householdId) {
    return (
      <section className="placeholder-page">
        <p className="eyebrow">Review</p>
        <h1>Review chores</h1>
        <p className="lede">Set up a household before reviewing existing chores.</p>
        <button className="secondary-action" onClick={onBackToChores} type="button">
          Back to chores
        </button>
      </section>
    );
  }

  return (
    <div className="plan-review review-page">
      <header className="workspace-hero compact-hero">
        <div>
          <p className="eyebrow">Assistant review</p>
          <h1>Review chores</h1>
          <p className="lede">
            Choose chores for the assistant to review, decide what to accept, and apply the changes when ready.
          </p>
          <p className="supporting-copy">
            <span><strong>{householdName}</strong></span>
          </p>
        </div>
      </header>

      <section className="dashboard-section review-flow-section" aria-labelledby="review-flow-heading">
        <div className="section-heading">
          <div className="section-title">
            <div>
              <h2 id="review-flow-heading">
                {reviewStep === "select" ? "Choose chores to review" : null}
                {reviewStep === "decide" ? "Decide on recommendations" : null}
                {reviewStep === "complete" ? "Review complete" : null}
              </h2>
              <p>
                {reviewStep === "select"
                  ? "Unreviewed chores are selected by default. Select reviewed chores too if you want another pass."
                  : null}
                {reviewStep === "decide"
                  ? "Accept or decline each recommendation, then apply the decisions together."
                  : null}
                {reviewStep === "complete"
                  ? "Your recommendation decisions were applied. Calendar export can fit here in a future slice."
                  : null}
              </p>
            </div>
          </div>
          <span className="confidence" role="status">{status}</span>
        </div>

        {loadState === "loading" ? (
          <div className="empty-state">Loading review queue...</div>
        ) : null}

        {loadState === "error" ? (
          <div className="empty-state">Could not load the review queue.</div>
        ) : null}

        {loadState === "ready" && reviewStep === "select" ? (
          <>
            {activeChores.length === 0 ? (
              <div className="empty-state">No active chores are ready for review.</div>
            ) : (
              <div className="review-checkbox-list">
                {activeChores.map((chore) => (
                  <label className="review-checkbox-row" key={chore.id}>
                    <input
                      checked={selectedChoreIds.includes(chore.id)}
                      onChange={(event) => {
                        setSelectedChoreIds((currentIds) =>
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
            )}

            <div className="form-actions">
              <button className="secondary-action" onClick={onBackToChores} type="button">
                Back to chores
              </button>
              <button
                disabled={selectedChoreIds.length === 0}
                onClick={handleGenerateSelectedReview}
                type="button"
              >
                Review selected chores
              </button>
            </div>
          </>
        ) : null}

        {loadState === "ready" && reviewStep === "decide" ? (
          <>
            <div className="recommendation-list">
              {reviewRecommendations.map((recommendation) => (
                <article className="recommendation" key={recommendation.id}>
                  <div>
                    <span className="recommendation-type">Recommendation</span>
                    <h3>{recommendation.title}</h3>
                    <p>{recommendation.rationale}</p>
                  </div>
                  <span className="confidence">Confidence: {recommendation.confidence}</span>
                  <div className="decision-toggle" role="group" aria-label={`Decision for ${recommendation.title}`}>
                    <button
                      aria-pressed={recommendation.decision === "accepted"}
                      onClick={() => handleDecisionChange(recommendation, "accepted")}
                      type="button"
                    >
                      Accept
                    </button>
                    <button
                      aria-pressed={recommendation.decision === "declined"}
                      onClick={() => handleDecisionChange(recommendation, "declined")}
                      type="button"
                    >
                      Decline
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="context-support">
              <strong>Recommendations not adding up?</strong>
              <p>Make sure your household context is correct for more accurate recommendations.</p>
            </div>

            <div className="form-actions">
              <button className="secondary-action" onClick={() => setReviewStep("select")} type="button">
                Back
              </button>
              <button onClick={handleApplyDecisions} type="button">
                Apply decisions
              </button>
            </div>
          </>
        ) : null}

        {loadState === "ready" && reviewStep === "complete" ? (
          <div className="review-completion">
            <p>Recommendation decisions applied.</p>
            <div className="form-actions">
              <button onClick={onBackToChores} type="button">
                Back to chores
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
