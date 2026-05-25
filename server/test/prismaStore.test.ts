import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { createPrismaStore } from "../src/repositories/prismaStore.js";
import { assertSafeDatabaseForCleanup } from "./databaseSafety.js";

const connectionString = process.env.DATABASE_URL;
const safeConnectionString = (() => {
  if (!connectionString) return undefined;

  try {
    assertSafeDatabaseForCleanup(
      connectionString,
      process.env.ALLOW_DESTRUCTIVE_DB_TESTS === "true"
    );
    return connectionString;
  } catch {
    return undefined;
  }
})();
const prisma = safeConnectionString
  ? new PrismaClient({ adapter: new PrismaPg(safeConnectionString) })
  : undefined;

it("scopes household structure ids by their parent records in the Prisma schema", () => {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

  expect(schema).toContain("model HouseholdFloor {\n  dbId");
  expect(schema).toContain("@unique([householdId, id])");
  expect(schema).toContain("model HouseholdRoom {\n  dbId");
  expect(schema).toContain("@unique([floorDbId, id])");
});

async function clearDatabase() {
  await prisma!.householdRoom.deleteMany();
  await prisma!.householdFloor.deleteMany();
  await prisma!.recommendation.deleteMany();
  await prisma!.chore.deleteMany();
  await prisma!.householdProfile.deleteMany();
  await prisma!.household.deleteMany();
}

describe.skipIf(!safeConnectionString || !prisma)(
  "Prisma household store",
  () => {
    beforeEach(async () => {
      await clearDatabase();
    });

    afterAll(async () => {
      await clearDatabase();
      await prisma!.$disconnect();
    });

    it("persists household profile and chores across store instances", async () => {
      const firstStore = createPrismaStore(prisma!);
      const household = await firstStore.createHousehold("Home");

      await firstStore.updateProfile(household.id, {
        name: "Home base",
        profile: {
          homeType: "house",
          hasPets: true,
          hasOutdoorSpace: true,
          notes: "Persistent setup"
        }
      });
      await firstStore.createChore({
        householdId: household.id,
        title: "Clean bathrooms",
        cadence: "weekly",
        estimatedMinutes: 5,
        source: "manual"
      });

      const secondStore = createPrismaStore(prisma!);

      expect(await secondStore.getHousehold(household.id)).toEqual({
        id: household.id,
        name: "Home base",
        profile: {
          homeType: "house",
          hasPets: true,
          hasOutdoorSpace: true,
          notes: "Persistent setup"
        }
      });
      expect(await secondStore.listChores(household.id)).toEqual([
        expect.objectContaining({
          householdId: household.id,
          title: "Clean bathrooms",
          cadence: "weekly",
          estimatedMinutes: 5,
          source: "manual"
        })
      ]);
    });

    it("persists household floor and room structure across store instances", async () => {
      const firstStore = createPrismaStore(prisma!);
      const household = await firstStore.createHousehold("Home");

      await firstStore.saveHouseholdStructure(household.id, [
        {
          id: "floor-main",
          householdId: "ignored-household",
          name: "Main floor",
          levelType: "main",
          flooring: ["hardwood", "rugs"],
          petImpact: "medium",
          robotVacuumCoverage: "most",
          robotMopCoverage: "partial",
          notes: "Rugs in the living room.",
          rooms: [
            {
              id: "room-living",
              floorId: "ignored-floor",
              name: "Living room",
              flooring: ["hardwood", "rugs"],
              petImpact: "high",
              robotVacuumCoverage: "all",
              robotMopCoverage: "inherit",
              notes: "Dog spends most evenings here."
            }
          ]
        }
      ]);

      const secondStore = createPrismaStore(prisma!);

      expect(await secondStore.getHouseholdStructure(household.id)).toEqual({
        householdId: household.id,
        floors: [
          {
            id: "floor-main",
            householdId: household.id,
            name: "Main floor",
            levelType: "main",
            flooring: ["hardwood", "rugs"],
            petImpact: "medium",
            robotVacuumCoverage: "most",
            robotMopCoverage: "partial",
            notes: "Rugs in the living room.",
            rooms: [
              {
                id: "room-living",
                floorId: "floor-main",
                name: "Living room",
                flooring: ["hardwood", "rugs"],
                petImpact: "high",
                robotVacuumCoverage: "all",
                robotMopCoverage: "inherit",
                notes: "Dog spends most evenings here."
              }
            ]
          }
        ]
      });
    });

    it("persists recommendations for later review", async () => {
      const store = createPrismaStore(prisma!);
      const household = await store.createHousehold("Home");

      await store.saveRecommendations(household.id, [
        {
          id: "recommendation-1",
          householdId: household.id,
          title: "Review duration for Clean bathrooms",
          rationale: "The current estimate may be too short for the scope.",
          confidence: "high",
          status: "pending"
        }
      ]);

      expect(await store.listRecommendations(household.id)).toEqual([
        {
          id: "recommendation-1",
          householdId: household.id,
          title: "Review duration for Clean bathrooms",
          rationale: "The current estimate may be too short for the scope.",
          confidence: "high",
          status: "pending",
          decision: "pending"
        }
      ]);
    });

    it("archives, restores, updates chores, and marks recommendations stale", async () => {
      const store = createPrismaStore(prisma!);
      const household = await store.createHousehold("Home");
      const chore = await store.createChore({
        householdId: household.id,
        title: "Clean bathrooms",
        cadence: "weekly",
        estimatedMinutes: 20,
        source: "manual"
      });

      await store.saveRecommendations(household.id, [
        {
          id: "recommendation-1",
          householdId: household.id,
          title: "Review duration",
          rationale: "The current estimate may be off.",
          confidence: "medium",
          status: "pending"
        }
      ]);

      const updated = await store.updateChore(household.id, chore.id, {
        title: "Clean main bathroom",
        cadence: "biweekly",
        estimatedMinutes: 30,
        source: "manual"
      });

      expect(updated).toEqual(
        expect.objectContaining({
          id: chore.id,
          title: "Clean main bathroom",
          cadence: "biweekly",
          estimatedMinutes: 30
        })
      );
      expect(await store.listRecommendations(household.id)).toEqual([
        expect.objectContaining({ staleAt: expect.any(String) })
      ]);

      const archived = await store.archiveChore(household.id, chore.id);
      expect(archived?.archivedAt).toEqual(expect.any(String));
      expect(await store.listChores(household.id)).toEqual([]);
      expect(await store.listChores(household.id, { includeArchived: true })).toEqual([
        expect.objectContaining({ id: chore.id, archivedAt: expect.any(String) })
      ]);

      const restored = await store.restoreChore(household.id, chore.id);
      expect(restored?.archivedAt).toBeUndefined();
      expect(await store.listChores(household.id)).toEqual([
        expect.objectContaining({ id: chore.id, archivedAt: undefined })
      ]);
    });
  }
);
