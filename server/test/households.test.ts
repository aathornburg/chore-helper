import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";

function createTestApp() {
  return createApp({ store: createInMemoryStore() });
}

describe("household baseline flow", () => {
  it("creates a household, saves baseline facts, and returns expert recommendations", async () => {
    const app = createTestApp();

    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);

    const householdId = created.body.id;

    await request(app)
      .put(`/api/households/${householdId}/baseline`)
      .send({
        homeType: "house",
        rooms: ["kitchen", "bathroom"],
        flooring: ["hardwood", "tile"],
        hasPets: true,
        hasOutdoorSpace: true,
        notes: "We already have recurring chores in Google Calendar."
      })
      .expect(200);

    const recommendations = await request(app)
      .post(`/api/households/${householdId}/recommendations`)
      .expect(201);

    expect(recommendations.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Add a recurring pet hair floor reset",
          confidence: "medium",
          status: "pending"
        })
      ])
    );
  });

  it("flags existing chores that look under-scoped for their ask", async () => {
    const app = createTestApp();

    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);

    const householdId = created.body.id;

    await request(app)
      .post(`/api/households/${householdId}/chores`)
      .send({
        title: "Clean bathrooms",
        cadence: "weekly",
        estimatedMinutes: 5,
        source: "manual"
      })
      .expect(201);

    const recommendations = await request(app)
      .post(`/api/households/${householdId}/recommendations`)
      .send({ reviewPrompt: "Review my existing setup and focus on under-scoped chores." })
      .expect(201);

    expect(recommendations.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Review duration for Clean bathrooms",
          confidence: "high",
          status: "pending"
        })
      ])
    );
  });

  it("fetches a saved household with its baseline for frontend restore", async () => {
    const app = createTestApp();

    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);

    await request(app)
      .put(`/api/households/${created.body.id}/baseline`)
      .send({
        homeType: "house",
        rooms: ["kitchen", "bathrooms", "bedrooms"],
        flooring: ["hardwood", "tile", "carpet"],
        hasPets: true,
        hasOutdoorSpace: true,
        notes: "Setup survives refresh."
      })
      .expect(200);

    const fetched = await request(app)
      .get(`/api/households/${created.body.id}`)
      .expect(200);

    expect(fetched.body).toEqual({
      id: created.body.id,
      name: "Home",
      baseline: {
        homeType: "house",
        rooms: ["kitchen", "bathrooms", "bedrooms"],
        flooring: ["hardwood", "tile", "carpet"],
        hasPets: true,
        hasOutdoorSpace: true,
        notes: "Setup survives refresh."
      }
    });
  });

  it("fetches saved recommendations for a household", async () => {
    const app = createTestApp();

    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);

    await request(app)
      .put(`/api/households/${created.body.id}/baseline`)
      .send({
        homeType: "house",
        rooms: ["living room"],
        flooring: ["carpet"],
        hasPets: true,
        hasOutdoorSpace: false
      })
      .expect(200);

    await request(app)
      .post(`/api/households/${created.body.id}/recommendations`)
      .expect(201);

    const fetched = await request(app)
      .get(`/api/households/${created.body.id}/recommendations`)
      .expect(200);

    expect(fetched.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          householdId: created.body.id,
          status: "pending"
        })
      ])
    );
  });

  it("updates, archives, lists archived, and restores household chores", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
    const householdId = created.body.id;
    const chore = await request(app)
      .post(`/api/households/${householdId}/chores`)
      .send({ title: "Clean bathrooms", cadence: "weekly", estimatedMinutes: 20, source: "manual" })
      .expect(201);

    await request(app)
      .post(`/api/households/${householdId}/recommendations`)
      .send({ reviewPrompt: "Review existing chores." })
      .expect(201);

    await request(app)
      .put(`/api/households/${householdId}/chores/${chore.body.id}`)
      .send({ title: "Clean main bathroom", cadence: "biweekly", estimatedMinutes: 30, source: "manual" })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({ title: "Clean main bathroom" }));
      });

    await request(app)
      .get(`/api/households/${householdId}/recommendations`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([]);
      });

    await request(app)
      .post(`/api/households/${householdId}/chores/${chore.body.id}/archive`)
      .expect(200)
      .expect((response) => {
        expect(response.body.archivedAt).toEqual(expect.any(String));
      });

    await request(app)
      .get(`/api/households/${householdId}/chores`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([]);
      });

    await request(app)
      .get(`/api/households/${householdId}/chores?status=archived`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([expect.objectContaining({ id: chore.body.id })]);
      });

    await request(app)
      .post(`/api/households/${householdId}/chores/${chore.body.id}/restore`)
      .expect(200)
      .expect((response) => {
        expect(response.body.archivedAt).toBeUndefined();
      });
  });

  it("returns 404 when updating a chore through the wrong household", async () => {
    const app = createTestApp();
    const first = await request(app).post("/api/households").send({ name: "First" }).expect(201);
    const second = await request(app).post("/api/households").send({ name: "Second" }).expect(201);
    const chore = await request(app)
      .post(`/api/households/${first.body.id}/chores`)
      .send({ title: "Vacuum", cadence: "weekly", estimatedMinutes: 15, source: "manual" })
      .expect(201);

    await request(app)
      .put(`/api/households/${second.body.id}/chores/${chore.body.id}`)
      .send({ title: "Vacuum", cadence: "weekly", estimatedMinutes: 20, source: "manual" })
      .expect(404);
  });
});
