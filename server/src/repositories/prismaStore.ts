import type { PrismaClient } from "@prisma/client";
import type {
  Chore,
  FlooringType,
  Household,
  HouseholdBaseline,
  Recommendation,
  RecommendationConfidence
} from "@chore-helper/shared";
import type { HouseholdStore } from "./inMemoryStore.js";

function serializeList(values: string[]) {
  return JSON.stringify(values);
}

function deserializeList(value: string) {
  return JSON.parse(value) as string[];
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

function toChore(chore: {
  id: string;
  householdId: string;
  title: string;
  cadence: string;
  estimatedMinutes: number;
  source: string;
  archivedAt?: Date | null;
}): Chore {
  return {
    id: chore.id,
    householdId: chore.householdId,
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
  title: string;
  rationale: string;
  confidence: string;
  status: string;
  staleAt?: Date | null;
}): Recommendation {
  return {
    id: recommendation.id,
    householdId: recommendation.householdId,
    title: recommendation.title,
    rationale: recommendation.rationale,
    confidence: recommendation.confidence as RecommendationConfidence,
    status: recommendation.status as Recommendation["status"],
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
            staleAt: recommendation.staleAt ? new Date(recommendation.staleAt) : null
          }))
        })
      ]);

      return recommendations;
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
    }
  };
}
