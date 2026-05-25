import { clerkClient, getAuth } from "@clerk/express";
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

  if (authMode === "test") {
    return store.upsertUserByClerkId(
      clerkUserId,
      clerkUserId.includes("@") ? { primaryEmail: clerkUserId.toLowerCase() } : undefined
    );
  }

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const primaryEmail = clerkUser.emailAddresses.find(
    (address) => address.id === clerkUser.primaryEmailAddressId
  )?.emailAddress;
  const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || undefined;

  return store.upsertUserByClerkId(clerkUserId, {
    ...(primaryEmail ? { primaryEmail: primaryEmail.toLowerCase() } : {}),
    ...(displayName ? { displayName } : {})
  });
}
