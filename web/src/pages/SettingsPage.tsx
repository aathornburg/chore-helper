import { useEffect, useMemo, useState } from "react";
import type {
  CalendarConnectionSummary,
  CalendarImportPolicy,
  CalendarPreferences,
  HouseholdAppData,
  HouseholdMemberSummary
} from "@chore-helper/shared";
import {
  disconnectCalendarConnection,
  getCalendarPreferences,
  getCurrentUser,
  listCalendarConnections,
  listCalendarImportPolicies,
  listHouseholdMembers,
  startGoogleCalendarConnection,
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
  const [policies, setPolicies] = useState<CalendarImportPolicy[]>([]);
  const [preferences, setPreferences] = useState<CalendarPreferences>();
  const [calendarStatus, setCalendarStatus] = useState<string>();
  const highlighted = window.location.hash === "#calendar";
  const connectedConnection = connections.find((connection) => connection.status === "connected") ?? connections[0];
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
      getCalendarPreferences(selectedHousehold.id)
    ]).then(([user, loadedMembers, loadedConnections, loadedPreferences]) => {
      if (cancelled) return;
      setCurrentUserId(user.id);
      setMembers(loadedMembers);
      setConnections(loadedConnections);
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

  function handleDisconnectGoogleCalendar() {
    if (!connectedConnection) return;
    void disconnectCalendarConnection(connectedConnection.id)
      .then((result) => {
        setConnections((current) => current.filter((connection) => connection.id !== connectedConnection.id));
        setCalendarStatus(result.message);
      })
      .catch(() => setCalendarStatus("Could not disconnect Google Calendar."));
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

      <section className={`calendar-sync-section ${highlighted ? "highlighted" : ""}`} id="calendar" aria-label="Calendar sync">
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
                <span>{connectionStatus(connections)}</span>
              </div>
              <p>
                Choose what Cleanly can review and where Cleanly exports your calendar updates.
                When you are ready to import or export events, use Calendar.
              </p>
              {preferences ? (
                <div className="sync-settings-stack">
                  <section className="sync-setting-section" aria-labelledby="calendar-connection-settings-heading">
                    <div className="sync-setting-copy">
                      <p className="eyebrow">Connection settings</p>
                      <h4 id="calendar-connection-settings-heading">Google account</h4>
                      <p>
                        {connectedConnection
                          ? `Connected as ${connectedConnection.providerAccountEmail}. Disconnecting removes Cleanly's stored Google tokens.`
                          : "Connect the account Cleanly should read from and write to when you choose to sync."}
                      </p>
                    </div>
                    <div className="sync-action-row">
                      {connectedConnection ? (
                        <button className="section-action" onClick={handleDisconnectGoogleCalendar} type="button">
                          Disconnect Google Calendar
                        </button>
                      ) : (
                        <button onClick={handleConnectGoogleCalendar} type="button">
                          Connect Google Calendar
                        </button>
                      )}
                    </div>
                  </section>

                  <section className="sync-setting-section" aria-labelledby="calendar-import-settings-heading">
                    <div className="sync-setting-copy">
                      <p className="eyebrow">Import settings</p>
                      <h4 id="calendar-import-settings-heading">What Cleanly can review</h4>
                      <p>Choose the privacy default Cleanly uses when you import events. Pick the source calendar from Calendar when you are ready to review events.</p>
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
                    </div>
                  </section>

                  <section className="sync-setting-section" aria-labelledby="calendar-export-settings-heading">
                    <div className="sync-setting-copy">
                      <p className="eyebrow">Export settings</p>
                      <h4 id="calendar-export-settings-heading">Where Cleanly writes</h4>
                      <p>Set export defaults here. Choose the destination calendar during the Calendar export review.</p>
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
                    </div>
                  </section>
                </div>
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
