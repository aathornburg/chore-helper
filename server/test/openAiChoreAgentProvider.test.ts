import { describe, expect, it } from "vitest";
import type { AgentChatContext, AgentRecommendationContext } from "../src/agent/AgentProvider.js";
import { OpenAiChoreAgentProvider } from "../src/agent/OpenAiChoreAgentProvider.js";

function createContext(): AgentRecommendationContext {
  return {
    household: {
      id: "household-1",
      name: "Home",
      timeZone: "America/New_York",
      profile: {
        homeType: "house",
        hasPets: true,
        hasOutdoorSpace: false,
        notes: "Two adults and one dog."
      }
    },
    chores: [
      {
        id: "chore-1",
        householdId: "household-1",
        title: "Clean bathrooms",
        source: "manual",
        instructions: "Sink, toilet, mirror and floor."
      }
    ],
    reviewPrompt: "Focus on duration and cadence."
  };
}

function createChatContext(): AgentChatContext {
  return {
    household: {
      id: "household-1",
      name: "Home",
      timeZone: "America/New_York",
      profile: {
        homeType: "house",
        hasPets: true,
        hasOutdoorSpace: false,
        notes: "Two adults and one dog."
      }
    },
    chores: [
      {
        id: "chore-1",
        householdId: "household-1",
        title: "Clean bathrooms",
        source: "manual",
        instructions: "Sink, toilet, mirror and floor."
      },
      {
        id: "chore-2",
        householdId: "household-1",
        title: "Reset kitchen",
        source: "manual",
        instructions: "Counters and sink."
      }
    ],
    recommendations: [
      {
        id: "recommendation-1",
        householdId: "household-1",
        affectedChoreId: "chore-1",
        title: "Review duration for Clean bathrooms",
        rationale: "The scope may need more time.",
        confidence: "high",
        status: "pending",
        decision: "pending"
      }
    ],
    message: "Which chores look under-scoped?"
  };
}

describe("OpenAiChoreAgentProvider", () => {
  it("maps structured agent output into app recommendations", async () => {
    const provider = new OpenAiChoreAgentProvider("gpt-test", async (input) => {
      expect(input.model).toBe("gpt-test");
      expect(input.prompt).toContain("Home");
      expect(input.prompt).toContain("Clean bathrooms");
      expect(input.prompt).toContain("Focus on duration and cadence.");
      expect(input.prompt).not.toContain("cadence=");
      expect(input.prompt).not.toContain("estimatedMinutes=");

      return {
        recommendations: [
          {
            title: "Review duration for Clean bathrooms",
            rationale: "Ten minutes may be too short for a full bathroom reset.",
            confidence: "high",
            affectedChoreTitle: "Clean bathrooms",
            proposedCadence: "weekly",
            proposedEstimatedMinutes: 25
          }
        ]
      };
    });

    const recommendations = await provider.recommendSetupImprovements(createContext());

    expect(recommendations).toEqual([
      expect.objectContaining({
        householdId: "household-1",
        affectedChoreId: "chore-1",
        title: "Review duration for Clean bathrooms",
        rationale: "Ten minutes may be too short for a full bathroom reset.",
        confidence: "high",
        status: "pending",
        decision: "pending",
        proposedCadence: "weekly",
        proposedEstimatedMinutes: 25
      })
    ]);
    expect(recommendations[0]?.id).toEqual(expect.any(String));
  });

  it("allows an empty recommendation list", async () => {
    const provider = new OpenAiChoreAgentProvider("gpt-test", async () => ({
      recommendations: []
    }));

    await expect(provider.recommendSetupImprovements(createContext())).resolves.toEqual([]);
  });

  it("rejects malformed structured output", async () => {
    const provider = new OpenAiChoreAgentProvider("gpt-test", async () => ({
      recommendations: [
        {
          title: "Missing confidence",
          rationale: "This object does not match the schema."
        }
      ]
    }));

    await expect(provider.recommendSetupImprovements(createContext())).rejects.toThrow();
  });

  it("retains a recommendation while discarding a zero-minute optional proposal", async () => {
    const provider = new OpenAiChoreAgentProvider("gpt-test", async () => ({
      recommendations: [
        {
          title: "Keep the existing care routine",
          rationale: "Daily pet care already matches the stated household need.",
          confidence: "medium",
          affectedChoreTitle: "Clean bathrooms",
          proposedEstimatedMinutes: 0
        }
      ]
    }));

    await expect(provider.recommendSetupImprovements(createContext())).resolves.toEqual([
      expect.objectContaining({
        title: "Keep the existing care routine",
        proposedEstimatedMinutes: undefined
      })
    ]);
  });

  it("answers chat questions with OpenAI structured output and context", async () => {
    const provider = new OpenAiChoreAgentProvider("gpt-test", async (input) => {
      expect(input.model).toBe("gpt-test");
      expect(input.prompt).toContain("Which chores look under-scoped?");
      expect(input.prompt).toContain("Clean bathrooms");
      expect(input.prompt).toContain("Reset kitchen");
      expect(input.prompt).toContain("Review duration for Clean bathrooms");

      return {
        answer: "Clean bathrooms looks under-scoped because the instructions include multiple surfaces.",
        relatedRecommendationIds: ["recommendation-1", "missing-recommendation"]
      };
    });

    await expect(provider.answerHouseholdQuestion(createChatContext())).resolves.toEqual({
      answer: "Clean bathrooms looks under-scoped because the instructions include multiple surfaces.",
      relatedRecommendationIds: ["recommendation-1"]
    });
  });

  it("rejects malformed chat output", async () => {
    const provider = new OpenAiChoreAgentProvider("gpt-test", async () => ({
      relatedRecommendationIds: ["recommendation-1"]
    }));

    await expect(provider.answerHouseholdQuestion(createChatContext())).rejects.toThrow();
  });
});
