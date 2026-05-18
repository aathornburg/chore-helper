import type { Chore, Household, HouseholdBaseline, Recommendation } from "@chore-helper/shared";

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

export async function createChore(
  householdId: string,
  chore: Omit<Chore, "id" | "householdId">
): Promise<Chore> {
  const response = await fetch(`${API_BASE_URL}/api/households/${householdId}/chores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(chore)
  });

  if (!response.ok) throw new Error("Failed to create chore");
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
