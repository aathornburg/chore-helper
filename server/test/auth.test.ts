import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";

function auth(userId: string) {
  return { Authorization: `Bearer ${userId}` };
}

describe("auth ownership", () => {
  it("creates the app user on first authenticated /api/me request", async () => {
    const app = createApp({ store: createInMemoryStore(), authMode: "test" });

    const response = await request(app)
      .get("/api/me")
      .set(auth("test-user-a"))
      .expect(200);

    expect(response.body.clerkUserId).toBe("test-user-a");
    expect(response.body.id).toBeTruthy();
  });

  it("rejects unauthenticated /api/me requests", async () => {
    const app = createApp({ store: createInMemoryStore(), authMode: "test" });

    await request(app)
      .get("/api/me")
      .expect(401)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Authentication required" });
      });
  });

  it("creates an owner membership when the user creates a household", async () => {
    const app = createApp({ store: createInMemoryStore(), authMode: "test" });

    const created = await request(app)
      .post("/api/households")
      .set(auth("test-user-a"))
      .send({ name: "Home" })
      .expect(201);

    const households = await request(app)
      .get("/api/households")
      .set(auth("test-user-a"))
      .expect(200);

    expect(households.body).toHaveLength(1);
    expect(households.body[0].id).toBe(created.body.id);
  });

  it("creates households with the default scheduling time zone", async () => {
    const app = createApp({ store: createInMemoryStore(), authMode: "test" });

    const created = await request(app)
      .post("/api/households")
      .set(auth("test-user-a"))
      .send({ name: "Home" })
      .expect(201);

    expect(created.body.timeZone).toBe("America/New_York");
  });

  it("allows a household owner to update the scheduling time zone", async () => {
    const app = createApp({ store: createInMemoryStore(), authMode: "test" });

    const created = await request(app)
      .post("/api/households")
      .set(auth("test-user-a"))
      .send({ name: "Home" })
      .expect(201);

    const updated = await request(app)
      .put(`/api/households/${created.body.id}/settings`)
      .set(auth("test-user-a"))
      .send({ timeZone: "America/Chicago" })
      .expect(200);

    expect(updated.body.timeZone).toBe("America/Chicago");
  });

  it("rejects invalid household time zones", async () => {
    const app = createApp({ store: createInMemoryStore(), authMode: "test" });

    const created = await request(app)
      .post("/api/households")
      .set(auth("test-user-a"))
      .send({ name: "Home" })
      .expect(201);

    await request(app)
      .put(`/api/households/${created.body.id}/settings`)
      .set(auth("test-user-a"))
      .send({ timeZone: "Middle/Earth" })
      .expect(400)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Invalid household settings payload" });
      });
  });

  it("lists the creating owner as the first household member", async () => {
    const app = createApp({ store: createInMemoryStore(), authMode: "test" });

    const created = await request(app)
      .post("/api/households")
      .set(auth("test-user-a"))
      .send({ name: "Home" })
      .expect(201);

    const members = await request(app)
      .get(`/api/households/${created.body.id}/members`)
      .set(auth("test-user-a"))
      .expect(200);

    expect(members.body).toEqual([
      expect.objectContaining({
        householdId: created.body.id,
        clerkUserId: "test-user-a",
        role: "owner"
      })
    ]);
  });

  it("lists only households owned by the authenticated user", async () => {
    const app = createApp({ store: createInMemoryStore(), authMode: "test" });

    const first = await request(app)
      .post("/api/households")
      .set(auth("test-user-a"))
      .send({ name: "First" })
      .expect(201);
    await request(app)
      .post("/api/households")
      .set(auth("test-user-b"))
      .send({ name: "Second" })
      .expect(201);

    const response = await request(app)
      .get("/api/me/households")
      .set(auth("test-user-a"))
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: first.body.id,
        name: "First"
      })
    ]);
  });
});
