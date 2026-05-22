import type { HouseholdSetupState, Navigate } from "../types";
import { formatBaselineSummary } from "../utils/household";

type TodayDashboardProps = {
  householdSetup: HouseholdSetupState;
  onNavigate: Navigate;
};

export function TodayDashboard({ householdSetup, onNavigate }: TodayDashboardProps) {
  /*
    This component receives `householdSetup` and `onNavigate` as props,
    which is analogous to Angular's `@Input() householdSetup` and
    `@Output() navigate = new EventEmitter()` patterns.
  */
  if (householdSetup.isRestoring) {
    return (
      <div className="dashboard-page first-time-dashboard">
        <header className="workspace-hero first-time-hero">
          <div>
            <p className="eyebrow">Household</p>
            <h1>Today</h1>
            <p className="lede">Loading household context...</p>
            <p className="supporting-copy">
              Chore Helper is checking your saved household before showing the next best action.
            </p>
          </div>
        </header>
      </div>
    );
  }

  if (householdSetup.setupComplete && householdSetup.baseline) {
    return (
      <div className="dashboard-page first-time-dashboard">
        <header className="workspace-hero first-time-hero">
          <div>
            <p className="eyebrow">Household ready</p>
            <h1>Today</h1>
            <p className="lede">
              {householdSetup.householdName} is ready for a first expert chore review.
            </p>
            <p className="supporting-copy">{formatBaselineSummary(householdSetup.baseline)}</p>
            <p className="section-summary">
              {householdSetup.choreCount} existing chore{householdSetup.choreCount === 1 ? "" : "s"} ready for review
            </p>
          </div>
          <button onClick={() => onNavigate("/chores")} type="button">Review existing chores</button>
        </header>

        <div className="first-time-grid">
          <section className="panel setup-focus-panel" aria-labelledby="setup-complete-heading">
            <p className="eyebrow">Next best action</p>
            <h2 id="setup-complete-heading">Review the current chore plan</h2>
            <p>
              Open Chores to manage saved chores and start a separate review flow when needed.
              Recommendations remain manual until you accept them in a later milestone.
            </p>
          </section>

          <section className="panel" aria-labelledby="saved-context-heading">
            <div className="panel-heading">
              <h2 id="saved-context-heading">Household context</h2>
              <span>Saved</span>
            </div>
            <div className="preview-health-list">
              <article>
                <strong>Home</strong>
                <p>{householdSetup.baseline.homeType}</p>
              </article>
              <article>
                <strong>Rooms</strong>
                <p>{householdSetup.baseline.rooms.join(", ")}</p>
              </article>
              <article>
                <strong>Floors</strong>
                <p>{householdSetup.baseline.flooring.join(", ")}</p>
              </article>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page first-time-dashboard">
      <header className="workspace-hero first-time-hero">
        <div>
          <p className="eyebrow">
            {householdSetup.baseline ? "Household in progress" : "First household"}
          </p>
          <h1>Today</h1>
          <p className="lede">
            {householdSetup.baseline
              ? "Add an existing chore to make the assistant recommendations useful."
              : "Let's get your household context set up."}
          </p>
          {householdSetup.restoreError ? (
            <p className="section-summary">{householdSetup.restoreError}</p>
          ) : null}
          <p className="supporting-copy">
            {householdSetup.baseline
              ? formatBaselineSummary(householdSetup.baseline)
              : "A few home details give the assistant enough context to review chores with better cadence, effort, and coverage recommendations."}
          </p>
        </div>
        <button onClick={() => onNavigate("/households")} type="button">
          {householdSetup.baseline ? "Review household" : "Set up household"}
        </button>
      </header>

      <div className="first-time-grid">
        <section className="panel setup-focus-panel" aria-labelledby="next-step-heading">
          <p className="eyebrow">Next best action</p>
          <h2 id="next-step-heading">
            {householdSetup.baseline ? "Add one existing chore" : "Start with household basics"}
          </h2>
          <p>
            {householdSetup.baseline
              ? "Chore Helper needs at least one real chore before it can review the plan."
              : "Tell Chore Helper about the home type, rooms, floors, pets, outdoor space, and any notes that affect recurring work."}
          </p>
          <button onClick={() => onNavigate("/households")} type="button">
            {householdSetup.baseline ? "Review household" : "Continue setup"}
          </button>
        </section>

        <section className="panel" aria-labelledby="plan-preview-heading">
          <div className="panel-heading">
            <h2 id="plan-preview-heading">Plan health preview</h2>
            <span>Unlocks after setup</span>
          </div>
          <div className="preview-health-list">
            <article>
              <strong>Coverage gaps</strong>
              <p>Spot chores missing from your current routine.</p>
            </article>
            <article>
              <strong>Cadence risks</strong>
              <p>Review chores that may be too frequent or too rare.</p>
            </article>
            <article>
              <strong>Duration concerns</strong>
              <p>Catch estimates that may be too short to be realistic.</p>
            </article>
          </div>
        </section>
      </div>

      <section className="panel" aria-labelledby="what-next-heading">
        <div className="panel-heading">
          <h2 id="what-next-heading">What comes next</h2>
          <span>MVP 1</span>
        </div>
        <ol className="next-step-list">
          <li>
            <span>{householdSetup.baseline ? "Ready" : "Next"}</span>
            Confirm household context
          </li>
          <li>
            <span>{householdSetup.choreCount > 0 ? "Ready" : "Next"}</span>
            Add one existing chore
          </li>
          <li>
            <span>Later</span>
            Connect Google Calendar
          </li>
          <li>
            <span>{householdSetup.setupComplete ? "Ready" : "Later"}</span>
            Review first recommendation set
          </li>
        </ol>
      </section>
    </div>
  );
}
