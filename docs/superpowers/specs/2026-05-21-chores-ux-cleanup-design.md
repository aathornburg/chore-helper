# Chores UX Cleanup Design

Date: 2026-05-21

## Summary

The Chores page should feel like the main workspace for managing chores and their review state. The current page still carries setup/review-queue language and a few visual leftovers from the earlier Plan page. This cleanup narrows the page to chore CRUD plus the separate staged review flow, while documenting a later Household page redesign without implementing it in this slice.

## Goals

- Keep Chores as the primary product workspace after Today.
- Remove remaining setup/Plan/review-queue framing from Chores.
- Make filter empty states accurate and lightweight.
- Keep recommendations attached to the relevant chore detail and review flow, not duplicated in a separate bottom panel.
- Fix obvious polish issues: secondary button hover contrast, singular/plural copy, and stale metric cards.
- Document the future Household page direction so the next slice has clear intent.

## Non-Goals

- Do not implement the Household page redesign in this slice.
- Do not add people management yet.
- Do not add structured room/floor inventory yet.
- Do not change backend recommendation behavior unless a small frontend contract issue requires it.
- Do not preserve `/setup` compatibility in the future Household redesign; the app has no production users.

## Chores Page Cleanup

### Page Framing

The Chores page should describe itself as a place to add, edit, archive, restore, and review chores. Remove copy that frames the page as setup, a plan, or a review queue. Existing class names can be cleaned up where touched, but broad CSS renaming is not required unless it makes the implementation clearer.

Recommended visible copy:

- Page title: `Household chores`
- Hero copy: `Add, edit, archive, and track your chores all in one place.`
- Section title: `Chore list`
- Section description: `Manage active and archived chores, review state, and recommendation decisions.`

### Review Entry Panel

Keep the page-level review entry point. Do not add per-card review buttons.

The unreviewed count must be grammatically correct and rendered as one coherent phrase:

- `1 chore has not been reviewed yet`
- `2 chores have not been reviewed yet`

The `Start review flow` button should remain visually secondary, but its hover state must preserve readable contrast. It should not inherit the global primary-button hover color while keeping secondary-button text color.

### Filters

Keep the tabs:

- `All active`
- `Unreviewed`
- `Recommendation pending`
- `Reviewed`
- `Archived`

When a filter has no matching chores, show only a short empty-state message. Do not render the add-chore form as a fallback for filtered empty states.

Recommended empty-state messages:

- `All active`: `No active chores yet. Add a chore to start building the household routine.`
- `Unreviewed`: `No unreviewed chores. New or changed chores will appear here before review.`
- `Recommendation pending`: `No chores have pending recommendations.`
- `Reviewed`: `No reviewed chores yet. Applied recommendations will move chores here.`
- `Archived`: `No archived chores yet.`

The add-chore form should stay available through the normal Chores CRUD surface, not as an accidental response to a filter result. If the current page does not yet have a clear add-chore entry point outside empty states, add one in this cleanup.

### Metrics

Remove the metric cards from Chores:

- `Tracked chores`
- `Duration concerns`
- `Pending recommendations`

These counts create dashboard-like noise and duplicate information that is already visible through filters and chore cards.

### Recommendations

Remove the bottom standalone Recommendations panel. Recommendations should appear in two places only:

- In the selected chore detail panel when a recommendation applies to that chore.
- In the staged review flow while the user is accepting or declining recommendations.

This avoids duplicate recommendation content and keeps the page aligned with chore-level decision making.

### Selected Chore Detail

The selected chore detail panel remains the place for editing the selected chore. It should also show any recommendation tied to that chore, including confidence and rationale. If no recommendation exists, use a neutral message such as:

`No recommendation for this chore yet.`

Avoid telling the user to "run review" inside every selected chore detail; the page-level review CTA already owns that flow.

## Deferred Household Page Follow-Up

The current Setup page should later be removed entirely and replaced by a Household page. Because the app is not in production, there is no need to preserve `/setup` references in code or docs when that work begins.

Future nav order:

1. `Today`
2. `Chores`
3. `Household`
4. `Settings`

The Household page should manage household context and eventually people. It should support a more structured context model than the current basic setup form.

Future Household context direction:

- Household name and home type.
- Household-level pets and pet types.
- Structured room/floor inventory.
- Floor type per room or area.
- Pet access or pet impact per room or area where useful.
- Robot vacuum coverage per room or area.
- Robot mop capability and mop coverage per room or area.
- Notes for edge cases that do not fit structured fields.

This richer context is intended to improve future agent recommendations, but it should be implemented after the Chores cleanup is complete.

## Testing

Update web tests to cover:

- Nav and route expectations that remain relevant to the Chores page.
- Correct singular/plural unreviewed review-entry copy.
- The secondary review CTA remains present.
- Filter-specific empty states render without the add-chore form.
- Metric cards are absent.
- Bottom standalone Recommendations panel is absent.
- Recommendations still appear in selected chore detail when tied to a chore.
- The staged review flow still works after the cleanup.

## Verification

Run:

```bash
npm.cmd run test -w web
npm.cmd run typecheck -w web
```

If shared types or backend-facing contracts change during implementation, also run:

```bash
npm.cmd run test -w server
npm.cmd run typecheck -w server
```
