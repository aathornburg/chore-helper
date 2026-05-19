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
});
