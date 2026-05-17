import { Router } from "express";
import { z } from "zod";
import type { AgentProvider } from "../agent/AgentProvider.js";
import type { InMemoryStore } from "../repositories/inMemoryStore.js";

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

export function createHouseholdRouter(store: InMemoryStore, agentProvider: AgentProvider) {
  const router = Router();

  router.post("/", (req, res) => {
    const parsed = createHouseholdSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid household payload" });

    return res.status(201).json(store.createHousehold(parsed.data.name));
  });

  router.put("/:householdId/baseline", (req, res) => {
    const parsed = baselineSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid baseline payload" });

    const household = store.updateBaseline(req.params.householdId, parsed.data);
    if (!household) return res.status(404).json({ error: "Household not found" });

    return res.status(200).json(household);
  });

  router.post("/:householdId/recommendations", async (req, res) => {
    const household = store.getHousehold(req.params.householdId);
    if (!household) return res.status(404).json({ error: "Household not found" });

    const recommendations = await agentProvider.recommendSetupImprovements(household);
    return res.status(201).json(store.saveRecommendations(household.id, recommendations));
  });

  return router;
}
