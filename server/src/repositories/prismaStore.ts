import type { PrismaClient } from "@prisma/client";
import type {
  Chore,
  FlooringType,
  Household,
  HouseholdBaseline,
  HouseholdFloor,
  HouseholdRoom,
  Recommendation,
  RecommendationConfidence,
  RecommendationDecision
} from "@chore-helper/shared";
import type { HouseholdStore } from "./inMemoryStore.js";

function serializeList(values: string[]) {
  return JSON.stringify(values);
}

function deserializeList(value: string) {
  return JSON.parse(value) as string[];
}

function serializeOptionalList(values: string[]) {
  return JSON.stringify(values);
}

function deserializeOptionalList<T extends string>(value: string) {
  return JSON.parse(value) as T[];
}

function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : undefined;
}

function toHousehold(
  household: {
    id: string;
    name: string;
    baseline?: {
      homeType: string;
      rooms: string;
      flooring: string;
      hasPets: boolean;
      hasOutdoorSpace: boolean;
      notes: string | null;
    } | null;
  }
): Household {
  const baseline = household.baseline
    ? {
        homeType: household.baseline.homeType as HouseholdBaseline["homeType"],
        rooms: deserializeList(household.baseline.rooms),
        flooring: deserializeList(household.baseline.flooring) as FlooringType[],
        hasPets: household.baseline.hasPets,
        hasOutdoorSpace: household.baseline.hasOutdoorSpace,
        notes: household.baseline.notes ?? undefined
      }
    : undefined;

  return {
    id: household.id,
    name: household.name,
    ...(baseline ? { baseline } : {})
  };
}

function toHouseholdRoom(room: {
  id: string;
  name: string;
  flooring: string;
  petImpact: string;
  robotVacuumCoverage: string;
  robotMopCoverage: string;
  notes?: string | null;
}, floorId: string): HouseholdRoom {
  return {
    id: room.id,
    floorId,
    name: room.name,
    flooring: deserializeOptionalList(room.flooring),
    petImpact: room.petImpact as HouseholdRoom["petImpact"],
    robotVacuumCoverage: room.robotVacuumCoverage as HouseholdRoom["robotVacuumCoverage"],
    robotMopCoverage: room.robotMopCoverage as HouseholdRoom["robotMopCoverage"],
    notes: room.notes ?? undefined
  };
}

function toHouseholdFloor(floor: {
  id: string;
  householdId: string;
  name: string;
  levelType: string;
  flooring: string;
  petImpact: string;
  robotVacuumCoverage: string;
  robotMopCoverage: string;
  notes?: string | null;
  rooms: Array<{
    id: string;
    name: string;
    flooring: string;
    petImpact: string;
    robotVacuumCoverage: string;
    robotMopCoverage: string;
    notes?: string | null;
  }>;
}): HouseholdFloor {
  return {
    id: floor.id,
    householdId: floor.householdId,
    name: floor.name,
    levelType: floor.levelType as HouseholdFloor["levelType"],
    flooring: deserializeOptionalList(floor.flooring),
    petImpact: floor.petImpact as HouseholdFloor["petImpact"],
    robotVacuumCoverage: floor.robotVacuumCoverage as HouseholdFloor["robotVacuumCoverage"],
    robotMopCoverage: floor.robotMopCoverage as HouseholdFloor["robotMopCoverage"],
    notes: floor.notes ?? undefined,
    rooms: floor.rooms.map((room) => toHouseholdRoom(room, floor.id))
  };
}

function toChore(chore: {
  id: string;
  householdId: string;
  household?: { name: string } | null;
  title: string;
  cadence: string;
  estimatedMinutes: number;
  source: string;
  archivedAt?: Date | null;
}): Chore {
  return {
    id: chore.id,
    householdId: chore.householdId,
    householdName: chore.household?.name,
    title: chore.title,
    cadence: chore.cadence,
    estimatedMinutes: chore.estimatedMinutes,
    source: chore.source as Chore["source"],
    archivedAt: serializeDate(chore.archivedAt)
  };
}

function toRecommendation(recommendation: {
  id: string;
  householdId: string;
  affectedChoreId?: string | null;
  title: string;
  rationale: string;
  confidence: string;
  status: string;
  decision?: string | null;
  proposedCadence?: string | null;
  proposedEstimatedMinutes?: number | null;
  staleAt?: Date | null;
}): Recommendation {
  return {
    id: recommendation.id,
    householdId: recommendation.householdId,
    affectedChoreId: recommendation.affectedChoreId ?? undefined,
    title: recommendation.title,
    rationale: recommendation.rationale,
    confidence: recommendation.confidence as RecommendationConfidence,
    status: recommendation.status as Recommendation["status"],
    decision: (recommendation.decision ?? "pending") as RecommendationDecision,
    proposedCadence: recommendation.proposedCadence ?? undefined,
    proposedEstimatedMinutes: recommendation.proposedEstimatedMinutes ?? undefined,
    staleAt: serializeDate(recommendation.staleAt)
  };
}

export function createPrismaStore(prisma: PrismaClient): HouseholdStore {
  return {
    async createHousehold(name) {
      const household = await prisma.household.create({
        data: {
          id: crypto.randomUUID(),
          name
        },
        include: { baseline: true }
      });

      return toHousehold(household);
    },

    async updateBaseline(householdId, baseline) {
      const household = await prisma.household.findUnique({
        where: { id: householdId }
      });
      if (!household) return undefined;

      const updated = await prisma.household.update({
        where: { id: householdId },
        data: {
          baseline: {
            upsert: {
              create: {
                homeType: baseline.homeType,
                rooms: serializeList(baseline.rooms),
                flooring: serializeList(baseline.flooring),
                hasPets: baseline.hasPets,
                hasOutdoorSpace: baseline.hasOutdoorSpace,
                notes: baseline.notes
              },
              update: {
                homeType: baseline.homeType,
                rooms: serializeList(baseline.rooms),
                flooring: serializeList(baseline.flooring),
                hasPets: baseline.hasPets,
                hasOutdoorSpace: baseline.hasOutdoorSpace,
                notes: baseline.notes
              }
            }
          }
        },
        include: { baseline: true }
      });

      return toHousehold(updated);
    },

    async getHousehold(householdId) {
      const household = await prisma.household.findUnique({
        where: { id: householdId },
        include: { baseline: true }
      });

      return household ? toHousehold(household) : undefined;
    },

    async getHouseholdStructure(householdId) {
      const household = await prisma.household.findUnique({
        where: { id: householdId }
      });
      if (!household) return undefined;

      const floors = await prisma.householdFloor.findMany({
        where: { householdId },
        include: { rooms: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" }
      });

      return {
        householdId,
        floors: floors.map(toHouseholdFloor)
      };
    },

    async saveHouseholdStructure(householdId, floors) {
      const household = await prisma.household.findUnique({
        where: { id: householdId }
      });
      if (!household) return undefined;

      await prisma.$transaction(async (tx) => {
        await tx.householdFloor.deleteMany({ where: { householdId } });

        for (const [floorIndex, floor] of floors.entries()) {
          await tx.householdFloor.create({
            data: {
              id: floor.id,
              householdId,
              name: floor.name,
              levelType: floor.levelType,
              flooring: serializeOptionalList(floor.flooring),
              petImpact: floor.petImpact,
              robotVacuumCoverage: floor.robotVacuumCoverage,
              robotMopCoverage: floor.robotMopCoverage,
              notes: floor.notes,
              sortOrder: floorIndex,
              rooms: {
                create: floor.rooms.map((room, roomIndex) => ({
                  id: room.id,
                  name: room.name,
                  flooring: serializeOptionalList(room.flooring),
                  petImpact: room.petImpact,
                  robotVacuumCoverage: room.robotVacuumCoverage,
                  robotMopCoverage: room.robotMopCoverage,
                  notes: room.notes,
                  sortOrder: roomIndex
                }))
              }
            }
          });
        }
      });

      return this.getHouseholdStructure(householdId);
    },

    async createChore(chore) {
      const created = await prisma.$transaction(async (tx) => {
        const nextChore = await tx.chore.create({
          data: {
            id: crypto.randomUUID(),
            householdId: chore.householdId,
            title: chore.title,
            cadence: chore.cadence,
            estimatedMinutes: chore.estimatedMinutes,
            source: chore.source
          }
        });
        await tx.recommendation.updateMany({
          where: { householdId: chore.householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextChore;
      });

      return toChore(created);
    },

    async updateChore(householdId, choreId, chore) {
      const existing = await prisma.chore.findFirst({
        where: { id: choreId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const nextChore = await tx.chore.update({
          where: { id: choreId },
          data: chore
        });
        await tx.recommendation.updateMany({
          where: { householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextChore;
      });

      return toChore(updated);
    },

    async archiveChore(householdId, choreId) {
      const existing = await prisma.chore.findFirst({
        where: { id: choreId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const nextChore = await tx.chore.update({
          where: { id: choreId },
          data: { archivedAt: new Date() }
        });
        await tx.recommendation.updateMany({
          where: { householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextChore;
      });

      return toChore(updated);
    },

    async restoreChore(householdId, choreId) {
      const existing = await prisma.chore.findFirst({
        where: { id: choreId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const nextChore = await tx.chore.update({
          where: { id: choreId },
          data: { archivedAt: null }
        });
        await tx.recommendation.updateMany({
          where: { householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextChore;
      });

      return toChore(updated);
    },

    async listChores(householdId, options = {}) {
      const chores = await prisma.chore.findMany({
        where: options.archivedOnly
          ? { householdId, archivedAt: { not: null } }
          : options.includeArchived
            ? { householdId }
            : { householdId, archivedAt: null },
        orderBy: { createdAt: "asc" }
      });

      return chores.map(toChore);
    },

    async listAllChores(options = {}) {
      const chores = await prisma.chore.findMany({
        where: options.archivedOnly
          ? { archivedAt: { not: null } }
          : options.includeArchived
            ? {}
            : { archivedAt: null },
        include: {
          household: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: "asc" }
      });

      return chores.map(toChore);
    },

    async saveRecommendations(householdId, recommendations) {
      await prisma.$transaction([
        prisma.recommendation.deleteMany({ where: { householdId } }),
        prisma.recommendation.createMany({
          data: recommendations.map((recommendation) => ({
            id: recommendation.id,
            householdId,
            title: recommendation.title,
            rationale: recommendation.rationale,
            confidence: recommendation.confidence,
            status: recommendation.status,
            affectedChoreId: recommendation.affectedChoreId,
            decision: recommendation.decision ?? "pending",
            proposedCadence: recommendation.proposedCadence,
            proposedEstimatedMinutes: recommendation.proposedEstimatedMinutes,
            staleAt: recommendation.staleAt ? new Date(recommendation.staleAt) : null
          }))
        })
      ]);

      return recommendations.map((recommendation) => ({
        ...recommendation,
        decision: recommendation.decision ?? "pending"
      }));
    },

    async markRecommendationsStale(householdId) {
      await prisma.recommendation.updateMany({
        where: { householdId, staleAt: null },
        data: { staleAt: new Date() }
      });
    },

    async listRecommendations(householdId) {
      const recommendations = await prisma.recommendation.findMany({
        where: { householdId },
        orderBy: { createdAt: "asc" }
      });

      return recommendations.map(toRecommendation);
    },

    async listAllRecommendations() {
      const recommendations = await prisma.recommendation.findMany({
        orderBy: { createdAt: "asc" }
      });

      return recommendations.map(toRecommendation);
    },

    async updateRecommendationDecision(householdId, recommendationId, update) {
      const existing = await prisma.recommendation.findFirst({
        where: { id: recommendationId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.recommendation.update({
        where: { id: recommendationId },
        data: { decision: update.decision }
      });

      return toRecommendation(updated);
    },

    async applyRecommendationDecisions(householdId) {
      return prisma.$transaction(async (tx) => {
        const accepted = await tx.recommendation.findMany({
          where: {
            householdId,
            staleAt: null,
            decision: "accepted"
          },
          orderBy: { createdAt: "asc" }
        });
        const declined = await tx.recommendation.findMany({
          where: {
            householdId,
            staleAt: null,
            decision: "declined"
          },
          orderBy: { createdAt: "asc" }
        });
        const applied: Recommendation[] = [];

        for (const recommendation of accepted) {
          if (!recommendation.affectedChoreId) continue;

          const chore = await tx.chore.findFirst({
            where: {
              id: recommendation.affectedChoreId,
              householdId
            }
          });
          if (!chore) continue;

          await tx.chore.update({
            where: { id: chore.id },
            data: {
              cadence: recommendation.proposedCadence ?? chore.cadence,
              estimatedMinutes: recommendation.proposedEstimatedMinutes ?? chore.estimatedMinutes
            }
          });

          const appliedRecommendation = await tx.recommendation.update({
            where: { id: recommendation.id },
            data: { decision: "applied" }
          });
          applied.push(toRecommendation(appliedRecommendation));
        }

        return {
          applied,
          declined: declined.map(toRecommendation)
        };
      });
    }
  };
}
