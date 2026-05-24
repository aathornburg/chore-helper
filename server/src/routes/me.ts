import { Router } from "express";
import type { AuthMode } from "../auth/currentUser.js";
import { resolveCurrentUser } from "../auth/currentUser.js";
import type { HouseholdStore } from "../repositories/inMemoryStore.js";

export function createMeRouter(store: HouseholdStore, authMode: AuthMode) {
  const router = Router();

  router.get("/", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;

    return res.status(200).json(user);
  });

  router.get("/households", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;

    return res.status(200).json(await store.listHouseholdsForUser(user.id));
  });

  return router;
}
