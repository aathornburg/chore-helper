import { useState } from "react";
import type { FlooringType, HomeType, HouseholdBaseline, Recommendation } from "@chore-helper/shared";
import { createChore, createHousehold, generateRecommendations, saveBaseline } from "./api";

const allowedFlooringTypes: FlooringType[] = ["carpet", "hardwood", "tile", "mixed", "unknown"];
type EditableSection = "household" | "chore" | "agent";

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFlooring(value: string): FlooringType[] {
  const requestedTypes = parseList(value).map((item) => item.toLowerCase());
  const validTypes = requestedTypes.filter((item): item is FlooringType =>
    allowedFlooringTypes.includes(item as FlooringType)
  );

  return validTypes.length > 0 ? validTypes : ["unknown"];
}

function getRecommendationType(recommendation: Recommendation) {
  if (recommendation.title.startsWith("Add")) return "New chore";
  if (recommendation.title.startsWith("Review")) return "Existing chore";
  return "Maintenance";
}

function getPromptPreview(prompt: string) {
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) return "No specific request yet.";
  if (trimmedPrompt.length <= 96) return trimmedPrompt;

  return `${trimmedPrompt.slice(0, 93)}...`;
}

type PlanReviewProps = {
  householdId?: string;
  householdName?: string;
  baseline?: HouseholdBaseline;
};

export function PlanReview({
  householdId,
  householdName: savedHouseholdName = "Home",
  baseline
}: PlanReviewProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [status, setStatus] = useState("Ready when you are.");
  const [expandedSection, setExpandedSection] = useState<EditableSection>("household");
  const [householdName, setHouseholdName] = useState(savedHouseholdName);
  const [homeType, setHomeType] = useState<HomeType>(baseline?.homeType ?? "house");
  const [rooms, setRooms] = useState(baseline?.rooms.join(", ") ?? "kitchen, bathroom");
  const [flooring, setFlooring] = useState(baseline?.flooring.join(", ") ?? "hardwood, tile");
  const [hasPets, setHasPets] = useState(baseline?.hasPets ?? true);
  const [hasOutdoorSpace, setHasOutdoorSpace] = useState(baseline?.hasOutdoorSpace ?? true);
  const [notes, setNotes] = useState(
    baseline?.notes ?? "We already have recurring chores in Google Calendar."
  );
  const [choreTitle, setChoreTitle] = useState("Clean bathrooms");
  const [choreCadence, setChoreCadence] = useState("weekly");
  const [estimatedMinutes, setEstimatedMinutes] = useState("5");
  const [choreSource, setChoreSource] = useState<"manual" | "google-calendar">("manual");
  const [reviewPrompt, setReviewPrompt] = useState(
    "Review my existing setup and suggest practical improvements."
  );
  const householdSummary = `${homeType} / ${parseList(rooms).length || 0} rooms / ${flooring} / ${
    hasPets ? "pets" : "no pets"
  } / ${hasOutdoorSpace ? "outdoor space" : "no outdoor space"}`;
  const choreSummary = `${choreTitle || "Untitled chore"} / ${choreCadence || "cadence"} / ${
    estimatedMinutes || "?"
  } min / ${choreSource}`;
  const agentSummary = getPromptPreview(reviewPrompt);

  function toggleSection(section: EditableSection) {
    setExpandedSection((currentSection) => (currentSection === section ? "household" : section));
  }

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Gathering household context...");

    let activeHouseholdId = householdId;

    if (!activeHouseholdId) {
      const household = await createHousehold(householdName);
      activeHouseholdId = household.id;

      await saveBaseline(activeHouseholdId, {
        homeType,
        rooms: parseList(rooms),
        flooring: parseFlooring(flooring),
        hasPets,
        hasOutdoorSpace,
        notes
      });
    }

    await createChore(activeHouseholdId, {
      title: choreTitle,
      cadence: choreCadence,
      estimatedMinutes: Number(estimatedMinutes),
      source: choreSource
    });

    setStatus("Asking the assistant to review your chore plan...");
    const nextRecommendations = await generateRecommendations(activeHouseholdId, reviewPrompt);
    setRecommendations(nextRecommendations);
    setStatus("Review complete.");
  }

  return (
    <form className="plan-review" onSubmit={handleGenerate}>
      <header className="workspace-hero compact-hero">
        <div>
          <p className="eyebrow">Expert review workspace</p>
          <h1>Plan</h1>
          <p className="lede">
            Tune the current chore system with rationale-backed recommendations before accepting
            any changes.
          </p>
        </div>
        <div className="header-action">
          <p className="status">{status}</p>
          <button type="submit">Review my chore plan</button>
        </div>
      </header>

      <section
        className={`dashboard-section ${expandedSection === "household" ? "is-expanded" : "is-collapsed"}`}
        aria-labelledby="household-context-heading"
      >
        <div className="section-heading">
          <div className="section-title">
            <span>01</span>
            <div>
              <h2 id="household-context-heading">Household Context</h2>
              <p>Capture the home details that shape cadence, effort, and missing chores.</p>
            </div>
          </div>
          <button className="section-action" onClick={() => toggleSection("household")} type="button">
            {expandedSection === "household" ? "Collapse Household Context" : "Edit Household Context"}
          </button>
        </div>

        <p className="section-summary">{householdSummary}</p>

        {expandedSection === "household" ? (
          <div className="section-body">
            <div className="field-grid">
              <label>
                Household name
                <input value={householdName} onChange={(event) => setHouseholdName(event.target.value)} />
              </label>

              <label>
                Home type
                <select value={homeType} onChange={(event) => setHomeType(event.target.value as HomeType)}>
                  <option value="house">House</option>
                  <option value="apartment">Apartment</option>
                  <option value="condo">Condo</option>
                  <option value="townhouse">Townhouse</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label>
                Rooms
                <input value={rooms} onChange={(event) => setRooms(event.target.value)} />
              </label>

              <label>
                Flooring
                <input value={flooring} onChange={(event) => setFlooring(event.target.value)} />
              </label>
            </div>

            <div className="choice-row">
              <label className="checkbox-field">
                <input
                  checked={hasPets}
                  onChange={(event) => setHasPets(event.target.checked)}
                  type="checkbox"
                />
                Has pets
              </label>

              <label className="checkbox-field">
                <input
                  checked={hasOutdoorSpace}
                  onChange={(event) => setHasOutdoorSpace(event.target.checked)}
                  type="checkbox"
                />
                Has outdoor space
              </label>
            </div>

            <label>
              Notes
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          </div>
        ) : null}
      </section>

      <section
        className={`dashboard-section ${expandedSection === "chore" ? "is-expanded" : "is-collapsed"}`}
        aria-labelledby="existing-chore-heading"
      >
        <div className="section-heading">
          <div className="section-title">
            <span>02</span>
            <div>
              <h2 id="existing-chore-heading">Existing Chore</h2>
              <p>Add one tracked chore so the assistant can review scope and timing.</p>
            </div>
          </div>
          <button className="section-action" onClick={() => toggleSection("chore")} type="button">
            {expandedSection === "chore" ? "Collapse Existing Chore" : "Edit Existing Chore"}
          </button>
        </div>

        <p className="section-summary">{choreSummary}</p>

        {expandedSection === "chore" ? (
          <div className="section-body">
            <div className="field-grid">
              <label>
                Chore title
                <input value={choreTitle} onChange={(event) => setChoreTitle(event.target.value)} />
              </label>

              <label>
                Cadence
                <input value={choreCadence} onChange={(event) => setChoreCadence(event.target.value)} />
              </label>

              <label>
                Estimated minutes
                <input
                  min="1"
                  type="number"
                  value={estimatedMinutes}
                  onChange={(event) => setEstimatedMinutes(event.target.value)}
                />
              </label>

              <label>
                Source
                <select
                  value={choreSource}
                  onChange={(event) =>
                    setChoreSource(event.target.value as "manual" | "google-calendar")
                  }
                >
                  <option value="manual">Manual</option>
                  <option value="google-calendar">Google Calendar</option>
                </select>
              </label>
            </div>
          </div>
        ) : null}
      </section>

      <section
        className={`dashboard-section agent-section ${expandedSection === "agent" ? "is-expanded" : "is-collapsed"}`}
        aria-labelledby="agent-review-heading"
      >
        <div className="section-heading">
          <div className="section-title">
            <span>03</span>
            <div>
              <h2 id="agent-review-heading">Agent Review</h2>
              <p>Tell the assistant what kind of guidance would be most useful right now.</p>
            </div>
          </div>
          <button className="section-action" onClick={() => toggleSection("agent")} type="button">
            {expandedSection === "agent" ? "Collapse Agent Review" : "Edit Agent Review"}
          </button>
        </div>

        <p className="section-summary">{agentSummary}</p>

        {expandedSection === "agent" ? (
          <div className="section-body">
            <label>
              Tell the assistant what kind of help would be useful
              <textarea
                value={reviewPrompt}
                onChange={(event) => setReviewPrompt(event.target.value)}
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="dashboard-section recommendations-section" aria-labelledby="recommendations-heading">
        <div className="section-heading">
          <div className="section-title">
            <span>04</span>
            <div>
              <h2 id="recommendations-heading">Recommendations</h2>
              <p>Suggestions appear with rationale and confidence for manual acceptance.</p>
            </div>
          </div>
        </div>

        <p className="section-summary">
          {recommendations.length === 0
            ? "No review yet. Suggestions will appear after the assistant reviews your current plan."
            : `${recommendations.length} recommendation${recommendations.length === 1 ? "" : "s"} ready for review.`}
        </p>

        {recommendations.length === 0 ? (
          <div className="empty-state">
            Review your chore plan to see suggested new chores and existing chore improvements.
          </div>
        ) : (
          <div className="recommendation-list">
            {recommendations.map((recommendation) => (
              <article key={recommendation.id} className="recommendation">
                <div>
                  <span className="recommendation-type">
                    {getRecommendationType(recommendation)}
                  </span>
                  <h3>{recommendation.title}</h3>
                  <p>{recommendation.rationale}</p>
                </div>
                <span className="confidence">Confidence: {recommendation.confidence}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </form>
  );
}
