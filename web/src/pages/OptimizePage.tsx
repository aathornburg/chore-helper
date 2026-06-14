import { useEffect, useMemo, useState } from "react";
import { type Task, type HouseholdAppData, type HouseholdProfile, type HouseholdStructure, type Recommendation } from "@chore-helper/shared";
import {
  applyRecommendationDecisions,
  askAssistantQuestion,
  generateRecommendations,
  listTasks,
  listRecommendations,
  updateRecommendationDecision
} from "../api";

type ReviewStep = "select" | "decide" | "complete";
type ReviewLoadState = "idle" | "loading" | "ready" | "error";
type OptimizeMode = "recommendations" | "chat";
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
  households: HouseholdAppData[];
  householdId: string;
  householdName: string;
  onHouseholdChange: (householdId: string) => void;
  profile?: HouseholdProfile;
  showHouseholdPicker: boolean;
  structure: HouseholdStructure;
};

const chatPrompts = [
  "Which chores look under-scoped?",
  "What recurring chores might be missing?",
  "How can I make this plan easier to keep up with?"
];

function findRecommendationForTask(chore: Task, recommendations: Recommendation[]) {
  return recommendations.find(
    (recommendation) =>
      recommendation.affectedTaskId === chore.id ||
      recommendation.title.toLowerCase().includes(chore.title.toLowerCase())
  );
}

function getReviewDefaultSelection(chores: Task[], recommendations: Recommendation[]) {
  const unreviewedIds = chores
    .filter((chore) => {
      const recommendation = findRecommendationForTask(chore, recommendations);
      return !recommendation || recommendation.decision !== "applied";
    })
    .map((chore) => chore.id);

  return unreviewedIds.length > 0 ? unreviewedIds : chores.map((chore) => chore.id);
}

function createMessageId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function formatProfileSummary(profile: HouseholdProfile | undefined, structure: HouseholdStructure) {
  if (!profile) return "Household context is not complete yet.";

  const rooms = structure.floors.reduce((total, floor) => total + floor.rooms.length, 0);
  return `${profile.homeType} / ${structure.floors.length} floors / ${rooms} rooms / ${
    profile.hasPets ? "pets" : "no pets"
  } / ${profile.hasOutdoorSpace ? "outdoor space" : "no outdoor space"}`;
}

export function OptimizePage({ households, isLoading }: OptimizePageProps) {
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | undefined>(() => households[0]?.id);
  const selectedHousehold = households.find((household) => household.id === selectedHouseholdId) ?? households[0];

  useEffect(() => {
    if (households.length === 0) {
      setSelectedHouseholdId(undefined);
      return;
    }

    if (!households.some((household) => household.id === selectedHouseholdId)) {
      setSelectedHouseholdId(households[0]?.id);
    }
  }, [households, selectedHouseholdId]);

  return (
    <div className="plan-review review-page optimize-page operational-page">
      {isLoading ? <div className="empty-state">Loading Optimize workspace...</div> : null}

      {!isLoading && households.length === 0 ? (
        <section className="placeholder-page">
          <p className="eyebrow">Optimize</p>
          <h2>No households yet</h2>
          <p className="lede">Add a household before asking the assistant to optimize chores.</p>
        </section>
      ) : null}

      {!isLoading && selectedHousehold ? (
        <HouseholdOptimizePanel
          households={households}
          profile={selectedHousehold.profile}
          structure={selectedHousehold.structure}
          householdId={selectedHousehold.id}
          householdName={selectedHousehold.name}
          onHouseholdChange={setSelectedHouseholdId}
          showHouseholdPicker={households.length > 1}
        />
      ) : null}
    </div>
  );
}

function HouseholdOptimizePanel({
  households,
  householdId,
  householdName,
  onHouseholdChange,
  profile,
  showHouseholdPicker,
  structure
}: HouseholdOptimizePanelProps) {
  const [chores, setTasks] = useState<Task[]>([]);
  const [existingRecommendations, setExistingRecommendations] = useState<Recommendation[]>([]);
  const [reviewRecommendations, setReviewRecommendations] = useState<Recommendation[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [mode, setMode] = useState<OptimizeMode>("recommendations");
  const [reviewStep, setReviewStep] = useState<ReviewStep>("select");
  const [loadState, setLoadState] = useState<ReviewLoadState>("idle");
  const [status, setStatus] = useState("Choose chores for assistant review.");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatIsSending, setChatIsSending] = useState(false);

  const activeTasks = useMemo(
    () => chores.filter((chore) => !chore.archivedAt),
    [chores]
  );
  const pendingRecommendations = useMemo(
    () => existingRecommendations.filter((recommendation) => recommendation.decision !== "applied"),
    [existingRecommendations]
  );
  const appliedRecommendations = useMemo(
    () => existingRecommendations.filter((recommendation) => recommendation.decision === "applied"),
    [existingRecommendations]
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
        const [nextTasks, nextRecommendations] = await Promise.all([
          listTasks(householdContextId),
          listRecommendations(householdContextId)
        ]);
        if (cancelled) return;

        const nextActiveTasks = nextTasks.filter((chore) => !chore.archivedAt);
        setTasks(nextActiveTasks);
        setExistingRecommendations(nextRecommendations);
        setSelectedTaskIds(getReviewDefaultSelection(nextActiveTasks, nextRecommendations));
        setReviewRecommendations([]);
        setMode("recommendations");
        setReviewStep("select");
        setLoadState("ready");
        setStatus("Ready to review.");
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

    const [nextTasks, nextRecommendations] = await Promise.all([
      listTasks(householdId),
      listRecommendations(householdId)
    ]);
    const nextActiveTasks = nextTasks.filter((chore) => !chore.archivedAt);
    setTasks(nextActiveTasks);
    setExistingRecommendations(nextRecommendations);
    setSelectedTaskIds(getReviewDefaultSelection(nextActiveTasks, nextRecommendations));
  }

  async function handleGenerateSelectedReview() {
    if (!householdId || selectedTaskIds.length === 0) return;

    setStatus("Reviewing selected chores...");

    try {
      const nextRecommendations = await generateRecommendations(
        householdId,
        "Review the selected chores and suggest practical improvements.",
        selectedTaskIds
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
    <section className="optimize-command-workspace" aria-label={`${householdName} optimize workspace`}>
      <section className="optimize-command-panel" aria-label="Optimize command center">
        <div className="optimize-command-copy">
          <p className="eyebrow">Optimize / Clenella assistant</p>
          <h1>Run a plan checkup for {householdName}.</h1>
          <p className="lede">
            Clenella looks across chores, room coverage, timing, and workload to suggest safer improvements before anything changes.
          </p>
          {showHouseholdPicker ? (
            <label className="optimize-household-picker">
              <span>Household to review</span>
              <select
                aria-label="Household to review"
                onChange={(event) => onHouseholdChange(event.target.value)}
                value={householdId}
              >
                {households.map((household) => (
                  <option key={household.id} value={household.id}>{household.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="optimize-command-actions">
            <button
              disabled={selectedTaskIds.length === 0 || loadState !== "ready"}
              onClick={handleGenerateSelectedReview}
              type="button"
            >
              Review selected chores
            </button>
          </div>
        </div>
        <aside className="optimize-checkup-card">
          <div>
            <p className="eyebrow">Checkup snapshot</p>
            <h2>Ready for assistant review</h2>
            <p>{selectedTaskIds.length} chores are selected. {pendingRecommendations.length} older ideas still need a decision.</p>
          </div>
          <div className="optimize-checkup-stats">
            <div>
              <strong>{selectedTaskIds.length}</strong>
              <span>Selected</span>
            </div>
            <div>
              <strong>{pendingRecommendations.length}</strong>
              <span>Pending</span>
            </div>
            <div>
              <strong>{appliedRecommendations.length}</strong>
              <span>Applied</span>
            </div>
          </div>
        </aside>
      </section>

      <div className="optimize-workspace-grid">
        <div className="optimize-workspace-toolbar">
          <div className="optimize-mode-tabs" role="tablist" aria-label="Optimize workspace mode">
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
          <span className="optimize-workspace-status" role="status">{status}</span>
        </div>

        <div className="optimize-review-stack">
          {mode === "recommendations" ? (
            <section className="dashboard-section review-flow-section optimize-review-panel" aria-label="Recommendation review">
              <div className="section-heading">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">Recommendation review</p>
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
                <span className="confidence">{status}</span>
              </div>

              {loadState === "loading" ? (
                <div className="empty-state">Loading Optimize workspace...</div>
              ) : null}

              {loadState === "error" ? (
                <div className="empty-state">Could not load the Optimize workspace.</div>
              ) : null}

              {loadState === "ready" && reviewStep === "select" ? (
                <>
                  <div className="optimize-stage-strip" aria-label="Review progress">
                    <span className="is-active"><strong>Select chores</strong><small>Current step</small></span>
                    <span><strong>Decide ideas</strong><small>Accept or decline</small></span>
                    <span><strong>Apply changes</strong><small>Commit together</small></span>
                  </div>

                  {activeTasks.length === 0 ? (
                    <div className="empty-state">No active chores are ready for review.</div>
                  ) : (
                    <div className="review-checkbox-list">
                      {activeTasks.map((chore) => (
                        <label className="review-checkbox-row" key={chore.id}>
                          <input
                            checked={selectedTaskIds.includes(chore.id)}
                            onChange={(event) => {
                              setSelectedTaskIds((currentIds) =>
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
                      disabled={selectedTaskIds.length === 0}
                      onClick={handleGenerateSelectedReview}
                      type="button"
                    >
                      Run review
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
            <section className="dashboard-section optimize-chat-section" aria-label="Assistant chat">
              <div className="section-heading">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">Assistant chat</p>
                    <h2 id="optimize-chat-heading">Ask while you review</h2>
                    <p>Use chat for questions that do not need the structured recommendation flow.</p>
                  </div>
                </div>
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
                  <p className="empty-state">Ask a question about chore scope, scheduling, or missing recurring work.</p>
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
        </div>

        <aside className="optimize-context-rail">
          <section className="dashboard-section optimize-context-panel" aria-label={`${householdName} household signals`}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Household signals</p>
                <h2>What Clenella is using</h2>
                <p>{formatProfileSummary(profile, structure)}</p>
              </div>
            </div>
            <div className="household-signal-grid">
              <div>
                <span>Context</span>
                <strong>{profile?.homeType ?? "Profile needed"}</strong>
              </div>
              <div>
                <span>Floors</span>
                <strong>{structure.floors.length}</strong>
              </div>
              <div>
                <span>Rooms</span>
                <strong>{structure.floors.reduce((total, floor) => total + floor.rooms.length, 0)}</strong>
              </div>
              <div>
                <span>Pets</span>
                <strong>{profile?.hasPets ? "Yes" : "No"}</strong>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
