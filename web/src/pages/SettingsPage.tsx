import { useEffect, useMemo, useState } from "react";
import type {
  CalendarConnectionSummary,
  CalendarImportPolicy,
  CalendarPreferences,
  Chore,
  ChoreDefinitionInput,
  ChoreLibraryPermission,
  HouseholdAppData,
  HouseholdMemberSummary
} from "@chore-helper/shared";
import {
  archiveChore,
  createChore,
  disconnectCalendarConnection,
  getCalendarPreferences,
  getCurrentUser,
  listArchivedChores,
  listCalendarConnections,
  listCalendarImportPolicies,
  listChores,
  listHouseholdMembers,
  restoreChore,
  startGoogleCalendarConnection,
  updateChore,
  updateChoreLibraryPermission,
  updateCalendarImportPolicy,
  updateCalendarPreferences
} from "../api";
import type { WeekStartDay } from "../types";

type SettingsPageProps = {
  households: HouseholdAppData[];
  onWeekStartDayChange: (weekStartDay: WeekStartDay) => void;
  weekStartDay: WeekStartDay;
};
type SettingsView = "general" | "connections" | "family" | "library";
type ChoreFormState = {
  title: string;
  instructions: string;
  tags: string;
};

const settingsViews: Array<{ id: SettingsView; label: string; summary: string }> = [
  { id: "general", label: "General", summary: "Defaults" },
  { id: "connections", label: "Connections", summary: "Calendar sync" },
  { id: "family", label: "Family", summary: "Permissions" },
  { id: "library", label: "Chore library", summary: "Reusable work" }
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

function ChoreLibraryModal({
  chore,
  onClose,
  onSave
}: {
  chore: Chore | "new";
  onClose: () => void;
  onSave: (chore: Chore | "new", form: ChoreFormState) => void;
}) {
  const [form, setForm] = useState<ChoreFormState>(() => ({
    title: chore === "new" ? "" : chore.title,
    instructions: chore === "new" ? "" : chore.instructions ?? "",
    tags: chore === "new" ? "" : (chore.tags ?? []).join(", ")
  }));
  const title = chore === "new" ? "Add chore" : "Edit chore";

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-label={title}
        aria-modal="true"
        className="modal-card chore-library-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Chore library</p>
            <h3>{title}</h3>
          </div>
          <button aria-label="Close dialog" className="modal-close-button" type="button" onClick={onClose}>X</button>
        </div>
        <div className="sync-preference-grid">
          <label>
            Chore name
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label>
            Tags
            <input
              placeholder="kitchen, weekly"
              value={form.tags}
              onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
            />
          </label>
          <label className="settings-modal-wide-field">
            Instructions
            <textarea
              value={form.instructions}
              onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={() => onSave(chore, form)} disabled={!form.title.trim()}>Save chore</button>
        </div>
      </section>
    </div>
  );
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
  const [libraryChores, setLibraryChores] = useState<Chore[]>([]);
  const [archivedChores, setArchivedChores] = useState<Chore[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySource, setLibrarySource] = useState<"all" | Chore["source"]>("all");
  const [libraryStatus, setLibraryStatus] = useState<"active" | "archived">("active");
  const [editingChore, setEditingChore] = useState<Chore | "new">();
  const [archiveCandidate, setArchiveCandidate] = useState<Chore>();
  const [libraryStatusMessage, setLibraryStatusMessage] = useState<string>();
  const [calendarStatus, setCalendarStatus] = useState<string>();
  const connectedConnection = connections.find((connection) => connection.status === "connected") ?? connections[0];
  const isOwner = useMemo(
    () => members.some((member) => member.userId === currentUserId && member.role === "owner"),
    [currentUserId, members]
  );
  const currentMember = members.find((member) => member.userId === currentUserId);
  const canManageChoreLibrary = isOwner || currentMember?.choreLibraryPermission === "manage";

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

  useEffect(() => {
    if (!selectedHousehold) {
      setLibraryChores([]);
      setArchivedChores([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      listChores(selectedHousehold.id),
      listArchivedChores(selectedHousehold.id)
    ])
      .then(([active, archived]) => {
        if (cancelled) return;
        setLibraryChores(active);
        setArchivedChores(archived);
      })
      .catch(() => {
        if (!cancelled) setLibraryStatusMessage("Could not load the Chore library.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedHousehold?.id]);

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

  function saveChoreLibraryPermission(member: HouseholdMemberSummary, choreLibraryPermission: ChoreLibraryPermission) {
    if (!selectedHousehold) return;
    void updateChoreLibraryPermission(selectedHousehold.id, member.userId, choreLibraryPermission)
      .then((updated) => {
        setMembers((current) => current.map((item) => item.userId === updated.userId ? updated : item));
      })
      .catch(() => setCalendarStatus("Could not save Chore library permission."));
  }

  function toChoreInput(chore: Chore | "new", form: ChoreFormState): ChoreDefinitionInput {
    return {
      title: form.title.trim(),
      source: chore === "new" ? "manual" : chore.source,
      instructions: form.instructions.trim() || undefined,
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
    };
  }

  function saveLibraryChore(chore: Chore | "new", form: ChoreFormState) {
    if (!selectedHousehold || !form.title.trim()) return;
    const input = toChoreInput(chore, form);
    const request = chore === "new"
      ? createChore(selectedHousehold.id, input)
      : updateChore(selectedHousehold.id, chore.id, input);

    void request
      .then((saved) => {
        setLibraryChores((current) => chore === "new"
          ? [...current, saved]
          : current.map((item) => item.id === saved.id ? saved : item));
        setEditingChore(undefined);
        setLibraryStatusMessage("Chore library saved.");
      })
      .catch(() => setLibraryStatusMessage("Could not save Chore library item."));
  }

  function archiveLibraryChore(chore: Chore) {
    if (!selectedHousehold) return;
    void archiveChore(selectedHousehold.id, chore.id)
      .then((archived) => {
        setLibraryChores((current) => current.filter((item) => item.id !== archived.id));
        setArchivedChores((current) => [archived, ...current.filter((item) => item.id !== archived.id)]);
        setArchiveCandidate(undefined);
        setLibraryStatusMessage("Chore archived.");
      })
      .catch(() => setLibraryStatusMessage("Could not archive chore."));
  }

  function restoreLibraryChore(chore: Chore) {
    if (!selectedHousehold) return;
    void restoreChore(selectedHousehold.id, chore.id)
      .then((restored) => {
        setArchivedChores((current) => current.filter((item) => item.id !== restored.id));
        setLibraryChores((current) => [restored, ...current.filter((item) => item.id !== restored.id)]);
        setLibraryStatusMessage("Chore restored.");
      })
      .catch(() => setLibraryStatusMessage("Could not restore chore."));
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
          <p className="empty-state">Add or join a household before managing family permissions.</p>
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
            <p>Your household owner controls whether shared events are auto-added and who can manage the shared Chore library.</p>
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
              <h3>Family permissions</h3>
            </div>
          </div>
          <p>Control how each member can send calendar events into Clenella and manage the shared Chore library.</p>
          <div className="sync-policy-table">
            <div className="sync-policy-header" aria-hidden="true">
              <span>Member</span>
              <span>Import mode</span>
              <span>Content</span>
              <span>Chore library</span>
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
                <label>
                  <span className="sr-only">{policy.memberName} chore library permission</span>
                  <select
                    value={members.find((member) => member.userId === policy.memberId)?.choreLibraryPermission ?? "view"}
                    onChange={(event) => {
                      const member = members.find((item) => item.userId === policy.memberId);
                      if (member) saveChoreLibraryPermission(member, event.target.value as ChoreLibraryPermission);
                    }}
                  >
                    <option value="view">View only</option>
                    <option value="manage">Manage</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
        </article>
      </section>
    );
  }

  function renderChoreLibrary() {
    const sourceLabel = (source: Chore["source"]) => source === "google-calendar" ? "Imported" : "Manual";
    const chores = libraryStatus === "active" ? libraryChores : archivedChores;
    const visibleChores = chores
      .filter((chore) => librarySource === "all" || chore.source === librarySource)
      .filter((chore) => {
        const query = librarySearch.trim().toLowerCase();
        if (!query) return true;
        return [
          chore.title,
          chore.instructions ?? "",
          ...(chore.tags ?? [])
        ].some((value) => value.toLowerCase().includes(query));
      });

    return (
      <section className="settings-view-panel" aria-label="Chore library">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Reusable work</p>
            <h2>Chore library</h2>
          </div>
          <span>{chores.length} chore{chores.length === 1 ? "" : "s"}</span>
        </div>
        {!selectedHousehold ? (
          <p className="empty-state">Add or join a household before reviewing the Chore library.</p>
        ) : (
          <>
            <div className="chore-library-toolbar">
              <label>
                <span className="sr-only">Search Chore library</span>
                <input
                  placeholder="Search chores"
                  type="search"
                  value={librarySearch}
                  onChange={(event) => setLibrarySearch(event.target.value)}
                />
              </label>
              <label>
                <span className="sr-only">Chore source</span>
                <select value={librarySource} onChange={(event) => setLibrarySource(event.target.value as typeof librarySource)}>
                  <option value="all">All sources</option>
                  <option value="manual">Manual</option>
                  <option value="google-calendar">Imported</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Chore status</span>
                <select value={libraryStatus} onChange={(event) => setLibraryStatus(event.target.value as typeof libraryStatus)}>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              {canManageChoreLibrary ? (
                <button type="button" onClick={() => setEditingChore("new")}>Add chore</button>
              ) : null}
            </div>
            {!canManageChoreLibrary ? (
              <p className="section-summary">Your household owner controls who can manage the Chore library.</p>
            ) : null}
            {libraryStatusMessage ? <p role="status" className="section-summary">{libraryStatusMessage}</p> : null}
            {visibleChores.length === 0 ? (
              <p className="empty-state">
                {libraryStatus === "archived" ? "No archived chores match these filters." : "No chores have been added to the Chore library yet."}
              </p>
            ) : (
              <div className="chore-library-list">
                {visibleChores.map((chore) => (
                  <article className="chore-library-row" key={chore.id}>
                    <div>
                      <strong>{chore.title}</strong>
                      <span>{chore.instructions ?? "No instructions yet."}</span>
                    </div>
                    <span>{sourceLabel(chore.source)}</span>
                    <span>{Array.isArray(chore.tags) && chore.tags.length > 0 ? chore.tags.join(", ") : "No tags"}</span>
                    <div className="chore-library-actions">
                      {canManageChoreLibrary && libraryStatus === "active" ? (
                        <>
                          <button aria-label="Edit chore" type="button" onClick={() => setEditingChore(chore)}>Edit</button>
                          <button aria-label="Archive chore" className="section-action" type="button" onClick={() => setArchiveCandidate(chore)}>Archive</button>
                        </>
                      ) : null}
                      {canManageChoreLibrary && libraryStatus === "archived" ? (
                        <button aria-label="Restore chore" type="button" onClick={() => restoreLibraryChore(chore)}>Restore</button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
        {editingChore ? (
          <ChoreLibraryModal
            chore={editingChore}
            onClose={() => setEditingChore(undefined)}
            onSave={saveLibraryChore}
          />
        ) : null}
        {archiveCandidate ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setArchiveCandidate(undefined)}>
            <section
              aria-label="Archive chore"
              aria-modal="true"
              className="modal-card chore-library-modal"
              onMouseDown={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Archive chore</p>
                  <h3>Archive {archiveCandidate.title}?</h3>
                </div>
                <button aria-label="Close dialog" className="modal-close-button" type="button" onClick={() => setArchiveCandidate(undefined)}>X</button>
              </div>
              <p>Future scheduled work for this chore will stop, but historical activity stays available.</p>
              <div className="modal-actions">
                <button type="button" onClick={() => setArchiveCandidate(undefined)}>Cancel</button>
                <button className="section-action" type="button" onClick={() => archiveLibraryChore(archiveCandidate)}>Archive chore</button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    );
  }

  function renderActiveView() {
    if (activeView === "connections") return renderConnectionsSettings();
    if (activeView === "family") return renderFamilySettings();
    if (activeView === "library") return renderChoreLibrary();
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
