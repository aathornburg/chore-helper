import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("household baseline flow", () => {
  it("creates a household, saves baseline facts, and returns expert recommendations", async () => {
    const app = createApp();

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
});
