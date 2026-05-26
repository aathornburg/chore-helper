import { describe, expect, it } from "vitest";
import type { AgentRecommendationContext } from "../src/agent/AgentProvider.js";
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
});
