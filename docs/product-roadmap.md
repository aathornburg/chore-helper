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
- Calendar chore markers should eventually support keyword or category-based icons, such as a paw for pet-related chores, instead of only using the generic dot marker.

Suggested child docs:

- `docs/superpowers/specs/2026-05-24-pre-calendar-ux-foundation-design.md`
- `docs/superpowers/plans/2026-05-24-pre-calendar-ux-foundation.md`

### 6. Google Calendar Import + Export

Connect Google Calendar as the first external chore source.

Key outcomes:

- Users can connect Google Calendar.
- The app imports likely chore events into internal chore records.
- The app imports non-chore calendar commitments such as school, work, appointments, and practices as planning constraints that display distinctly from chores.
- Calendar sync governance separates owner import controls from member-owned import/export preferences.
- Owners review member-submitted commitments through an owner-only import queue before items enter the shared Clenella calendar, unless that member is configured for auto-add.
- Members control export mode and destination calendar independently from import.
- Imported chores preserve calendar source references such as calendar ID, event ID, recurrence, and duration.
- Calendar data is treated as an integration source, not the permanent source of truth.
- Later export support creates user-approved calendar change drafts instead of automatic background writes.

Suggested child doc:

- `docs/superpowers/specs/YYYY-MM-DD-google-calendar-integration-design.md`

### 7. Tech Debt

Implementation changes that won't change the experience of using the application.

Key changes:

- Update styling from simple CSS to Tailwind

### 8. Home Navigation + Today Operating Dashboard + UI Revamp

Update the authenticated header so Optimize is visually and spatially emphasized, revamp Today into the daily operating dashboard now that app-owned chores and calendar occurrences are functional, and refresh the core authenticated UI so the product feels cohesive and operational.

Key outcomes:

- Signed-in visits to `/` still open Today as the first working page.
- The header places Optimize to the left of Today so it becomes the first navigation item users scan.
- Optimize receives a stronger visual treatment than standard navigation items, encouraging users to start there when they want planning guidance.
- Today remains clearly available and understandable as the daily home view.
- Today shows a due-today calendar widget with quick completion actions for assigned chores.
- Today shows an upcoming chores widget, likely covering the next seven days, so users can see what is coming without opening the full Calendar page.
- Completed chores remain visible but visually quiet, matching the Calendar completion treatment.
- Today widgets link into the full Calendar page for deeper planning, filtering, and schedule editing.
- Mobile Today prioritizes what needs doing now, then upcoming chores, then household summary context.
- The existing Google Calendar CTA moves from Today to Calendar, where calendar setup and import expectations belong.
- The milestone includes a UI discovery/refinement step using `docs/assets/today-operating-dashboard-ui-reference.png` as an example direction, not a pixel-perfect requirement.
- The resulting visual direction should be applied across core authenticated pages: Today, Calendar, Optimize, Households, Family, and Settings.

Suggested child doc:

- `docs/superpowers/specs/2026-05-31-home-navigation-today-dashboard-design.md`

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
