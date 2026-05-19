import type { Chore, Household, HouseholdBaseline, Recommendation } from "@chore-helper/shared";

export type StoreResult<T> = T | Promise<T>;

export type HouseholdStore = {
  createHousehold(name: string): StoreResult<Household>;
  updateBaseline(householdId: string, baseline: HouseholdBaseline): StoreResult<Household | undefined>;
  getHousehold(householdId: string): StoreResult<Household | undefined>;
  createChore(chore: Omit<Chore, "id">): StoreResult<Chore>;
  listChores(householdId: string): StoreResult<Chore[]>;
  saveRecommendations(
    householdId: string,
    recommendations: Recommendation[]
  ): StoreResult<Recommendation[]>;
  listRecommendations(householdId: string): StoreResult<Recommendation[]>;
};

export function createInMemoryStore(): HouseholdStore {
  const households = new Map<string, Household>();
  const chores = new Map<string, Chore[]>();
  const recommendations = new Map<string, Recommendation[]>();

  return {
    createHousehold(name) {
      const household = { id: crypto.randomUUID(), name };
      households.set(household.id, household);
      return household;
    },

    updateBaseline(householdId, baseline) {
      const household = households.get(householdId);
      if (!household) return undefined;

      const updated = { ...household, baseline };
      households.set(householdId, updated);
      return updated;
    },

    getHousehold(householdId) {
      return households.get(householdId);
    },

    createChore(chore) {
      const created = { ...chore, id: crypto.randomUUID() };
      const existingChores = chores.get(chore.householdId) ?? [];
      chores.set(chore.householdId, [...existingChores, created]);
      return created;
    },

    listChores(householdId) {
      return chores.get(householdId) ?? [];
    },

    saveRecommendations(householdId, nextRecommendations) {
      recommendations.set(householdId, nextRecommendations);
      return nextRecommendations;
    },

    listRecommendations(householdId) {
      return recommendations.get(householdId) ?? [];
    }
  };
}
