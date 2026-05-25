# Chore Helper Product Roadmap

Date: 2026-05-24

## Summary

This roadmap tracks the remaining big-ticket work for Chore Helper. It is the parent document for milestone-specific design specs and implementation plans.

The app should evolve milestone by milestone from the current React + Express + Prisma/Postgres foundation into an expert chore assistant that can review existing household routines, recommend improvements, and eventually import/export Google Calendar chores with manual user approval.

## Milestones

### 1. UI + Data Integration

Replace demo-feeling dashboard data with persisted household, chore, and recommendation data. This milestone also finishes the MVP 1 setup flow: household context, existing chores, import options, and review handoff.

Key outcomes:

- Today, Chores, Family, and Settings feel like connected parts of one product.
- Today shows real household context, setup status, chores, and recommendation summary data.
- Setup guides the user through household context and at least one existing chore before marking setup complete.
- Ongoing Setup/Plan behavior is consolidated into a Chores workspace with a separate staged review flow.
- Empty, loading, saved, and review states feel intentional rather than placeholder-like.
- Demo data is removed or clearly isolated from real app state.
- People, family workload, and fairness views are treated as MVP 2, not MVP 1.

Suggested child doc:

- `docs/superpowers/specs/2026-05-19-ui-data-setup-flow-design.md`

### 2. Persistence + Domain Hardening

Build on the existing Prisma + Postgres persistence and expand it into durable product state.

Key outcomes:

- Add domain models for import metadata, recommendation drafts, accepted/skipped decisions, and future people/workload features.
- Preserve source metadata for imported chores without making Google Calendar the only source of truth.
- Store recommendation decisions so the assistant can avoid repeating dismissed suggestions.
- Store recommendation accept/decline decisions before real agent integration so the Agents SDK plugs into a durable review contract.
- Support future calendar draft generation and manual acceptance flows.
- Keep database changes incremental and covered by backend tests.

Suggested child doc:

- `docs/superpowers/specs/2026-05-20-domain-persistence-design.md`

### 3. OpenAI Agents SDK Integration

Replace the mock recommendation provider with an OpenAI Agents SDK-backed implementation behind the existing backend `AgentProvider` boundary.

Key outcomes:

- The React app continues calling product APIs rather than OpenAI APIs directly.
- The backend owns agent orchestration, tool access, recommendation persistence, and approval state.
- The agent receives household context, existing chores, user prompts, and relevant recommendation history.
- Agent recommendations include rationale and confidence.
- Recommendations remain suggestions until manually accepted.

Suggested child doc:

- `docs/superpowers/specs/YYYY-MM-DD-openai-agents-sdk-design.md`

### 4. Auth + Household Ownership

Introduce user authentication and make households belong to authenticated users.

Key outcomes:

- Users can sign in and sign out.
- Households are associated with users.
- The app replaces localStorage household ownership with authenticated user-scoped household loading.
- Local development remains simple while the architecture prepares for hosted deployment.
- The backend enforces household access through authenticated ownership rather than client-provided IDs alone.

Suggested child doc:

- `docs/superpowers/specs/2026-05-20-auth-household-ownership-design.md`

### 5. Pre-Calendar UX Foundation

Revamp the signed-out entry experience and authenticated working pages before calendar integration adds another product workflow.

Key outcomes:

- Signed-out visitors see a polished public landing page with Clerk sign-in and sign-up actions; signed-in visits to `/` open Today.
- Today becomes a unified multi-household home overview based on real stored household, chore, and recommendation data.
- Households becomes fully editable by replacing the duplicate legacy baseline shape with general profile facts plus floor/room structure.
- Settings contains a Google Calendar connection shell, while Today and Chores provide clear entry actions before OAuth/import functionality lands.
- The warm home-oriented visual style becomes consistent across public and authenticated surfaces.

Suggested child docs:

- `docs/superpowers/specs/2026-05-24-pre-calendar-ux-foundation-design.md`
- `docs/superpowers/plans/2026-05-24-pre-calendar-ux-foundation.md`

### 6. Google Calendar Import + Export

Connect Google Calendar as the first external chore source.

Key outcomes:

- Users can connect Google Calendar.
- The app imports likely chore events into internal chore records.
- Imported chores preserve calendar source references such as calendar ID, event ID, recurrence, and duration.
- Calendar data is treated as an integration source, not the permanent source of truth.
- Later export support creates user-approved calendar change drafts instead of automatic background writes.

Suggested child doc:

- `docs/superpowers/specs/YYYY-MM-DD-google-calendar-integration-design.md`

### 7. Tech Debt

Implementation changes that won't change the experience of using the application.

Key changes:

- Update styling from simple CSS to Tailwind

## Documentation Flow

For each milestone:

1. Create a milestone-specific design spec under `docs/superpowers/specs/`.
2. Review and approve the design before implementation.
3. Create a detailed implementation plan under `docs/superpowers/plans/`.
4. Implement and verify the milestone in small slices.
5. Update this roadmap when scope, sequencing, or milestone status changes.

## Current Defaults

- Keep React + Express + Prisma/Postgres as the core stack.
- Keep OpenAI integration behind the backend provider interface.
- Treat Google Calendar as an integration source, not the only source of truth.
- Keep recommendations and calendar changes manual-acceptance first.
- Evolve the current foundation instead of rewriting the app.
