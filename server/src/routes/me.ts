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

  router.get("/notifications", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;

    const notifications = await store.listNotificationsForUser(user.id);
    return res.status(200).json({
      unreadTaskCount: notifications.filter((notification) => !notification.readAt).length,
      notifications
    });
  });

  router.patch("/notifications/read", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;

    if (!Array.isArray(req.body.notificationIds) || !req.body.notificationIds.every((id: unknown) => typeof id === "string")) {
      return res.status(400).json({ error: "notificationIds must be an array of strings." });
    }

    await store.markNotificationsRead(user.id, req.body.notificationIds);
    const notifications = await store.listNotificationsForUser(user.id);
    return res.status(200).json({
      unreadTaskCount: notifications.filter((notification) => !notification.readAt).length,
      notifications
    });
  });

  return router;
}
