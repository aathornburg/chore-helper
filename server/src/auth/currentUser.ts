import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import type { AppUser, HouseholdStore } from "../repositories/inMemoryStore.js";

export type AuthMode = "clerk" | "test";

export async function resolveCurrentUser(
  req: Request,
  res: Response,
  store: HouseholdStore,
  authMode: AuthMode
): Promise<AppUser | undefined> {
  const clerkUserId = authMode === "test"
    ? req.header("Authorization")?.replace(/^Bearer\s+/i, "")
    : getAuth(req).userId;

  if (!clerkUserId) {
    res.status(401).json({ error: "Authentication required" });
    return undefined;
  }

  return store.upsertUserByClerkId(clerkUserId);
}
