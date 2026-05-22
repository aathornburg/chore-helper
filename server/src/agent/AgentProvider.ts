/*
  This interface is like a Spring service contract. In a Spring Boot app,
  this would be an interface that multiple `@Service` implementations can
  satisfy, allowing the controller layer to remain decoupled from the
  actual recommendation engine.
*/
import type { Chore, Household, Recommendation } from "@chore-helper/shared";

export type AgentRecommendationContext = {
  household: Household;
  chores: Chore[];
  reviewPrompt?: string;
};

export type AgentChatContext = {
  household: Household;
  chores: Chore[];
  recommendations: Recommendation[];
  message: string;
};

export type AgentChatResponse = {
  answer: string;
  relatedRecommendationIds?: string[];
};

export type AgentProvider = {
  recommendSetupImprovements(context: AgentRecommendationContext): Promise<Recommendation[]>;
  answerHouseholdQuestion(context: AgentChatContext): Promise<AgentChatResponse>;
};
