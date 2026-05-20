import { useEffect, useRef, useState } from "react";
import type { HomeType } from "@chore-helper/shared";
import type { ExistingChoreFormValues, HouseholdSetupState, SetupFormValues } from "../types";

type SetupStep = "context" | "chores" | "import" | "review";

type SetupPageProps = {
  householdSetup: HouseholdSetupState;
  onAddChore: (values: ExistingChoreFormValues) => Promise<void>;
  onReviewChores: () => void;
  onSave: (values: SetupFormValues) => Promise<void>;
};

const setupSteps: Array<{ id: SetupStep; label: string }> = [
  { id: "context", label: "Household Context" },
  { id: "chores", label: "Existing Chores" },
  { id: "import", label: "Import Options" },
  { id: "review", label: "Review Handoff" }
];

function getStepNumber(step: SetupStep) {
  return setupSteps.findIndex((setupStep) => setupStep.id === step) + 1;
}

export function SetupPage({
  householdSetup,
  onAddChore,
  onReviewChores,
  onSave
}: SetupPageProps) {
  // Like Angular component fields plus click handlers, this local state drives which template branch renders.
  const [activeStep, setActiveStep] = useState<SetupStep>(
    householdSetup.baseline ? "chores" : "context"
  );
  const [householdName, setHouseholdName] = useState(
    householdSetup.baseline ? householdSetup.householdName : ""
  );
  const [homeType, setHomeType] = useState<HomeType>(householdSetup.baseline?.homeType ?? "house");
  const [rooms, setRooms] = useState(householdSetup.baseline?.rooms.join(", ") ?? "");
  const [flooring, setFlooring] = useState(householdSetup.baseline?.flooring.join(", ") ?? "");
  const [hasPets, setHasPets] = useState(householdSetup.baseline?.hasPets ?? false);
  const [hasOutdoorSpace, setHasOutdoorSpace] = useState(
    householdSetup.baseline?.hasOutdoorSpace ?? false
  );
  const [notes, setNotes] = useState(householdSetup.baseline?.notes ?? "");
  const [choreTitle, setChoreTitle] = useState("");
  const [choreCadence, setChoreCadence] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const choreSource: ExistingChoreFormValues["source"] = "manual";
  const syncedHouseholdId = useRef<string | undefined>(undefined);
  const [status, setStatus] = useState(
    householdSetup.baseline
      ? "Household context saved. Add one existing chore next."
      : "Ready to save household basics."
  );

  useEffect(() => {
    if (!householdSetup.householdId || !householdSetup.baseline) return;
    if (syncedHouseholdId.current === householdSetup.householdId) return;

    // Similar to Angular ngOnChanges for @Input data: sync restored props into editable local form fields once.
    syncedHouseholdId.current = householdSetup.householdId;
    setHouseholdName(householdSetup.householdName);
    setHomeType(householdSetup.baseline.homeType);
    setRooms(householdSetup.baseline.rooms.join(", "));
    setFlooring(householdSetup.baseline.flooring.join(", "));
    setHasPets(householdSetup.baseline.hasPets);
    setHasOutdoorSpace(householdSetup.baseline.hasOutdoorSpace);
    setNotes(householdSetup.baseline.notes ?? "");
  }, [householdSetup.householdId, householdSetup.householdName, householdSetup.baseline]);

  function handleStepSelect(step: SetupStep) {
    if (step === "context") {
      setActiveStep(step);
      return;
    }

    if (!householdSetup.baseline) {
      setStatus("Save household context before adding chores.");
      setActiveStep("context");
      return;
    }

    if (step === "review" && householdSetup.choreCount === 0) {
      setStatus("Add at least one existing chore before review.");
      setActiveStep("chores");
      return;
    }

    setActiveStep(step);
  }

  async function handleContextSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving household setup...");

    try {
      await onSave({
        householdName,
        homeType,
        rooms,
        flooring,
        hasPets,
        hasOutdoorSpace,
        notes
      });
      setStatus("Household context saved. Add one existing chore next.");
      setActiveStep("chores");
    } catch {
      setStatus("Could not save household setup.");
    }
  }

  async function handleChoreSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Adding existing chore...");

    try {
      await onAddChore({
        title: choreTitle,
        cadence: choreCadence,
        estimatedMinutes: Number(estimatedMinutes),
        source: choreSource
      });
      setStatus("Existing chore saved. Review your setup next.");
      setActiveStep("review");
    } catch {
      setStatus("Could not add existing chore.");
    }
  }

  const readyChoreSummary =
    householdSetup.choreCount === 1
      ? "1 existing chore ready for review"
      : `${householdSetup.choreCount} existing chores ready for review`;

  if (householdSetup.isRestoring) {
    return (
      <div className="setup-page">
        <header className="workspace-hero compact-hero">
          <div>
            <p className="eyebrow">MVP 1 setup</p>
            <h1>Household setup</h1>
            <p className="lede">
              Build enough context to review the chores you already have before the assistant
              recommends changes.
            </p>
          </div>
        </header>

        <section className="panel setup-form" aria-live="polite">
          <p className="status" role="status">Loading household setup...</p>
        </section>
      </div>
    );
  }

  return (
    <div className="setup-page">
      <header className="workspace-hero compact-hero">
        <div>
          <p className="eyebrow">MVP 1 setup</p>
          <h1>Household setup</h1>
          <p className="lede">
            Build enough context to review the chores you already have before the assistant
            recommends changes.
          </p>
        </div>
      </header>

      <section className="panel setup-stepper" aria-label="Setup progress">
        {setupSteps.map((step, index) => (
          <button
            aria-current={activeStep === step.id ? "step" : undefined}
            className="setup-step"
            key={step.id}
            onClick={() => handleStepSelect(step.id)}
            type="button"
          >
            <span>{index + 1}</span>
            {step.label}
          </button>
        ))}
      </section>

      <section className="panel setup-progress-panel" aria-label="Setup readiness">
        <article>
          <span>{householdSetup.baseline ? "Saved" : "Next"}</span>
          <strong>Household context {householdSetup.baseline ? "saved" : "needed"}</strong>
        </article>
        <article>
          <span>{householdSetup.choreCount > 0 ? "Saved" : "Next"}</span>
          <strong>
            {householdSetup.choreCount > 0
              ? `${householdSetup.choreCount} existing chore${householdSetup.choreCount === 1 ? "" : "s"} saved`
              : "No existing chores saved yet"}
          </strong>
        </article>
        <article>
          <span>{householdSetup.setupComplete ? "Ready" : "Locked"}</span>
          <strong>{householdSetup.setupComplete ? "Review handoff ready" : "Review unlocks after one chore"}</strong>
        </article>
      </section>

      {activeStep === "context" ? (
        <form className="panel setup-form" onSubmit={handleContextSubmit}>
          <p className="eyebrow">Step {getStepNumber(activeStep)} of 4</p>
          <h2>Household Context</h2>
          <p className="section-summary">
            Tell the assistant what kind of home and routines it is reviewing.
          </p>
          <div className="field-grid">
            <label>
              Household name
              <input
                placeholder="Home"
                required
                value={householdName}
                onChange={(event) => setHouseholdName(event.target.value)}
              />
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
              <input
                placeholder="kitchen, bathrooms, bedrooms"
                required
                value={rooms}
                onChange={(event) => setRooms(event.target.value)}
              />
            </label>

            <label>
              Flooring
              <input
                placeholder="hardwood, tile, carpet"
                required
                value={flooring}
                onChange={(event) => setFlooring(event.target.value)}
              />
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
            <textarea
              placeholder="Anything the assistant should account for."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <div className="form-footer">
            <button type="submit">Save basics</button>
            <span>Existing chores come next.</span>
          </div>
          <p className="status" role="status">{status}</p>
        </form>
      ) : null}

      {activeStep === "chores" ? (
        <form className="panel setup-form" onSubmit={handleChoreSubmit}>
          <p className="eyebrow">Step {getStepNumber(activeStep)} of 4</p>
          <h2>Existing Chores</h2>
          <p className="section-summary">
            Add one chore you already track so the assistant has something concrete to review.
          </p>
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
          <div className="form-footer">
            <button type="submit">Add chore and continue</button>
            <button className="section-action" onClick={() => setActiveStep("import")} type="button">
              Continue to import options
            </button>
          </div>
          <p className="status" role="status">{status}</p>
        </form>
      ) : null}

      {activeStep === "import" ? (
        <section className="panel setup-form">
          <p className="eyebrow">Step {getStepNumber(activeStep)} of 4</p>
          <h2>Import Options</h2>
          <p className="section-summary">
            Manual entry is available now. Google Calendar import is the next integration path.
          </p>
          <div className="preview-health-list">
            <article>
              <strong>Manual entry</strong>
              <p>Available now through the existing chores step.</p>
            </article>
            <article>
              <strong>Google Calendar</strong>
              <p>Coming soon for recurring chore imports.</p>
            </article>
          </div>
          <div className="form-footer">
            <button disabled type="button">Google Calendar import coming soon</button>
            <button className="section-action" onClick={() => handleStepSelect("review")} type="button">
              Continue to review handoff
            </button>
          </div>
        </section>
      ) : null}

      {activeStep === "review" ? (
        <section className="panel setup-form">
          <p className="eyebrow">Step {getStepNumber(activeStep)} of 4</p>
          <h2>Review Handoff</h2>
          <p className="section-summary">
            {householdSetup.choreCount > 0
              ? readyChoreSummary
              : "Add at least one existing chore before starting expert review."}
          </p>
          <div className="form-footer">
            <button
              disabled={householdSetup.choreCount === 0}
              onClick={onReviewChores}
              type="button"
            >
              Review existing chores
            </button>
            <button className="section-action" onClick={() => setActiveStep("chores")} type="button">
              Back to existing chores
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
