import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";

function auth(email: string) {
  return { Authorization: `Bearer ${email}` };
}

function createInvitationTestApp() {
  const messages: Array<{
    to: string;
    householdName: string;
    acceptUrl: string;
    idempotencyKey: string;
  }> = [];
  const app = createApp({
    store: createInMemoryStore(),
    authMode: "test",
    invitationBaseUrl: "http://localhost:5173",
    invitationMailer: {
      async sendInvitation(message) {
        messages.push(message);
      }
    }
  });

  return { app, messages };
}

async function createHousehold(app: ReturnType<typeof createApp>) {
  const response = await request(app)
    .post("/api/households")
    .set(auth("owner@example.com"))
    .send({ name: "Home" })
    .expect(201);

  return response.body as { id: string };
}

function invitationToken(acceptUrl: string) {
  return acceptUrl.split("/").at(-1)!;
}

describe("household invitations", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends an owner-created invitation and lets the matching recipient join", async () => {
    const { app, messages } = createInvitationTestApp();
    const household = await createHousehold(app);

    const invitation = await request(app)
      .post(`/api/households/${household.id}/invitations`)
      .set(auth("owner@example.com"))
      .send({ email: "member@example.com" })
      .expect(201);

    expect(invitation.body).toEqual(
      expect.objectContaining({
        householdId: household.id,
        recipientEmail: "member@example.com",
        role: "member",
        status: "pending"
      })
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(
      expect.objectContaining({
        to: "member@example.com",
        householdName: "Home",
        idempotencyKey: invitation.body.id
      })
    );

    await request(app)
      .post(`/api/invitations/${invitationToken(messages[0].acceptUrl)}/accept`)
      .set(auth("member@example.com"))
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe("accepted");
      });

    await request(app)
      .get(`/api/households/${household.id}/members`)
      .set(auth("member@example.com"))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ primaryEmail: "owner@example.com", role: "owner" }),
            expect.objectContaining({ primaryEmail: "member@example.com", role: "member" })
          ])
        );
      });
  });

  it("does not let a different signed-in recipient accept an email invitation", async () => {
    const { app, messages } = createInvitationTestApp();
    const household = await createHousehold(app);

    await request(app)
      .post(`/api/households/${household.id}/invitations`)
      .set(auth("owner@example.com"))
      .send({ email: "member@example.com" })
      .expect(201);

    await request(app)
      .post(`/api/invitations/${invitationToken(messages[0].acceptUrl)}/accept`)
      .set(auth("somebody-else@example.com"))
      .expect(403)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Invitation belongs to another recipient" });
      });
  });

  it("prevents a member from using an accepted invitation more than once", async () => {
    const { app, messages } = createInvitationTestApp();
    const household = await createHousehold(app);

    await request(app)
      .post(`/api/households/${household.id}/invitations`)
      .set(auth("owner@example.com"))
      .send({ email: "member@example.com" })
      .expect(201);

    const token = invitationToken(messages[0].acceptUrl);
    await request(app)
      .post(`/api/invitations/${token}/accept`)
      .set(auth("member@example.com"))
      .expect(200);

    await request(app)
      .post(`/api/invitations/${token}/accept`)
      .set(auth("member@example.com"))
      .expect(409)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Invitation is no longer pending" });
      });
  });

  it("lets an owner cancel a pending invitation before it is accepted", async () => {
    const { app, messages } = createInvitationTestApp();
    const household = await createHousehold(app);

    const invitation = await request(app)
      .post(`/api/households/${household.id}/invitations`)
      .set(auth("owner@example.com"))
      .send({ email: "member@example.com" })
      .expect(201);

    await request(app)
      .post(`/api/households/${household.id}/invitations/${invitation.body.id}/cancel`)
      .set(auth("owner@example.com"))
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe("cancelled");
      });

    await request(app)
      .post(`/api/invitations/${invitationToken(messages[0].acceptUrl)}/accept`)
      .set(auth("member@example.com"))
      .expect(409);
  });

  it("does not let an ordinary member invite another member", async () => {
    const { app, messages } = createInvitationTestApp();
    const household = await createHousehold(app);

    await request(app)
      .post(`/api/households/${household.id}/invitations`)
      .set(auth("owner@example.com"))
      .send({ email: "member@example.com" })
      .expect(201);
    await request(app)
      .post(`/api/invitations/${invitationToken(messages[0].acceptUrl)}/accept`)
      .set(auth("member@example.com"))
      .expect(200);

    await request(app)
      .post(`/api/households/${household.id}/invitations`)
      .set(auth("member@example.com"))
      .send({ email: "friend@example.com" })
      .expect(403)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Household owner access required" });
      });
  });

  it("cancels an invitation when its email cannot be sent", async () => {
    const app = createApp({
      store: createInMemoryStore(),
      authMode: "test",
      invitationBaseUrl: "http://localhost:5173",
      invitationMailer: {
        async sendInvitation() {
          throw new Error("Mail delivery unavailable");
        }
      }
    });
    const household = await createHousehold(app);

    await request(app)
      .post(`/api/households/${household.id}/invitations`)
      .set(auth("owner@example.com"))
      .send({ email: "member@example.com" })
      .expect(502);

    await request(app)
      .get(`/api/households/${household.id}/invitations`)
      .set(auth("owner@example.com"))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({
            recipientEmail: "member@example.com",
            status: "cancelled"
          })
        ]);
      });
  });

  it("marks an elapsed invitation expired and refuses acceptance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T12:00:00.000Z"));
    const { app, messages } = createInvitationTestApp();
    const household = await createHousehold(app);

    await request(app)
      .post(`/api/households/${household.id}/invitations`)
      .set(auth("owner@example.com"))
      .send({ email: "member@example.com" })
      .expect(201);

    vi.setSystemTime(new Date("2026-06-02T12:00:00.000Z"));

    await request(app)
      .get(`/api/households/${household.id}/invitations`)
      .set(auth("owner@example.com"))
      .expect(200)
      .expect((response) => {
        expect(response.body[0].status).toBe("expired");
      });

    await request(app)
      .post(`/api/invitations/${invitationToken(messages[0].acceptUrl)}/accept`)
      .set(auth("member@example.com"))
      .expect(410);
  });

  it("prints a usable invitation link during local development without email configuration", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("INVITATION_FROM_EMAIL", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const app = createApp({
      store: createInMemoryStore(),
      authMode: "test",
      invitationBaseUrl: "http://localhost:5173"
    });
    const household = await createHousehold(app);

    await request(app)
      .post(`/api/households/${household.id}/invitations`)
      .set(auth("owner@example.com"))
      .send({ email: "member@example.com" })
      .expect(201);

    expect(info).toHaveBeenCalledWith(expect.stringContaining("http://localhost:5173/accept-invitation/"));
  });
});
