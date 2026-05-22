import type { Recommendation } from "@chore-helper/shared";
import type { AgentProvider, AgentRecommendationContext } from "./AgentProvider.js";

export const DEFAULT_OPENAI_AGENT_MODEL = "gpt-5.5";

export class OpenAiChoreAgentProvider implements AgentProvider {
  constructor(private readonly model = DEFAULT_OPENAI_AGENT_MODEL) {}

  async recommendSetupImprovements(
    _context: AgentRecommendationContext
  ): Promise<Recommendation[]> {
    throw new Error(
      `OpenAiChoreAgentProvider is configured for ${this.model}, but its runner has not been implemented.`
    );
  }
}
