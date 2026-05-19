import { demoHousehold, setupChecklist } from "../demoData";
import type { HouseholdSetupState, Navigate } from "../types";
import { formatBaselineSummary } from "../utils/household";

type TodayDashboardProps = {
  householdSetup: HouseholdSetupState;
  onNavigate: Navigate;
};

export function TodayDashboard({ householdSetup, onNavigate }: TodayDashboardProps) {
  if (householdSetup.setupComplete && householdSetup.baseline) {
    return (
      <div className="dashboard-page first-time-dashboard">
        <header className="workspace-hero first-time-hero">
          <div>
            <p className="eyebrow">Setup complete</p>
            <h1>Today</h1>
            <p className="lede">
              {householdSetup.householdName} is ready for a first expert chore review.
            </p>
            <p className="supporting-copy">{formatBaselineSummary(householdSetup.baseline)}</p>
          </div>
          <button onClick={() => onNavigate("/plan")} type="button">Review existing chores</button>
        </header>

        <div className="first-time-grid">
          <section className="panel setup-focus-panel" aria-labelledby="setup-complete-heading">
            <p className="eyebrow">Next best action</p>
            <h2 id="setup-complete-heading">Review the current chore plan</h2>
            <p>
              Add an existing chore from your current calendar so the assistant can evaluate
              cadence, duration, and missing coverage before suggesting manual changes.
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
          <p className="eyebrow">First household setup</p>
          <h1>Today</h1>
          <p className="lede">
            Let's get your household context set up.
          </p>
          <p className="supporting-copy">
            A few home details give the assistant enough context to review chores with better
            cadence, effort, and coverage recommendations.
          </p>
        </div>
        <button onClick={() => onNavigate("/setup")} type="button">Set up household</button>
      </header>

      <div className="first-time-grid">
        <section className="panel setup-focus-panel" aria-labelledby="next-step-heading">
          <p className="eyebrow">Next best action</p>
          <h2 id="next-step-heading">Start with household basics</h2>
          <p>
            Tell Chore Helper about the home type, rooms, floors, pets, outdoor space, and any
            notes that affect recurring work.
          </p>
          <button onClick={() => onNavigate("/setup")} type="button">Continue setup</button>
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
          <span>{demoHousehold.name}</span>
        </div>
        <ol className="next-step-list">
          {setupChecklist.map((item) => (
            <li key={item.label}>
              <span>{item.complete ? "Ready" : "Later"}</span>
              {item.label}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
