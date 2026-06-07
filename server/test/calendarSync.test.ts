import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";
import type { GoogleCalendarProvider } from "../src/calendar/googleCalendarProvider.js";

function auth(app: ReturnType<typeof createApp>, clerkUserId: string) {
  const authorization = `Bearer ${clerkUserId}`;
  return {
    get: (url: string) => request(app).get(url).set("Authorization", authorization),
    delete: (url: string) => request(app).delete(url).set("Authorization", authorization),
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

function fakeGoogleProvider(): GoogleCalendarProvider {
  return {
    buildAuthUrl: vi.fn((state: string) => `https://accounts.google.com/o/oauth2/v2/auth?client_id=fake-client&state=${state}`),
    exchangeCode: vi.fn(async () => ({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: "2099-06-04T18:00:00.000Z",
      scopes: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
        "https://www.googleapis.com/auth/calendar.events.readonly",
        "https://www.googleapis.com/auth/calendar.events"
      ]
    })),
    refreshAccessToken: vi.fn(async () => ({
      accessToken: "refreshed-access-token",
      expiresAt: "2099-06-04T19:00:00.000Z",
      scopes: ["https://www.googleapis.com/auth/calendar.events"]
    })),
    getProfile: vi.fn(async () => ({ email: "member.google@example.com" })),
    listCalendars: vi.fn(async () => [
      {
        providerCalendarId: "primary",
        name: "Personal",
        color: "#1a73e8",
        timezone: "America/New_York",
        accessRole: "owner"
      },
      {
        providerCalendarId: "family",
        name: "Family",
        color: "#fbbc04",
        timezone: "America/New_York",
        accessRole: "writer"
      }
    ]),
    listEvents: vi.fn(async () => [
      {
        providerEventId: "google-event-1",
        sourceProviderCalendarId: "primary",
        title: "Dentist appointment",
        startsAt: "2026-06-18T14:00:00.000Z",
        endsAt: "2026-06-18T15:00:00.000Z",
        timezone: "America/New_York"
      }
    ]),
    createEvent: vi.fn(async () => ({ providerEventId: "exported-google-event-1" }))
  };
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

  it("lets a member read only their own calendar import policy", async () => {
    const { app, household, member } = await createHouseholdWithMember();

    const response = await auth(app, "member").get(`/api/me/calendar/import-policy?householdId=${household.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      householdId: household.id,
      memberId: member.id,
      importQueueMode: "manual",
      importContentMode: "both"
    }));
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
    const previousClientId = process.env.GOOGLE_CLIENT_ID;
    const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const previousRedirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CALENDAR_REDIRECT_URI;

    try {
    const { app } = await createHouseholdWithMember();
    const response = await auth(app, "member").post("/api/me/calendar/google/connect");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      provider: "google",
      status: "setup_required"
    }));
    } finally {
      process.env.GOOGLE_CLIENT_ID = previousClientId;
      process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
      process.env.GOOGLE_CALENDAR_REDIRECT_URI = previousRedirectUri;
    }
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

  it("stores encrypted tokens and discovered calendars after Google OAuth callback", async () => {
    const store = createInMemoryStore();
    const provider = fakeGoogleProvider();
    const app = createApp({ store, authMode: "test", calendarProvider: provider });
    const member = await store.upsertUserByClerkId("member", {
      primaryEmail: "member@example.com",
      displayName: "Member"
    });

    const connect = await auth(app, "member").post("/api/me/calendar/google/connect");
    const state = new URL(connect.body.authUrl).searchParams.get("state");
    const callback = await request(app).get(`/api/me/calendar/google/callback?code=google-code&state=${state}`);

    expect(callback.status).toBe(302);
    expect(provider.exchangeCode).toHaveBeenCalledWith("google-code");
    const connections = await store.listCalendarConnections(member.id);
    expect(connections).toEqual([
      expect.objectContaining({
        provider: "google",
        providerAccountEmail: "member.google@example.com",
        status: "connected"
      })
    ]);
    expect(await Promise.resolve(store.getCalendarConnectionSecrets(member.id, connections[0].id))).toEqual(expect.objectContaining({
      accessTokenEncrypted: expect.not.stringContaining("access-token"),
      refreshTokenEncrypted: expect.not.stringContaining("refresh-token")
    }));
    expect(await Promise.resolve(store.listExternalCalendars(member.id))).toHaveLength(2);
  });

  it("disconnects a stored Google Calendar connection", async () => {
    const store = createInMemoryStore();
    const provider = fakeGoogleProvider();
    const app = createApp({ store, authMode: "test", calendarProvider: provider });
    const member = await store.upsertUserByClerkId("member", {
      primaryEmail: "member@example.com",
      displayName: "Member"
    });

    const connect = await auth(app, "member").post("/api/me/calendar/google/connect");
    const state = new URL(connect.body.authUrl).searchParams.get("state");
    await request(app).get(`/api/me/calendar/google/callback?code=google-code&state=${state}`);
    const [connection] = await store.listCalendarConnections(member.id);

    const response = await auth(app, "member").delete(`/api/me/calendar/connections/${connection.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      connectionId: connection.id,
      status: "disconnected"
    }));
    expect(await store.listCalendarConnections(member.id)).toEqual([]);
    expect(await store.listExternalCalendars(member.id)).toEqual([]);
  });

  it("returns not found when disconnecting another calendar connection", async () => {
    const { app } = await createHouseholdWithMember();

    const response = await auth(app, "member").delete("/api/me/calendar/connections/connection-from-someone-else");

    expect(response.status).toBe(404);
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

  it("pulls import candidates from selected Google source calendars", async () => {
    const store = createInMemoryStore();
    const provider = fakeGoogleProvider();
    const app = createApp({ store, authMode: "test", calendarProvider: provider });
    const owner = await store.upsertUserByClerkId("owner", { primaryEmail: "owner@example.com", displayName: "Owner" });
    const member = await store.upsertUserByClerkId("member", { primaryEmail: "member@example.com", displayName: "Member" });
    const household = await store.createHouseholdForUser("Home", owner.id);
    await store.acceptInvitation((await store.createInvitation({
      householdId: household.id,
      recipientEmail: "member@example.com",
      tokenDigest: "token",
      invitedByUserId: owner.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    })).id, member.id, new Date().toISOString());
    const connection = await store.upsertCalendarConnection(member.id, {
      provider: "google",
      providerAccountEmail: "member.google@example.com",
      scopes: ["https://www.googleapis.com/auth/calendar.events.readonly"],
      tokenExpiresAt: "2099-06-05T18:00:00.000Z",
      lastSyncedAt: "2026-06-04T17:00:00.000Z",
      accessTokenEncrypted: "encrypted-access",
      refreshTokenEncrypted: "encrypted-refresh"
    });
    const calendars = await store.upsertExternalCalendars(member.id, connection.id, [{
      providerCalendarId: "primary",
      name: "Personal",
      timezone: "America/New_York",
      accessRole: "owner"
    }]);
    await store.updateCalendarPreferences(member.id, household.id, {
      householdId: household.id,
      defaultDetailLevel: "busy_only",
      selectedSourceCalendarIds: [calendars[0].id],
      exportMode: "off",
      exportContentMode: "chores"
    });

    const response = await auth(app, "member")
      .get(`/api/me/calendar/import-candidates?householdId=${household.id}&startAt=2026-06-15T00:00:00.000Z&endAt=2026-06-22T00:00:00.000Z`);

    expect(response.status).toBe(200);
    expect(provider.listEvents).toHaveBeenCalledWith(expect.objectContaining({
      calendarIds: ["primary"]
    }));
    expect(response.body).toEqual([
      expect.objectContaining({
        providerEventId: "google-event-1",
        title: "Dentist appointment",
        privacyTitle: "Busy",
        proposedType: "commitment"
      })
    ]);
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

  it("creates one unread import review notification for each household owner after manual import submission", async () => {
    const { app, household, store, owner } = await createHouseholdWithMember();
    const secondOwner = await store.upsertUserByClerkId("second-owner", {
      primaryEmail: "second-owner@example.com",
      displayName: "Second Owner"
    });
    const invitation = await store.createInvitation({
      householdId: household.id,
      recipientEmail: "second-owner@example.com",
      tokenDigest: "second-owner-token",
      invitedByUserId: owner.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    await store.acceptInvitation(invitation.id, secondOwner.id, new Date().toISOString());
    await store.updateMemberRole(household.id, secondOwner.id, "owner");

    await auth(app, "member")
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
      })
      .expect(202);

    const firstOwnerNotifications = await auth(app, "owner").get("/api/me/notifications");
    const secondOwnerNotifications = await auth(app, "second-owner").get("/api/me/notifications");

    expect(firstOwnerNotifications.status).toBe(200);
    expect(firstOwnerNotifications.body.unreadTaskCount).toBe(1);
    expect(firstOwnerNotifications.body.notifications).toEqual([
      expect.objectContaining({
        type: "calendar_import_queue_review",
        householdId: household.id,
        householdName: "New household",
        title: "Calendar imports need review",
        body: "1 event is waiting in New household.",
        targetPath: "/calendar?reviewImports=1",
        readAt: null,
        metadata: expect.objectContaining({ pendingCount: 1 })
      })
    ]);
    expect(secondOwnerNotifications.body.unreadTaskCount).toBe(1);
    expect(secondOwnerNotifications.body.notifications).toEqual([
      expect.objectContaining({
        type: "calendar_import_queue_review",
        householdId: household.id,
        metadata: expect.objectContaining({ pendingCount: 1 })
      })
    ]);
  });

  it("dedupes import review notifications and resets read state when more pending imports arrive", async () => {
    const { app, household } = await createHouseholdWithMember();

    await auth(app, "member")
      .post("/api/me/calendar/import-queue")
      .send({
        householdId: household.id,
        events: [{
          proposedType: "commitment",
          title: "Dentist appointment",
          startsAt: "2026-06-18T14:00:00.000Z",
          endsAt: "2026-06-18T15:00:00.000Z"
        }]
      })
      .expect(202);
    const firstList = await auth(app, "owner").get("/api/me/notifications").expect(200);
    await auth(app, "owner")
      .patch("/api/me/notifications/read")
      .send({ notificationIds: [firstList.body.notifications[0].id] })
      .expect(200);

    await auth(app, "member")
      .post("/api/me/calendar/import-queue")
      .send({
        householdId: household.id,
        events: [{
          proposedType: "commitment",
          title: "Practice",
          startsAt: "2026-06-19T21:30:00.000Z",
          endsAt: "2026-06-19T22:30:00.000Z"
        }]
      })
      .expect(202);

    const refreshed = await auth(app, "owner").get("/api/me/notifications");

    expect(refreshed.body.unreadTaskCount).toBe(1);
    expect(refreshed.body.notifications).toHaveLength(1);
    expect(refreshed.body.notifications[0]).toEqual(expect.objectContaining({
      id: firstList.body.notifications[0].id,
      readAt: null,
      body: "2 events are waiting in New household.",
      metadata: expect.objectContaining({ pendingCount: 2 })
    }));
  });

  it("does not create owner review notifications for auto-approved imports", async () => {
    const { app, household, member } = await createHouseholdWithMember();
    await auth(app, "owner")
      .patch(`/api/households/${household.id}/calendar/import-policies/${member.id}`)
      .send({ importQueueMode: "auto", importContentMode: "commitments" })
      .expect(200);

    await auth(app, "member")
      .post("/api/me/calendar/import-queue")
      .send({
        householdId: household.id,
        events: [{
          proposedType: "commitment",
          title: "Practice",
          startsAt: "2026-06-19T21:30:00.000Z",
          endsAt: "2026-06-19T22:30:00.000Z"
        }]
      })
      .expect(202);

    const response = await auth(app, "owner").get("/api/me/notifications");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ unreadTaskCount: 0, notifications: [] });
  });

  it("only returns and marks read notifications for the current user", async () => {
    const { app, household, store, owner } = await createHouseholdWithMember();
    const secondOwner = await store.upsertUserByClerkId("second-owner", {
      primaryEmail: "second-owner@example.com",
      displayName: "Second Owner"
    });
    const invitation = await store.createInvitation({
      householdId: household.id,
      recipientEmail: "second-owner@example.com",
      tokenDigest: "second-owner-token",
      invitedByUserId: owner.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    await store.acceptInvitation(invitation.id, secondOwner.id, new Date().toISOString());
    await store.updateMemberRole(household.id, secondOwner.id, "owner");

    await auth(app, "member")
      .post("/api/me/calendar/import-queue")
      .send({
        householdId: household.id,
        events: [{
          proposedType: "commitment",
          title: "Dentist appointment",
          startsAt: "2026-06-18T14:00:00.000Z",
          endsAt: "2026-06-18T15:00:00.000Z"
        }]
      })
      .expect(202);
    const firstOwnerNotifications = await auth(app, "owner").get("/api/me/notifications").expect(200);
    const secondOwnerNotifications = await auth(app, "second-owner").get("/api/me/notifications").expect(200);

    await auth(app, "owner")
      .patch("/api/me/notifications/read")
      .send({ notificationIds: [
        firstOwnerNotifications.body.notifications[0].id,
        secondOwnerNotifications.body.notifications[0].id
      ] })
      .expect(200);

    const firstOwnerAfterRead = await auth(app, "owner").get("/api/me/notifications");
    const secondOwnerAfterRead = await auth(app, "second-owner").get("/api/me/notifications");
    const memberNotifications = await auth(app, "member").get("/api/me/notifications");

    expect(firstOwnerAfterRead.body.unreadTaskCount).toBe(0);
    expect(firstOwnerAfterRead.body.notifications[0].readAt).toEqual(expect.any(String));
    expect(secondOwnerAfterRead.body.unreadTaskCount).toBe(1);
    expect(secondOwnerAfterRead.body.notifications[0].readAt).toBeNull();
    expect(memberNotifications.body).toEqual({ unreadTaskCount: 0, notifications: [] });
  });

  it("hides import review notifications once no pending queue items remain", async () => {
    const { app, household } = await createHouseholdWithMember();

    await auth(app, "member")
      .post("/api/me/calendar/import-queue")
      .send({
        householdId: household.id,
        events: [{
          proposedType: "commitment",
          title: "Dentist appointment",
          startsAt: "2026-06-18T14:00:00.000Z",
          endsAt: "2026-06-18T15:00:00.000Z"
        }]
      })
      .expect(202);
    const ownerQueue = await auth(app, "owner").get(`/api/households/${household.id}/calendar/import-queue`);

    await auth(app, "owner")
      .patch(`/api/households/${household.id}/calendar/import-queue/${ownerQueue.body[0].id}`)
      .send({ decision: "approve", proposedType: "commitment" })
      .expect(200);

    const notifications = await auth(app, "owner").get("/api/me/notifications");

    expect(notifications.status).toBe(200);
    expect(notifications.body).toEqual({ unreadTaskCount: 0, notifications: [] });
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

  it("exports approved Cleanly calendar events to the selected Google destination calendar", async () => {
    const store = createInMemoryStore();
    const provider = fakeGoogleProvider();
    const app = createApp({ store, authMode: "test", calendarProvider: provider });
    const owner = await store.upsertUserByClerkId("owner", { primaryEmail: "owner@example.com", displayName: "Owner" });
    const household = await store.createHouseholdForUser("Home", owner.id);
    const connection = await store.upsertCalendarConnection(owner.id, {
      provider: "google",
      providerAccountEmail: "owner.google@example.com",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
      tokenExpiresAt: "2099-06-05T18:00:00.000Z",
      lastSyncedAt: "2026-06-04T17:00:00.000Z",
      accessTokenEncrypted: "encrypted-access",
      refreshTokenEncrypted: "encrypted-refresh"
    });
    const calendars = await store.upsertExternalCalendars(owner.id, connection.id, [{
      providerCalendarId: "cleanly",
      name: "Cleanly",
      timezone: "America/New_York",
      accessRole: "owner"
    }]);
    await store.updateCalendarPreferences(owner.id, household.id, {
      householdId: household.id,
      defaultDetailLevel: "busy_only",
      selectedSourceCalendarIds: [],
      exportMode: "auto",
      exportContentMode: "both",
      destinationExternalCalendarId: calendars[0].id
    });
    const queueItem = await store.createCalendarImportQueueItem({
      householdId: household.id,
      submittedByUserId: owner.id,
      submittedByName: "Owner",
      proposedType: "commitment",
      detailLevel: "full_details",
      title: "Dentist appointment",
      privacyTitle: "Dentist appointment",
      startsAt: "2026-06-18T14:00:00.000Z",
      endsAt: "2026-06-18T15:00:00.000Z"
    });
    const approved = await store.decideCalendarImportQueueItem(household.id, queueItem.id, owner.id, {
      decision: "approve",
      proposedType: "commitment"
    });

    const response = await auth(app, "owner")
      .post("/api/me/calendar/export")
      .send({ householdId: household.id, cleanlyCalendarEventIds: [approved.createdCleanlyEventId] });

    expect(response.status).toBe(202);
    expect(provider.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      calendarId: "cleanly",
      title: "Dentist appointment"
    }));
    expect(response.body).toEqual(expect.objectContaining({
      status: "exported",
      exported: 1
    }));
  });
});
