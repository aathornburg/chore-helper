import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";

function auth(email: string) {
  return { Authorization: `Bearer ${email}` };
}

function createMemberTestApp() {
  const links: string[] = [];
  const app = createApp({
    store: createInMemoryStore(),
    authMode: "test",
    invitationBaseUrl: "http://localhost:5173",
    invitationMailer: {
      async sendInvitation(message) {
        links.push(message.acceptUrl);
      }
    }
  });

  return { app, links };
}

async function createHousehold(app: ReturnType<typeof createApp>) {
  const response = await request(app)
    .post("/api/households")
    .set(auth("owner@example.com"))
    .send({ name: "Home" })
    .expect(201);

  return response.body as { id: string };
}

async function joinMember(
  app: ReturnType<typeof createApp>,
  householdId: string,
  links: string[],
  email: string
) {
  await request(app)
    .post(`/api/households/${householdId}/invitations`)
    .set(auth("owner@example.com"))
    .send({ email })
    .expect(201);

  const token = links.at(-1)!.split("/").at(-1)!;
  await request(app)
    .post(`/api/invitations/${token}/accept`)
    .set(auth(email))
    .expect(200);

  const members = await request(app)
    .get(`/api/households/${householdId}/members`)
    .set(auth("owner@example.com"))
    .expect(200);

  return members.body.find((member: { primaryEmail?: string }) => member.primaryEmail === email) as {
    userId: string;
    role: "owner" | "member";
  };
}

describe("household member administration", () => {
  it("lets an owner promote an accepted member to owner", async () => {
    const { app, links } = createMemberTestApp();
    const household = await createHousehold(app);
    const member = await joinMember(app, household.id, links, "member@example.com");

    await request(app)
      .put(`/api/households/${household.id}/members/${member.userId}/role`)
      .set(auth("owner@example.com"))
      .send({ role: "owner" })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({ userId: member.userId, role: "owner" }));
      });
  });

  it("does not let an ordinary member change roles or remove another member", async () => {
    const { app, links } = createMemberTestApp();
    const household = await createHousehold(app);
    const member = await joinMember(app, household.id, links, "member@example.com");

    await request(app)
      .put(`/api/households/${household.id}/members/${member.userId}/role`)
      .set(auth("member@example.com"))
      .send({ role: "owner" })
      .expect(403);

    await request(app)
      .delete(`/api/households/${household.id}/members/${member.userId}`)
      .set(auth("member@example.com"))
      .expect(403);
  });

  it("lets an owner remove a member from the household", async () => {
    const { app, links } = createMemberTestApp();
    const household = await createHousehold(app);
    const member = await joinMember(app, household.id, links, "member@example.com");

    await request(app)
      .delete(`/api/households/${household.id}/members/${member.userId}`)
      .set(auth("owner@example.com"))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({ userId: member.userId, role: "member" }));
      });

    await request(app)
      .get(`/api/households/${household.id}/members`)
      .set(auth("member@example.com"))
      .expect(404);
  });

  it("rejects deleting the final owner", async () => {
    const { app } = createMemberTestApp();
    const household = await createHousehold(app);
    const members = await request(app)
      .get(`/api/households/${household.id}/members`)
      .set(auth("owner@example.com"))
      .expect(200);

    await request(app)
      .delete(`/api/households/${household.id}/members/${members.body[0].userId}`)
      .set(auth("owner@example.com"))
      .expect(409)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Household must keep at least one owner" });
      });
  });

  it("rejects demoting the final owner", async () => {
    const { app } = createMemberTestApp();
    const household = await createHousehold(app);
    const members = await request(app)
      .get(`/api/households/${household.id}/members`)
      .set(auth("owner@example.com"))
      .expect(200);

    await request(app)
      .put(`/api/households/${household.id}/members/${members.body[0].userId}/role`)
      .set(auth("owner@example.com"))
      .send({ role: "member" })
      .expect(409)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Household must keep at least one owner" });
      });
  });

  it("returns not found when an owner manages a user outside the household", async () => {
    const { app } = createMemberTestApp();
    const household = await createHousehold(app);

    await request(app)
      .put(`/api/households/${household.id}/members/missing-user/role`)
      .set(auth("owner@example.com"))
      .send({ role: "member" })
      .expect(404);

    await request(app)
      .delete(`/api/households/${household.id}/members/missing-user`)
      .set(auth("owner@example.com"))
      .expect(404);
  });
});
