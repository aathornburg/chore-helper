/*
  This class is a stand-in service implementation, similar to a Spring
  `@Service` bean that contains business rules. It uses the shared
  recommendation contract while remaining replaceable by a real AI-backed
  implementation in the future.
*/
import type { Recommendation } from "@chore-helper/shared";
import type {
  AgentChatContext,
  AgentChatResponse,
  AgentProvider,
  AgentRecommendationContext
} from "./AgentProvider.js";

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

  async answerHouseholdQuestion({
    household,
    chores,
    recommendations,
    message
  }: AgentChatContext): Promise<AgentChatResponse> {
    const pendingRecommendations = recommendations.filter(
      (recommendation) =>
        recommendation.status === "pending" && (recommendation.decision ?? "pending") === "pending"
    );
    const underScopedChore = chores.find((chore) => chore.estimatedMinutes < 15);
    const baselineNotes = [
      household.baseline?.homeType ? `home type: ${household.baseline.homeType}` : undefined,
      household.baseline?.rooms.length
        ? `rooms: ${household.baseline.rooms.join(", ")}`
        : undefined,
      household.baseline?.hasPets ? "pets are present" : undefined,
      household.baseline?.hasOutdoorSpace ? "outdoor space is present" : undefined
    ].filter(Boolean);
    const baselineSummary =
      baselineNotes.length > 0
        ? ` Household context includes ${baselineNotes.join("; ")}.`
        : " Household baseline details are not set yet.";
    const recommendationSummary =
      pendingRecommendations.length > 0
        ? ` There ${pendingRecommendations.length === 1 ? "is" : "are"} ${pendingRecommendations.length} pending recommendation${pendingRecommendations.length === 1 ? "" : "s"} to consider: ${pendingRecommendations.map((recommendation) => recommendation.title).join("; ")}.`
        : " There are no pending recommendations right now.";

    if (chores.length === 0) {
      return {
        answer: `For "${message}", there are no active chores to review yet.${baselineSummary}${recommendationSummary}`,
        ...(pendingRecommendations.length > 0
          ? { relatedRecommendationIds: pendingRecommendations.map((recommendation) => recommendation.id) }
          : {})
      };
    }

    const choreSummary = chores
      .map((chore) => `${chore.title} (${chore.cadence}, ${chore.estimatedMinutes} min)`)
      .join("; ");
    const focus = underScopedChore
      ? ` Start with ${underScopedChore.title}; its ${underScopedChore.estimatedMinutes}-minute estimate may be under-scoped.`
      : ` Active chores in scope are ${choreSummary}.`;

    return {
      answer: `For "${message}", review ${chores.length} active chore${chores.length === 1 ? "" : "s"}.${focus}${baselineSummary}${recommendationSummary}`,
      ...(pendingRecommendations.length > 0
        ? { relatedRecommendationIds: pendingRecommendations.map((recommendation) => recommendation.id) }
        : {})
    };
  }
}
