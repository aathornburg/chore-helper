# My Home Setup Studio Design

Date: 2026-06-02

## Summary

Redesign the single-household `My Home` page around the selected **Home setup studio** direction from `docs/my-home-fresh-concepts.html`.

The page should feel like a playful but usable workspace for building and maintaining a home model. The 2D house becomes the visual anchor, the setup path becomes easier to understand, and room/floor actions become less visually aggressive.

This is a second-stage redesign of the existing single-home experience. The route, data model, and persistence behavior stay the same; the presentation and interaction hierarchy change.

## Selected Direction

Use **Concept A: Home setup studio**.

Core idea:

- The house model is large, dimensional, and persistent.
- The right side guides users through floors, rooms, and surfaces.
- Rooms are annotated items inside the workspace, not individual shadowed cards.
- Low-frequency actions are quiet links or secondary controls.
- The workspace should fill more of the viewport so the page feels intentional and substantial.

Reference mockup:

- `docs/my-home-fresh-concepts.html`

## Problem

The current `My Home` page has improved information architecture, but it still feels too close to a compressed form:

- Overview, Floors, and Rooms often stop halfway down the browser window.
- The 2D house reads like a selector, not a memorable home model.
- `Add room`, `Edit room`, and `Remove room` look too much like primary actions.
- Room cards inherit section-level box shadows, causing visual overload when a floor has many rooms.
- The page does not yet feel fun or inviting for a user setting up a household.

## Goals

- Make household setup feel visually engaging and approachable.
- Keep setup and maintenance workflows easy to understand.
- Preserve existing Overview/Floors/Rooms behavior.
- Preserve existing profile, floor, room, surface, and persistence logic.
- Make the 2D house more expressive without turning the page into a heavy illustration.
- Reduce primary-button overuse in the Rooms view.
- Remove per-room box shadows.
- Give the workspace a substantial minimum height.

## Non-Goals

- Do not build a true drag-and-drop floor plan editor.
- Do not change backend contracts.
- Do not change household, floor, or room schema.
- Do not remove multi-home support.
- Do not add an app-wide active-home concept.
- Do not redesign chore scheduling in this work.

## Experience

### Page Frame

The single-home page keeps:

- Heading: `My Home`
- Supporting copy about floors, rooms, surfaces, pet impact, and cleaning coverage
- Existing multi-home affordance for adding another home
- Existing `Overview`, `Floors`, `Rooms` tab model

The page changes from a compact editor into a studio workspace:

- One large visual/model area on the left
- One guided detail/work area on the right
- A minimum height that better fills the viewport
- Large panels use the shared offset shadow
- Repeated room items do not use the shared offset shadow

### Studio House Model

The house model should be more visually appealing than the current compact selector:

- Larger roof/body silhouette
- Teal dimensional roof
- Floor bands with room counts or setup signal text
- Small window/detail marks for visual richness
- Active floor shown in teal-tinted treatment
- Same model appears in Overview, Floors, and Rooms so the page feels stable

In Overview, floor clicks should open the Floors view with that floor selected.

In Floors and Rooms, floor clicks should select the floor in the current view.

### Overview View

Overview should read like a summary of what Cleanly knows:

- House model remains prominent.
- Right panel shows setup path and home details.
- `Edit home details` is a quiet text action.
- Home facts are grouped as read-only signals, not heavyweight cards.

### Floors View

Floors should focus on selected floor details:

- House model remains prominent and selectable.
- Right panel shows selected floor information.
- `Edit floor` is secondary or quiet.
- `Add floor` and `Add basement` remain secondary actions.
- Remove floor remains a danger text action.
- Flooring/surface controls stay visually subordinate.

### Rooms View

Rooms should feel like annotated parts of the model:

- House model remains prominent and selectable.
- `Add room` is a quiet link or secondary action, not a filled primary button.
- Each room appears as a flat annotated row or strip.
- Room rows show name, surfaces, and key cleaning signals.
- `Edit room` is a quiet text action.
- `Remove room` is a danger text action, ideally shown in the edit state rather than every default room row.
- Room rows do not use offset box shadows.

### Editing States

Existing inline editing behavior may remain for this phase, but it should be visually aligned with the studio:

- Edit forms should sit inside the right work area.
- Save actions may remain stronger than secondary actions.
- Cancel and destructive actions should be visually quiet.
- The edit state should not introduce multiple competing primary buttons.

## Visual Rules

- Use teal for navigation, active floor, and primary save actions.
- Use green only for completed/done concepts elsewhere in the app.
- Keep section cards squared or minimally rounded.
- Use shared offset shadow only for major sections.
- Do not apply shared offset shadow to repeated room rows.
- Avoid cards inside cards except for genuinely repeated items or bounded form surfaces.
- Keep text inside buttons short and readable.
- Make the workspace responsive by stacking the house model above the work panel on narrow screens.

## Accessibility

- Keep existing tab roles and `aria-selected` behavior.
- House floor buttons need clear labels.
- Overview floor buttons should indicate they open floor details.
- Room edit/remove actions need room-specific accessible names.
- Empty states must remain readable and not rely only on visual presentation.

## Implementation Notes

Expected frontend shape:

- Keep `HouseholdsPage` route behavior.
- Keep `SingleHomeWorkspace`, `HomesListWorkspace`, and `HouseholdWorkspace` as the current ownership boundaries.
- Add or extract a `StudioHouseModel` helper inside `HouseholdsPage.tsx` unless the component becomes too large.
- Refactor `renderFloorSelector` into a richer model renderer, or replace its call sites with `renderStudioHouseModel`.
- Refactor `renderRoomsPanel` so room rows use a new room annotation structure.
- Update `App.css` with scoped `.home-studio-*`, `.studio-house-*`, and `.room-annotation-*` classes.
- Remove `.room-card` and `.room-card-section` from the global offset-shadow grouping.

## Testing Notes

Update tests to confirm:

- Single-home page still renders `My Home`.
- Overview renders the home setup studio model.
- Clicking a floor in Overview moves to Floors and selects that floor.
- Rooms view renders quiet `Add room` and per-room edit actions.
- Rooms do not use the section shadow class/style hook.
- Existing profile/floor/room save behavior still works.

## Visual Verification

After implementation, verify in the browser:

- Overview, Floors, and Rooms each fill a meaningful portion of the viewport.
- The house model is visible and stable across all three tabs.
- Room rows do not create shadow overload.
- `Add room`, `Edit room`, and `Remove room` no longer read as equal primary actions.
- Mobile/narrow layout stacks without overlapping text or controls.
