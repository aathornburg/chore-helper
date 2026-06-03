import { Router } from "express";
import type {
  CalendarContentMode,
  CalendarDetailLevel,
  CalendarExportMode,
  CalendarImportQueueDecisionInput,
  CalendarSyncMode
} from "@chore-helper/shared";
import type { AuthMode } from "../auth/currentUser.js";
import { resolveCurrentUser } from "../auth/currentUser.js";
import type { HouseholdStore } from "../repositories/inMemoryStore.js";

const importQueueModes: CalendarSyncMode[] = ["off", "manual", "auto"];
const exportModes: CalendarExportMode[] = ["off", "review", "auto"];
const contentModes: CalendarContentMode[] = ["chores", "commitments", "both"];
const detailLevels: CalendarDetailLevel[] = ["busy_only", "full_details"];

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.includes(value as T);
}

async function requireHouseholdOwner(store: HouseholdStore, householdId: string, userId: string) {
  const members = await store.listHouseholdMembers(householdId);
  return members.some((member) => member.userId === userId && member.role === "owner");
}

export function createCalendarRouter(store: HouseholdStore, authMode: AuthMode) {
  const router = Router();

  router.get("/households/:householdId/calendar/import-policies", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    if (!await requireHouseholdOwner(store, req.params.householdId, user.id)) {
      return res.status(403).json({ error: "Only household owners can manage calendar import policies." });
    }

    return res.status(200).json(await store.listCalendarImportPolicies(req.params.householdId));
  });

  router.patch("/households/:householdId/calendar/import-policies/:memberId", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    if (!await requireHouseholdOwner(store, req.params.householdId, user.id)) {
      return res.status(403).json({ error: "Only household owners can manage calendar import policies." });
    }
    if (!isOneOf(req.body.importQueueMode, importQueueModes) || !isOneOf(req.body.importContentMode, contentModes)) {
      return res.status(400).json({ error: "Invalid calendar import policy." });
    }

    try {
      const policy = await store.updateCalendarImportPolicy(req.params.householdId, req.params.memberId, {
        importQueueMode: req.body.importQueueMode,
        importContentMode: req.body.importContentMode
      });
      return res.status(200).json(policy);
    } catch {
      return res.status(404).json({ error: "Household member not found." });
    }
  });

  router.get("/households/:householdId/calendar/import-queue", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    if (!await requireHouseholdOwner(store, req.params.householdId, user.id)) {
      return res.status(403).json({ error: "Only household owners can review calendar imports." });
    }

    return res.status(200).json(await store.listCalendarImportQueue(req.params.householdId));
  });

  router.patch("/households/:householdId/calendar/import-queue/:queueItemId", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    if (!await requireHouseholdOwner(store, req.params.householdId, user.id)) {
      return res.status(403).json({ error: "Only household owners can review calendar imports." });
    }
    if (req.body.decision !== "approve" && req.body.decision !== "reject") {
      return res.status(400).json({ error: "Decision must be approve or reject." });
    }

    const input: CalendarImportQueueDecisionInput = {
      decision: req.body.decision,
      proposedType: isOneOf(req.body.proposedType, ["chore", "commitment"] as const) ? req.body.proposedType : undefined
    };

    try {
      return res.status(200).json(await store.decideCalendarImportQueueItem(
        req.params.householdId,
        req.params.queueItemId,
        user.id,
        input
      ));
    } catch {
      return res.status(404).json({ error: "Calendar import queue item not found." });
    }
  });

  router.get("/me/calendar/connections", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    return res.status(200).json(await store.listCalendarConnections(user.id));
  });

  router.post("/me/calendar/google/connect", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    return res.status(202).json({
      provider: "google",
      status: "not_configured",
      message: "Google OAuth is ready to be wired to this endpoint."
    });
  });

  router.get("/me/calendar/preferences", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    const householdId = String(req.query.householdId ?? "");
    if (!householdId) return res.status(400).json({ error: "householdId is required." });
    return res.status(200).json(await store.getCalendarPreferences(user.id, householdId));
  });

  router.patch("/me/calendar/preferences", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    if (
      typeof req.body.householdId !== "string" ||
      !isOneOf(req.body.defaultDetailLevel, detailLevels) ||
      !Array.isArray(req.body.selectedSourceCalendarIds) ||
      !isOneOf(req.body.exportMode, exportModes) ||
      !isOneOf(req.body.exportContentMode, contentModes)
    ) {
      return res.status(400).json({ error: "Invalid calendar preferences." });
    }

    return res.status(200).json(await store.updateCalendarPreferences(user.id, req.body.householdId, {
      householdId: req.body.householdId,
      defaultDetailLevel: req.body.defaultDetailLevel,
      selectedSourceCalendarIds: req.body.selectedSourceCalendarIds,
      exportMode: req.body.exportMode,
      exportContentMode: req.body.exportContentMode,
      destinationExternalCalendarId: typeof req.body.destinationExternalCalendarId === "string"
        ? req.body.destinationExternalCalendarId
        : undefined
    }));
  });

  return router;
}
