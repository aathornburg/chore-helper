import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";

function auth(app: ReturnType<typeof createApp>, clerkUserId: string) {
  const authorization = `Bearer ${clerkUserId}`;
  return {
    get: (url: string) => request(app).get(url).set("Authorization", authorization),
    patch: (url: string) => request(app).patch(url).set("Authorization", authorization)
  };
}

async function createHouseholdWithMember() {
  const store = createInMemoryStore();
  const app = createApp({ store, authMode: "test" });
  const owner = await store.upsertUserByClerkId("owner", {
    primaryEmail: "owner@example.com",
    displayName: "Owner"
  });
  const member = await store.upsertUserByClerkId("member", {
    primaryEmail: "member@example.com",
    displayName: "Member"
  });
  const household = await store.createHouseholdForUser("New household", owner.id);
  const invitation = await store.createInvitation({
    householdId: household.id,
    recipientEmail: "member@example.com",
    tokenDigest: "member-token",
    invitedByUserId: owner.id,
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  await store.acceptInvitation(invitation.id, member.id, new Date().toISOString());

  return { app, household, member, owner, store };
}

describe("calendar sync governance", () => {
  it("lets a household owner list default import policies for members", async () => {
    const { app, household, member, owner } = await createHouseholdWithMember();

    const response = await auth(app, "owner").get(`/api/households/${household.id}/calendar/import-policies`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        householdId: household.id,
        memberId: owner.id,
        importQueueMode: "manual",
        importContentMode: "both"
      }),
      expect.objectContaining({
        householdId: household.id,
        memberId: member.id,
        importQueueMode: "manual",
        importContentMode: "both"
      })
    ]);
  });

  it("blocks non-owners from listing household import policies", async () => {
    const { app, household } = await createHouseholdWithMember();

    const response = await auth(app, "member").get(`/api/households/${household.id}/calendar/import-policies`);

    expect(response.status).toBe(403);
  });

  it("lets an owner update one member import policy", async () => {
    const { app, household, member } = await createHouseholdWithMember();

    const response = await auth(app, "owner")
      .patch(`/api/households/${household.id}/calendar/import-policies/${member.id}`)
      .send({ importQueueMode: "auto", importContentMode: "commitments" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      memberId: member.id,
      importQueueMode: "auto",
      importContentMode: "commitments"
    }));
  });

  it("lets a member update personal calendar preferences", async () => {
    const { app, household } = await createHouseholdWithMember();

    const response = await auth(app, "member")
      .patch("/api/me/calendar/preferences")
      .send({
        householdId: household.id,
        defaultDetailLevel: "full_details",
        selectedSourceCalendarIds: ["google-primary"],
        exportMode: "review",
        exportContentMode: "both",
        destinationExternalCalendarId: "google-cleanly"
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      householdId: household.id,
      defaultDetailLevel: "full_details",
      exportMode: "review",
      exportContentMode: "both",
      destinationExternalCalendarId: "google-cleanly"
    }));
  });

  it("lets an owner approve a pending import queue item", async () => {
    const { app, household, member, store } = await createHouseholdWithMember();
    const queueItem = await store.createCalendarImportQueueItem({
      householdId: household.id,
      submittedByUserId: member.id,
      submittedByName: "Member",
      proposedType: "commitment",
      detailLevel: "busy_only",
      title: "Dentist appointment",
      privacyTitle: "Busy",
      startsAt: "2026-06-18T14:00:00.000Z",
      endsAt: "2026-06-18T15:00:00.000Z"
    });

    const response = await auth(app, "owner")
      .patch(`/api/households/${household.id}/calendar/import-queue/${queueItem.id}`)
      .send({ decision: "approve", proposedType: "commitment" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      id: queueItem.id,
      queueStatus: "approved",
      createdCleanlyEventId: expect.any(String)
    }));
  });
});
