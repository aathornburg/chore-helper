import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";

function auth(app: ReturnType<typeof createApp>, clerkUserId: string) {
  const authorization = `Bearer ${clerkUserId}`;
  return {
    get: (url: string) => request(app).get(url).set("Authorization", authorization),
    patch: (url: string) => request(app).patch(url).set("Authorization", authorization),
    post: (url: string) => request(app).post(url).set("Authorization", authorization)
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

  it("reports setup requirements when Google OAuth config is missing", async () => {
    const { app } = await createHouseholdWithMember();
    const response = await auth(app, "member").post("/api/me/calendar/google/connect");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      provider: "google",
      status: "setup_required"
    }));
  });

  it("starts Google OAuth when provider config is present", async () => {
    const previousClientId = process.env.GOOGLE_CLIENT_ID;
    const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const previousRedirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = "http://localhost:3001/api/me/calendar/google/callback";

    try {
      const { app } = await createHouseholdWithMember();
      const response = await auth(app, "member").post("/api/me/calendar/google/connect");

      expect(response.status).toBe(202);
      expect(response.body.status).toBe("redirect");
      expect(response.body.authUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(response.body.authUrl).toContain("client_id=google-client-id");
    } finally {
      process.env.GOOGLE_CLIENT_ID = previousClientId;
      process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
      process.env.GOOGLE_CALENDAR_REDIRECT_URI = previousRedirectUri;
    }
  });

  it("blocks member calendar preferences for households the user cannot access", async () => {
    const { app, store } = await createHouseholdWithMember();
    const otherOwner = await store.upsertUserByClerkId("other-owner", {
      primaryEmail: "other-owner@example.com",
      displayName: "Other Owner"
    });
    const otherHousehold = await store.createHouseholdForUser("Other household", otherOwner.id);

    const response = await auth(app, "member")
      .patch("/api/me/calendar/preferences")
      .send({
        householdId: otherHousehold.id,
        defaultDetailLevel: "full_details",
        selectedSourceCalendarIds: ["google-primary"],
        exportMode: "review",
        exportContentMode: "both"
      });

    expect(response.status).toBe(403);
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

  it("does not create a new Cleanly event id when approving an already approved queue item", async () => {
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

    const first = await auth(app, "owner")
      .patch(`/api/households/${household.id}/calendar/import-queue/${queueItem.id}`)
      .send({ decision: "approve", proposedType: "commitment" });
    const second = await auth(app, "owner")
      .patch(`/api/households/${household.id}/calendar/import-queue/${queueItem.id}`)
      .send({ decision: "approve", proposedType: "commitment" });

    expect(second.status).toBe(200);
    expect(second.body.createdCleanlyEventId).toBe(first.body.createdCleanlyEventId);
  });

  it("exposes member-owned calendar queue endpoints without live provider sync", async () => {
    const { app, household } = await createHouseholdWithMember();

    await auth(app, "member")
      .get(`/api/me/calendar/import-candidates?householdId=${household.id}`)
      .expect(200, []);
    await auth(app, "member")
      .get("/api/me/calendar/export-queue")
      .expect(200, []);
  });

  it("lets a member submit selected events to the owner import queue", async () => {
    const { app, household } = await createHouseholdWithMember();

    const response = await auth(app, "member")
      .post("/api/me/calendar/import-queue")
      .send({
        householdId: household.id,
        events: [{
          proposedType: "commitment",
          title: "Dentist appointment",
          privacyTitle: "Busy",
          startsAt: "2026-06-18T14:00:00.000Z",
          endsAt: "2026-06-18T15:00:00.000Z"
        }]
      });

    expect(response.status).toBe(202);
    expect(response.body.status).toBe("queued_for_review");
    expect(response.body.items).toEqual([
      expect.objectContaining({
        householdId: household.id,
        proposedType: "commitment",
        queueStatus: "pending",
        privacyTitle: "Busy"
      })
    ]);

    const ownerQueue = await auth(app, "owner").get(`/api/households/${household.id}/calendar/import-queue`);
    expect(ownerQueue.body).toEqual([
      expect.objectContaining({
        title: "Dentist appointment",
        queueStatus: "pending"
      })
    ]);
  });

  it("auto-approves member submitted events when the owner policy allows it", async () => {
    const { app, household, member } = await createHouseholdWithMember();
    await auth(app, "owner")
      .patch(`/api/households/${household.id}/calendar/import-policies/${member.id}`)
      .send({ importQueueMode: "auto", importContentMode: "commitments" })
      .expect(200);

    const response = await auth(app, "member")
      .post("/api/me/calendar/import-queue")
      .send({
        householdId: household.id,
        events: [{
          proposedType: "commitment",
          title: "Practice",
          startsAt: "2026-06-19T21:30:00.000Z",
          endsAt: "2026-06-19T22:30:00.000Z"
        }]
      });

    expect(response.status).toBe(202);
    expect(response.body.status).toBe("auto_ready");
    expect(response.body.items).toEqual([
      expect.objectContaining({
        proposedType: "commitment",
        queueStatus: "approved",
        createdCleanlyEventId: expect.any(String)
      })
    ]);
  });
});
