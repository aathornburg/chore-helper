/*
  This router module serves the same purpose as a Spring Boot `@RestController`
  class. Each route handler is like a controller method that validates input,
  calls service/repository operations, and returns JSON responses.
*/
import { Router } from "express";
import { z } from "zod";
import type { Chore, Recommendation } from "@chore-helper/shared";
import type { AgentProvider } from "../agent/AgentProvider.js";
import type { HouseholdStore } from "../repositories/inMemoryStore.js";

const createHouseholdSchema = z.object({
  name: z.string().min(1)
});

const baselineSchema = z.object({
  homeType: z.enum(["house", "apartment", "condo", "townhouse", "other"]),
  rooms: z.array(z.string().min(1)),
  flooring: z.array(z.enum(["carpet", "hardwood", "tile", "mixed", "unknown"])),
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
});

const choreSchema = z.object({
  title: z.string().min(1),
  cadence: z.string().min(1),
  estimatedMinutes: z.number().int().positive(),
  source: z.enum(["manual"])
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

export function createHouseholdRouter(store: HouseholdStore, agentProvider: AgentProvider) {
  const router = Router();

  router.post("/", async (req, res) => {
    const parsed = createHouseholdSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid household payload" });

    return res.status(201).json(await store.createHousehold(parsed.data.name));
  });

  router.get("/:householdId", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    return res.status(200).json(household);
  });

  router.get("/:householdId/structure", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    return res.status(200).json(await store.getHouseholdStructure(household.id));
  });

  router.put("/:householdId/structure", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    const parsed = householdStructureSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid household structure payload" });

    return res.status(200).json(
      await store.saveHouseholdStructure(household.id, parsed.data.floors)
    );
  });

  router.put("/:householdId/baseline", async (req, res) => {
    const parsed = baselineSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid baseline payload" });

    const household = await store.updateBaseline(req.params.householdId, parsed.data);
    if (!household) return res.status(404).json({ error: "Household not found" });

    return res.status(200).json(household);
  });

  router.post("/:householdId/chores", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    const parsed = choreSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid chore payload" });

    const chore = await store.createChore({
      ...parsed.data,
      householdId: household.id
    });

    return res.status(201).json(chore);
  });
  
  router.get("/:householdId/chores", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    const status = req.query.status;
    const includeArchived = req.query.includeArchived === "true";
    const archivedOnly = status === "archived";

    return res.status(200).json(await store.listChores(household.id, {
      includeArchived,
      archivedOnly
    }));
  });

  router.put("/:householdId/chores/:choreId", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    const parsed = choreSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid chore payload" });

    const chore = await store.updateChore(household.id, req.params.choreId, parsed.data);
    if (!chore) return res.status(404).json({ error: "Chore not found" });

    return res.status(200).json(chore);
  });

  router.post("/:householdId/chores/:choreId/archive", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    const chore = await store.archiveChore(household.id, req.params.choreId);
    if (!chore) return res.status(404).json({ error: "Chore not found" });

    return res.status(200).json(chore);
  });

  router.post("/:householdId/chores/:choreId/restore", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    const chore = await store.restoreChore(household.id, req.params.choreId);
    if (!chore) return res.status(404).json({ error: "Chore not found" });

    return res.status(200).json(chore);
  });

  router.get("/:householdId/recommendations", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    const recommendations = await store.listRecommendations(household.id);
    return res.status(200).json(
      recommendations.filter((recommendation) => !recommendation.staleAt)
    );
  });

  router.post("/:householdId/assistant/chat", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

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
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    const parsed = recommendationDecisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid recommendation decision payload" });

    const recommendation = await store.updateRecommendationDecision(
      household.id,
      req.params.recommendationId,
      parsed.data
    );
    if (!recommendation) return res.status(404).json({ error: "Recommendation not found" });

    return res.status(200).json(recommendation);
  });

  router.post("/:householdId/recommendations/apply", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    return res.status(200).json(await store.applyRecommendationDecisions(household.id));
  });

  router.post("/:householdId/recommendations", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

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
