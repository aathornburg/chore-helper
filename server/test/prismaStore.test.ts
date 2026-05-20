import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { createPrismaStore } from "../src/repositories/prismaStore.js";

const connectionString = process.env.DATABASE_URL;
const prisma = connectionString
  ? new PrismaClient({ adapter: new PrismaPg(connectionString) })
  : undefined;

async function clearDatabase() {
  await prisma!.recommendation.deleteMany();
  await prisma!.chore.deleteMany();
  await prisma!.householdBaseline.deleteMany();
  await prisma!.household.deleteMany();
}

describe.skipIf(!prisma)("Prisma household store", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await clearDatabase();
    await prisma!.$disconnect();
  });

  it("persists household baseline and chores across store instances", async () => {
    const firstStore = createPrismaStore(prisma!);
    const household = await firstStore.createHousehold("Home");

    await firstStore.updateBaseline(household.id, {
      homeType: "house",
      rooms: ["kitchen", "bathrooms"],
      flooring: ["hardwood", "tile"],
      hasPets: true,
      hasOutdoorSpace: true,
      notes: "Persistent setup"
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
      name: "Home",
      baseline: {
        homeType: "house",
        rooms: ["kitchen", "bathrooms"],
        flooring: ["hardwood", "tile"],
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
        status: "pending"
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
});
