import type { Household, Recommendation } from "@chore-helper/shared";
import type { AgentProvider } from "./AgentProvider.js";

export class MockChoreAgentProvider implements AgentProvider {
  async recommendSetupImprovements(household: Household): Promise<Recommendation[]> {
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

    return recommendations;
  }
}
