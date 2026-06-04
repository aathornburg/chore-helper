import { useEffect, useMemo, useState } from "react";
import type {
  CalendarConnectionSummary,
  CalendarImportCandidate,
  CalendarImportPolicy,
  CalendarPreferences,
  ExternalCalendarSummary,
  HouseholdAppData,
  HouseholdMemberSummary
} from "@chore-helper/shared";
import {
  getCalendarPreferences,
  getCurrentUser,
  listCalendarImportCandidates,
  listCalendarConnections,
  listExternalCalendars,
  listCalendarImportPolicies,
  listHouseholdMembers,
  startGoogleCalendarConnection,
  submitCalendarImportEvents,
  updateCalendarImportPolicy,
  updateCalendarPreferences
} from "../api";
import type { WeekStartDay } from "../types";

type SettingsPageProps = {
  households: HouseholdAppData[];
  onWeekStartDayChange: (weekStartDay: WeekStartDay) => void;
  weekStartDay: WeekStartDay;
};

function connectionStatus(connections: CalendarConnectionSummary[]) {
  if (!connections.length) return "Not connected";
  const firstConnection = connections[0];
  return firstConnection.status === "connected" ? "Connected" : "Needs attention";
}

export function SettingsPage({ households, onWeekStartDayChange, weekStartDay }: SettingsPageProps) {
  const selectedHousehold = households[0];
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [members, setMembers] = useState<HouseholdMemberSummary[]>([]);
  const [connections, setConnections] = useState<CalendarConnectionSummary[]>([]);
  const [externalCalendars, setExternalCalendars] = useState<ExternalCalendarSummary[]>([]);
  const [policies, setPolicies] = useState<CalendarImportPolicy[]>([]);
  const [preferences, setPreferences] = useState<CalendarPreferences>();
  const [calendarStatus, setCalendarStatus] = useState<string>();
  const [isReviewingImports, setIsReviewingImports] = useState(false);
  const [importCandidates, setImportCandidates] = useState<CalendarImportCandidate[]>([]);
  const [selectedImportCandidateIds, setSelectedImportCandidateIds] = useState<string[]>([]);
  const highlighted = window.location.hash === "#calendar";
  const isOwner = useMemo(
    () => members.some((member) => member.userId === currentUserId && member.role === "owner"),
    [currentUserId, members]
  );

  useEffect(() => {
    if (!selectedHousehold) return;
    let cancelled = false;
    void Promise.all([
      getCurrentUser(),
      listHouseholdMembers(selectedHousehold.id),
      listCalendarConnections(),
      listExternalCalendars(),
      getCalendarPreferences(selectedHousehold.id)
    ]).then(([user, loadedMembers, loadedConnections, loadedCalendars, loadedPreferences]) => {
      if (cancelled) return;
      setCurrentUserId(user.id);
      setMembers(loadedMembers);
      setConnections(loadedConnections);
      setExternalCalendars(loadedCalendars);
      setPreferences(loadedPreferences);
    }).catch(() => {
      if (!cancelled) setCalendarStatus("Could not load calendar sync settings.");
    });
    return () => {
      cancelled = true;
    };
  }, [selectedHousehold?.id]);

  useEffect(() => {
    if (!selectedHousehold || !isOwner) {
      setPolicies([]);
      return;
    }
    let cancelled = false;
    void listCalendarImportPolicies(selectedHousehold.id)
      .then((loadedPolicies) => {
        if (!cancelled) setPolicies(loadedPolicies);
      })
      .catch(() => {
        if (!cancelled) setCalendarStatus("Could not load family import controls.");
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, selectedHousehold?.id]);

  function savePreference(update: CalendarPreferences) {
    void updateCalendarPreferences(update).then(setPreferences).catch(() => {
      setCalendarStatus("Could not save calendar preferences.");
    });
  }

  function savePolicy(policy: CalendarImportPolicy, update: Pick<CalendarImportPolicy, "importQueueMode" | "importContentMode">) {
    if (!selectedHousehold) return;
    void updateCalendarImportPolicy(selectedHousehold.id, policy.memberId, update)
      .then((updated) => {
        setPolicies((current) => current.map((item) => item.memberId === updated.memberId ? updated : item));
      })
      .catch(() => setCalendarStatus("Could not save family import controls."));
  }

  function handleConnectGoogleCalendar() {
    void startGoogleCalendarConnection()
      .then((result) => {
        if (result.authUrl) {
          window.location.assign(result.authUrl);
          return;
        }
        setCalendarStatus(result.message);
      })
      .catch(() => setCalendarStatus("Could not start Google Calendar connection."));
  }

  function handleReviewEventsToShare() {
    setIsReviewingImports(true);
    if (!selectedHousehold) return;
    void listCalendarImportCandidates(selectedHousehold.id)
      .then((candidates) => {
        setImportCandidates(candidates);
        setSelectedImportCandidateIds(candidates.map((candidate) => candidate.id));
      })
      .catch(() => setCalendarStatus("Could not load calendar events to review."));
  }

  function toggleImportCandidate(candidateId: string) {
    setSelectedImportCandidateIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId]
    );
  }

  function updateImportCandidateType(candidateId: string, proposedType: CalendarImportCandidate["proposedType"]) {
    setImportCandidates((current) => current.map((candidate) =>
      candidate.id === candidateId ? { ...candidate, proposedType } : candidate
    ));
  }

  function handleSubmitEventsToCleanly() {
    if (!selectedHousehold) return;
    const selectedEvents = importCandidates.filter((candidate) => selectedImportCandidateIds.includes(candidate.id));
    void submitCalendarImportEvents(selectedHousehold.id, selectedEvents)
      .then((result) => {
        setCalendarStatus(result.status === "auto_ready" ? "Selected events were added to Cleanly." : "Selected events were sent to the owner queue.");
        setImportCandidates([]);
        setSelectedImportCandidateIds([]);
      })
      .catch(() => setCalendarStatus("Could not send selected events to Cleanly."));
  }

  return (
    <div className="settings-page operational-page">
      <header className="page-command-header">
        <div>
          <p className="eyebrow">Preferences and connections</p>
          <h1>Settings</h1>
          <p className="lede">Manage integrations that bring your household routine into one plan.</p>
        </div>
      </header>

      <section className={`dashboard-section calendar-sync-section ${highlighted ? "highlighted" : ""}`} id="calendar" aria-labelledby="calendar-sync-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Connections</p>
            <h2 id="calendar-sync-heading">Calendar sync</h2>
          </div>
          <span>{connectionStatus(connections)}</span>
        </div>

        {!selectedHousehold ? (
          <p className="empty-state">Create a home before setting up calendar sync.</p>
        ) : (
          <div className="sync-board">
            <article className="sync-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{isOwner ? "Your connection" : "Your controls"}</p>
                  <h3>{isOwner ? "Your calendar connection" : "Personal sync center"}</h3>
                </div>
              </div>
              <p>
                Choose what you share with Cleanly and where Cleanly exports your calendar updates.
                Export does not require importing personal events.
              </p>
              {preferences ? (
                <div className="sync-settings-stack">
                  <section className="sync-setting-section" aria-labelledby="calendar-connection-settings-heading">
                    <div className="sync-setting-copy">
                      <p className="eyebrow">Connection settings</p>
                      <h4 id="calendar-connection-settings-heading">Google account</h4>
                      <p>Connect the account Cleanly should read from and write to when you choose to sync.</p>
                    </div>
                    <div className="sync-action-row">
                      <button
                        onClick={handleConnectGoogleCalendar}
                        type="button"
                      >
                        Connect Google Calendar
                      </button>
                    </div>
                  </section>

                  <section className="sync-setting-section" aria-labelledby="calendar-import-settings-heading">
                    <div className="sync-setting-copy">
                      <p className="eyebrow">Import settings</p>
                      <h4 id="calendar-import-settings-heading">What Cleanly can review</h4>
                      <p>Choose which calendars can send events toward the shared Cleanly queue.</p>
                    </div>
                    <div className="sync-preference-grid sync-preference-grid-import">
                      <label>
                        Privacy default
                        <select
                          value={preferences.defaultDetailLevel}
                          onChange={(event) => savePreference({
                            ...preferences,
                            defaultDetailLevel: event.target.value as CalendarPreferences["defaultDetailLevel"]
                          })}
                        >
                          <option value="busy_only">Busy only</option>
                          <option value="full_details">Full details</option>
                        </select>
                      </label>
                      <label>
                        Source calendars
                        <select
                          value={preferences.selectedSourceCalendarIds[0] ?? ""}
                          onChange={(event) => savePreference({
                            ...preferences,
                            selectedSourceCalendarIds: event.target.value ? [event.target.value] : []
                          })}
                        >
                          <option value="">Choose source calendar</option>
                          {externalCalendars.length ? externalCalendars.map((calendar) => (
                            <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                          )) : <option disabled>Connect Google Calendar to choose</option>}
                        </select>
                      </label>
                      <div className="sync-action-row">
                        <button className="section-action" onClick={handleReviewEventsToShare} type="button">Review events to share</button>
                      </div>
                    </div>
                  </section>

                  <section className="sync-setting-section" aria-labelledby="calendar-export-settings-heading">
                    <div className="sync-setting-copy">
                      <p className="eyebrow">Export settings</p>
                      <h4 id="calendar-export-settings-heading">Where Cleanly writes</h4>
                      <p>Export is personal. Each member chooses where Cleanly writes calendar updates.</p>
                    </div>
                    <div className="sync-preference-grid sync-preference-grid-export">
                      <label>
                        Export mode
                        <select
                          value={preferences.exportMode}
                          onChange={(event) => savePreference({
                            ...preferences,
                            exportMode: event.target.value as CalendarPreferences["exportMode"]
                          })}
                        >
                          <option value="off">Off</option>
                          <option value="review">Review first</option>
                          <option value="auto">Auto</option>
                        </select>
                      </label>
                      <label>
                        Export content
                        <select
                          value={preferences.exportContentMode}
                          onChange={(event) => savePreference({
                            ...preferences,
                            exportContentMode: event.target.value as CalendarPreferences["exportContentMode"]
                          })}
                        >
                          <option value="chores">Chores</option>
                          <option value="commitments">Commitments</option>
                          <option value="both">Both</option>
                        </select>
                      </label>
                      <label>
                        Export destination
                        <select
                          value={preferences.destinationExternalCalendarId ?? ""}
                          onChange={(event) => savePreference({
                            ...preferences,
                            destinationExternalCalendarId: event.target.value || undefined
                          })}
                        >
                          <option value="">Choose after connecting Google Calendar</option>
                          {externalCalendars.map((calendar) => (
                            <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </section>
                </div>
              ) : null}
              {isReviewingImports ? (
                <section className="calendar-review-panel" aria-live="polite" aria-label="Events to share">
                  <div>
                    <p className="eyebrow">Events to share</p>
                    <h4>Choose what reaches Cleanly</h4>
                  </div>
                  {connections.length === 0 ? (
                    <p>Connect Google Calendar before reviewing events.</p>
                  ) : importCandidates.length === 0 ? (
                    <p>No Google Calendar events are available to review yet.</p>
                  ) : (
                    <ul>
                      {importCandidates.map((candidate) => (
                        <li key={candidate.id}>
                          <label>
                            <input
                              checked={selectedImportCandidateIds.includes(candidate.id)}
                              onChange={() => toggleImportCandidate(candidate.id)}
                              type="checkbox"
                            />
                            <strong>{candidate.privacyTitle}</strong>
                          </label>
                          <select
                            value={candidate.proposedType}
                            onChange={(event) => updateImportCandidateType(
                              candidate.id,
                              event.target.value as CalendarImportCandidate["proposedType"]
                            )}
                          >
                            <option value="commitment">Commitment</option>
                            <option value="chore">Chore</option>
                          </select>
                        </li>
                      ))}
                    </ul>
                  )}
                  {importCandidates.length ? (
                    <button
                      disabled={selectedImportCandidateIds.length === 0}
                      onClick={handleSubmitEventsToCleanly}
                      type="button"
                    >
                      Send selected to Cleanly
                    </button>
                  ) : null}
                </section>
              ) : null}
            </article>

            {isOwner ? (
              <article className="sync-panel wide-sync-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Owner controls</p>
                    <h3>Family import controls</h3>
                  </div>
                </div>
                <p>Control how each member can send calendar events into the shared Cleanly calendar.</p>
                <div className="sync-policy-table">
                  <div className="sync-policy-header" aria-hidden="true">
                    <span>Member</span>
                    <span>Import mode</span>
                    <span>Content</span>
                  </div>
                  {policies.map((policy) => (
                    <div className="sync-policy-row" key={policy.memberId}>
                      <span>
                        <strong>{policy.memberName}</strong>
                        {policy.memberEmail ? <small>{policy.memberEmail}</small> : null}
                      </span>
                      <label>
                        <span className="sr-only">{policy.memberName} import mode</span>
                        <select
                          value={policy.importQueueMode}
                          onChange={(event) => savePolicy(policy, {
                            importQueueMode: event.target.value as CalendarImportPolicy["importQueueMode"],
                            importContentMode: policy.importContentMode
                          })}
                        >
                          <option value="off">Off</option>
                          <option value="manual">Review first</option>
                          <option value="auto">Auto-add</option>
                        </select>
                      </label>
                      <label>
                        <span className="sr-only">{policy.memberName} content mode</span>
                        <select
                          value={policy.importContentMode}
                          onChange={(event) => savePolicy(policy, {
                            importQueueMode: policy.importQueueMode,
                            importContentMode: event.target.value as CalendarImportPolicy["importContentMode"]
                          })}
                        >
                          <option value="chores">Chores</option>
                          <option value="commitments">Commitments</option>
                          <option value="both">Both</option>
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
              </article>
            ) : (
              <article className="sync-panel">
                <div className="panel-heading">
                  <h3>Your household policy</h3>
                </div>
                <p>Your household owner controls whether shared events are auto-added, reviewed first, or turned off for the shared Cleanly calendar.</p>
              </article>
            )}
          </div>
        )}
        {calendarStatus ? <p role="status" className="section-summary">{calendarStatus}</p> : null}
      </section>

      <section className="dashboard-section" aria-labelledby="calendar-preferences-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Calendar</p>
            <h2 id="calendar-preferences-heading">Calendar preferences</h2>
          </div>
        </div>
        <article className="integration-card">
          <div className="panel-heading">
            <h2>Week starts on</h2>
            <span>{weekStartDay === "sunday" ? "Sunday" : "Monday"}</span>
          </div>
          <fieldset className="settings-radio-group">
            <legend className="sr-only">Week starts on</legend>
            <label>
              <input
                checked={weekStartDay === "sunday"}
                name="week-start-day"
                onChange={() => onWeekStartDayChange("sunday")}
                type="radio"
              />
              Sunday
            </label>
            <label>
              <input
                checked={weekStartDay === "monday"}
                name="week-start-day"
                onChange={() => onWeekStartDayChange("monday")}
                type="radio"
              />
              Monday
            </label>
          </fieldset>
        </article>
      </section>
    </div>
  );
}
