import type {
  Chore,
  Household,
  HouseholdBaseline,
  HouseholdFloor,
  HouseholdStructure,
  Recommendation,
  RecommendationDecision
} from "@chore-helper/shared";

export type StoreResult<T> = T | Promise<T>;

export type ChoreListOptions = {
  includeArchived?: boolean;
  archivedOnly?: boolean;
};

export type ChoreUpdate = Omit<Chore, "id" | "householdId" | "archivedAt">;

export type RecommendationDecisionUpdate = {
  decision: Exclude<RecommendationDecision, "applied">;
};

export type ApplyRecommendationResult = {
  applied: Recommendation[];
  declined: Recommendation[];
};

export type HouseholdStore = {
  createHousehold(name: string): StoreResult<Household>;
  listHouseholds(): StoreResult<Household[]>;
  updateBaseline(householdId: string, baseline: HouseholdBaseline): StoreResult<Household | undefined>;
  getHousehold(householdId: string): StoreResult<Household | undefined>;
  getHouseholdStructure(householdId: string): StoreResult<HouseholdStructure | undefined>;
  saveHouseholdStructure(
    householdId: string,
    floors: HouseholdFloor[]
  ): StoreResult<HouseholdStructure | undefined>;
  createChore(chore: Omit<Chore, "id" | "archivedAt">): StoreResult<Chore>;
  updateChore(householdId: string, choreId: string, chore: ChoreUpdate): StoreResult<Chore | undefined>;
  archiveChore(householdId: string, choreId: string): StoreResult<Chore | undefined>;
  restoreChore(householdId: string, choreId: string): StoreResult<Chore | undefined>;
  listChores(householdId: string, options?: ChoreListOptions): StoreResult<Chore[]>;
  listAllChores(options?: ChoreListOptions): StoreResult<Chore[]>;
  saveRecommendations(
    householdId: string,
    recommendations: Recommendation[]
  ): StoreResult<Recommendation[]>;
  markRecommendationsStale(householdId: string): StoreResult<void>;
  listRecommendations(householdId: string): StoreResult<Recommendation[]>;
  listAllRecommendations(): StoreResult<Recommendation[]>;
  updateRecommendationDecision(
    householdId: string,
    recommendationId: string,
    update: RecommendationDecisionUpdate
  ): StoreResult<Recommendation | undefined>;
  applyRecommendationDecisions(householdId: string): StoreResult<ApplyRecommendationResult>;
};

function normalizeRecommendation(recommendation: Recommendation): Recommendation {
  return {
    ...recommendation,
    decision: recommendation.decision ?? "pending"
  };
}

export function createInMemoryStore(): HouseholdStore {
  const households = new Map<string, Household>();
  const householdFloors = new Map<string, HouseholdFloor[]>();
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

    listHouseholds() {
      return Array.from(households.values());
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

    getHouseholdStructure(householdId) {
      if (!households.has(householdId)) return undefined;
      return {
        householdId,
        floors: householdFloors.get(householdId) ?? []
      };
    },

    saveHouseholdStructure(householdId, floors) {
      if (!households.has(householdId)) return undefined;

      const normalized = floors.map((floor) => ({
        ...floor,
        householdId,
        rooms: floor.rooms.map((room) => ({
          ...room,
          floorId: floor.id
        }))
      }));
      householdFloors.set(householdId, normalized);

      return {
        householdId,
        floors: normalized
      };
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

    listAllChores(options = {}) {
      const allChores = Array.from(chores.values())
        .flat()
        .map((chore) => ({
          ...chore,
          householdName: households.get(chore.householdId)?.name
        }));
      if (options.archivedOnly) return allChores.filter((chore) => chore.archivedAt);
      if (options.includeArchived) return allChores;
      return allChores.filter((chore) => !chore.archivedAt);
    },

    saveRecommendations(householdId, nextRecommendations) {
      const normalized = nextRecommendations.map(normalizeRecommendation);
      recommendations.set(householdId, normalized);
      return normalized;
    },

    markRecommendationsStale(householdId) {
      markStale(householdId);
    },

    listRecommendations(householdId) {
      return recommendations.get(householdId) ?? [];
    },

    listAllRecommendations() {
      return Array.from(recommendations.values()).flat();
    },

    updateRecommendationDecision(householdId, recommendationId, update) {
      const householdRecommendations = recommendations.get(householdId) ?? [];
      const existing = householdRecommendations.find((recommendation) => recommendation.id === recommendationId);
      if (!existing) return undefined;

      const updated = { ...existing, decision: update.decision };
      recommendations.set(
        householdId,
        householdRecommendations.map((recommendation) =>
          recommendation.id === recommendationId ? updated : recommendation
        )
      );
      return updated;
    },

    applyRecommendationDecisions(householdId) {
      const householdRecommendations = recommendations.get(householdId) ?? [];
      let nextChores = chores.get(householdId) ?? [];
      const applied: Recommendation[] = [];
      const declined: Recommendation[] = [];

      const nextRecommendations = householdRecommendations.map((recommendation) => {
        if (recommendation.staleAt) return recommendation;
        if (recommendation.decision === "declined") {
          declined.push(recommendation);
          return recommendation;
        }
        if (recommendation.decision !== "accepted") return recommendation;

        const affectedChore = nextChores.find((chore) => chore.id === recommendation.affectedChoreId);
        if (!affectedChore) return recommendation;

        const updatedChore = {
          ...affectedChore,
          cadence: recommendation.proposedCadence ?? affectedChore.cadence,
          estimatedMinutes: recommendation.proposedEstimatedMinutes ?? affectedChore.estimatedMinutes
        };
        nextChores = nextChores.map((chore) => (chore.id === updatedChore.id ? updatedChore : chore));

        const appliedRecommendation = { ...recommendation, decision: "applied" as const };
        applied.push(appliedRecommendation);
        return appliedRecommendation;
      });

      chores.set(householdId, nextChores);
      recommendations.set(householdId, nextRecommendations);
      return { applied, declined };
    }
  };
}
