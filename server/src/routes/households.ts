/*
  This router module serves the same purpose as a Spring Boot `@RestController`
  class. Each route handler is like a controller method that validates input,
  calls service/repository operations, and returns JSON responses.
*/
import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import type { Chore, Recommendation } from "@chore-helper/shared";
import type { AgentProvider } from "../agent/AgentProvider.js";
import type { AuthMode } from "../auth/currentUser.js";
import { resolveCurrentUser } from "../auth/currentUser.js";
import type { InvitationMailer } from "../invitations/InvitationMailer.js";
import type { HouseholdStore } from "../repositories/inMemoryStore.js";

const createHouseholdSchema = z.object({
  name: z.string().min(1)
});

const householdSettingsSchema = z.object({
  timeZone: z.string().trim().min(1).refine((timeZone) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone });
      return true;
    } catch {
      return false;
    }
  })
});

const profileSchema = z.object({
  name: z.string().trim().min(1),
  homeType: z.enum(["house", "apartment", "condo", "townhouse", "other"]),
  hasPets: z.boolean(),
  hasOutdoorSpace: z.boolean(),
  notes: z.string().optional()
});

const coverageLevelSchema = z.enum(["none", "partial", "most", "all"]);
const petImpactSchema = z.enum(["none", "low", "medium", "high"]);
const flooringSurfaceSchema = z.enum([
  "hardwood",
  "tile",
  "carpet",
  "rugs",
  "vinyl",
  "laminate",
  "concrete",
  "mats",
  "mixed",
  "other"
]);

const roomOverrideCoverageSchema = z.union([coverageLevelSchema, z.literal("inherit")]);
const roomOverridePetImpactSchema = z.union([petImpactSchema, z.literal("inherit")]);

function hasUniqueValues<T>(values: T[]) {
  return new Set(values).size === values.length;
}

const householdRoomSchema = z.object({
  id: z.string().min(1),
  floorId: z.string().min(1),
  name: z.string().min(1),
  flooring: z.array(flooringSurfaceSchema),
  petImpact: roomOverridePetImpactSchema,
  robotVacuumCoverage: roomOverrideCoverageSchema,
  robotMopCoverage: roomOverrideCoverageSchema,
  notes: z.string().optional()
});

const householdFloorSchema = z.object({
  id: z.string().min(1),
  householdId: z.string().min(1),
  name: z.string().min(1),
  levelType: z.enum(["upstairs", "main", "basement", "other"]),
  flooring: z.array(flooringSurfaceSchema),
  petImpact: petImpactSchema,
  robotVacuumCoverage: coverageLevelSchema,
  robotMopCoverage: coverageLevelSchema,
  notes: z.string().optional(),
  rooms: z.array(householdRoomSchema)
});

const householdStructureSchema = z.object({
  floors: z.array(householdFloorSchema)
}).superRefine((structure, ctx) => {
  if (!hasUniqueValues(structure.floors.map((floor) => floor.id))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Floor ids must be unique",
      path: ["floors"]
    });
  }

  structure.floors.forEach((floor, floorIndex) => {
    if (!hasUniqueValues(floor.rooms.map((room) => room.id))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Room ids must be unique within a floor",
        path: ["floors", floorIndex, "rooms"]
      });
    }

    floor.rooms.forEach((room, roomIndex) => {
      if (room.floorId !== floor.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Room floorId must match containing floor id",
          path: ["floors", floorIndex, "rooms", roomIndex, "floorId"]
        });
      }
    });
  });
});

const choreSchema = z.object({
  title: z.string().min(1),
  cadence: z.string().min(1),
  estimatedMinutes: z.number().int().positive(),
  source: z.enum(["manual"]),
  instructions: z.string().trim().optional(),
  tags: z.array(z.string().trim().min(1)).optional()
});

const scheduleSchema = z.object({
  recurrence: z.object({
    frequency: z.enum(["one_time", "daily", "weekly", "monthly"]),
    interval: z.number().int().positive(),
    weekDays: z.array(z.number().int().min(0).max(6)).optional(),
    monthlyDay: z.number().int().min(1).max(31).optional()
  }),
  localStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  startsOn: z.string().date(),
  endsOn: z.string().date().optional(),
  plannedMinutes: z.number().int().positive(),
  assignment: z.object({
    mode: z.enum(["fixed", "rotation"]),
    memberUserIds: z.array(z.string().min(1)).min(1)
  })
}).superRefine((schedule, ctx) => {
  if (schedule.assignment.mode === "fixed" && schedule.assignment.memberUserIds.length !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fixed schedules need one assignee", path: ["assignment"] });
  }
  if (schedule.recurrence.frequency === "weekly" && !schedule.recurrence.weekDays?.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Weekly schedules need weekdays", path: ["recurrence"] });
  }
  if (schedule.recurrence.frequency === "monthly" && !schedule.recurrence.monthlyDay) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Monthly schedules need a day", path: ["recurrence"] });
  }
});

const recommendationRequestSchema = z.object({
  reviewPrompt: z.string().trim().optional(),
  selectedChoreIds: z.array(z.string()).optional()
});

const recommendationDecisionSchema = z.object({
  decision: z.enum(["pending", "accepted", "declined"])
});

const assistantChatRequestSchema = z.object({
  message: z.string().trim().min(1)
});

const invitationRequestSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase())
});

const memberRoleSchema = z.object({
  role: z.enum(["owner", "member"])
});

function attachReviewMetadata(recommendation: Recommendation, selectedChores: Chore[]) {
  const matchedChore =
    selectedChores.find((chore) =>
      recommendation.title.toLowerCase().includes(chore.title.toLowerCase())
    ) ?? (selectedChores.length === 1 ? selectedChores[0] : undefined);

  if (!matchedChore) {
    return {
      ...recommendation,
      decision: recommendation.decision ?? "pending"
    };
  }

  return {
    ...recommendation,
    affectedChoreId: recommendation.affectedChoreId ?? matchedChore.id,
    decision: recommendation.decision ?? "pending",
    // Like an Angular smart component enriching DTOs before binding, the
    // controller records the concrete proposed change so the final Apply
    // action can be deterministic instead of asking the agent again.
    proposedCadence: recommendation.proposedCadence ?? matchedChore.cadence,
    proposedEstimatedMinutes:
      recommendation.proposedEstimatedMinutes ?? (matchedChore.estimatedMinutes < 15 ? 30 : matchedChore.estimatedMinutes)
  };
}

export function createHouseholdRouter(
  store: HouseholdStore,
  agentProvider: AgentProvider,
  authMode: AuthMode,
  invitations: { mailer: InvitationMailer; baseUrl: string }
) {
  const router = Router();

  async function requireUser(req: Request, res: Response) {
    return resolveCurrentUser(req, res, store, authMode);
  }

  async function requireHouseholdAccess(req: Request, res: Response) {
    const user = await requireUser(req, res);
    if (!user) return undefined;

    const householdId = req.params.householdId;
    if (!(await store.userHasHouseholdAccess(user.id, householdId))) {
      res.status(404).json({ error: "Household not found" });
      return undefined;
    }

    const household = await store.getHousehold(householdId);
    if (!household) {
      res.status(404).json({ error: "Household not found" });
      return undefined;
    }

    return { user, household };
  }

  async function requireHouseholdOwner(req: Request, res: Response) {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return undefined;

    const membership = await store.getMembership(access.user.id, access.household.id);
    if (membership?.role !== "owner") {
      res.status(403).json({ error: "Household owner access required" });
      return undefined;
    }

    return access;
  }

  async function hasValidScheduleAssignees(householdId: string, memberUserIds: string[]) {
    const memberships = await Promise.all(
      memberUserIds.map((userId) => store.getMembership(userId, householdId))
    );
    return memberships.every(Boolean);
  }

  router.get("/", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;

    const households = await store.listHouseholdsForUser(user.id);
    const appData = await Promise.all(
      households.map(async (household) => {
        const recommendations = (await store.listRecommendations(household.id)).filter(
          (recommendation) => !recommendation.staleAt
        );
        const chores = await store.listChores(household.id);

        return {
          ...household,
          structure: await store.getHouseholdStructure(household.id),
          chores: chores.map((chore) => ({
            ...chore,
            recommendations: recommendations.filter(
              (recommendation) => recommendation.affectedChoreId === chore.id
            )
          })),
          recommendations
        };
      })
    );

    return res.status(200).json(appData);
  });

  router.post("/", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;

    const parsed = createHouseholdSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid household payload" });

    return res.status(201).json(await store.createHouseholdForUser(parsed.data.name, user.id));
  });

  router.get("/:householdId", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    return res.status(200).json(access.household);
  });

  router.get("/:householdId/structure", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    return res.status(200).json(await store.getHouseholdStructure(access.household.id));
  });

  router.put("/:householdId/structure", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    const parsed = householdStructureSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid household structure payload" });

    return res.status(200).json(
      await store.saveHouseholdStructure(access.household.id, parsed.data.floors)
    );
  });

  router.put("/:householdId/profile", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid profile payload" });

    const { name, ...profile } = parsed.data;
    const household = await store.updateProfile(access.household.id, { name, profile });
    if (!household) return res.status(404).json({ error: "Household not found" });

    return res.status(200).json(household);
  });

  router.put("/:householdId/settings", async (req, res) => {
    const access = await requireHouseholdOwner(req, res);
    if (!access) return;

    const parsed = householdSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid household settings payload" });

    const household = await store.updateHouseholdSettings(access.household.id, parsed.data);
    if (!household) return res.status(404).json({ error: "Household not found" });

    return res.status(200).json(household);
  });

  router.get("/:householdId/members", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    return res.status(200).json(await store.listHouseholdMembers(access.household.id));
  });

  router.put("/:householdId/members/:userId/role", async (req, res) => {
    const access = await requireHouseholdOwner(req, res);
    if (!access) return;

    const parsed = memberRoleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid member role payload" });

    const result = await store.updateMemberRole(
      access.household.id,
      req.params.userId,
      parsed.data.role
    );
    if (result.outcome === "not_found") {
      return res.status(404).json({ error: "Household member not found" });
    }
    if (result.outcome === "last_owner") {
      return res.status(409).json({ error: "Household must keep at least one owner" });
    }

    return res.status(200).json(result.membership);
  });

  router.delete("/:householdId/members/:userId", async (req, res) => {
    const access = await requireHouseholdOwner(req, res);
    if (!access) return;

    const result = await store.removeMember(access.household.id, req.params.userId);
    if (result.outcome === "not_found") {
      return res.status(404).json({ error: "Household member not found" });
    }
    if (result.outcome === "last_owner") {
      return res.status(409).json({ error: "Household must keep at least one owner" });
    }

    return res.status(200).json(result.membership);
  });

  router.get("/:householdId/invitations", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    return res.status(200).json(await store.listInvitations(access.household.id));
  });

  router.post("/:householdId/invitations", async (req, res) => {
    const access = await requireHouseholdOwner(req, res);
    if (!access) return;

    const parsed = invitationRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid invitation payload" });

    const token = randomBytes(32).toString("hex");
    const invitation = await store.createInvitation({
      householdId: access.household.id,
      recipientEmail: parsed.data.email,
      tokenDigest: createHash("sha256").update(token).digest("hex"),
      invitedByUserId: access.user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });

    try {
      await invitations.mailer.sendInvitation({
        to: invitation.recipientEmail,
        householdName: access.household.name,
        acceptUrl: new URL(`/accept-invitation/${token}`, invitations.baseUrl).toString(),
        idempotencyKey: invitation.id
      });
    } catch {
      await store.cancelInvitation(
        access.household.id,
        invitation.id,
        new Date().toISOString()
      );
      return res.status(502).json({ error: "Could not send household invitation" });
    }

    return res.status(201).json(invitation);
  });

  router.post("/:householdId/invitations/:invitationId/cancel", async (req, res) => {
    const access = await requireHouseholdOwner(req, res);
    if (!access) return;

    const invitation = await store.cancelInvitation(
      access.household.id,
      req.params.invitationId,
      new Date().toISOString()
    );
    if (!invitation) return res.status(404).json({ error: "Pending invitation not found" });

    return res.status(200).json(invitation);
  });

  router.post("/:householdId/chores", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    const parsed = choreSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid chore payload" });

    const chore = await store.createChore({
      ...parsed.data,
      householdId: access.household.id
    });

    return res.status(201).json(chore);
  });
  
  router.get("/:householdId/chores", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    const status = req.query.status;
    const includeArchived = req.query.includeArchived === "true";
    const archivedOnly = status === "archived";

    return res.status(200).json(await store.listChores(access.household.id, {
      includeArchived,
      archivedOnly
    }));
  });

  router.get("/:householdId/chores/:choreId/schedules", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    return res.status(200).json(await store.listSchedules(access.household.id, req.params.choreId));
  });

  router.post("/:householdId/chores/:choreId/schedules", async (req, res) => {
    const access = await requireHouseholdOwner(req, res);
    if (!access) return;

    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid schedule payload" });

    const chore = (await store.listChores(access.household.id)).find(
      (candidate) => candidate.id === req.params.choreId
    );
    if (!chore) return res.status(404).json({ error: "Chore not found" });
    if (!await hasValidScheduleAssignees(access.household.id, parsed.data.assignment.memberUserIds)) {
      return res.status(400).json({ error: "Schedule assignee must be a household member" });
    }

    return res.status(201).json(await store.createSchedule({
      householdId: access.household.id,
      choreId: chore.id,
      ...parsed.data
    }));
  });

  router.put("/:householdId/schedules/:scheduleId", async (req, res) => {
    const access = await requireHouseholdOwner(req, res);
    if (!access) return;

    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid schedule payload" });
    if (!await hasValidScheduleAssignees(access.household.id, parsed.data.assignment.memberUserIds)) {
      return res.status(400).json({ error: "Schedule assignee must be a household member" });
    }

    const schedule = await store.updateSchedule(access.household.id, req.params.scheduleId, parsed.data);
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });

    return res.status(200).json(schedule);
  });

  router.post("/:householdId/schedules/:scheduleId/archive", async (req, res) => {
    const access = await requireHouseholdOwner(req, res);
    if (!access) return;

    const schedule = await store.archiveSchedule(access.household.id, req.params.scheduleId);
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });

    return res.status(200).json(schedule);
  });

  router.put("/:householdId/chores/:choreId", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    const parsed = choreSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid chore payload" });

    const chore = await store.updateChore(access.household.id, req.params.choreId, parsed.data);
    if (!chore) return res.status(404).json({ error: "Chore not found" });

    return res.status(200).json(chore);
  });

  router.post("/:householdId/chores/:choreId/archive", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    const chore = await store.archiveChore(access.household.id, req.params.choreId);
    if (!chore) return res.status(404).json({ error: "Chore not found" });

    return res.status(200).json(chore);
  });

  router.post("/:householdId/chores/:choreId/restore", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    const chore = await store.restoreChore(access.household.id, req.params.choreId);
    if (!chore) return res.status(404).json({ error: "Chore not found" });

    return res.status(200).json(chore);
  });

  router.get("/:householdId/recommendations", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    const recommendations = await store.listRecommendations(access.household.id);
    return res.status(200).json(
      recommendations.filter((recommendation) => !recommendation.staleAt)
    );
  });

  router.post("/:householdId/assistant/chat", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;
    const { household } = access;

    const parsed = assistantChatRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid assistant chat payload" });

    const chores = await store.listChores(household.id);
    const activeChores = chores.filter((chore) => !chore.archivedAt);
    const activeRecommendations = (await store.listRecommendations(household.id)).filter(
      (recommendation) => !recommendation.staleAt
    );

    try {
      return res.status(200).json(
        await agentProvider.answerHouseholdQuestion({
          household,
          chores: activeChores,
          recommendations: activeRecommendations,
          message: parsed.data.message
        })
      );
    } catch {
      return res.status(502).json({ error: "Could not answer assistant question" });
    }
  });

  router.put("/:householdId/recommendations/:recommendationId/decision", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    const parsed = recommendationDecisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid recommendation decision payload" });

    const recommendation = await store.updateRecommendationDecision(
      access.household.id,
      req.params.recommendationId,
      parsed.data
    );
    if (!recommendation) return res.status(404).json({ error: "Recommendation not found" });

    return res.status(200).json(recommendation);
  });

  router.post("/:householdId/recommendations/apply", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;

    return res.status(200).json(await store.applyRecommendationDecisions(access.household.id));
  });

  router.post("/:householdId/recommendations", async (req, res) => {
    const access = await requireHouseholdAccess(req, res);
    if (!access) return;
    const { household } = access;

    const parsed = recommendationRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid recommendation payload" });

    const chores = await store.listChores(household.id);
    const selectedChores = parsed.data.selectedChoreIds
      ? chores.filter((chore) => parsed.data.selectedChoreIds?.includes(chore.id))
      : chores;

    try {
      const recommendations = await agentProvider.recommendSetupImprovements({
        household,
        chores: selectedChores,
        reviewPrompt: parsed.data.reviewPrompt
      });
      const reviewRecommendations = recommendations.map((recommendation) =>
        attachReviewMetadata(recommendation, selectedChores)
      );

      return res.status(201).json(await store.saveRecommendations(household.id, reviewRecommendations));
    } catch {
      return res.status(502).json({ error: "Could not generate recommendations" });
    }
  });

  return router;
}
