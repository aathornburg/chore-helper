import { useEffect, useMemo, useState } from "react";
import type { HouseholdAppData, HouseholdMemberSummary, Task, TaskDefinitionInput, TaskInboxItem } from "@chore-helper/shared";
import {
  archiveTask,
  createTask,
  getCurrentUser,
  keepTaskInboxItemOneTime,
  listArchivedTasks,
  listHouseholdMembers,
  listTaskInbox,
  listTasks,
  linkTaskInboxItem,
  restoreTask,
  saveTaskInboxItem,
  updateTask
} from "../api";

type TasksPageProps = {
  households: HouseholdAppData[];
  isLoading: boolean;
};

type TasksSection = "library" | "inbox";
type TaskFormState = {
  title: string;
  type: Task["type"];
  instructions: string;
  tags: string;
};

function taskTypeLabel(type: Task["type"]) {
  return type === "commitment" ? "Commitment" : "Chore";
}

function taskSourceLabel(source: Task["source"]) {
  return source === "google-calendar" ? "Imported" : "Manual";
}

function TaskLibraryModal({
  task,
  onClose,
  onSave
}: {
  task: Task | "new";
  onClose: () => void;
  onSave: (task: Task | "new", form: TaskFormState) => void;
}) {
  const [form, setForm] = useState<TaskFormState>(() => ({
    title: task === "new" ? "" : task.title,
    type: task === "new" ? "chore" : task.type,
    instructions: task === "new" ? "" : task.instructions ?? "",
    tags: task === "new" ? "" : (task.tags ?? []).join(", ")
  }));
  const title = task === "new" ? "Add task" : "Edit task";

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
            <p className="eyebrow">Task library</p>
            <h3>{title}</h3>
          </div>
          <button aria-label="Close dialog" className="modal-close-button" type="button" onClick={onClose}>X</button>
        </div>
        <div className="sync-preference-grid">
          <label>
            Task name
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label>
            Task type
            <select
              value={form.type}
              onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as Task["type"] }))}
            >
              <option value="chore">Chore</option>
              <option value="commitment">Commitment</option>
            </select>
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
          <button type="button" onClick={() => onSave(task, form)} disabled={!form.title.trim()}>Save task</button>
        </div>
      </section>
    </div>
  );
}

export function TasksPage({ households, isLoading }: TasksPageProps) {
  const selectedHousehold = households[0];
  const [activeSection, setActiveSection] = useState<TasksSection>("library");
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [members, setMembers] = useState<HouseholdMemberSummary[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<"loading" | "ready" | "error">(
    selectedHousehold ? "loading" : "ready"
  );
  const [libraryTasks, setLibraryTasks] = useState<Task[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [taskInboxItems, setTaskInboxItems] = useState<TaskInboxItem[]>([]);
  const [taskInboxStatus, setTaskInboxStatus] = useState<"loading" | "ready" | "error">(
    selectedHousehold ? "loading" : "ready"
  );
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySource, setLibrarySource] = useState<"all" | Task["source"]>("all");
  const [libraryType, setLibraryType] = useState<"all" | Task["type"]>("all");
  const [libraryStatus, setLibraryStatus] = useState<"active" | "archived">("active");
  const [editingTask, setEditingTask] = useState<Task | "new">();
  const [archiveCandidate, setArchiveCandidate] = useState<Task>();
  const [statusMessage, setStatusMessage] = useState<string>();

  const isOwner = useMemo(
    () => members.some((member) => member.userId === currentUserId && member.role === "owner"),
    [currentUserId, members]
  );
  const currentMember = members.find((member) => member.userId === currentUserId);
  const canManageTaskLibrary = isOwner || currentMember?.taskLibraryPermission === "manage";

  useEffect(() => {
    if (!selectedHousehold) {
      setPermissionStatus("ready");
      setMembers([]);
      return;
    }

    let cancelled = false;
    setPermissionStatus("loading");
    void Promise.all([
      getCurrentUser(),
      listHouseholdMembers(selectedHousehold.id)
    ]).then(([user, loadedMembers]) => {
      if (cancelled) return;
      setCurrentUserId(user.id);
      setMembers(loadedMembers);
      setPermissionStatus("ready");
    }).catch(() => {
      if (!cancelled) {
        setMembers([]);
        setPermissionStatus("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedHousehold?.id]);

  useEffect(() => {
    if (!selectedHousehold) {
      setLibraryTasks([]);
      setArchivedTasks([]);
      setTaskInboxItems([]);
      setTaskInboxStatus("ready");
      return;
    }

    let cancelled = false;
    setTaskInboxStatus("loading");
    void Promise.all([
      listTasks(selectedHousehold.id),
      listArchivedTasks(selectedHousehold.id),
      listTaskInbox(selectedHousehold.id)
    ]).then(([active, archived, inbox]) => {
      if (cancelled) return;
      setLibraryTasks(active);
      setArchivedTasks(archived);
      setTaskInboxItems(inbox.items);
      setTaskInboxStatus("ready");
    }).catch(() => {
      if (!cancelled) {
        setTaskInboxStatus("error");
        setStatusMessage("Could not load task data.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedHousehold?.id]);

  function toTaskInput(task: Task | "new", form: TaskFormState): TaskDefinitionInput {
    return {
      title: form.title.trim(),
      type: form.type,
      libraryState: task === "new" ? "saved" : task.libraryState,
      source: task === "new" ? "manual" : task.source,
      instructions: form.instructions.trim() || undefined,
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
    };
  }

  function saveLibraryTask(task: Task | "new", form: TaskFormState) {
    if (!selectedHousehold || !form.title.trim()) return;
    const input = toTaskInput(task, form);
    const request = task === "new"
      ? createTask(selectedHousehold.id, input)
      : updateTask(selectedHousehold.id, task.id, input);

    void request
      .then((saved) => {
        setLibraryTasks((current) => task === "new"
          ? [...current, saved]
          : current.map((item) => item.id === saved.id ? saved : item));
        setEditingTask(undefined);
        setStatusMessage("Task library saved.");
      })
      .catch(() => setStatusMessage("Could not save Task library item."));
  }

  function archiveLibraryTask(task: Task) {
    if (!selectedHousehold) return;
    void archiveTask(selectedHousehold.id, task.id)
      .then((archived) => {
        setLibraryTasks((current) => current.filter((item) => item.id !== archived.id));
        setArchivedTasks((current) => [archived, ...current.filter((item) => item.id !== archived.id)]);
        setArchiveCandidate(undefined);
        setStatusMessage("Task archived.");
      })
      .catch(() => setStatusMessage("Could not archive task."));
  }

  function restoreLibraryTask(task: Task) {
    if (!selectedHousehold) return;
    void restoreTask(selectedHousehold.id, task.id)
      .then((restored) => {
        setArchivedTasks((current) => current.filter((item) => item.id !== restored.id));
        setLibraryTasks((current) => [restored, ...current.filter((item) => item.id !== restored.id)]);
        setStatusMessage("Task restored.");
      })
      .catch(() => setStatusMessage("Could not restore task."));
  }

  function taskInputFromInboxItem(item: TaskInboxItem): TaskDefinitionInput {
    return {
      title: item.title.trim(),
      type: item.proposedType,
      libraryState: "saved",
      source: item.source,
      tags: []
    };
  }

  function removeInboxItem(item: TaskInboxItem) {
    setTaskInboxItems((current) => current.filter((candidate) => candidate.id !== item.id));
  }

  function saveInboxItem(item: TaskInboxItem) {
    if (!selectedHousehold) return;
    void saveTaskInboxItem(selectedHousehold.id, item.kind, item.id, taskInputFromInboxItem(item), "single")
      .then(() => {
        removeInboxItem(item);
        setStatusMessage("Task saved to the library.");
      })
      .catch(() => setStatusMessage("Could not save this inbox item."));
  }

  function linkInboxItem(item: TaskInboxItem) {
    if (!selectedHousehold || !item.suggestedTaskId) return;
    void linkTaskInboxItem(selectedHousehold.id, item.kind, item.id, item.suggestedTaskId, "single")
      .then(() => {
        removeInboxItem(item);
        setStatusMessage("Task linked.");
      })
      .catch(() => setStatusMessage("Could not link this inbox item."));
  }

  function keepInboxItemOneTime(item: TaskInboxItem) {
    if (!selectedHousehold) return;
    void keepTaskInboxItemOneTime(selectedHousehold.id, item.kind, item.id)
      .then(() => {
        removeInboxItem(item);
        setStatusMessage("Task kept one-time.");
      })
      .catch(() => setStatusMessage("Could not update this inbox item."));
  }

  const tasksForStatus = libraryStatus === "active" ? libraryTasks : archivedTasks;
  const visibleTasks = tasksForStatus
    .filter((task) => librarySource === "all" || task.source === librarySource)
    .filter((task) => libraryType === "all" || task.type === libraryType)
    .filter((task) => {
      const query = librarySearch.trim().toLowerCase();
      if (!query) return true;
      return [
        task.title,
        task.instructions ?? "",
        taskTypeLabel(task.type),
        ...(task.tags ?? [])
      ].some((value) => value.toLowerCase().includes(query));
    });

  function renderTaskLibrary() {
    return (
      <section className="settings-view-panel" aria-label="Task library">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Reusable work</p>
            <h2>Task library</h2>
          </div>
          <span>{tasksForStatus.length} task{tasksForStatus.length === 1 ? "" : "s"}</span>
        </div>
        {!selectedHousehold ? (
          <p className="empty-state">Add or join a household before reviewing the Task library.</p>
        ) : (
          <>
            <div className="chore-library-toolbar">
              <label>
                <span className="sr-only">Search Task library</span>
                <input
                  placeholder="Search tasks"
                  type="search"
                  value={librarySearch}
                  onChange={(event) => setLibrarySearch(event.target.value)}
                />
              </label>
              <label>
                <span className="sr-only">Task type</span>
                <select value={libraryType} onChange={(event) => setLibraryType(event.target.value as typeof libraryType)}>
                  <option value="all">All types</option>
                  <option value="chore">Chores</option>
                  <option value="commitment">Commitments</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Task source</span>
                <select value={librarySource} onChange={(event) => setLibrarySource(event.target.value as typeof librarySource)}>
                  <option value="all">All sources</option>
                  <option value="manual">Manual</option>
                  <option value="google-calendar">Imported</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Task status</span>
                <select value={libraryStatus} onChange={(event) => setLibraryStatus(event.target.value as typeof libraryStatus)}>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              {canManageTaskLibrary ? (
                <button type="button" onClick={() => setEditingTask("new")}>Add task</button>
              ) : null}
            </div>
            {permissionStatus === "loading" ? (
              <p className="section-summary" role="status">Loading household permissions...</p>
            ) : null}
            {permissionStatus === "error" ? (
              <p className="section-summary" role="status">
                Could not load household permissions. Task library management is unavailable, and a database migration may still need to run.
              </p>
            ) : null}
            {permissionStatus === "ready" && !canManageTaskLibrary ? (
              <p className="section-summary">Your household owner controls who can manage the Task library.</p>
            ) : null}
            {statusMessage ? <p role="status" className="section-summary">{statusMessage}</p> : null}
            {visibleTasks.length === 0 ? (
              <p className="empty-state">
                {libraryStatus === "archived" ? "No archived tasks match these filters." : "No tasks have been saved to the Task library yet."}
              </p>
            ) : (
              <div className="chore-library-list">
                {visibleTasks.map((task) => (
                  <article className={`chore-library-row task-library-row is-${task.type}`} key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <span>{task.instructions ?? "No instructions yet."}</span>
                    </div>
                    <span className={`task-type-badge is-${task.type}`}>{taskTypeLabel(task.type)}</span>
                    <span>{taskSourceLabel(task.source)}</span>
                    <span>{Array.isArray(task.tags) && task.tags.length > 0 ? task.tags.join(", ") : "No tags"}</span>
                    <div className="chore-library-actions">
                      {canManageTaskLibrary && libraryStatus === "active" ? (
                        <>
                          <button aria-label={`Edit ${task.title}`} type="button" onClick={() => setEditingTask(task)}>Edit</button>
                          <button aria-label={`Archive ${task.title}`} className="section-action" type="button" onClick={() => setArchiveCandidate(task)}>Archive</button>
                        </>
                      ) : null}
                      {canManageTaskLibrary && libraryStatus === "archived" ? (
                        <button aria-label={`Restore ${task.title}`} type="button" onClick={() => restoreLibraryTask(task)}>Restore</button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    );
  }

  function renderTaskInbox() {
    return (
      <section className="settings-view-panel" aria-label="Task inbox">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Needs review</p>
            <h2>Task inbox</h2>
          </div>
          <span>{taskInboxItems.length} item{taskInboxItems.length === 1 ? "" : "s"}</span>
        </div>
        {taskInboxStatus === "loading" ? (
          <p className="section-summary" role="status">Loading Task inbox...</p>
        ) : null}
        {taskInboxStatus === "error" ? (
          <p className="section-summary" role="status">Could not load the Task inbox.</p>
        ) : null}
        {statusMessage ? <p role="status" className="section-summary">{statusMessage}</p> : null}
        {taskInboxStatus === "ready" && taskInboxItems.length === 0 ? (
          <p className="empty-state">Imported and one-time scheduled tasks that can be saved or linked will appear here.</p>
        ) : null}
        {taskInboxItems.length > 0 ? (
          <div className="task-inbox-list">
            {taskInboxItems.map((item) => (
              <article className={`task-inbox-row is-${item.proposedType}`} key={`${item.kind}-${item.id}`}>
                <div>
                  <div className="task-inbox-title-line">
                    <strong>{item.title}</strong>
                    <span className="calendar-queue-badge">{item.badge}</span>
                    <span className={`task-type-badge is-${item.proposedType}`}>{taskTypeLabel(item.proposedType)}</span>
                  </div>
                  <span>{taskSourceLabel(item.source)}</span>
                  {item.suggestedReason ? (
                    <span>Suggested link: {item.suggestedReason}</span>
                  ) : null}
                </div>
                <div className="task-inbox-actions">
                  {canManageTaskLibrary ? (
                    <>
                      <button type="button" onClick={() => saveInboxItem(item)}>Save as task</button>
                      <button type="button" onClick={() => linkInboxItem(item)} disabled={!item.suggestedTaskId}>Link to existing task</button>
                      <button type="button" onClick={() => keepInboxItemOneTime(item)}>Keep one-time</button>
                    </>
                  ) : null}
                  {item.kind === "import_queue" ? (
                    <a className="button-link" href="/calendar?section=import-queue">Open in Import queue</a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  if (isLoading) return <p className="loading-state">Loading tasks...</p>;

  return (
    <div className="settings-page operational-page tasks-page">
      <header className="page-command-header">
        <div>
          <p className="eyebrow">Reusable work</p>
          <h1>Tasks</h1>
          <p className="lede">Manage saved chores and commitments, then review task candidates before they become reusable.</p>
        </div>
      </header>

      <div className="settings-layout">
        <aside className="settings-sidebar" role="tablist" aria-label="Task sections">
          <button
            aria-label="Task library"
            aria-selected={activeSection === "library"}
            className="settings-sidebar-tab"
            onClick={() => setActiveSection("library")}
            role="tab"
            type="button"
          >
            <strong>Task library</strong>
            <span>Saved work</span>
          </button>
          <button
            aria-label="Task inbox"
            aria-selected={activeSection === "inbox"}
            className="settings-sidebar-tab"
            onClick={() => setActiveSection("inbox")}
            role="tab"
            type="button"
          >
            <strong>Task inbox</strong>
            <span>Needs review</span>
          </button>
        </aside>

        <div className="settings-content">
          {activeSection === "library" ? renderTaskLibrary() : renderTaskInbox()}
        </div>
      </div>

      {editingTask ? (
        <TaskLibraryModal
          task={editingTask}
          onClose={() => setEditingTask(undefined)}
          onSave={saveLibraryTask}
        />
      ) : null}
      {archiveCandidate ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setArchiveCandidate(undefined)}>
          <section
            aria-label="Archive task"
            aria-modal="true"
            className="modal-card chore-library-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Archive task</p>
                <h3>Archive {archiveCandidate.title}?</h3>
              </div>
              <button aria-label="Close dialog" className="modal-close-button" type="button" onClick={() => setArchiveCandidate(undefined)}>X</button>
            </div>
            <p>Future scheduled work for this task will stop, but historical activity stays available.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setArchiveCandidate(undefined)}>Cancel</button>
              <button className="section-action" type="button" onClick={() => archiveLibraryTask(archiveCandidate)}>Archive task</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
