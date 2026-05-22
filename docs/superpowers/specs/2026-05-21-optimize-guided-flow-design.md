# Optimize Guided Flow Design

Date: 2026-05-21

## Summary

Refine the current review-page refactor into a dedicated `Optimize` workspace. The page should keep the existing staged recommendation flow, because selecting chores, generating recommendations, deciding, and applying are separate user decisions. It should also introduce a Chat mode with a real frontend/API contract and mocked provider behavior for this slice.

This spec is intentionally Optimize-first. Full household add/edit CRUD is deferred to a follow-up Households spec.

## Goals

- Make `Optimize` the product surface for assistant-driven chore improvement.
- Preserve the existing recommendation review behavior as a guided multi-step flow.
- Add a Chat mode where users can ask free-form questions about household chores.
- Add the backend contract for chat without requiring real OpenAI chat behavior in this slice.
- Keep Optimize reachable from the primary nav.
- Remove product reliance on `/chores/review`.
- Keep React calling product APIs only.

## Non-Goals

- No full Households CRUD implementation.
- No auth/session ownership changes.
- No Google Calendar export.
- No autonomous chore edits from chat.
- No assistant chat persistence history beyond component state in this slice.
- No multi-agent backend workflow.

## Current State

The repo already has a partial refactor:

- `web/src/pages/OptimizePage.tsx` exists and currently contains the old staged review flow.
- `web/src/App.tsx` includes an `Optimize` nav item and renders `OptimizePage` at `/optimize`.
- `web/src/routes.ts` includes `/optimize` and `/household`.
- The nav currently labels `Households` but points to `/setup`.
- The Chores page no longer has a review CTA.
- There is not yet a real `HouseholdsPage`.

The implementation should clean this up around Optimize, but should not build the full Households page yet.

## Optimize Layout

Use the guided flow direction.

The page should have a concise header:

- Eyebrow: `Assistant workspace`
- Heading: `Optimize chores`
- Supporting copy: `Review selected chores or ask the assistant a question about the household routine.`

Below the header, use tabs or a segmented control:

- `Recommendations`
- `Chat`

The tabs should be page-local modes, not top-level nav items. `Recommendations` is the default mode.

## Recommendations Mode

Recommendations mode should keep the existing staged flow:

1. Select chores.
2. Generate recommendations.
3. Accept or decline each recommendation.
4. Apply decisions.
5. Show completion state.

This mode is the renamed and polished version of the old review page, not a new workflow.

Recommended copy updates:

- Page/mode label: `Recommendations`
- Select heading: `Choose chores to optimize`
- Select helper: `Unreviewed chores are selected by default. Include reviewed chores when you want another pass.`
- Generate button: `Get recommendations`
- Decide heading: `Review recommendations`
- Completion heading: `Optimization complete`

Recommendation decisions remain manual. The assistant does not directly change chores.

## Chat Mode

Chat mode should support free-form questions about chores. In this slice, it should have real UI and a real backend contract, but the provider can return deterministic mocked replies.

The chat UI should include:

- A message list.
- A text input.
- A submit button.
- Loading and error states.
- Empty-state prompt examples such as:
  - `Which chores look under-scoped?`
  - `What recurring work might be missing?`
  - `How should I think about pet-related chores?`

Chat responses should be informational only. They should not create chores, update chores, save recommendations, or apply decisions.

## Backend Chat Contract

Add a backend route for household-scoped assistant chat:

`POST /api/households/:householdId/assistant/chat`

Request:

```json
{
  "message": "Which chores look under-scoped?"
}
```

Response:

```json
{
  "reply": "The bathroom chore may be under-scoped because..."
}
```

The backend should load the household, active chores, and current non-stale recommendations before calling the provider.

Validation rules:

- `message` is required.
- Trim whitespace.
- Empty messages return `400`.
- Unknown household returns `404`.
- Provider failure returns `502` with `{ "error": "Could not answer assistant question" }`.

## Provider Boundary

Extend the existing backend agent boundary rather than adding a frontend OpenAI call.

Add this provider method:

```ts
answerHouseholdQuestion(context: AgentChatContext): Promise<AgentChatResponse>
```

Where context includes:

- household
- active chores
- current recommendations
- user message

The first implementation should live in `MockChoreAgentProvider` and return deterministic text based on the supplied context.

`OpenAiChoreAgentProvider` should also implement the method, but for this slice it should return deterministic text through a small local formatter rather than making a real OpenAI chat call. Real OpenAI chat behavior is deferred so this slice stays focused on UI and contract shape.

This preserves the same architecture as recommendations: React calls product APIs, Express owns orchestration, and provider implementations sit behind a server interface.

## Routing And Navigation

Use `/optimize` as the active product route for assistant review and chat.

Required cleanup:

- Optimize is reached from the primary nav, not from a Chores page review CTA.
- Primary nav includes `Optimize`.
- Primary nav does not include `Review`.
- `/chores/review` should no longer be the product route.
- Since the app is not in production, no compatibility redirect is required.

Households nav cleanup should be minimal in this spec:

- Make the `Households` nav route point to `/household`.
- If `/household` has no page yet, show a small placeholder page that says household management is coming next.
- Do not implement full add/edit household CRUD in this spec.

## Data Flow

Recommendations mode:

1. `OptimizePage` loads active chores and current recommendations.
2. User selects chores.
3. `OptimizePage` calls the existing recommendation API.
4. Backend provider returns recommendations.
5. User accepts or declines.
6. User applies decisions through the existing apply API.

Chat mode:

1. User types a question.
2. `OptimizePage` calls the new chat API.
3. Backend loads household context, active chores, and current recommendations.
4. Backend provider returns a text reply.
5. `OptimizePage` appends the reply to the current in-page chat thread.

## Error Handling

Recommendations mode should preserve current failure behavior:

- Load failure shows an Optimize-page error.
- Recommendation generation failure keeps the user on the selection step.
- Decision or apply failures keep the current step and show status copy.

Chat mode should handle:

- Empty input by disabling submit or showing a local validation state.
- Loading state while awaiting reply.
- `404` household failure with page-level setup/household-required copy.
- `502` provider failure with an inline chat error that does not clear the thread.

## Testing

Frontend tests should cover:

- `/optimize` renders the guided Optimize page.
- The `Recommendations` tab loads the existing staged flow.
- Primary nav routes to `/optimize`.
- `/chores/review` is no longer expected as the main route.
- `Chat` tab renders prompt examples, input, and submit button.
- Chat submit calls the new API helper and renders the reply.
- Chat failure shows an inline error and keeps existing messages.

Backend tests should cover:

- Chat route returns `404` for unknown household.
- Chat route returns `400` for empty message.
- Chat route passes household, active chores, recommendations, and message into the provider.
- Chat route returns mocked provider reply.
- Chat route returns stable `502` on provider failure.

Typecheck should also be part of this cleanup because the current UI refactor has stale unused props/functions.

## Acceptance Criteria

- `Optimize` is the assistant workspace route.
- Recommendation review is still guided and staged.
- Primary nav opens `/optimize`.
- Chat mode exists with UI, API helper, backend route, and mocked provider response.
- Chat does not mutate chores or recommendations.
- Full Households CRUD remains deferred.
- Frontend tests reflect Optimize instead of the old review route.
- Server and web typechecks pass.
- Relevant server and web tests pass, with DB-backed tests allowed to skip when the local test database is not configured.
