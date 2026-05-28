import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { createPrismaStore } from "../src/repositories/prismaStore.js";
import { materializeOccurrences } from "../src/scheduling/materializeOccurrences.js";
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
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8").replaceAll("\r\n", "\n");

  expect(schema).toContain("model HouseholdFloor {\n  dbId");
  expect(schema).toContain("@unique([householdId, id])");
  expect(schema).toContain("model HouseholdRoom {\n  dbId");
  expect(schema).toContain("@unique([floorDbId, id])");
  expect(schema).toContain("planningMode");
  expect(schema).toContain("flexibleWindowRule");
  expect(schema).toContain("eligibleStartOn");
  expect(schema).toContain("@@index([householdId, planningMode, plannedStartAt])");
  expect(schema).toContain("@@index([householdId, planningMode, eligibleEndOn, eligibleStartOn])");
  expect(schema).not.toContain("  cadence");
  expect(schema).not.toContain("  plannedMinutes");
});

async function clearDatabase() {
  await prisma!.householdInvitation.deleteMany();
  await prisma!.householdMember.deleteMany();
  await prisma!.householdRoom.deleteMany();
  await prisma!.householdFloor.deleteMany();
  await prisma!.recommendation.deleteMany();
  await prisma!.chore.deleteMany();
  await prisma!.householdProfile.deleteMany();
  await prisma!.household.deleteMany();
  await prisma!.user.deleteMany();
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

    it("persists definition-only chores with their schedules across store instances", async () => {
      const firstStore = createPrismaStore(prisma!);
      const owner = await firstStore.upsertUserByClerkId("owner");
      const household = await firstStore.createHouseholdForUser("Home", owner.id);

      await firstStore.updateProfile(household.id, {
        name: "Home base",
        profile: {
          homeType: "house",
          hasPets: true,
          hasOutdoorSpace: true,
          notes: "Persistent setup"
        }
      });
      const created = await firstStore.createChoreWithSchedules({
        householdId: household.id,
        chore: {
          title: "Clean bathrooms",
          source: "manual",
          instructions: "Sink, toilet, mirror, floor.",
          tags: ["bathroom"]
        },
        schedules: [{
          planningMode: "flexible",
          recurrence: { frequency: "weekly", interval: 1, weekDays: [0, 6] },
          startsOn: "2026-05-30",
          estimatedMinutes: 60,
          flexibleWindowRule: "once_within_selected_days",
          assignment: { mode: "fixed", memberUserIds: [owner.id] }
        }]
      });

      const secondStore = createPrismaStore(prisma!);

      expect(await secondStore.getHousehold(household.id)).toEqual({
        id: household.id,
        name: "Home base",
        timeZone: "America/New_York",
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
          instructions: "Sink, toilet, mirror, floor.",
          tags: ["bathroom"],
          source: "manual"
        })
      ]);
      expect(created.chore).not.toHaveProperty("cadence");
      expect(created.chore).not.toHaveProperty("estimatedMinutes");
      expect(await secondStore.listSchedules(household.id, created.chore.id)).toEqual([
        expect.objectContaining({
          planningMode: "flexible",
          flexibleWindowRule: "once_within_selected_days",
          estimatedMinutes: 60
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
      const owner = await store.upsertUserByClerkId("owner");
      const household = await store.createHouseholdForUser("Home", owner.id);
      const scheduled = await store.createChoreWithSchedules({
        householdId: household.id,
        chore: { title: "Clean bathrooms", source: "manual" },
        schedules: [{
          planningMode: "timed",
          recurrence: { frequency: "weekly", interval: 1, weekDays: [1] },
          localStartTime: "09:00",
          localEndTime: "09:30",
          startsOn: "2026-05-25",
          assignment: { mode: "fixed", memberUserIds: [owner.id] }
        }]
      });
      const chore = scheduled.chore;

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
        source: "manual"
      });

      expect(updated).toEqual(
        expect.objectContaining({
          id: chore.id,
          title: "Clean main bathroom"
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

    it("persists household settings and invitation-created membership across store instances", async () => {
      const firstStore = createPrismaStore(prisma!);
      const owner = await firstStore.upsertUserByClerkId("owner", {
        primaryEmail: "owner@example.com"
      });
      const member = await firstStore.upsertUserByClerkId("member", {
        primaryEmail: "member@example.com"
      });
      const household = await firstStore.createHouseholdForUser("Home", owner.id);

      await firstStore.updateHouseholdSettings(household.id, { timeZone: "America/Chicago" });
      const invitation = await firstStore.createInvitation({
        householdId: household.id,
        recipientEmail: "member@example.com",
        tokenDigest: "member-token-digest",
        invitedByUserId: owner.id,
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      });
      await firstStore.acceptInvitation(invitation.id, member.id, new Date().toISOString());

      const secondStore = createPrismaStore(prisma!);

      expect(await secondStore.getHousehold(household.id)).toEqual(
        expect.objectContaining({ timeZone: "America/Chicago" })
      );
      expect(await secondStore.listHouseholdMembers(household.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: owner.id, role: "owner" }),
          expect.objectContaining({ userId: member.id, role: "member" })
        ])
      );
      expect(await secondStore.listInvitations(household.id)).toEqual([
        expect.objectContaining({ id: invitation.id, status: "accepted", acceptedByUserId: member.id })
      ]);
    });

    it("persists role changes while refusing to remove the final owner", async () => {
      const firstStore = createPrismaStore(prisma!);
      const owner = await firstStore.upsertUserByClerkId("owner");
      const member = await firstStore.upsertUserByClerkId("member");
      const household = await firstStore.createHouseholdForUser("Home", owner.id);
      const invitation = await firstStore.createInvitation({
        householdId: household.id,
        recipientEmail: "member@example.com",
        tokenDigest: "role-token-digest",
        invitedByUserId: owner.id,
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      });
      await firstStore.acceptInvitation(invitation.id, member.id, new Date().toISOString());

      expect(await firstStore.updateMemberRole(household.id, member.id, "owner")).toEqual(
        expect.objectContaining({ outcome: "updated" })
      );
      expect(await firstStore.removeMember(household.id, owner.id)).toEqual(
        expect.objectContaining({ outcome: "updated" })
      );

      const secondStore = createPrismaStore(prisma!);
      expect(await secondStore.getMembership(member.id, household.id)).toEqual(
        expect.objectContaining({ role: "owner" })
      );
      expect(await secondStore.removeMember(household.id, member.id)).toEqual({
        outcome: "last_owner"
      });
    });

    it("persists timed schedules and their materialized occurrences across store instances", async () => {
      const firstStore = createPrismaStore(prisma!);
      const owner = await firstStore.upsertUserByClerkId("owner");
      const household = await firstStore.createHouseholdForUser("Home", owner.id);
      const scheduled = await firstStore.createChoreWithSchedules({
        householdId: household.id,
        chore: { title: "Clean bathrooms", source: "manual" },
        schedules: [{
          planningMode: "timed",
          recurrence: { frequency: "daily", interval: 1 },
          localStartTime: "09:00",
          localEndTime: "09:30",
          startsOn: "2026-05-25",
          assignment: { mode: "fixed", memberUserIds: [owner.id] }
        }]
      });
      const schedule = scheduled.schedules[0];

      await firstStore.materializeScheduleOccurrences(
        household.id,
        schedule.id,
        materializeOccurrences({
          schedule,
          householdTimeZone: household.timeZone,
          rangeStart: "2026-05-25",
          rangeEnd: "2026-05-31"
        })
      );

      const secondStore = createPrismaStore(prisma!);
      expect(await secondStore.listSchedules(household.id, scheduled.chore.id)).toEqual([
        expect.objectContaining({ id: schedule.id, planningMode: "timed", localEndTime: "09:30" })
      ]);
      expect(await secondStore.listOccurrences(household.id, {
        startAt: "2026-05-25T00:00:00.000Z",
        endAt: "2026-06-01T00:00:00.000Z",
        startOn: "2026-05-25",
        endOn: "2026-06-01"
      })).toHaveLength(7);
    });

    it("orders mixed occurrence modes and clears only untouched future flexible rows", async () => {
      const firstStore = createPrismaStore(prisma!);
      const owner = await firstStore.upsertUserByClerkId("owner");
      const member = await firstStore.upsertUserByClerkId("member");
      const household = await firstStore.createHouseholdForUser("Home", owner.id);
      await firstStore.updateHouseholdSettings(household.id, { timeZone: "America/Los_Angeles" });
      await firstStore.acceptInvitation((await firstStore.createInvitation({
        householdId: household.id,
        recipientEmail: "member@example.com",
        tokenDigest: "mixed-member-token",
        invitedByUserId: owner.id,
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      })).id, member.id, new Date().toISOString());

      const scheduled = await firstStore.createChoreWithSchedules({
        householdId: household.id,
        chore: { title: "Mixed occurrence coverage", source: "manual" },
        schedules: [
          {
            planningMode: "flexible",
            recurrence: { frequency: "weekly", interval: 1, weekDays: [6, 0] },
            startsOn: "2026-03-07",
            estimatedMinutes: 60,
            flexibleWindowRule: "once_within_selected_days",
            assignment: { mode: "fixed", memberUserIds: [member.id] }
          },
          {
            planningMode: "timed",
            recurrence: { frequency: "daily", interval: 1 },
            localStartTime: "23:30",
            localEndTime: "23:45",
            startsOn: "2026-03-07",
            assignment: { mode: "fixed", memberUserIds: [member.id] }
          }
        ]
      });
      const flexibleSchedule = scheduled.schedules.find((schedule) => schedule.planningMode === "flexible")!;
      const timedSchedule = scheduled.schedules.find((schedule) => schedule.planningMode === "timed")!;

      for (const schedule of scheduled.schedules) {
        await firstStore.materializeScheduleOccurrences(
          household.id,
          schedule.id,
          materializeOccurrences({
            schedule,
            householdTimeZone: "America/Los_Angeles",
            rangeStart: "2026-03-07",
            rangeEnd: "2026-03-22"
          })
        );
      }

      const initial = await firstStore.listOccurrences(household.id, {
        startAt: "2026-03-07T00:00:00.000Z",
        endAt: "2026-03-09T23:59:59.999Z",
        startOn: "2026-03-07",
        endOn: "2026-03-09"
      });
      expect(initial.filter((occurrence) => occurrence.scheduleId === timedSchedule.id || occurrence.scheduleId === flexibleSchedule.id)
        .map((occurrence) => ({
          planningMode: occurrence.planningMode,
          eligibleStartOn: occurrence.eligibleStartOn,
          plannedStartAt: occurrence.plannedStartAt
        }))).toEqual([
        {
          planningMode: "timed",
          eligibleStartOn: "2026-03-07",
          plannedStartAt: "2026-03-08T07:30:00.000Z"
        },
        {
          planningMode: "flexible",
          eligibleStartOn: "2026-03-07",
          plannedStartAt: undefined
        },
        {
          planningMode: "timed",
          eligibleStartOn: "2026-03-08",
          plannedStartAt: "2026-03-09T06:30:00.000Z"
        },
        {
          planningMode: "timed",
          eligibleStartOn: "2026-03-09",
          plannedStartAt: "2026-03-09T07:30:00.000Z"
        }
      ]);

      const flexibleRows = await firstStore.listOccurrences(household.id, {
        startAt: "2026-03-07T00:00:00.000Z",
        endAt: "2026-03-22T23:59:59.999Z",
        startOn: "2026-03-07",
        endOn: "2026-03-22"
      });
      await firstStore.skipOccurrence(
        household.id,
        flexibleRows.find((occurrence) =>
          occurrence.scheduleId === flexibleSchedule.id &&
          occurrence.eligibleStartOn === "2026-03-14"
        )!.id
      );
      await firstStore.clearFutureUntouchedOccurrences(household.id, flexibleSchedule.id, {
        fromAt: "2026-03-10T12:00:00.000Z",
        fromOn: "2026-03-10"
      });
      const updatedFlexible = {
        ...flexibleSchedule,
        estimatedMinutes: 45,
        assignment: { mode: "fixed" as const, memberUserIds: [owner.id] }
      };
      await firstStore.materializeScheduleOccurrences(
        household.id,
        flexibleSchedule.id,
        materializeOccurrences({
          schedule: updatedFlexible,
          householdTimeZone: "America/Los_Angeles",
          rangeStart: "2026-03-07",
          rangeEnd: "2026-03-22"
        })
      );

      expect((await firstStore.listOccurrences(household.id, {
        startAt: "2026-03-07T00:00:00.000Z",
        endAt: "2026-03-22T23:59:59.999Z",
        startOn: "2026-03-07",
        endOn: "2026-03-22"
      })).filter((occurrence) => occurrence.scheduleId === flexibleSchedule.id)).toEqual([
        expect.objectContaining({ eligibleStartOn: "2026-03-07", estimatedMinutes: 60, assignedUserId: member.id }),
        expect.objectContaining({ eligibleStartOn: "2026-03-14", estimatedMinutes: 60, assignedUserId: member.id, status: "skipped" }),
        expect.objectContaining({ eligibleStartOn: "2026-03-21", estimatedMinutes: 45, assignedUserId: owner.id })
      ]);
    });

    it("clears untouched future occurrences across schedule planning mode changes", async () => {
      const firstStore = createPrismaStore(prisma!);
      const owner = await firstStore.upsertUserByClerkId("owner");
      const member = await firstStore.upsertUserByClerkId("member");
      const household = await firstStore.createHouseholdForUser("Home", owner.id);
      await firstStore.acceptInvitation((await firstStore.createInvitation({
        householdId: household.id,
        recipientEmail: "member@example.com",
        tokenDigest: "mode-change-member-token",
        invitedByUserId: owner.id,
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      })).id, member.id, new Date().toISOString());

      const scheduled = await firstStore.createChoreWithSchedules({
        householdId: household.id,
        chore: { title: "Mode change cleanup", source: "manual" },
        schedules: [{
          planningMode: "flexible",
          recurrence: { frequency: "daily", interval: 1 },
          startsOn: "2026-06-01",
          estimatedMinutes: 60,
          flexibleWindowRule: "each_selected_day",
          assignment: { mode: "fixed", memberUserIds: [member.id] }
        }]
      });
      const schedule = scheduled.schedules[0];
      await firstStore.materializeScheduleOccurrences(
        household.id,
        schedule.id,
        materializeOccurrences({
          schedule,
          householdTimeZone: "UTC",
          rangeStart: "2026-06-01",
          rangeEnd: "2026-06-03"
        })
      );

      const initialRows = await firstStore.listOccurrences(household.id, {
        startAt: "2026-06-01T00:00:00.000Z",
        endAt: "2026-06-03T23:59:59.999Z",
        startOn: "2026-06-01",
        endOn: "2026-06-03"
      });
      await firstStore.skipOccurrence(
        household.id,
        initialRows.find((occurrence) =>
          occurrence.scheduleId === schedule.id &&
          occurrence.eligibleStartOn === "2026-06-02"
        )!.id
      );

      const updatedSchedule = await firstStore.updateSchedule(household.id, schedule.id, {
        planningMode: "timed",
        recurrence: { frequency: "daily", interval: 1 },
        localStartTime: "15:00",
        localEndTime: "15:30",
        startsOn: "2026-06-01",
        assignment: { mode: "fixed", memberUserIds: [owner.id] }
      });
      expect(updatedSchedule).toBeDefined();
      await firstStore.clearFutureUntouchedOccurrences(household.id, schedule.id, {
        fromAt: "2026-06-01T12:00:00.000Z",
        fromOn: "2026-06-01"
      });
      await firstStore.materializeScheduleOccurrences(
        household.id,
        schedule.id,
        materializeOccurrences({
          schedule: updatedSchedule!,
          householdTimeZone: "UTC",
          rangeStart: "2026-06-01",
          rangeEnd: "2026-06-03"
        })
      );

      expect((await firstStore.listOccurrences(household.id, {
        startAt: "2026-06-01T00:00:00.000Z",
        endAt: "2026-06-03T23:59:59.999Z",
        startOn: "2026-06-01",
        endOn: "2026-06-03"
      })).filter((occurrence) => occurrence.scheduleId === schedule.id)).toEqual([
        expect.objectContaining({
          planningMode: "timed",
          eligibleStartOn: "2026-06-01",
          plannedStartAt: "2026-06-01T15:00:00.000Z",
          estimatedMinutes: 30,
          assignedUserId: owner.id
        }),
        expect.objectContaining({
          planningMode: "flexible",
          eligibleStartOn: "2026-06-02",
          estimatedMinutes: 60,
          assignedUserId: member.id,
          status: "skipped"
        }),
        expect.objectContaining({
          planningMode: "timed",
          eligibleStartOn: "2026-06-03",
          plannedStartAt: "2026-06-03T15:00:00.000Z",
          estimatedMinutes: 30,
          assignedUserId: owner.id
        })
      ]);
    });

    it("does not persist a chore when nested schedule persistence fails", async () => {
      const store = createPrismaStore(prisma!);
      const owner = await store.upsertUserByClerkId("owner");
      const household = await store.createHouseholdForUser("Home", owner.id);

      await expect(store.createChoreWithSchedules({
        householdId: household.id,
        chore: { title: "Invalid atomic chore", source: "manual" },
        schedules: [{
          planningMode: "timed",
          recurrence: { frequency: "one_time", interval: 1 },
          localStartTime: "09:00",
          localEndTime: "09:30",
          startsOn: "2026-05-25",
          assignment: { mode: "fixed", memberUserIds: ["missing-user"] }
        }]
      })).rejects.toThrow();

      expect(await store.listChores(household.id)).toEqual([]);
    });
  }
);
