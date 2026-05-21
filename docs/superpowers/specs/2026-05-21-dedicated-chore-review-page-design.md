# Dedicated Chore Review Page Design

## Summary

The Chores page should focus on chore CRUD and list management. The assistant review workflow should move to a separate, hidden route that is reached from the Chores page review CTA but is not shown in the primary navigation.

The new route should be `/chores/review`. It should own the review-specific workflow: selecting chores, generating recommendations, accepting or declining recommendations, applying decisions, and showing a completion state.

## Goals

- Reduce crowding on the Chores page by removing the inline review flow.
- Keep the review flow accessible from the Chores page through a clear `Review` CTA.
- Do not add the review page to the top navigation.
- Keep the current review flow behavior: default selection should favor unreviewed chores, while allowing re-review of other chores.
- Use concise decision button copy: `Accept` and `Decline`.
- After applying decisions, stay on the review page and show a completion state.
- Leave room for a future Google Calendar export action without building it in this slice.

## Non-Goals

- Do not implement Google Calendar export yet.
- Do not change the recommendation API contracts.
- Do not add authentication/session gating.
- Do not redesign the Chores page CRUD row behavior from the row-editing slice.
- Do not expose `/chores/review` in the app shell nav.

## Routing

Add a route for `/chores/review` in the existing manual routing system in `App.tsx`.

The route should render only when the household setup context has a `householdId`, just like the Chores page. If no household exists, it should show a placeholder state that points the user back to household setup or chores, following the current Chores page pattern.

The top navigation should continue to include:

- `Today`
- `Setup`
- `Chores`
- `Settings`

It should not include `Review`.

## Chores Page Changes

The Chores page should remove review-flow state and review-flow UI:

- No embedded chore-selection panel.
- No embedded decide-on-recommendations panel.
- No embedded `Apply decisions` flow.

The review entry panel can remain, but its action should navigate to `/chores/review` instead of opening an inline flow. The CTA should use the concise copy `Review`.

The Chores page should continue to show:

- Chore filters.
- `Add chore`.
- Chore rows and inline edit/archive controls.
- Per-chore recommendation details when a chore row is expanded and recommendations already exist.

## Review Page Flow

The review page should be a focused workflow with its own page header and status copy.

### Step 1: Choose Chores

The page should load active chores and current recommendations for the household.

The checkbox list should default to unreviewed chores. If there are no unreviewed chores, it should default to all active chores so the user can re-review.

The user should be able to include or exclude chores before requesting review.

Primary action: `Review selected chores`.

Secondary action: `Back to chores`.

### Step 2: Decide On Recommendations

After recommendations are generated, show the recommendation list on the same review page.

Each recommendation should include:

- Recommendation title.
- Rationale.
- Confidence.
- Decision controls.

Decision controls should use concise button labels:

- `Accept`
- `Decline`

The recommendation title should not be repeated in the button copy. The decision group can keep an accessible label that references the recommendation title, for example `Decision for Review duration for Clean bathrooms`.

Primary action: `Apply decisions`.

Secondary action: `Back`.

### Step 3: Completion

After applying decisions, stay on `/chores/review`.

Show a completion state that communicates the decisions were applied. Include a `Back to chores` button that navigates to `/chores`.

Do not add an `Export to Google Calendar` button yet. The layout should leave room for that future action in this completion state.

## Data Flow

The review page should reuse existing API helpers:

- `listChores`
- `listRecommendations`
- `generateRecommendations`
- `updateRecommendationDecision`
- `applyRecommendationDecisions`

The Chores page should continue to load chores and recommendations for normal list management.

The review page should manage its own local state for:

- Loading/error status.
- Selected chore ids.
- Generated review recommendations.
- Current step: select, decide, complete.

The review page should refresh chores and recommendations after applying decisions so future UI state is based on persisted data.

## Error Handling

If chores or recommendations fail to load, show a review-page error message rather than rendering an empty review flow.

If recommendation generation fails, keep the user on the selection step and show a recoverable status message.

If applying decisions fails, keep the user on the decision step and show a recoverable status message.

## Testing

Add or update tests to cover:

- `/chores/review` is not present in the primary nav.
- Clicking the Chores page review CTA navigates to `/chores/review`.
- The Chores page no longer renders the review checkbox/decision flow inline.
- The review page defaults checkbox selection to unreviewed chores.
- The review page allows reviewed chores to be selected for re-review.
- `Review selected chores` calls the recommendation API with selected chore ids.
- Recommendation decision buttons are labeled `Accept` and `Decline`.
- The old `Accept <recommendation title>` and `Decline <recommendation title>` labels are absent.
- `Apply decisions` stays on `/chores/review` and shows a completion state.
- `Back to chores` navigates to `/chores`.

## Browser Review

After implementation, verify:

- Chores page looks less crowded with no inline review flow.
- Review CTA routes to `/chores/review`.
- `/chores/review` is not in the primary nav.
- Selection step, decision step, and completion state are readable on desktop.
- Decision buttons read simply as `Accept` and `Decline`.
- Completion state has a clear `Back to chores` action and space for future export actions.
- Mobile width keeps the review workflow readable without overlapping controls.
