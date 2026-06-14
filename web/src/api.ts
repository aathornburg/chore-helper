import type {
  AppUserProfile,
  AppNotificationList,
  CalendarConnectionSummary,
  CalendarImportPolicy,
  CalendarImportQueueDecisionInput,
  CalendarImportQueueItem,
  CalendarPreferences,
  CalendarImportCandidate,
  CleanlyCalendarEvent,
  Task,
  TaskLibraryPermission,
  CreateTaskInput,
  TaskDefinitionInput,
  TaskCompletionCheckIn,
  TaskOccurrence,
  TaskSchedule,
  CompletionCheckInInput,
  CreateScheduledTaskInput,
  Household,
  HouseholdAppData,
  HouseholdInvitation,
  HouseholdMemberSummary,
  HouseholdProfile,
  HouseholdStructure,
  Recommendation,
  ScheduleInput,
  ScheduledTask,
  ExternalCalendarSummary
} from "@chore-helper/shared";

/*
  This API layer is analogous to an Angular service that wraps HttpClient.
  It centralizes all backend calls so React components can stay focused on
  presentation and state management.

  `import.meta.env` is a Vite-specific way to inject environment variables
  at build time; in a Webpack app this would typically be handled by
  `DefinePlugin` or a similar replacement strategy.
*/
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

let getAuthToken: (() => Promise<string | null>) | undefined;

export function configureApiAuth(nextGetAuthToken: () => Promise<string | null>) {
  getAuthToken = nextGetAuthToken;
}

export async function apiFetch(input: string, init: RequestInit = {}) {
  const token = getAuthToken ? await getAuthToken() : null;
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(input, {
    ...init,
    headers
  });
}

export async function getCurrentUser(): Promise<AppUserProfile> {
  const response = await apiFetch(`${API_BASE_URL}/api/me`);

  if (!response.ok) throw new Error("Failed to fetch current user");
  return response.json();
}

export async function listMyNotifications(): Promise<AppNotificationList> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/notifications`);

  if (!response.ok) throw new Error("Failed to fetch notifications");
  return response.json();
}

export async function markMyNotificationsRead(notificationIds: string[]): Promise<AppNotificationList> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/notifications/read`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notificationIds })
  });

  if (!response.ok) throw new Error("Failed to mark notifications read");
  return response.json();
}

export async function createHousehold(name: string): Promise<Household> {
  const response = await apiFetch(`${API_BASE_URL}/api/households`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  if (!response.ok) throw new Error("Failed to create household");
  return response.json();
}

export async function listHouseholds(): Promise<HouseholdAppData[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/households`);

  if (!response.ok) throw new Error("Failed to fetch households");
  return response.json();
}

export async function saveHouseholdProfile(
  householdId: string,
  update: { name: string } & HouseholdProfile
): Promise<Household> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update)
  });

  if (!response.ok) throw new Error("Failed to save household profile");
  return response.json();
}

export async function getHousehold(householdId: string): Promise<Household> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}`);

  if (!response.ok) throw new Error("Failed to fetch household");
  return response.json();
}

export async function deleteHousehold(householdId: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}`, {
    method: "DELETE"
  });

  if (!response.ok) throw new Error("Failed to delete household");
}

export async function getHouseholdStructure(householdId: string): Promise<HouseholdStructure> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/structure`);

  if (!response.ok) throw new Error("Failed to fetch household structure");
  return response.json();
}

export async function listHouseholdMembers(householdId: string): Promise<HouseholdMemberSummary[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/members`);

  if (!response.ok) throw new Error("Failed to fetch household members");
  return response.json();
}

export async function listHouseholdInvitations(householdId: string): Promise<HouseholdInvitation[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/invitations`);

  if (!response.ok) throw new Error("Failed to fetch household invitations");
  return response.json();
}

export async function inviteHouseholdMember(
  householdId: string,
  email: string
): Promise<HouseholdInvitation> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });

  if (!response.ok) throw new Error("Failed to send household invitation");
  return response.json();
}

export async function cancelHouseholdInvitation(
  householdId: string,
  invitationId: string
): Promise<HouseholdInvitation> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/invitations/${invitationId}/cancel`,
    { method: "POST" }
  );

  if (!response.ok) throw new Error("Failed to cancel household invitation");
  return response.json();
}

export async function updateHouseholdMemberRole(
  householdId: string,
  userId: string,
  role: HouseholdMemberSummary["role"]
): Promise<{ householdId: string; userId: string; role: HouseholdMemberSummary["role"] }> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/members/${userId}/role`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role })
  });

  if (!response.ok) throw new Error("Failed to update household member role");
  return response.json();
}

export async function removeHouseholdMember(
  householdId: string,
  userId: string
): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/members/${userId}`, {
    method: "DELETE"
  });

  if (!response.ok) throw new Error("Failed to remove household member");
}

export async function saveHouseholdStructure(
  householdId: string,
  structure: HouseholdStructure
): Promise<HouseholdStructure> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/structure`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ floors: structure.floors })
  });

  if (!response.ok) throw new Error("Failed to save household structure");
  return response.json();
}

export async function createScheduledTask(
  householdId: string,
  input: CreateScheduledTaskInput
): Promise<ScheduledTask> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) throw new Error("Failed to create scheduled task");
  return response.json();
}

export async function createTask(householdId: string, task: CreateTaskInput): Promise<Task> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task })
  });

  if (!response.ok) throw new Error("Failed to create task");
  return response.json();
}

export async function listAllTasks(options: { includeArchived?: boolean; status?: "archived" } = {}): Promise<Task[]> {
  const params = new URLSearchParams();
  if (options.includeArchived) params.set("includeArchived", "true");
  if (options.status) params.set("status", options.status);
  const queryString = params.toString();
  const response = await apiFetch(`${API_BASE_URL}/api/tasks${queryString ? `?${queryString}` : ""}`);

  if (!response.ok) throw new Error("Failed to fetch tasks");
  return response.json();
}

export async function listTasks(householdId: string): Promise<Task[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/tasks`);

  if (!response.ok) throw new Error("Failed to fetch tasks");
  return response.json();
}

export async function updateTask(
  householdId: string,
  taskId: string,
  task: TaskDefinitionInput
): Promise<Task> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/tasks/${taskId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task)
  });

  if (!response.ok) throw new Error("Failed to update task");
  return response.json();
}

export async function archiveTask(householdId: string, taskId: string): Promise<Task> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/tasks/${taskId}/archive`,
    { method: "POST" }
  );

  if (!response.ok) throw new Error("Failed to archive task");
  return response.json();
}

export async function restoreTask(householdId: string, taskId: string): Promise<Task> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/tasks/${taskId}/restore`,
    { method: "POST" }
  );

  if (!response.ok) throw new Error("Failed to restore task");
  return response.json();
}

export async function listArchivedTasks(householdId: string): Promise<Task[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/tasks?status=archived`);

  if (!response.ok) throw new Error("Failed to fetch archived tasks");
  return response.json();
}

export async function updateTaskLibraryPermission(
  householdId: string,
  memberId: string,
  taskLibraryPermission: TaskLibraryPermission
): Promise<HouseholdMemberSummary> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/members/${memberId}/task-library-permission`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskLibraryPermission })
    }
  );

  if (!response.ok) throw new Error("Failed to update task library permission");
  return response.json();
}

export async function listSchedules(householdId: string, taskId: string): Promise<TaskSchedule[]> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/tasks/${taskId}/schedules`
  );

  if (!response.ok) throw new Error("Failed to fetch schedules");
  return response.json();
}

export async function createSchedule(
  householdId: string,
  taskId: string,
  schedule: ScheduleInput
): Promise<TaskSchedule> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/tasks/${taskId}/schedules`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedule)
    }
  );

  if (!response.ok) throw new Error("Failed to create schedule");
  return response.json();
}

export async function updateSchedule(
  householdId: string,
  scheduleId: string,
  schedule: ScheduleInput
): Promise<TaskSchedule> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/schedules/${scheduleId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedule)
    }
  );

  if (!response.ok) throw new Error("Failed to update schedule");
  return response.json();
}

export async function listOccurrences(
  householdId: string,
  range: { startAt: string; endAt: string; startOn: string; endOn: string; assignedUserId?: string }
): Promise<TaskOccurrence[]> {
  const params = new URLSearchParams({
    startAt: range.startAt,
    endAt: range.endAt,
    startOn: range.startOn,
    endOn: range.endOn
  });
  if (range.assignedUserId) params.set("assignedUserId", range.assignedUserId);
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/occurrences?${params.toString()}`
  );

  if (!response.ok) throw new Error("Failed to fetch occurrences");
  return response.json();
}

export async function completeOccurrence(
  householdId: string,
  occurrenceId: string,
  checkIn?: CompletionCheckInInput
): Promise<TaskOccurrence> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/occurrences/${occurrenceId}/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkIn ?? {})
    }
  );

  if (!response.ok) throw new Error("Failed to complete occurrence");
  return response.json();
}

export async function updateCompletionCheckIn(
  householdId: string,
  occurrenceId: string,
  checkIn: CompletionCheckInInput
): Promise<TaskCompletionCheckIn> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/occurrences/${occurrenceId}/check-in`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkIn)
    }
  );

  if (!response.ok) throw new Error("Failed to update completion check-in");
  return response.json();
}

export async function updateOccurrence(
  householdId: string,
  occurrenceId: string,
  update: { plannedStartAt: string; plannedEndAt: string; assignedUserId: string }
): Promise<TaskOccurrence> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/occurrences/${occurrenceId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update)
    }
  );

  if (!response.ok) throw new Error("Failed to update occurrence");
  return response.json();
}

export async function skipOccurrence(householdId: string, occurrenceId: string): Promise<TaskOccurrence> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/occurrences/${occurrenceId}/skip`,
    { method: "POST" }
  );

  if (!response.ok) throw new Error("Failed to skip occurrence");
  return response.json();
}

export async function generateRecommendations(
  householdId: string,
  reviewPrompt?: string,
  selectedTaskIds?: string[]
): Promise<Recommendation[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/recommendations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewPrompt, selectedTaskIds })
  });

  if (!response.ok) throw new Error("Failed to generate recommendations");
  return response.json();
}

export async function listAllRecommendations(): Promise<Recommendation[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/recommendations`);

  if (!response.ok) throw new Error("Failed to fetch recommendations");
  return response.json();
}

export async function listRecommendations(householdId: string): Promise<Recommendation[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/recommendations`);

  if (!response.ok) throw new Error("Failed to fetch recommendations");
  return response.json();
}

export async function updateRecommendationDecision(
  householdId: string,
  recommendationId: string,
  decision: Recommendation["decision"]
): Promise<Recommendation> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/recommendations/${recommendationId}/decision`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision })
    }
  );

  if (!response.ok) throw new Error("Failed to update recommendation decision");
  return response.json();
}

export async function applyRecommendationDecisions(
  householdId: string
): Promise<{ applied: Recommendation[]; declined: Recommendation[] }> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/recommendations/apply`, {
    method: "POST"
  });

  if (!response.ok) throw new Error("Failed to apply recommendation decisions");
  return response.json();
}

export type AssistantChatResponse = {
  answer: string;
  relatedRecommendationIds?: string[];
};

export async function askAssistantQuestion(
  householdId: string,
  message: string
): Promise<AssistantChatResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });

  if (!response.ok) throw new Error("Failed to ask assistant question");
  return response.json();
}

export async function listCalendarImportPolicies(householdId: string): Promise<CalendarImportPolicy[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/calendar/import-policies`);

  if (!response.ok) throw new Error("Failed to fetch calendar import policies");
  return response.json();
}

export async function getMyCalendarImportPolicy(householdId: string): Promise<CalendarImportPolicy> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/calendar/import-policy?householdId=${encodeURIComponent(householdId)}`);

  if (!response.ok) throw new Error("Failed to fetch calendar import policy");
  return response.json();
}

export async function updateCalendarImportPolicy(
  householdId: string,
  memberId: string,
  update: Pick<CalendarImportPolicy, "importQueueMode" | "importContentMode">
): Promise<CalendarImportPolicy> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/calendar/import-policies/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update)
  });

  if (!response.ok) throw new Error("Failed to update calendar import policy");
  return response.json();
}

export async function listCalendarImportQueue(householdId: string): Promise<CalendarImportQueueItem[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/calendar/import-queue`);

  if (!response.ok) throw new Error("Failed to fetch calendar import queue");
  return response.json();
}

export async function decideCalendarImportQueueItem(
  householdId: string,
  queueItemId: string,
  input: CalendarImportQueueDecisionInput
): Promise<CalendarImportQueueItem> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/calendar/import-queue/${queueItemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) throw new Error("Failed to update calendar import queue item");
  return response.json();
}

export async function listCalendarConnections(): Promise<CalendarConnectionSummary[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/calendar/connections`);

  if (!response.ok) throw new Error("Failed to fetch calendar connections");
  return response.json();
}

export async function disconnectCalendarConnection(connectionId: string): Promise<{ connectionId: string; status: string; message: string }> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/calendar/connections/${connectionId}`, { method: "DELETE" });

  if (!response.ok) throw new Error("Failed to disconnect calendar connection");
  return response.json();
}

export async function listExternalCalendars(): Promise<ExternalCalendarSummary[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/calendar/external-calendars`);

  if (!response.ok) throw new Error("Failed to fetch external calendars");
  return response.json();
}

export async function startGoogleCalendarConnection(): Promise<{ provider: "google"; status: string; message: string; authUrl?: string }> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/calendar/google/connect`, { method: "POST" });

  if (!response.ok) throw new Error("Failed to start Google Calendar connection");
  return response.json();
}

export async function listCalendarImportCandidates(householdId: string): Promise<CalendarImportCandidate[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/calendar/import-candidates?householdId=${encodeURIComponent(householdId)}`);

  if (!response.ok) throw new Error("Failed to fetch calendar import candidates");
  return response.json();
}

export async function submitCalendarImportEvents(
  householdId: string,
  events: CalendarImportCandidate[]
): Promise<{ status: string; items: CalendarImportQueueItem[] }> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/calendar/import-queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ householdId, events })
  });

  if (!response.ok) throw new Error("Failed to submit calendar events");
  return response.json();
}

export async function listCleanlyCalendarEvents(
  householdId: string,
  range: { startAt: string; endAt: string }
): Promise<CleanlyCalendarEvent[]> {
  const params = new URLSearchParams(range);
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/calendar/events?${params.toString()}`);

  if (!response.ok) throw new Error("Failed to fetch Clenella calendar events");
  return response.json();
}

export async function exportCleanlyCalendarEvents(
  householdId: string,
  cleanlyCalendarEventIds: string[]
): Promise<{ status: string; exported: number }> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/calendar/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ householdId, cleanlyCalendarEventIds })
  });

  if (!response.ok) throw new Error("Failed to export calendar events");
  return response.json();
}

export async function getCalendarPreferences(householdId: string): Promise<CalendarPreferences> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/calendar/preferences?householdId=${encodeURIComponent(householdId)}`);

  if (!response.ok) throw new Error("Failed to fetch calendar preferences");
  return response.json();
}

export async function updateCalendarPreferences(input: CalendarPreferences): Promise<CalendarPreferences> {
  const response = await apiFetch(`${API_BASE_URL}/api/me/calendar/preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) throw new Error("Failed to update calendar preferences");
  return response.json();
}
