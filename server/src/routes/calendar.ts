import { Router } from "express";
import crypto from "node:crypto";
import type {
  CalendarContentMode,
  CalendarDetailLevel,
  CalendarExportMode,
  CalendarImportQueueDecisionInput,
  CleanlyCalendarEventType,
  CalendarSyncMode
} from "@chore-helper/shared";
import type { AuthMode } from "../auth/currentUser.js";
import { resolveCurrentUser } from "../auth/currentUser.js";
import type { HouseholdStore } from "../repositories/inMemoryStore.js";

const importQueueModes: CalendarSyncMode[] = ["off", "manual", "auto"];
const exportModes: CalendarExportMode[] = ["off", "review", "auto"];
const contentModes: CalendarContentMode[] = ["chores", "commitments", "both"];
const detailLevels: CalendarDetailLevel[] = ["busy_only", "full_details"];
const cleanlyEventTypes: CleanlyCalendarEventType[] = ["chore", "commitment"];
const googleCalendarScopes = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email"
];

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.includes(value as T);
}

async function requireHouseholdOwner(store: HouseholdStore, householdId: string, userId: string) {
  const members = await store.listHouseholdMembers(householdId);
  return members.some((member) => member.userId === userId && member.role === "owner");
}

async function requireHouseholdAccess(store: HouseholdStore, householdId: string, userId: string) {
  return store.userHasHouseholdAccess(userId, householdId);
}

function isAllowedImportType(proposedType: CleanlyCalendarEventType, mode: CalendarContentMode) {
  return mode === "both" || (mode === "chores" && proposedType === "chore") || (mode === "commitments" && proposedType === "commitment");
}

function displayName(user: { displayName?: string; primaryEmail?: string; clerkUserId: string }) {
  return user.displayName ?? user.primaryEmail ?? user.clerkUserId;
}

function googleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return undefined;
  return { clientId, clientSecret, redirectUri };
}

function createGoogleOAuthState(userId: string) {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "dev-calendar-oauth-state";
  const payload = Buffer.from(JSON.stringify({
    userId,
    nonce: crypto.randomUUID(),
    createdAt: Date.now()
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyGoogleOAuthState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return undefined;
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "dev-calendar-oauth-state";
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return undefined;
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: string; createdAt?: number };
  if (!decoded.userId || !decoded.createdAt || Date.now() - decoded.createdAt > 10 * 60 * 1000) return undefined;
  return { userId: decoded.userId };
}

function settingsRedirect(status: string) {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:5173";
  const url = new URL("/settings", baseUrl);
  url.hash = "calendar";
  url.searchParams.set("calendar", status);
  return url.toString();
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

  router.delete("/me/calendar/connections/:connectionId", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    return res.status(202).json({
      connectionId: req.params.connectionId,
      status: "not_configured",
      message: "Calendar disconnect will be wired when provider sync execution lands."
    });
  });

  router.post("/me/calendar/google/connect", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    const config = googleOAuthConfig();
    if (!config) {
      return res.status(200).json({
        provider: "google",
        status: "setup_required",
        message: "Google Calendar login needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALENDAR_REDIRECT_URI."
      });
    }
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set("redirect_uri", config.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("scope", googleCalendarScopes.join(" "));
    authUrl.searchParams.set("state", createGoogleOAuthState(user.id));
    return res.status(202).json({
      provider: "google",
      status: "redirect",
      message: "Redirecting to Google Calendar login.",
      authUrl: authUrl.toString()
    });
  });

  router.get("/me/calendar/google/callback", async (req, res) => {
    const config = googleOAuthConfig();
    if (!config) return res.redirect(settingsRedirect("google-setup-required"));
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const verifiedState = verifyGoogleOAuthState(state);
    if (!code || !verifiedState) return res.redirect(settingsRedirect("google-auth-error"));

    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: "authorization_code",
          code
        })
      });
      if (!tokenResponse.ok) return res.redirect(settingsRedirect("google-auth-error"));
      const tokenPayload = await tokenResponse.json() as { access_token?: string; expires_in?: number; scope?: string };
      if (!tokenPayload.access_token) return res.redirect(settingsRedirect("google-auth-error"));

      const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
      });
      if (!profileResponse.ok) return res.redirect(settingsRedirect("google-auth-error"));
      const profile = await profileResponse.json() as { email?: string };
      if (!profile.email) return res.redirect(settingsRedirect("google-auth-error"));

      await store.upsertCalendarConnection(verifiedState.userId, {
        provider: "google",
        providerAccountEmail: profile.email,
        scopes: tokenPayload.scope?.split(" ") ?? googleCalendarScopes,
        tokenExpiresAt: tokenPayload.expires_in
          ? new Date(Date.now() + tokenPayload.expires_in * 1000).toISOString()
          : undefined,
        lastSyncedAt: new Date().toISOString()
      });
      return res.redirect(settingsRedirect("google-connected"));
    } catch {
      return res.redirect(settingsRedirect("google-auth-error"));
    }
  });

  router.get("/me/calendar/preferences", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    const householdId = String(req.query.householdId ?? "");
    if (!householdId) return res.status(400).json({ error: "householdId is required." });
    if (!await requireHouseholdAccess(store, householdId, user.id)) {
      return res.status(403).json({ error: "You do not have access to this household." });
    }
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
    if (!await requireHouseholdAccess(store, req.body.householdId, user.id)) {
      return res.status(403).json({ error: "You do not have access to this household." });
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

  router.get("/me/calendar/import-candidates", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    const householdId = String(req.query.householdId ?? "");
    if (!householdId) return res.status(400).json({ error: "householdId is required." });
    if (!await requireHouseholdAccess(store, householdId, user.id)) {
      return res.status(403).json({ error: "You do not have access to this household." });
    }
    return res.status(200).json([]);
  });

  router.post("/me/calendar/import-queue", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    if (typeof req.body.householdId !== "string" || !Array.isArray(req.body.events)) {
      return res.status(400).json({ error: "householdId and events are required." });
    }
    if (!await requireHouseholdAccess(store, req.body.householdId, user.id)) {
      return res.status(403).json({ error: "You do not have access to this household." });
    }
    const policies = await store.listCalendarImportPolicies(req.body.householdId);
    const policy = policies.find((item) => item.memberId === user.id);
    if (policy?.importQueueMode === "off") {
      return res.status(403).json({ error: "Calendar importing is off for this household member." });
    }
    const importQueueMode = policy?.importQueueMode ?? "manual";
    const importContentMode = policy?.importContentMode ?? "both";
    const preferences = await store.getCalendarPreferences(user.id, req.body.householdId);
    const items = [];

    for (const event of req.body.events) {
      if (
        !isOneOf(event?.proposedType, cleanlyEventTypes) ||
        !isAllowedImportType(event.proposedType, importContentMode) ||
        typeof event.title !== "string" ||
        !event.title.trim() ||
        typeof event.startsAt !== "string" ||
        Number.isNaN(Date.parse(event.startsAt)) ||
        typeof event.endsAt !== "string" ||
        Number.isNaN(Date.parse(event.endsAt)) ||
        Date.parse(event.endsAt) <= Date.parse(event.startsAt)
      ) {
        return res.status(400).json({ error: "Invalid calendar import event." });
      }

      const detailLevel = isOneOf(event.detailLevel, detailLevels) ? event.detailLevel : preferences.defaultDetailLevel;
      const title = event.title.trim();
      const privacyTitle = detailLevel === "full_details" ? title : typeof event.privacyTitle === "string" && event.privacyTitle.trim()
        ? event.privacyTitle.trim()
        : "Busy";
      const created = await store.createCalendarImportQueueItem({
        householdId: req.body.householdId,
        submittedByUserId: user.id,
        submittedByName: displayName(user),
        proposedType: event.proposedType,
        detailLevel,
        title,
        privacyTitle,
        startsAt: new Date(event.startsAt).toISOString(),
        endsAt: new Date(event.endsAt).toISOString()
      });

      items.push(importQueueMode === "auto"
        ? await store.decideCalendarImportQueueItem(req.body.householdId, created.id, user.id, {
            decision: "approve",
            proposedType: created.proposedType
          })
        : created);
    }

    return res.status(202).json({
      status: importQueueMode === "auto" ? "auto_ready" : "queued_for_review",
      items
    });
  });

  router.get("/me/calendar/export-queue", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    return res.status(200).json([]);
  });

  router.patch("/me/calendar/export-queue/:queueItemId", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;
    if (req.body.decision !== "approve" && req.body.decision !== "reject") {
      return res.status(400).json({ error: "Decision must be approve or reject." });
    }
    return res.status(404).json({ error: "Calendar export queue item not found." });
  });

  return router;
}
