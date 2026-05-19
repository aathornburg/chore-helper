# Chore Agent Design

## Summary

Build a small web app backed by an API-first backend for an expert chore assistant. The first version helps a user connect Google Calendar, import existing recurring chore events, get the lay of the land for their household, and receive optional expert recommendations. The assistant should be collaborative and respectful of existing systems: it offers guidance, rationale, and confidence, but it does not automatically critique every chore or make calendar changes without explicit user approval.

> Current MVP note, added 2026-05-19: the immediate MVP 1 implementation is narrowed to household context, existing chore setup, and chore optimization. People, family workload balancing, ownership rotation, and fairness views remain valid product directions, but they are MVP 2/future scope rather than required for the first setup-flow milestone.

## Product Principles

- The assistant is an expert chore assistant, not a mandatory auditor.
- Existing calendar work should be treated as valuable household knowledge.
- Recommendations should be explainable, with rationale and confidence when the agent suggests a change.
- Calendar writes are manual approval only in the first version.
- Google Calendar is the first integration, but the core chore model should not depend on it.
- The system should be API-first so future clients, integrations, and family/product use can build on the same core operations.

## Primary Users

- A personal user who already has chores in Google Calendar and wants help understanding, improving, and planning them.
- A household or family that wants a shared chore system with multiple members. This is an important future audience; MVP 1 should not require people or workload setup.
- Future external users or clients that may interact with the assistant through an API.

## First Usable Product

The first usable product is a web app with these flows:

1. Connect Google Calendar.
2. Import likely chore events, especially recurring events.
3. Confirm which imported events are chores.
4. Complete a guided Household Baseline intake.
5. Receive high-signal expert suggestions.
6. Ask for deeper review by area, chore, or whole setup.
7. Approve, edit, or skip proposed additions and calendar changes.

## Household Baseline

The Household Baseline is the agent's early discovery process. It gathers context that affects chore recommendations:

- Home type: house, apartment, condo, townhouse, or other.
- Rooms and zones: kitchen, bathrooms, bedrooms, living areas, garage, basement, outdoor spaces.
- Flooring: carpet, hard floors, tile, rugs, mixed flooring.
- Household members and participation level. For MVP 1 this remains optional/future context, not a required setup step.
- Pets, children, allergies, mobility constraints, and other care factors.
- Appliances and systems: HVAC filters, dishwasher, laundry, garbage disposal, yard equipment.
- Outdoor responsibilities: lawn, snow, gutters, garden, patio, exterior checks.
- Preferences: tolerance for clutter, cleaning standards, available chore windows, preferred cadence style.

The baseline should be incremental. The user should not be forced through a long questionnaire before seeing value. The agent can ask follow-up questions when it needs more context to make a specific recommendation.

## Google Calendar Import

Google Calendar is the first import tool. The integration should:

- Pull calendar events from selected calendars.
- Detect likely chores using title, recurrence, duration, description, and calendar metadata.
- Preserve source references to calendar IDs and event IDs.
- Import recurrence cadence, duration, timing, notes, and assignees where inferable.
- Let the user confirm, rename, ignore, categorize, merge, or split imported events.

Google Calendar should be treated as an integration source, not the permanent source of truth. Internal chore records should be able to exist without a calendar event, and future integrations should use the same adapter pattern.

## Expert Assistance Modes

The app should offer several ways to use the expert assistant:

### Get Me Set Up

The default guided flow. It imports chores, gathers household context, identifies obvious gaps, and helps create a practical starting system.

### Review My Existing Setup

An optional deeper review. When the user asks for this mode, the agent evaluates imported chores for cadence, duration, clarity, timing, duplication, missing dependencies, and fit with the household baseline.

### Help Me Improve One Area

The user can ask for targeted expert help, such as kitchen chores, bathroom cadence, floors, pet-related chores, seasonal maintenance, or overloaded weekend tasks.

### Plan This Week

The assistant focuses on scheduling, workload balance, calendar fit, and catch-up planning rather than analyzing the underlying chore system.

## Recommendations

Recommendations may include:

- Add a missing chore.
- Change cadence.
- Change expected duration.
- Rename a vague chore.
- Split a broad chore into smaller chores.
- Combine duplicate chores.
- Move timing to a better window.
- Add seasonal or conditional reminders.
- Suggest a rotation or ownership model in a future people/workload milestone.

Each recommendation should include:

- Proposed change.
- Rationale.
- Confidence level.
- Relevant household facts used.
- Accept, edit, skip, and ask-for-more-detail actions.

The assistant should prioritize a small number of high-signal recommendations in the default setup flow. Full chore-by-chore analysis should happen only when the user asks for deeper review.

## Calendar Change Approval

The first version must not write changes automatically. Accepted recommendations become drafts. The user manually reviews the draft list before changes are applied to Google Calendar.

Draft changes may include:

- Create a calendar event.
- Update an existing event.
- Change recurrence.
- Change duration.
- Change event title or notes.
- Move an event to a different time.

The UI should make it clear what will change in Google Calendar before any write occurs.

Applying a draft is still a user-approved action. The product should avoid background writes, silent sync changes, or agent-initiated edits in the first version.

## Core Data Model

The backend should maintain internal records for:

- Household.
- Household member.
- Household profile / baseline facts.
- Chore.
- Chore recurrence.
- Chore assignment.
- Chore completion.
- Integration account.
- Imported source event.
- Recommendation.
- Calendar change draft.
- Agent conversation or decision trace.

The data model should support multiple households and future external users from the beginning, even if the first version is used personally.

## API Boundaries

The backend should expose internal API operations for:

- Create, update, list, and archive chores.
- Import chores from an integration.
- Confirm or reject imported events.
- Update household baseline facts.
- Ask the agent for setup help, targeted review, or weekly planning.
- Create, update, accept, edit, skip, and apply recommendations.
- Create and apply calendar change drafts.

These boundaries make future public API exposure easier without requiring the first version to expose a public developer API.

## Technical Direction

Use app-owned agent orchestration rather than a Bedrock-hosted agent for the first version. The backend starts and controls agent runs, exposes a curated set of internal tool functions, stores all recommendation and approval state, and calls the OpenAI Agents SDK as a dependency when the real agent integration is added.

Use a React frontend with an Express backend. This keeps the full application in TypeScript while giving room to learn React incrementally. The backend should own the product API, Google Calendar integration, chore domain model, recommendation approval workflow, and agent tool surface.

Recommended starting stack:

- React frontend built with Vite.
- Express backend written in TypeScript.
- Postgres for persistent product data.
- Prisma or Drizzle for database access.
- A background worker for calendar import and agent runs.
- An OpenAI Agents SDK provider behind the backend `AgentProvider` interface.

The app should keep the provider boundary even after adopting the OpenAI Agents SDK. React should call the product API, the product API should call `AgentProvider`, and the OpenAI-specific implementation should live behind that interface. This keeps the UI and chore domain code independent from SDK details.

## Agent Behavior

The agent should:

- Ask focused follow-up questions when context is missing.
- Prefer targeted help over broad unsolicited critique.
- Explain recommendations in plain language.
- Include confidence when making recommendations.
- Avoid implying that the existing calendar is wrong.
- Use household context to tailor chore suggestions.
- Keep potentially disruptive actions behind user approval.

## Error Handling

The app should handle:

- Google Calendar connection failures.
- Expired or revoked integration tokens.
- Ambiguous imported events.
- Recurrence rules the app cannot confidently interpret.
- Calendar write failures.
- Conflicts between internal chore state and current calendar state.

When confidence is low, the app should ask the user rather than guessing.

## Testing Strategy

Initial tests should cover:

- Calendar import classification for recurring and non-recurring events.
- Mapping imported events to internal chores.
- Household baseline persistence.
- Recommendation creation with rationale and confidence.
- Draft calendar change generation without automatic writes.
- Approval workflow for accepted, edited, skipped, and applied recommendations.
- Multi-household data isolation.

## Out Of Scope For First Version

- Fully autonomous calendar edits.
- Public developer API access.
- Non-Google integrations.
- Complex fairness scoring across household members.
- Required people/workload setup in MVP 1.
- Native mobile apps.

## Open Decisions

- Whether the first UI includes chat, forms, or both.
- Initial recommendation confidence scale.
- Whether accepted Google Calendar drafts are applied through the app or exported for manual calendar editing.
- Authentication strategy for personal use versus future multi-user households.
