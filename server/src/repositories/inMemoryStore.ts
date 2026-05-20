import type { Chore, Household, HouseholdBaseline, Recommendation } from "@chore-helper/shared";

export type StoreResult<T> = T | Promise<T>;

export type ChoreListOptions = {
  includeArchived?: boolean;
  archivedOnly?: boolean;
};

export type ChoreUpdate = Omit<Chore, "id" | "householdId" | "archivedAt">;

export type HouseholdStore = {
  createHousehold(name: string): StoreResult<Household>;
  updateBaseline(householdId: string, baseline: HouseholdBaseline): StoreResult<Household | undefined>;
  getHousehold(householdId: string): StoreResult<Household | undefined>;
  createChore(chore: Omit<Chore, "id" | "archivedAt">): StoreResult<Chore>;
  updateChore(householdId: string, choreId: string, chore: ChoreUpdate): StoreResult<Chore | undefined>;
  archiveChore(householdId: string, choreId: string): StoreResult<Chore | undefined>;
  restoreChore(householdId: string, choreId: string): StoreResult<Chore | undefined>;
  listChores(householdId: string, options?: ChoreListOptions): StoreResult<Chore[]>;
  saveRecommendations(
    householdId: string,
    recommendations: Recommendation[]
  ): StoreResult<Recommendation[]>;
  markRecommendationsStale(householdId: string): StoreResult<void>;
  listRecommendations(householdId: string): StoreResult<Recommendation[]>;
};

export function createInMemoryStore(): HouseholdStore {
  const households = new Map<string, Household>();
  const chores = new Map<string, Chore[]>();
  const recommendations = new Map<string, Recommendation[]>();

  function markStale(householdId: string) {
    const now = new Date().toISOString();
    recommendations.set(
      householdId,
      (recommendations.get(householdId) ?? []).map((recommendation) => ({
        ...recommendation,
        staleAt: recommendation.staleAt ?? now
      }))
    );
  }

  function replaceChore(householdId: string, choreId: string, update: (chore: Chore) => Chore) {
    const householdChores = chores.get(householdId) ?? [];
    const existing = householdChores.find((chore) => chore.id === choreId);
    if (!existing) return undefined;

    const updated = update(existing);
    chores.set(
      householdId,
      householdChores.map((chore) => (chore.id === choreId ? updated : chore))
    );
    markStale(householdId);
    return updated;
  }

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
      markStale(chore.householdId);
      return created;
    },

    updateChore(householdId, choreId, chore) {
      return replaceChore(householdId, choreId, (existing) => ({
        ...existing,
        ...chore
      }));
    },

    archiveChore(householdId, choreId) {
      return replaceChore(householdId, choreId, (existing) => ({
        ...existing,
        archivedAt: new Date().toISOString()
      }));
    },

    restoreChore(householdId, choreId) {
      return replaceChore(householdId, choreId, (existing) => {
        const { archivedAt: _archivedAt, ...restored } = existing;
        return restored;
      });
    },

    listChores(householdId, options = {}) {
      const householdChores = chores.get(householdId) ?? [];
      if (options.archivedOnly) return householdChores.filter((chore) => chore.archivedAt);
      if (options.includeArchived) return householdChores;
      return householdChores.filter((chore) => !chore.archivedAt);
    },

    saveRecommendations(householdId, nextRecommendations) {
      recommendations.set(householdId, nextRecommendations);
      return nextRecommendations;
    },

    markRecommendationsStale(householdId) {
      markStale(householdId);
    },

    listRecommendations(householdId) {
      return recommendations.get(householdId) ?? [];
    }
  };
}
