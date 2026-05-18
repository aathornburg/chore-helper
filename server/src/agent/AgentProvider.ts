import type { Chore, Household, Recommendation } from "@chore-helper/shared";

export type AgentRecommendationContext = {
  household: Household;
  chores: Chore[];
};

export type AgentProvider = {
  recommendSetupImprovements(context: AgentRecommendationContext): Promise<Recommendation[]>;
};
