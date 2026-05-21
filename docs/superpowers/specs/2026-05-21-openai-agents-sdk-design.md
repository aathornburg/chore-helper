# OpenAI Agents SDK Integration Design

Date: 2026-05-21

## Summary

Replace the mock recommendation provider with an OpenAI Agents SDK-backed implementation behind the existing backend `AgentProvider` boundary.

The first slice is intentionally backend-only. The React app should keep calling the existing product API, and the dedicated review page should keep its current select, generate, accept, decline, and apply workflow. OpenAI should only change the quality and source of generated recommendations, not the user-facing approval model.

## Goals

- Keep OpenAI calls entirely on the Express backend.
- Preserve the existing `POST /api/households/:householdId/recommendations` API contract.
- Add a real `AgentProvider` implementation using the OpenAI Agents SDK for TypeScript.
- Keep `MockChoreAgentProvider` available for tests and local development without an API key.
- Return recommendations that match the existing shared `Recommendation` model.
- Preserve manual acceptance before any chore is changed.

## Non-Goals

- No chat UI.
- No provider status or model settings UI.
- No automatic chore edits from agent output.
- No Google Calendar export.
- No auth/session ownership changes.
- No multi-agent workflow in this slice.

## Current Architecture

The current server already has the right boundary:

- `server/src/agent/AgentProvider.ts` defines `recommendSetupImprovements(context)`.
- `server/src/agent/MockChoreAgentProvider.ts` implements deterministic local recommendations.
- `server/src/routes/households.ts` loads the household and selected chores, calls the provider, enriches recommendation metadata, and persists the recommendations.
- `web/src/pages/ChoreReviewPage.tsx` generates recommendations through the product API and requires the user to accept or decline before applying.

This design keeps that shape. The route remains analogous to a Spring controller: it handles HTTP, validation, persistence orchestration, and deterministic metadata. The provider remains analogous to an injectable service implementation: the app can swap mock and OpenAI implementations without changing the route or React components.

## Provider Selection

Add a small provider factory under `server/src/agent/`, for example `createAgentProvider.ts`.

Provider selection should use environment configuration:

- `AGENT_PROVIDER=mock` returns `MockChoreAgentProvider`.
- `AGENT_PROVIDER=openai` returns `OpenAiChoreAgentProvider`.
- Missing `AGENT_PROVIDER` defaults to `mock` for local development safety.
- `AGENT_PROVIDER=openai` without `OPENAI_API_KEY` should fail clearly during startup.

`createApp({ agentProvider })` should continue to accept injected providers so tests can bypass environment selection and avoid real OpenAI calls.

## OpenAI Provider

Add `server/src/agent/OpenAiChoreAgentProvider.ts`.

The provider should:

- Create one focused chore review agent.
- Use the OpenAI Agents SDK for TypeScript.
- Use a model configurable by `OPENAI_AGENT_MODEL`.
- Default the model to `gpt-5.5`, matching the Agents SDK quickstart checked during design, when `OPENAI_AGENT_MODEL` is not configured.
- Use structured output with `zod` so downstream code receives typed data rather than free-form prose.
- Map structured output into `Recommendation[]`.

The provider should receive the existing `AgentRecommendationContext`:

- household name and baseline
- selected chores only
- optional `reviewPrompt`

The provider should not persist anything directly. Persistence remains in `households.ts` through `store.saveRecommendations(...)`.

## Agent Instructions

The agent should be framed as a household chore review assistant.

Instructions should require the agent to:

- Recommend practical improvements to household chores.
- Focus on cadence, duration, missing recurring work, and chore scope.
- Prefer recommendations tied to selected chores when selected chores exist.
- Include concise rationale.
- Include confidence as `low`, `medium`, or `high`.
- Avoid inventing household facts not present in the provided context.
- Avoid recommending automatic calendar or chore changes.
- Treat all recommendations as suggestions that need manual user approval.

The prompt should include enough structured context for the model to reason without needing tools in this first slice. Function tools, hosted tools, handoffs, and long-lived agent state are deferred.

## Structured Output Contract

The OpenAI provider should define a `zod` output schema close to:

```ts
const agentRecommendationSchema = z.object({
  title: z.string().min(1),
  rationale: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  affectedChoreTitle: z.string().optional(),
  proposedCadence: z.string().optional(),
  proposedEstimatedMinutes: z.number().int().positive().optional()
});
```

The full output should be an object containing `recommendations: agentRecommendationSchema.array()`.

The backend should generate app-owned fields:

- `id`
- `householdId`
- `status: "pending"`
- `decision: "pending"`

The route-level `attachReviewMetadata(...)` can continue to set `affectedChoreId`, fallback proposed cadence, and fallback proposed minutes. If the OpenAI output supplies valid proposed values, the route should preserve them.

## Error Handling

If OpenAI generation fails, the provider should throw a clear error. The recommendation route should catch provider errors and return `502` with a stable JSON error such as `{ "error": "Could not generate recommendations" }`.

If the agent returns an empty recommendation list, the server should persist and return an empty list. The review page already needs to handle empty recommendations as a valid result.

If structured output validation fails, the provider should throw rather than trying to guess at malformed data.

## Safety And Approval

OpenAI output must never directly mutate chores.

The existing review workflow remains the safety boundary:

1. Generate recommendations.
2. Persist recommendations as pending.
3. User accepts or declines each recommendation.
4. User applies decisions.
5. The store applies accepted changes deterministically.

This matches the Agents SDK guidance that application code should own orchestration, state, and approvals, and that human review should occur before side-effecting actions.

## Dependencies And Configuration

Add server dependencies:

- `@openai/agents`
- `zod` is already present

Environment variables:

- `AGENT_PROVIDER=mock|openai`
- `OPENAI_API_KEY`
- `OPENAI_AGENT_MODEL`

Do not expose `OPENAI_API_KEY` to the Vite frontend.

## Testing

Server tests should cover:

- provider factory returns mock by default
- provider factory returns mock for `AGENT_PROVIDER=mock`
- provider factory returns OpenAI provider for `AGENT_PROVIDER=openai` when `OPENAI_API_KEY` is present
- provider factory throws a clear configuration error for `AGENT_PROVIDER=openai` without `OPENAI_API_KEY`
- OpenAI provider maps a valid structured result into `Recommendation[]`
- OpenAI provider rejects malformed structured output
- existing route tests continue to pass with injected provider doubles and no network calls

Automated tests must not make real OpenAI API calls. Mock the SDK boundary or inject a small runner abstraction into `OpenAiChoreAgentProvider`.

## Documentation

Update local development documentation with:

- how to keep using mock recommendations
- how to opt into OpenAI recommendations locally
- required environment variables
- confirmation that API keys belong only on the backend

## Acceptance Criteria

- React continues calling only product APIs.
- `MockChoreAgentProvider` remains usable.
- `AGENT_PROVIDER=openai` uses the OpenAI Agents SDK provider.
- Missing `OPENAI_API_KEY` fails clearly when OpenAI provider is selected.
- Generated OpenAI recommendations persist through the existing recommendation store.
- Accept, decline, and apply behavior is unchanged.
- Server tests cover provider selection and OpenAI output mapping without real network calls.
- Server typecheck and tests pass.

## Source References

- OpenAI Agents SDK overview: https://developers.openai.com/api/docs/guides/agents
- OpenAI Agents SDK quickstart: https://developers.openai.com/api/docs/guides/agents/quickstart
- Agent structured outputs: https://developers.openai.com/api/docs/guides/agents/define-agents
- Guardrails and human review: https://developers.openai.com/api/docs/guides/agents/guardrails-approvals
