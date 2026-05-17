import type { Household, HouseholdBaseline, Recommendation } from "@chore-helper/shared";

export type InMemoryStore = {
  createHousehold(name: string): Household;
  updateBaseline(householdId: string, baseline: HouseholdBaseline): Household | undefined;
  getHousehold(householdId: string): Household | undefined;
  saveRecommendations(householdId: string, recommendations: Recommendation[]): Recommendation[];
};

export function createInMemoryStore(): InMemoryStore {
  const households = new Map<string, Household>();
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

    saveRecommendations(householdId, nextRecommendations) {
      recommendations.set(householdId, nextRecommendations);
      return nextRecommendations;
    }
  };
}
