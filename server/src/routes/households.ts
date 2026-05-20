/*
  This router module serves the same purpose as a Spring Boot `@RestController`
  class. Each route handler is like a controller method that validates input,
  calls service/repository operations, and returns JSON responses.
*/
import { Router } from "express";
import { z } from "zod";
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

const choreSchema = z.object({
  title: z.string().min(1),
  cadence: z.string().min(1),
  estimatedMinutes: z.number().int().positive(),
  source: z.enum(["manual"])
});

const recommendationRequestSchema = z.object({
  reviewPrompt: z.string().trim().optional()
});

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

  router.post("/:householdId/recommendations", async (req, res) => {
    const household = await store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    const parsed = recommendationRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid recommendation payload" });

    const recommendations = await agentProvider.recommendSetupImprovements({
      household,
      chores: await store.listChores(household.id),
      reviewPrompt: parsed.data.reviewPrompt
    });
    return res.status(201).json(await store.saveRecommendations(household.id, recommendations));
  });

  return router;
}
