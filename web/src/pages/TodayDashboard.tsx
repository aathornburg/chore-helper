import type { HouseholdAppData } from "@chore-helper/shared";
import type { Navigate } from "../types";
import { formatHouseholdSummary } from "../utils/household";

type TodayDashboardProps = {
  households: HouseholdAppData[];
  isLoading: boolean;
  loadError?: string;
  onNavigate: Navigate;
};

function isProfileComplete(household: HouseholdAppData) {
  return Boolean(household.profile) && household.structure.floors.length > 0;
}

export function TodayDashboard({ households, isLoading, loadError, onNavigate }: TodayDashboardProps) {
  if (isLoading) {
    return (
      <div className="dashboard-page">
        <header className="workspace-hero first-time-hero">
          <div>
            <p className="eyebrow">Your home overview</p>
            <h1>Today</h1>
            <p className="lede">Loading your households and chore plans...</p>
          </div>
        </header>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="dashboard-page">
        <header className="workspace-hero first-time-hero">
          <div>
            <p className="eyebrow">Could not load</p>
            <h1>Today</h1>
            <p className="lede">{loadError}</p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="dashboard-page today-page">
      <header className="workspace-hero first-time-hero">
        <div>
          <p className="eyebrow">Home command center</p>
          <h1>Today</h1>
          <p className="lede">
            {households.length === 0
              ? "Set up your first household to start organizing routines."
              : `Keep ${households.length} household${households.length === 1 ? "" : "s"} moving with clear next actions.`}
          </p>
        </div>
        {households.length === 0 ? (
          <button onClick={() => onNavigate("/households")} type="button">Set up household</button>
        ) : (
          <button onClick={() => onNavigate("/chores")} type="button">Manage chores</button>
        )}
      </header>

      {households.length === 0 ? (
        <section className="panel setup-focus-panel">
          <p className="eyebrow">Start here</p>
          <h2>Create a home profile</h2>
          <p>Add floors, rooms, pets, and notes so Cleanly can make useful chore recommendations.</p>
        </section>
      ) : (
        <section className="today-household-grid" aria-label="Household overview">
          {households.map((household) => {
            const profileComplete = isProfileComplete(household);
            const reviewReady = profileComplete && household.chores.length > 0;
            return (
              <article className="panel today-household-card" key={household.id}>
                <div className="panel-heading">
                  <h2>{household.name}</h2>
                  <span>{reviewReady ? "Ready to optimize" : profileComplete ? "Ready for chores" : "Needs setup"}</span>
                </div>
                <p>{formatHouseholdSummary(household)}</p>
                <div className="overview-stat-grid">
                  <div><span>Chores</span><strong>{household.chores.length}</strong></div>
                  <div><span>Recommendations</span><strong>{household.recommendations.length}</strong></div>
                </div>
                <div className="form-actions">
                  {!profileComplete ? (
                    <button onClick={() => onNavigate("/households")} type="button">Complete profile</button>
                  ) : household.chores.length === 0 ? (
                    <button onClick={() => onNavigate("/chores")} type="button">Add chores</button>
                  ) : (
                    <button onClick={() => onNavigate("/optimize")} type="button">Optimize plan</button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="panel integration-callout" aria-labelledby="today-calendar-heading">
        <div>
          <p className="eyebrow">Next integration</p>
          <h2 id="today-calendar-heading">Google Calendar</h2>
          <p>Connect your calendar to import routines and review approved schedule changes.</p>
        </div>
        <button className="secondary-action" onClick={() => onNavigate("/settings#calendar")} type="button">
          Set up Calendar
        </button>
      </section>
    </div>
  );
}
