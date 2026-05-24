import { useEffect, useMemo, useState } from "react";
import { type Chore, type HouseholdAppData, type HouseholdBaseline, type Recommendation } from "@chore-helper/shared";
import {
  applyRecommendationDecisions,
  askAssistantQuestion,
  generateRecommendations,
  listChores,
  listRecommendations,
  updateRecommendationDecision
} from "../api";

type OptimizeMode = "recommendations" | "chat";
type ReviewStep = "select" | "decide" | "complete";
type ReviewLoadState = "idle" | "loading" | "ready" | "error";
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type OptimizePageProps = {
  households: HouseholdAppData[];
  isLoading: boolean;
};

type HouseholdOptimizePanelProps = {
  householdId: string;
  householdName: string;
  baseline?: HouseholdBaseline;
};

const chatPrompts = [
  "Which chores look under-scoped?",
  "What recurring chores might be missing?",
  "How can I make this plan easier to keep up with?"
];

function findRecommendationForChore(chore: Chore, recommendations: Recommendation[]) {
  return recommendations.find(
    (recommendation) =>
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

function createMessageId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function formatBaselineSummary(baseline?: HouseholdBaseline) {
  if (!baseline) return "Household context is not complete yet.";

  return `${baseline.homeType} / ${baseline.rooms.length} rooms / ${baseline.flooring.join(", ")} / ${
    baseline.hasPets ? "pets" : "no pets"
  } / ${baseline.hasOutdoorSpace ? "outdoor space" : "no outdoor space"}`;
}

export function OptimizePage({ households, isLoading }: OptimizePageProps) {
  return (
    <div className="plan-review review-page optimize-page">
      <header className="workspace-hero compact-hero">
        <div>
          <h1>Optimize</h1>
          <p className="lede">
            Generate structured recommendations or ask the assistant free-form questions about your chore plan.
          </p>
        </div>
      </header>

      {isLoading ? <div className="empty-state">Loading Optimize workspace...</div> : null}

      {!isLoading && households.length === 0 ? (
        <section className="placeholder-page">
          <p className="eyebrow">Optimize</p>
          <h2>No households yet</h2>
          <p className="lede">Add a household before asking the assistant to optimize chores.</p>
        </section>
      ) : null}

      {!isLoading ? (
        <div className="household-panel-list">
          {households.map((household) => (
            <HouseholdOptimizePanel
              baseline={household.baseline}
              householdId={household.id}
              householdName={household.name}
              key={household.id}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HouseholdOptimizePanel({
  householdId,
  householdName,
  baseline
}: HouseholdOptimizePanelProps) {
  const [mode, setMode] = useState<OptimizeMode>("recommendations");
  const [chores, setChores] = useState<Chore[]>([]);
  const [existingRecommendations, setExistingRecommendations] = useState<Recommendation[]>([]);
  const [reviewRecommendations, setReviewRecommendations] = useState<Recommendation[]>([]);
  const [selectedChoreIds, setSelectedChoreIds] = useState<string[]>([]);
  const [reviewStep, setReviewStep] = useState<ReviewStep>("select");
  const [loadState, setLoadState] = useState<ReviewLoadState>("idle");
  const [status, setStatus] = useState("Choose chores for assistant review.");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatIsSending, setChatIsSending] = useState(false);

  const activeChores = useMemo(
    () => chores.filter((chore) => !chore.archivedAt),
    [chores]
  );

  useEffect(() => {
    if (!householdId) return;
    const householdContextId = householdId;

    let cancelled = false;

    async function loadOptimizeData() {
      // This mirrors Angular's ngOnInit pattern: route-provided inputs
      // trigger service calls, then the component template reacts to state.
      setLoadState("loading");
      setStatus("Loading Optimize workspace...");

      try {
        const [nextChores, nextRecommendations] = await Promise.all([
          listChores(householdContextId),
          listRecommendations(householdContextId)
        ]);
        if (cancelled) return;

        const nextActiveChores = nextChores.filter((chore) => !chore.archivedAt);
        setChores(nextActiveChores);
        setExistingRecommendations(nextRecommendations);
        setSelectedChoreIds(getReviewDefaultSelection(nextActiveChores, nextRecommendations));
        setReviewRecommendations([]);
        setReviewStep("select");
        setLoadState("ready");
        setStatus("Choose chores for assistant review.");
      } catch {
        if (!cancelled) {
          setLoadState("error");
          setStatus("Could not load the Optimize workspace.");
        }
      }
    }

    void loadOptimizeData();

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
    setExistingRecommendations(nextRecommendations);
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

  async function handleSendChat() {
    if (!householdId || !chatInput.trim() || chatIsSending) return;

    const message = chatInput.trim();
    setChatInput("");
    setChatIsSending(true);
    setStatus("Asking assistant...");
    setChatMessages((currentMessages) => [
      ...currentMessages,
      { id: createMessageId(), role: "user", text: message }
    ]);

    try {
      const response = await askAssistantQuestion(householdId, message);
      setChatMessages((currentMessages) => [
        ...currentMessages,
        { id: createMessageId(), role: "assistant", text: response.answer }
      ]);
      setStatus("Assistant answered.");
    } catch {
      setStatus("Could not answer assistant question.");
    } finally {
      setChatIsSending(false);
    }
  }

  return (
    <section className="household-instance panel" aria-label={`${householdName} optimize workspace`}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Household</p>
          <h2>{householdName}</h2>
          <p className="supporting-copy">{formatBaselineSummary(baseline)}</p>
        </div>
      </div>

      <div className="optimize-mode-tabs" role="tablist" aria-label="Optimize mode">
        <button
          aria-selected={mode === "recommendations"}
          onClick={() => setMode("recommendations")}
          role="tab"
          type="button"
        >
          Recommendations
        </button>
        <button
          aria-selected={mode === "chat"}
          onClick={() => setMode("chat")}
          role="tab"
          type="button"
        >
          Chat
        </button>
      </div>

      {mode === "recommendations" ? (
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
            <div className="empty-state">Loading Optimize workspace...</div>
          ) : null}

          {loadState === "error" ? (
            <div className="empty-state">Could not load the Optimize workspace.</div>
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
              <p>{existingRecommendations.length} recommendation records are available for this household.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {mode === "chat" ? (
        <section className="dashboard-section optimize-chat-section" aria-labelledby="optimize-chat-heading">
          <div className="section-heading">
            <div className="section-title">
              <div>
                <h2 id="optimize-chat-heading">Ask about your chores</h2>
                <p>Use chat for questions that do not need the structured recommendation flow.</p>
              </div>
            </div>
            <span className="confidence" role="status">{status}</span>
          </div>

          <div className="chat-prompt-list" aria-label="Suggested questions">
            {chatPrompts.map((prompt) => (
              <button
                className="secondary-action"
                key={prompt}
                onClick={() => setChatInput(prompt)}
                type="button"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="chat-thread" aria-label="Assistant conversation">
            {chatMessages.length === 0 ? (
              <p className="empty-state">Ask a question about chore scope, cadence, or missing recurring work.</p>
            ) : null}
            {chatMessages.map((message) => (
              <article className={`chat-message chat-message-${message.role}`} key={message.id}>
                <span>{message.role === "user" ? "You" : "Assistant"}</span>
                <p>{message.text}</p>
              </article>
            ))}
          </div>

          <label className="chat-input-label">
            Ask the assistant
            <textarea
              onChange={(event) => setChatInput(event.target.value)}
              value={chatInput}
            />
          </label>
          <div className="form-actions">
            <button
              disabled={!chatInput.trim() || chatIsSending}
              onClick={handleSendChat}
              type="button"
            >
              Send
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
