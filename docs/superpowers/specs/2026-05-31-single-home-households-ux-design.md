# Single-Home Households UX Design

Date: 2026-05-31

## Summary

Redesign the Households page around the common case: most users will manage one home. The page should feel like a direct "My Home" workspace instead of a multi-property dashboard.

The chosen direction is **Option 1 page framing plus Pattern C multi-home escalation** from the comparison mockup:

- Use `My Home` as the single-household experience.
- Keep the primary view focused on the current home's profile, floors, and rooms.
- Replace aggregate metric cards with a read-only 2D house/floor preview in Overview.
- Hide multi-home actions behind a small `More` menu while the user has one home.
- Once the user has multiple homes, graduate the page to a `Homes` list model where `Add another home` naturally belongs at list level.

Reference mockup: `docs/households-single-home-ux-options.html`.

## Problem

The current Households page presents a multi-household dashboard even when the user only has one household. It shows account-level framing such as "Households," profile counts, property dashboard copy, and aggregate stats that read awkwardly for a single home:

- `1 of 1 profiles healthy`
- `Households: 1`
- Floors and rooms counted across homes
- A household list before the actual editor

That structure makes the default user do extra interpretation before they can edit the home model. It also gives too much visual weight to a use case that is likely uncommon: managing multiple separate homes.

## Goals

- Make the one-home state feel first-class and direct.
- Preserve support for multiple homes without implying a selected or active household model.
- Reduce "dashboard of dashboards" visual nesting.
- Make Overview, Floors, and Rooms feel like views of one home, not separate account-management areas.
- Keep the page compatible with existing household/profile/floor/room data structures.
- Keep the design implementable as an incremental frontend change.

## Non-Goals

- Do not remove support for multiple homes.
- Do not introduce an active household selector or global selected-home state.
- Do not redesign chore scheduling or household membership behavior.
- Do not change backend contracts as part of this UX pass.
- Do not implement a full visual floor-plan editor in this slice.

## Chosen Direction

### Single-Home State

When the user has exactly one household, the page should present a single-home workspace:

- Primary heading: `My Home`
- Primary views: `Overview`, `Floors`, `Rooms`
- Small page-level `More` action for low-frequency actions
- No household aggregate dashboard
- No visible `Add another home` button in the main header

The goal is for the user to immediately understand that this page edits the model of their home.

### Overview View

Overview should summarize the home using a visual read-only house model instead of metric boxes.

It should show:

- A compact 2D house elevation/floor preview.
- Floor rows or labels with room counts and setup status.
- Profile details below or beside the house preview.

The Overview view should not show standalone `Floors`, `Rooms`, and `Status` stat cards. Those repeat information better expressed by the house preview and floor summaries.

### Floors View

Floors should focus on floor-level editing:

- Floor selector or house elevation navigation.
- Selected floor details.
- Floor name, level type, flooring, pet impact, vacuum coverage, mop coverage, notes.
- Add/remove floor actions where appropriate.

Overview summary content should not repeat here.

### Rooms View

Rooms should focus on room-level editing:

- Floor selector or house elevation navigation.
- Room cards grouped by selected floor.
- Add/edit/remove room actions.
- Room flooring, pet impact, vacuum coverage, mop coverage, and notes.

Overview summary content should not repeat here.

### Single-Home More Menu

The single-home page should tuck rare home-management actions behind a small `More` menu. The menu can include:

- Rename home
- Add another home

This keeps `Add another home` discoverable without giving it primary header weight or placing it inside the current home's data.

## Multi-Home Escalation

When a user adds a second home, the page should graduate from `My Home` to a multi-home management model.

Recommended multi-home state:

- Primary heading: `Homes`
- A list of homes, each with a compact summary.
- `Add another home` appears at the top of the home list or list header.
- Each home can expand or navigate into its own `Overview`, `Floors`, and `Rooms` workspace.

This avoids a global active-home concept. The page is not saying "this is the selected home." It is saying "these are your homes; choose which one to manage."

## UX Rules

- Use `My Home` only when there is exactly one household.
- Use `Homes` when there are two or more households.
- Do not show account-level aggregate cards in the one-home state.
- Do not place `Add another home` inside a home's profile/details section.
- Do not make `Add another home` a primary action in the one-home header.
- Keep the Overview/Floors/Rooms selector compact and page-level.
- Keep cards shallow. Avoid cards inside cards unless a card represents a repeated item.
- Use green only for completion/done concepts; use teal for navigation and primary actions.

## Empty State

When the user has zero households:

- Keep a focused setup state.
- Explain that Clenella needs a home model before chores can be optimized.
- Primary action: create the first home.

This state can still use `My Home` language after creation, but before creation the page should not pretend a home exists.

## Implementation Notes

This can be implemented without backend changes.

Recommended frontend shape:

- Keep `HouseholdsPage` as the route-level component initially.
- Branch rendering by `households.length`:
  - `0`: first-home setup empty state.
  - `1`: single-home `My Home` workspace.
  - `2+`: `Homes` list workspace.
- Extract a reusable `HouseholdWorkspace` component for one home's Overview/Floors/Rooms views.
- Reuse or adapt the existing compact 2D house floor selector as the Overview preview.
- Keep add-home behavior wired to the existing `onAddHousehold` callback.
- Use local component state for open menus, selected view, selected floor, and editing state.

The current `HouseholdEditor` already contains much of the needed floor and room behavior. The redesign should reorganize the information architecture before doing deeper component extraction.

## Testing Notes

Add or update tests for:

- One household renders `My Home`, not the aggregate dashboard.
- One household does not show a primary `Add household` header button.
- The `More` menu exposes `Add another home`.
- Multiple households render the `Homes` list model.
- The Overview view shows the house/floor preview.
- Floors and Rooms views do not repeat Overview-only summary content.
- Existing floor, room, and profile save flows still work.

## Open Design Details

- Exact icon treatment for the `More` action.
- Whether multi-home list rows expand inline or navigate into a per-home detail workspace.
- How much profile data belongs beside the Overview house preview versus below it.
- Whether the nav label should become `My Home`, `Home`, or remain `Households`.

## Decision

Proceed with **Option 1 + Pattern C**:

- Single-home users get a clean `My Home` workspace.
- Multi-home affordances stay quiet until needed.
- Adding a second home changes the page into a `Homes` list model rather than creating a global active-home selector.
