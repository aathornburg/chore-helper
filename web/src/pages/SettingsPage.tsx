import { useState } from "react";

export function SettingsPage() {
  const [showCalendarReadiness, setShowCalendarReadiness] = useState(false);
  const highlighted = window.location.hash === "#calendar";

  return (
    <div className="settings-page">
      <header className="workspace-hero compact-hero">
        <div>
          <p className="eyebrow">Preferences and connections</p>
          <h1>Settings</h1>
          <p className="lede">Manage integrations that bring your household routine into one plan.</p>
        </div>
      </header>

      <section className="dashboard-section" aria-labelledby="integrations-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Integrations</p>
            <h2 id="integrations-heading">Connected services</h2>
          </div>
        </div>
        <article className={`integration-card ${highlighted ? "highlighted" : ""}`} id="calendar">
          <div className="panel-heading">
            <h2>Google Calendar</h2>
            <span>Not connected</span>
          </div>
          <p>Import recurring chores and prepare calendar updates for your approval.</p>
          <button onClick={() => setShowCalendarReadiness(true)} type="button">Connect Google Calendar</button>
          {showCalendarReadiness ? (
            <p className="section-summary" role="status">
              The Google Calendar connection flow is coming next. This entry point is ready for OAuth and import review work.
            </p>
          ) : null}
        </article>
      </section>
    </div>
  );
}
