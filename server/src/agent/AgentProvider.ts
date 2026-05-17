import type { Household, Recommendation } from "@chore-helper/shared";

export type AgentProvider = {
  recommendSetupImprovements(household: Household): Promise<Recommendation[]>;
};
