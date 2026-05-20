import type { Chore, Household, HouseholdBaseline, Recommendation } from "@chore-helper/shared";

/*
  This API layer is analogous to an Angular service that wraps HttpClient.
  It centralizes all backend calls so React components can stay focused on
  presentation and state management.

  `import.meta.env` is a Vite-specific way to inject environment variables
  at build time; in a Webpack app this would typically be handled by
  `DefinePlugin` or a similar replacement strategy.
*/
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export async function createHousehold(name: string): Promise<Household> {
  const response = await fetch(`${API_BASE_URL}/api/households`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  if (!response.ok) throw new Error("Failed to create household");
  return response.json();
}

export async function saveBaseline(
  householdId: string,
  baseline: HouseholdBaseline
): Promise<Household> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/baseline`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(baseline)
  });

  if (!response.ok) throw new Error("Failed to save baseline");
  return response.json();
}

export async function getHousehold(householdId: string): Promise<Household> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}`);

  if (!response.ok) throw new Error("Failed to fetch household");
  return response.json();
}

export async function createChore(
  householdId: string,
  chore: Omit<Chore, "id" | "householdId" | "archivedAt">
): Promise<Chore> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/chores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(chore)
  });

  if (!response.ok) throw new Error("Failed to create chore");
  return response.json();
}

export async function listChores(householdId: string): Promise<Chore[]> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/chores`);

  if (!response.ok) throw new Error("Failed to fetch chores");
  return response.json();
}

export async function updateChore(
  householdId: string,
  choreId: string,
  chore: Omit<Chore, "id" | "householdId" | "archivedAt">
): Promise<Chore> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/chores/${choreId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(chore)
  });

  if (!response.ok) throw new Error("Failed to update chore");
  return response.json();
}

export async function archiveChore(householdId: string, choreId: string): Promise<Chore> {
  const response = await fetch(
    `${API_BASE_URL}/api/households/${householdId}/chores/${choreId}/archive`,
    { method: "POST" }
  );

  if (!response.ok) throw new Error("Failed to archive chore");
  return response.json();
}

export async function restoreChore(householdId: string, choreId: string): Promise<Chore> {
  const response = await fetch(
    `${API_BASE_URL}/api/households/${householdId}/chores/${choreId}/restore`,
    { method: "POST" }
  );

  if (!response.ok) throw new Error("Failed to restore chore");
  return response.json();
}

export async function listArchivedChores(householdId: string): Promise<Chore[]> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/chores?status=archived`);

  if (!response.ok) throw new Error("Failed to fetch archived chores");
  return response.json();
}

export async function generateRecommendations(
  householdId: string,
  reviewPrompt?: string
): Promise<Recommendation[]> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/recommendations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewPrompt })
  });

  if (!response.ok) throw new Error("Failed to generate recommendations");
  return response.json();
}

export async function listRecommendations(householdId: string): Promise<Recommendation[]> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/recommendations`);

  if (!response.ok) throw new Error("Failed to fetch recommendations");
  return response.json();
}
