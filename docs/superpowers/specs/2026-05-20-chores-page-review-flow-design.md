# Chores Page + Review Flow UX Design

Date: 2026-05-20

## Summary

Replace the ongoing Setup/Plan split with a single Chores workspace after initial onboarding. First-time onboarding still gathers household basics, but once that context exists, the app should treat chores as the primary durable object: users can add, edit, archive, restore, inspect source, see review state, and see recommendation decisions from one place.

Agent review becomes an intentional flow launched from Chores. The Chores page does not embed review controls in every row; it offers a clear entry point into a review flow where users select chores, inspect recommendations, stage accept/decline decisions, and apply those decisions at the end.

## Product Direction

Keep:

- Today as the command center and next-action surface.
- Initial onboarding for household basics.
- Chore CRUD and archived chore restore.
- Manual user approval for recommendations.

Change:

- Replace the persistent Setup and Plan routes with a Chores route after onboarding.
- Use numbered steps only in first-time onboarding.
- Move chore management out of a "Review Queue" framing and into a durable Chores workspace.
- Start review from a dedicated Chores page CTA instead of mixing review actions into each chore card.

Defer:

- Auth and household ownership.
- Google Calendar import execution.
- Real OpenAI Agents SDK integration.
- Calendar draft application/export.

## Navigation Model

Primary navigation should become:

- Today
- Chores
- Settings

The Setup route can remain internally while onboarding is incomplete, but it should not feel like an ongoing app section once household basics are saved. If the user has no household basics, Today routes them to onboarding. After basics exist, Today routes chore-related work to Chores.

The current Plan route should be replaced or redirected to Chores. The word "Plan" should not be the main ongoing surface for chore CRUD or review status because the page is now object-centered around chores.

## Chores Page

The Chores page is the primary CRUD/status surface.

Header:

- Page title: "Household chores"
- Supporting copy: "Add, edit, archive, and track chore review state."
- Primary action: "Add chore"

Review entry point:

- Below the header, show a distinct review CTA panel.
- Example copy: "2 chores have not been reviewed yet. Choose which chores the assistant should review. You can include already-reviewed chores if you want a second pass."
- Button: "Start review flow"
- This CTA should not visually compete with "Add chore"; use lower-emphasis styling for the review button or separate it spatially.

No household context edit button should appear on the main Chores page. Household context is unlikely to change after onboarding, so surfacing it here adds noise.

## Chore Status Tabs

Tabs/filters should describe review and lifecycle state, not source.

Use these tabs:

- All active
- Unreviewed
- Recommendation pending
- Reviewed
- Archived

Rationale:

- "All active" is the main working list.
- "Unreviewed" identifies chores that have never been through review or became stale after edits.
- "Recommendation pending" identifies chores with staged or unresolved agent suggestions.
- "Reviewed" identifies chores with no currently pending recommendation.
- "Archived" keeps restored chores discoverable without treating archive as hard delete.

Source should remain visible on each chore, but source should not be a top-level filter initially. Source filters such as Manual and Imported can be added later when imports exist.

## Chore Card Information

Each chore card should show:

- Title
- Cadence
- Estimated minutes
- Source, such as "Manual add" or "Imported from Google Calendar"
- Review state
- Recommendation decision summary when one exists

Visual treatment:

- Unreviewed chores should have a distinct dotted border.
- Recommendation-pending chores should have a warmer attention border.
- Reviewed chores with accepted recommendations can use a subtle positive state.
- Reviewed chores with declined recommendations should remain neutral with the decision noted.

Chore cards should not include "Review this chore" buttons. The user starts review from the page-level review CTA, then chooses chores in the review flow.

## Review Flow

The review flow is launched from the Chores page.

Step 1: Choose chores to review

- Show a checkbox list of active chores.
- Default selection is all unreviewed chores.
- Already-reviewed chores remain visible and selectable so the user can request a second pass.
- Each checkbox row should show title, review state, source, cadence, and estimate.
- Primary action: "Review selected chores"
- Secondary action: "Cancel"

Step 2: Review recommendations

- Show generated recommendations for the selected chores.
- Recommendations include title, rationale, confidence, and affected chore.
- Each recommendation has a staged decision control, preferably a segmented toggle:
  - Accept
  - Decline
- Accept/decline does not immediately mutate the chore.
- The user can change decisions before applying.

Step 3: Apply decisions

- Show a summary of accepted and declined recommendations.
- Primary action: "Apply decisions"
- Applying decisions persists recommendation decisions and applies accepted chore changes.
- Declined recommendations are persisted so the assistant can avoid repeating them.
- After applying, the user returns to Chores and chore cards reflect the new statuses.

At the bottom of the final review step, include household context support copy:

> Recommendations not adding up? Make sure your household context is correct for more accurate recommendations.

Add a secondary action: "Review household context".

## Decision Semantics

Recommendation decisions are staged during review.

- Selecting Accept marks the recommendation as accepted in the in-progress review state.
- Selecting Decline marks it as declined in the in-progress review state.
- Neither choice immediately updates chores.
- "Apply decisions" commits the staged decisions.

This keeps review reversible until the user deliberately finishes the flow.

## Data Model Implications

This UX requires recommendation decision persistence beyond the current stale marker.

Likely additions:

- Recommendation decision status: pending, accepted, declined, applied.
- A relationship or metadata field that ties a recommendation to an affected chore.
- Optional proposed change data for accepted recommendations, such as cadence or estimated minute changes.
- Review timestamps on chores, or enough recommendation history to derive reviewed/unreviewed state.

Chore source remains on the Chore model. Google Calendar source metadata can remain future scope until import integration starts.

## Error Handling

- If Chores cannot load, show a recoverable page-level error.
- If no household basics exist, route to onboarding instead of showing an empty Chores workspace.
- If review generation fails, keep the selected chore list and show an error inside the review flow.
- If applying decisions fails, keep staged decisions visible so the user can retry.
- If recommendations are stale because a chore changed, the chore should move back to Unreviewed or otherwise clearly indicate that review is needed again.

## Testing Strategy

Frontend tests should cover:

- Navigation shows Chores instead of Setup/Plan after onboarding.
- Chores page renders state tabs and active chore cards.
- Unreviewed chores have distinct accessible state text.
- Review CTA opens the review flow.
- Review flow defaults unreviewed chores to selected.
- Reviewed chores can be selected for re-review.
- Accept/decline decisions are staged and can be changed before applying.
- Applying decisions updates chore/recommendation status in the UI.
- Household context edit prompt appears at the end of review, not on the main Chores page.

Backend tests should cover:

- Recommendation decisions can be persisted.
- Accepted decisions can be applied in a single request.
- Declined decisions remain visible in history and are not applied to chores.
- Chore review status can be derived or returned for Chores page display.
- Editing a chore makes previous review status stale/unreviewed.

## Open Implementation Notes

- The implementation should likely happen before real agent integration so the OpenAI Agents SDK can plug into a clearer review contract.
- Existing Plan persistence work should be reused rather than discarded: chore CRUD, archive/restore, stale recommendations, and API helpers all remain useful.
- Current Setup household-basics code can be preserved but reframed as onboarding, not as a permanent navigation destination.
