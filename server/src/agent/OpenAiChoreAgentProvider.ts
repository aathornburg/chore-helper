import { Agent, run } from "@openai/agents";
import type { Recommendation, Task } from "@chore-helper/shared";
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
  proposedEstimatedMinutes: z.number().int().optional()
});

const choreAgentOutputSchema = z.object({
  recommendations: z.array(choreAgentRecommendationSchema)
});

const choreAgentChatOutputSchema = z.object({
  answer: z.string().min(1),
  relatedRecommendationIds: z.array(z.string().min(1)).optional()
});

export type ChoreAgentRunInput = {
  model: string;
  instructions: string;
  prompt: string;
  outputType?: typeof choreAgentOutputSchema | typeof choreAgentChatOutputSchema;
};

type ChoreAgentOutput = z.infer<typeof choreAgentOutputSchema>;
type ChoreAgentChatOutput = z.infer<typeof choreAgentChatOutputSchema>;

type ChoreAgentRunner = (input: ChoreAgentRunInput) => Promise<unknown>;

const choreReviewInstructions = [
  "You are a household chore review assistant.",
  "Recommend practical improvements to household chores.",
  "Focus on cadence, duration, missing recurring work, and chore scope.",
  "Prefer recommendations tied to selected chores when selected chores are provided.",
  "Include concise rationale and confidence as low, medium, or high.",
  "If proposing estimated minutes, provide a positive whole number only; omit it when no duration change is recommended.",
  "Do not invent household facts that are not present in the provided context.",
  "Do not recommend automatic calendar edits or automatic chore changes.",
  "Every recommendation is only a suggestion and requires manual user approval."
].join(" ");

const choreChatInstructions = [
  "You are a household chore optimization assistant.",
  "Answer the user's question using only the provided household, chore, and recommendation context.",
  "Be concise and practical.",
  "When existing recommendations are directly relevant, include their IDs in relatedRecommendationIds.",
  "Do not invent chores, schedules, calendar events, or household facts that are not in the prompt.",
  "Do not claim you changed chores or calendar events; recommendations and changes require manual user approval."
].join(" ");

async function runOpenAiChoreAgent({
  model,
  instructions,
  prompt,
  outputType = choreAgentOutputSchema
}: ChoreAgentRunInput): Promise<unknown> {
  const agent = new Agent({
    name: "Chore review assistant",
    instructions,
    model,
    outputType
  });
  const result = await run(agent, prompt);

  return result.finalOutput;
}

function formatChores(chores: Task[]) {
  if (chores.length === 0) {
    return "No selected chores.";
  }

  return chores
    .map(
      (chore) =>
        `- ${chore.title}: source=${chore.source}, instructions=${chore.instructions ?? "none"}, tags=${chore.tags?.join(", ") || "none"}`
    )
    .join("\n");
}

function formatPrompt({ household, chores, reviewPrompt }: AgentRecommendationContext) {
  return [
    `Household: ${household.name}`,
    `Profile: ${JSON.stringify(household.profile ?? null)}`,
    "Selected chores:",
    formatChores(chores),
    `User review prompt: ${reviewPrompt?.trim() || "Review the selected chores for practical improvements."}`,
    "Return only structured recommendations that match the requested schema."
  ].join("\n\n");
}

function formatChatChores(chores: Task[]) {
  if (chores.length === 0) {
    return "No active chores.";
  }

  return chores
    .map((chore) =>
      [
        `- id=${chore.id}`,
        `title=${chore.title}`,
        `source=${chore.source}`,
        `instructions=${chore.instructions ?? "none"}`,
        `tags=${chore.tags?.join(", ") || "none"}`
      ].join("; ")
    )
    .join("\n");
}

function formatChatRecommendations(recommendations: AgentChatContext["recommendations"]) {
  const activeRecommendations = recommendations.filter((recommendation) => !recommendation.staleAt);
  if (activeRecommendations.length === 0) {
    return "No active recommendations.";
  }

  return activeRecommendations
    .map((recommendation) =>
      [
        `- id=${recommendation.id}`,
        `title=${recommendation.title}`,
        `rationale=${recommendation.rationale}`,
        `confidence=${recommendation.confidence}`,
        `status=${recommendation.status}`,
        `decision=${recommendation.decision ?? "pending"}`,
        `affectedTaskId=${recommendation.affectedTaskId ?? "none"}`
      ].join("; ")
    )
    .join("\n");
}

function formatChatPrompt({ household, chores, recommendations, message }: AgentChatContext) {
  return [
    `Household: ${household.name}`,
    `Profile: ${JSON.stringify(household.profile ?? null)}`,
    "Active chores:",
    formatChatChores(chores),
    "Active recommendations:",
    formatChatRecommendations(recommendations),
    `User question: ${message}`,
    "Return a concise answer and include only recommendation IDs that are relevant to the answer."
  ].join("\n\n");
}

function findAffectedChoreId(affectedChoreTitle: string | undefined, chores: Task[]) {
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
    affectedTaskId: findAffectedChoreId(recommendation.affectedChoreTitle, context.chores),
    title: recommendation.title,
    rationale: recommendation.rationale,
    confidence: recommendation.confidence,
    status: "pending",
    decision: "pending",
    proposedCadence: recommendation.proposedCadence,
    proposedEstimatedMinutes:
      recommendation.proposedEstimatedMinutes && recommendation.proposedEstimatedMinutes > 0
        ? recommendation.proposedEstimatedMinutes
        : undefined
  }));
}

function mapChatOutputToResponse(output: ChoreAgentChatOutput, context: AgentChatContext): AgentChatResponse {
  const recommendationIds = new Set(context.recommendations.map((recommendation) => recommendation.id));
  const relatedRecommendationIds = (output.relatedRecommendationIds ?? [])
    .filter((recommendationId) => recommendationIds.has(recommendationId));

  return {
    answer: output.answer,
    ...(relatedRecommendationIds.length > 0 ? { relatedRecommendationIds } : {})
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
    const output = choreAgentChatOutputSchema.parse(
      await this.runChoreAgent({
        model: this.model,
        instructions: choreChatInstructions,
        prompt: formatChatPrompt(context),
        outputType: choreAgentChatOutputSchema
      })
    );

    return mapChatOutputToResponse(output, context);
  }
}
