import type { Recommendation } from "@chore-helper/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type {
  AgentChatContext,
  AgentChatResponse,
  AgentProvider,
  AgentRecommendationContext
} from "../src/agent/AgentProvider.js";
import { createApp } from "../src/app.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";

function createTestApp() {
  return createApp({ store: createInMemoryStore() });
}

class FailingAgentProvider implements AgentProvider {
  async recommendSetupImprovements(
    _context: AgentRecommendationContext
  ): Promise<Recommendation[]> {
    throw new Error("OpenAI request failed");
  }

  async answerHouseholdQuestion(_context: AgentChatContext): Promise<AgentChatResponse> {
    return { answer: "Not used by this test." };
  }
}

class RecordingChatAgentProvider implements AgentProvider {
  receivedContext?: AgentChatContext;

  async recommendSetupImprovements(
    context: AgentRecommendationContext
  ): Promise<Recommendation[]> {
    const firstChore = context.chores[0];

    return [
      {
        id: `chat-context-recommendation-${context.household.id}`,
        householdId: context.household.id,
        affectedChoreId: firstChore?.id,
        title: firstChore ? `Review duration for ${firstChore.title}` : "Review household setup",
        rationale: "Deterministic fixture recommendation for assistant chat context tests.",
        confidence: "high",
        status: "pending"
      }
    ];
  }

  async answerHouseholdQuestion(context: AgentChatContext): Promise<AgentChatResponse> {
    this.receivedContext = context;
    return {
      answer: `Mock answer for ${context.household.name}`,
      relatedRecommendationIds: context.recommendations.map((recommendation) => recommendation.id)
    };
  }
}

class FailingChatAgentProvider implements AgentProvider {
  async recommendSetupImprovements(
    _context: AgentRecommendationContext
  ): Promise<Recommendation[]> {
    return [];
  }

  async answerHouseholdQuestion(_context: AgentChatContext): Promise<AgentChatResponse> {
    throw new Error("Assistant chat failed");
  }
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

  it("stages a recommendation decision without immediately changing chores", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
    const householdId = created.body.id;
    const chore = await request(app)
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
      .send({
        selectedChoreIds: [chore.body.id],
        reviewPrompt: "Review the selected chores."
      })
      .expect(201);
    const recommendation = recommendations.body[0];

    await request(app)
      .put(`/api/households/${householdId}/recommendations/${recommendation.id}/decision`)
      .send({ decision: "accepted" })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            id: recommendation.id,
            affectedChoreId: chore.body.id,
            decision: "accepted"
          })
        );
      });

    await request(app)
      .get(`/api/households/${householdId}/chores`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({
            id: chore.body.id,
            estimatedMinutes: 5
          })
        ]);
      });
  });

  it("applies accepted recommendation decisions in one explicit request", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
    const householdId = created.body.id;
    const chore = await request(app)
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
      .send({ selectedChoreIds: [chore.body.id] })
      .expect(201);
    const recommendation = recommendations.body[0];

    await request(app)
      .put(`/api/households/${householdId}/recommendations/${recommendation.id}/decision`)
      .send({ decision: "accepted" })
      .expect(200);

    await request(app)
      .post(`/api/households/${householdId}/recommendations/apply`)
      .expect(200)
      .expect((response) => {
        expect(response.body.applied).toEqual([
          expect.objectContaining({
            id: recommendation.id,
            decision: "applied"
          })
        ]);
      });

    await request(app)
      .get(`/api/households/${householdId}/chores`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({
            id: chore.body.id,
            estimatedMinutes: 30
          })
        ]);
      });
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

  it("lists active chores across households from the top-level chores route", async () => {
    const app = createTestApp();
    const first = await request(app).post("/api/households").send({ name: "First" }).expect(201);
    const second = await request(app).post("/api/households").send({ name: "Second" }).expect(201);

    const firstChore = await request(app)
      .post(`/api/households/${first.body.id}/chores`)
      .send({ title: "Vacuum", cadence: "weekly", estimatedMinutes: 15, source: "manual" })
      .expect(201);
    const secondChore = await request(app)
      .post(`/api/households/${second.body.id}/chores`)
      .send({ title: "Mop", cadence: "weekly", estimatedMinutes: 20, source: "manual" })
      .expect(201);

    await request(app)
      .get("/api/chores")
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({
            id: firstChore.body.id,
            householdId: first.body.id,
            householdName: "First"
          }),
          expect.objectContaining({
            id: secondChore.body.id,
            householdId: second.body.id,
            householdName: "Second"
          })
        ]);
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

  it("returns a stable 502 when recommendation generation fails", async () => {
    const app = createApp({
      store: createInMemoryStore(),
      agentProvider: new FailingAgentProvider()
    });
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);

    await request(app)
      .post(`/api/households/${created.body.id}/recommendations`)
      .send({ reviewPrompt: "Review these chores." })
      .expect(502)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Could not generate recommendations" });
      });
  });

  it("answers assistant chat questions with household context", async () => {
    const agentProvider = new RecordingChatAgentProvider();
    const app = createApp({
      store: createInMemoryStore(),
      agentProvider
    });
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
    const householdId = created.body.id;

    await request(app)
      .put(`/api/households/${householdId}/baseline`)
      .send({
        homeType: "house",
        rooms: ["kitchen", "bathroom"],
        flooring: ["tile"],
        hasPets: true,
        hasOutdoorSpace: false,
        notes: "One dog."
      })
      .expect(200);

    const chore = await request(app)
      .post(`/api/households/${householdId}/chores`)
      .send({
        title: "Clean bathrooms",
        cadence: "weekly",
        estimatedMinutes: 10,
        source: "manual"
      })
      .expect(201);

    const recommendations = await request(app)
      .post(`/api/households/${householdId}/recommendations`)
      .send({ selectedChoreIds: [chore.body.id] })
      .expect(201);

    await request(app)
      .post(`/api/households/${householdId}/assistant/chat`)
      .send({ message: " Which chores look under-scoped? " })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          answer: "Mock answer for Home",
          relatedRecommendationIds: [recommendations.body[0].id]
        });
      });

    expect(agentProvider.receivedContext).toEqual(
      expect.objectContaining({
        message: "Which chores look under-scoped?",
        household: expect.objectContaining({ id: householdId, name: "Home" }),
        chores: [expect.objectContaining({ id: chore.body.id, title: "Clean bathrooms" })],
        recommendations: [
          expect.objectContaining({
            id: recommendations.body[0].id,
            householdId,
            affectedChoreId: chore.body.id,
            title: "Review duration for Clean bathrooms",
            status: "pending"
          })
        ]
      })
    );
  });

  it("returns 400 for empty assistant chat messages", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);

    await request(app)
      .post(`/api/households/${created.body.id}/assistant/chat`)
      .send({ message: "   " })
      .expect(400)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Invalid assistant chat payload" });
      });
  });

  it("returns 404 for assistant chat on an unknown household", async () => {
    const app = createTestApp();

    await request(app)
      .post("/api/households/missing-household/assistant/chat")
      .send({ message: "What should I optimize?" })
      .expect(404)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Household not found" });
      });
  });

  it("returns a stable 502 when assistant chat generation fails", async () => {
    const app = createApp({
      store: createInMemoryStore(),
      agentProvider: new FailingChatAgentProvider()
    });
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);

    await request(app)
      .post(`/api/households/${created.body.id}/assistant/chat`)
      .send({ message: "What should I optimize?" })
      .expect(502)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Could not answer assistant question" });
      });
  });
});
