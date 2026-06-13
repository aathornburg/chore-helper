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
type SettingsView = "general" | "connections" | "family" | "master";

const settingsViews: Array<{ id: SettingsView; label: string; summary: string }> = [
  { id: "general", label: "General", summary: "Defaults" },
  { id: "connections", label: "Connections", summary: "Calendar sync" },
  { id: "family", label: "Family", summary: "Import controls" },
  { id: "master", label: "Master chore list", summary: "Chore library" }
];

function connectionStatus(connections: CalendarConnectionSummary[]) {
  if (!connections.length) return "Not connected";
  const firstConnection = connections[0];
  return firstConnection.status === "connected" ? "Connected" : "Needs attention";
}

function defaultDisconnectedPreferences(householdId: string): CalendarPreferences {
  return {
    householdId,
    defaultDetailLevel: "busy_only",
    selectedSourceCalendarIds: [],
    exportMode: "off",
    exportContentMode: "chores"
  };
}

export function SettingsPage({ households, onWeekStartDayChange, weekStartDay }: SettingsPageProps) {
  const selectedHousehold = households[0];
  const [activeView, setActiveView] = useState<SettingsView>(() =>
    window.location.hash === "#calendar" ? "connections" : "general"
  );
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [members, setMembers] = useState<HouseholdMemberSummary[]>([]);
  const [connections, setConnections] = useState<CalendarConnectionSummary[]>([]);
  const [policies, setPolicies] = useState<CalendarImportPolicy[]>([]);
  const [preferences, setPreferences] = useState<CalendarPreferences>();
  const [calendarStatus, setCalendarStatus] = useState<string>();
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
      listCalendarConnections()
    ]).then(([user, loadedMembers, loadedConnections]) => {
      if (cancelled) return;
      setCurrentUserId(user.id);
      setMembers(loadedMembers);
      setConnections(loadedConnections);
      if (!loadedConnections.length) {
        setPreferences(defaultDisconnectedPreferences(selectedHousehold.id));
        return;
      }
      void getCalendarPreferences(selectedHousehold.id)
        .then((loadedPreferences) => {
          if (!cancelled) setPreferences(loadedPreferences);
        })
        .catch(() => {
          if (!cancelled) setCalendarStatus("Could not load calendar sync settings.");
        });
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

  function renderGeneralSettings() {
    return (
      <section className="settings-view-panel" aria-label="General settings">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">General</p>
            <h2>Calendar preferences</h2>
          </div>
        </div>
        <article className="settings-preference-row">
          <div>
            <h3>Week starts on</h3>
            <p>Controls the week rail on Today.</p>
          </div>
          <label className="settings-select-control">
            <span className="sr-only">Week starts on</span>
            <select
              value={weekStartDay}
              onChange={(event) => onWeekStartDayChange(event.target.value as WeekStartDay)}
            >
              <option value="sunday">Sunday</option>
              <option value="monday">Monday</option>
            </select>
          </label>
        </article>
      </section>
    );
  }

  function renderConnectionsSettings() {
    return (
      <section className="calendar-sync-section settings-view-panel" id="calendar" aria-label="Calendar sync">
        {!selectedHousehold ? (
          <p className="empty-state">Add or join a household before setting up calendar sync.</p>
        ) : (
          <article className="sync-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{isOwner ? "Your connection" : "Your controls"}</p>
                <h3>{isOwner ? "Your calendar connection" : "Personal sync center"}</h3>
              </div>
              <span>{connectionStatus(connections)}</span>
            </div>
            <p>
              Choose what Clenella can review and where Clenella exports your calendar updates.
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
                        ? `Connected as ${connectedConnection.providerAccountEmail}. Disconnecting removes Clenella's stored Google tokens.`
                        : "Connect the account Clenella should read from and write to when you choose to sync."}
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
                    <h4 id="calendar-import-settings-heading">What Clenella can review</h4>
                    <p>Choose the privacy default Clenella uses when you import events. Pick the source calendar from Calendar when you are ready to review events.</p>
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
                    <h4 id="calendar-export-settings-heading">Where Clenella writes</h4>
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
        )}
        {calendarStatus ? <p role="status" className="section-summary">{calendarStatus}</p> : null}
      </section>
    );
  }

  function renderFamilySettings() {
    if (!selectedHousehold) {
      return (
        <section className="settings-view-panel" aria-label="Family settings">
          <p className="empty-state">Add or join a household before managing family import controls.</p>
        </section>
      );
    }

    if (!isOwner) {
      return (
        <section className="settings-view-panel" aria-label="Family settings">
          <article className="sync-panel">
            <div className="panel-heading">
              <h3>Your household policy</h3>
            </div>
            <p>Your household owner controls whether shared events are auto-added, reviewed first, or turned off for the shared Clenella calendar.</p>
          </article>
        </section>
      );
    }

    return (
      <section className="settings-view-panel" aria-label="Family settings">
        <article className="sync-panel wide-sync-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Owner controls</p>
              <h3>Family import controls</h3>
            </div>
          </div>
          <p>Control how each member can send calendar events into the shared Clenella calendar.</p>
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
      </section>
    );
  }

  function renderMasterChoreList() {
    return (
      <section className="settings-view-panel" aria-label="Master chore list">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Reusable work</p>
            <h2>Master chore list</h2>
          </div>
          <span>{selectedHousehold?.chores.length ?? 0} chore{selectedHousehold?.chores.length === 1 ? "" : "s"}</span>
        </div>
        {!selectedHousehold ? (
          <p className="empty-state">Add or join a household before reviewing the master chore list.</p>
        ) : selectedHousehold.chores.length === 0 ? (
          <p className="empty-state">No chores have been added to this household yet.</p>
        ) : (
          <div className="settings-master-list">
            {selectedHousehold.chores.map((chore) => (
              <article className="settings-master-row" key={chore.id}>
                <div>
                  <strong>{chore.title}</strong>
                  <span>{chore.source === "google-calendar" ? "Imported" : "Manual"}</span>
                </div>
                <span>{Array.isArray(chore.tags) && chore.tags.length > 0 ? chore.tags.join(", ") : "No tags"}</span>
                <span>{chore.recommendations.length} recommendation{chore.recommendations.length === 1 ? "" : "s"}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderActiveView() {
    if (activeView === "connections") return renderConnectionsSettings();
    if (activeView === "family") return renderFamilySettings();
    if (activeView === "master") return renderMasterChoreList();
    return renderGeneralSettings();
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

      <section className="settings-workspace" aria-label="Settings workspace">
        <nav className="settings-sidebar" role="tablist" aria-label="Settings sections">
          {settingsViews.map((view) => (
            <button
              aria-label={view.label}
              aria-controls={`settings-panel-${view.id}`}
              aria-selected={activeView === view.id}
              className="settings-sidebar-tab"
              id={`settings-tab-${view.id}`}
              key={view.id}
              onClick={() => setActiveView(view.id)}
              role="tab"
              type="button"
            >
              <strong>{view.label}</strong>
              <span>{view.summary}</span>
            </button>
          ))}
        </nav>
        <div
          aria-labelledby={`settings-tab-${activeView}`}
          className="settings-content"
          id={`settings-panel-${activeView}`}
          role="tabpanel"
        >
          {renderActiveView()}
        </div>
      </section>
    </div>
  );
}
