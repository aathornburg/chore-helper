import type {
  AppUserProfile,
  Chore,
  ChoreDefinitionInput,
  ChoreOccurrence,
  ChoreSchedule,
  CreateScheduledChoreInput,
  Household,
  HouseholdAppData,
  HouseholdInvitation,
  HouseholdMemberSummary,
  HouseholdProfile,
  HouseholdStructure,
  Recommendation,
  ScheduleInput,
  ScheduledChore
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

type LegacyCreateChoreInput = ChoreDefinitionInput & {
  cadence?: string;
  estimatedMinutes?: number;
};

type LegacyCreateScheduleInput = Partial<ScheduleInput> & {
  recurrence: ChoreSchedule["recurrence"];
  localStartTime?: string;
  plannedMinutes?: number;
  startsOn: string;
  assignment: ChoreSchedule["assignment"];
};

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

export async function createChore(
  householdId: string,
  chore: LegacyCreateChoreInput
): Promise<Chore> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/chores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(chore)
  });

  if (!response.ok) throw new Error("Failed to create chore");
  return response.json();
}

export async function createScheduledChore(
  householdId: string,
  input: CreateScheduledChoreInput
): Promise<ScheduledChore> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/chores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) throw new Error("Failed to create scheduled chore");
  return response.json();
}

export async function listAllChores(options: { includeArchived?: boolean; status?: "archived" } = {}): Promise<Chore[]> {
  const params = new URLSearchParams();
  if (options.includeArchived) params.set("includeArchived", "true");
  if (options.status) params.set("status", options.status);
  const queryString = params.toString();
  const response = await apiFetch(`${API_BASE_URL}/api/chores${queryString ? `?${queryString}` : ""}`);

  if (!response.ok) throw new Error("Failed to fetch chores");
  return response.json();
}

export async function listChores(householdId: string): Promise<Chore[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/chores`);

  if (!response.ok) throw new Error("Failed to fetch chores");
  return response.json();
}

export async function updateChore(
  householdId: string,
  choreId: string,
  chore: ChoreDefinitionInput
): Promise<Chore> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/chores/${choreId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(chore)
  });

  if (!response.ok) throw new Error("Failed to update chore");
  return response.json();
}

export async function archiveChore(householdId: string, choreId: string): Promise<Chore> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/chores/${choreId}/archive`,
    { method: "POST" }
  );

  if (!response.ok) throw new Error("Failed to archive chore");
  return response.json();
}

export async function restoreChore(householdId: string, choreId: string): Promise<Chore> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/chores/${choreId}/restore`,
    { method: "POST" }
  );

  if (!response.ok) throw new Error("Failed to restore chore");
  return response.json();
}

export async function listArchivedChores(householdId: string): Promise<Chore[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/chores?status=archived`);

  if (!response.ok) throw new Error("Failed to fetch archived chores");
  return response.json();
}

export async function listSchedules(householdId: string, choreId: string): Promise<ChoreSchedule[]> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/chores/${choreId}/schedules`
  );

  if (!response.ok) throw new Error("Failed to fetch schedules");
  return response.json();
}

export async function createSchedule(
  householdId: string,
  choreId: string,
  schedule: LegacyCreateScheduleInput
): Promise<ChoreSchedule> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/chores/${choreId}/schedules`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedule)
    }
  );

  if (!response.ok) throw new Error("Failed to create schedule");
  return response.json();
}

export async function listOccurrences(
  householdId: string,
  range: { startAt: string; endAt: string; startOn: string; endOn: string; assignedUserId?: string }
): Promise<ChoreOccurrence[]> {
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
  occurrenceId: string
): Promise<ChoreOccurrence> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/households/${householdId}/occurrences/${occurrenceId}/complete`,
    { method: "POST" }
  );

  if (!response.ok) throw new Error("Failed to complete occurrence");
  return response.json();
}

export async function updateOccurrence(
  householdId: string,
  occurrenceId: string,
  update: { plannedStartAt: string; plannedEndAt: string; assignedUserId: string }
): Promise<ChoreOccurrence> {
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

export async function skipOccurrence(householdId: string, occurrenceId: string): Promise<ChoreOccurrence> {
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
  selectedChoreIds?: string[]
): Promise<Recommendation[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/households/${householdId}/recommendations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewPrompt, selectedChoreIds })
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
