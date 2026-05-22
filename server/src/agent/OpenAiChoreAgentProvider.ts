import { Agent, run } from "@openai/agents";
import type { Chore, Recommendation } from "@chore-helper/shared";
import { z } from "zod";
import type {
  AgentChatContext,
  AgentChatResponse,
  AgentProvider,
  AgentRecommendationContext
} from "./AgentProvider.js";

export const DEFAULT_OPENAI_AGENT_MODEL = "gpt-5.5";

const choreAgentRecommendationSchema = z.object({
  title: z.string().min(1),
  rationale: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  affectedChoreTitle: z.string().min(1).optional(),
  proposedCadence: z.string().min(1).optional(),
  proposedEstimatedMinutes: z.number().int().positive().optional()
});

const choreAgentOutputSchema = z.object({
  recommendations: z.array(choreAgentRecommendationSchema)
});

export type ChoreAgentRunInput = {
  model: string;
  instructions: string;
  prompt: string;
};

type ChoreAgentOutput = z.infer<typeof choreAgentOutputSchema>;

type ChoreAgentRunner = (input: ChoreAgentRunInput) => Promise<unknown>;

const choreReviewInstructions = [
  "You are a household chore review assistant.",
  "Recommend practical improvements to household chores.",
  "Focus on cadence, duration, missing recurring work, and chore scope.",
  "Prefer recommendations tied to selected chores when selected chores are provided.",
  "Include concise rationale and confidence as low, medium, or high.",
  "Do not invent household facts that are not present in the provided context.",
  "Do not recommend automatic calendar edits or automatic chore changes.",
  "Every recommendation is only a suggestion and requires manual user approval."
].join(" ");

async function runOpenAiChoreAgent({
  model,
  instructions,
  prompt
}: ChoreAgentRunInput): Promise<unknown> {
  const agent = new Agent({
    name: "Chore review assistant",
    instructions,
    model,
    outputType: choreAgentOutputSchema
  });
  const result = await run(agent, prompt);

  return result.finalOutput;
}

function formatChores(chores: Chore[]) {
  if (chores.length === 0) {
    return "No selected chores.";
  }

  return chores
    .map(
      (chore) =>
        `- ${chore.title}: cadence=${chore.cadence}, estimatedMinutes=${chore.estimatedMinutes}, source=${chore.source}`
    )
    .join("\n");
}

function formatPrompt({ household, chores, reviewPrompt }: AgentRecommendationContext) {
  return [
    `Household: ${household.name}`,
    `Baseline: ${JSON.stringify(household.baseline ?? null)}`,
    "Selected chores:",
    formatChores(chores),
    `User review prompt: ${reviewPrompt?.trim() || "Review the selected chores for practical improvements."}`,
    "Return only structured recommendations that match the requested schema."
  ].join("\n\n");
}

function findAffectedChoreId(affectedChoreTitle: string | undefined, chores: Chore[]) {
  if (!affectedChoreTitle) return undefined;

  const normalizedTitle = affectedChoreTitle.trim().toLowerCase();
  return chores.find((chore) => chore.title.trim().toLowerCase() === normalizedTitle)?.id;
}

function mapOutputToRecommendations(
  output: ChoreAgentOutput,
  context: AgentRecommendationContext
): Recommendation[] {
  return output.recommendations.map((recommendation) => ({
    id: crypto.randomUUID(),
    householdId: context.household.id,
    affectedChoreId: findAffectedChoreId(recommendation.affectedChoreTitle, context.chores),
    title: recommendation.title,
    rationale: recommendation.rationale,
    confidence: recommendation.confidence,
    status: "pending",
    decision: "pending",
    proposedCadence: recommendation.proposedCadence,
    proposedEstimatedMinutes: recommendation.proposedEstimatedMinutes
  }));
}

function formatDeterministicChatResponse({
  household,
  chores,
  recommendations,
  message
}: AgentChatContext): AgentChatResponse {
  const pendingRecommendations = recommendations.filter(
    (recommendation) =>
      recommendation.status === "pending" && (recommendation.decision ?? "pending") === "pending"
  );
  const shortestChore = chores
    .slice()
    .sort((first, second) => first.estimatedMinutes - second.estimatedMinutes)[0];
  const baselineSummary = household.baseline
    ? `Baseline: ${household.baseline.homeType} with ${household.baseline.rooms.length} tracked room${household.baseline.rooms.length === 1 ? "" : "s"}, pets=${household.baseline.hasPets}, outdoorSpace=${household.baseline.hasOutdoorSpace}.`
    : "Baseline details are not set yet.";
  const choreSummary = shortestChore
    ? `${shortestChore.title} has the shortest estimate at ${shortestChore.estimatedMinutes} minutes, so it is a practical first chore to review.`
    : "There are no active chores to inspect yet.";
  const recommendationSummary =
    pendingRecommendations.length > 0
      ? `Pending recommendations: ${pendingRecommendations.map((recommendation) => recommendation.title).join("; ")}.`
      : "There are no pending recommendations right now.";

  return {
    answer: `For "${message}", ${choreSummary} ${baselineSummary} ${recommendationSummary}`,
    ...(pendingRecommendations.length > 0
      ? { relatedRecommendationIds: pendingRecommendations.map((recommendation) => recommendation.id) }
      : {})
  };
}

export class OpenAiChoreAgentProvider implements AgentProvider {
  constructor(
    private readonly model = DEFAULT_OPENAI_AGENT_MODEL,
    private readonly runChoreAgent: ChoreAgentRunner = runOpenAiChoreAgent
  ) {}

  async recommendSetupImprovements(
    context: AgentRecommendationContext
  ): Promise<Recommendation[]> {
    const output = choreAgentOutputSchema.parse(
      await this.runChoreAgent({
        model: this.model,
        instructions: choreReviewInstructions,
        prompt: formatPrompt(context)
      })
    );

    return mapOutputToRecommendations(output, context);
  }

  async answerHouseholdQuestion(context: AgentChatContext): Promise<AgentChatResponse> {
    return formatDeterministicChatResponse(context);
  }
}
