import type { Recommendation } from "@chore-helper/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type {
  AgentChatContext,
  AgentChatResponse,
  AgentProvider,
  AgentRecommendationContext
} from "../src/agent/AgentProvider.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";
import { createApp } from "../src/app.js";

class RecordingAgentProvider implements AgentProvider {
  receivedContext?: AgentRecommendationContext;

  async recommendSetupImprovements(
    context: AgentRecommendationContext
  ): Promise<Recommendation[]> {
    this.receivedContext = context;
    return [];
  }

  async answerHouseholdQuestion(_context: AgentChatContext): Promise<AgentChatResponse> {
    return { answer: "Not used by this test." };
  }
}

describe("recommendation prompt context", () => {
  it("passes reviewPrompt into the agent provider context", async () => {
    const agentProvider = new RecordingAgentProvider();
    const app = createApp({
      store: createInMemoryStore(),
      agentProvider
    });

    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);

    await request(app)
      .post(`/api/households/${created.body.id}/recommendations`)
      .send({ reviewPrompt: "Please focus on cadence and duration." })
      .expect(201);

    expect(agentProvider.receivedContext?.reviewPrompt).toBe(
      "Please focus on cadence and duration."
    );
  });
});
