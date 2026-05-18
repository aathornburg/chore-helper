import type { Recommendation } from "@chore-helper/shared";
import type { AgentProvider, AgentRecommendationContext } from "./AgentProvider.js";

export class MockChoreAgentProvider implements AgentProvider {
  async recommendSetupImprovements({
    household,
    chores
  }: AgentRecommendationContext): Promise<Recommendation[]> {
    const baseline = household.baseline;
    const recommendations: Recommendation[] = [];

    if (baseline?.hasPets) {
      recommendations.push({
        id: crypto.randomUUID(),
        householdId: household.id,
        title: "Add a recurring pet hair floor reset",
        rationale:
          "Pets usually increase floor and upholstery maintenance. A short recurring reset can prevent pet hair from becoming a larger weekend chore.",
        confidence: "medium",
        status: "pending"
      });
    }

    if (baseline?.hasOutdoorSpace) {
      recommendations.push({
        id: crypto.randomUUID(),
        householdId: household.id,
        title: "Add seasonal outdoor maintenance reminders",
        rationale:
          "Outdoor spaces often need lower-frequency chores that are easy to forget because they do not show up in weekly cleaning routines.",
        confidence: "high",
        status: "pending"
      });
    }

    for (const chore of chores) {
      const looksLikeBathroomCleaning = chore.title.toLowerCase().includes("bathroom");
      const looksUnderScoped = looksLikeBathroomCleaning && chore.estimatedMinutes < 15;

      if (looksUnderScoped) {
        recommendations.push({
          id: crypto.randomUUID(),
          householdId: household.id,
          title: `Review duration for ${chore.title}`,
          rationale:
            "Bathroom cleaning usually includes several surfaces and reset steps. A very short estimate may cause the chore to be rushed or repeatedly deferred.",
          confidence: "high",
          status: "pending"
        });
      }
    }

    return recommendations;
  }
}
