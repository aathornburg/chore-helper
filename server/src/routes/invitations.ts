import { createHash } from "node:crypto";
import { Router } from "express";
import type { AuthMode } from "../auth/currentUser.js";
import { resolveCurrentUser } from "../auth/currentUser.js";
import type { HouseholdStore } from "../repositories/inMemoryStore.js";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createInvitationRouter(store: HouseholdStore, authMode: AuthMode) {
  const router = Router();

  router.post("/:token/accept", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;

    const invitation = await store.findInvitationByTokenDigest(hashToken(req.params.token));
    if (!invitation) return res.status(404).json({ error: "Invitation not found" });
    if (invitation.status === "expired") {
      return res.status(410).json({ error: "Invitation has expired" });
    }
    if (invitation.status !== "pending") {
      return res.status(409).json({ error: "Invitation is no longer pending" });
    }
    if (Date.parse(invitation.expiresAt) <= Date.now()) {
      return res.status(410).json({ error: "Invitation has expired" });
    }
    if (!user.primaryEmail || user.primaryEmail.toLowerCase() !== invitation.recipientEmail.toLowerCase()) {
      return res.status(403).json({ error: "Invitation belongs to another recipient" });
    }

    const accepted = await store.acceptInvitation(invitation.id, user.id, new Date().toISOString());
    if (!accepted) return res.status(409).json({ error: "Invitation is no longer pending" });

    return res.status(200).json(accepted);
  });

  return router;
}
