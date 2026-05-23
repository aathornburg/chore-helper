# Households 2D Floor Editor Design

Date: 2026-05-23

## Summary

Replace the placeholder Households page with a household structure editor centered on a compact 2D house elevation. Users select floors by clicking the actual floor band in the house drawing, then manage the selected floor's rooms and floor-level details through editable cards and forms.

The first implementation should be practical rather than a floor-plan drawing tool. It should support adding, editing, and removing household floors, including an optional basement, plus editing each floor's details and room inventory.

## Goals

- Make the Households page the durable place to manage household structure and cleaning context.
- Use a compact elevation-first 2D house as the primary floor selector.
- Let users add and remove floors, including adding or removing a basement.
- Let users edit details for each floor.
- Let users add, edit, and remove room cards for the selected floor.
- Use multi-select flooring chips because floors and rooms can have multiple flooring surfaces, such as hardwood plus rugs.
- Capture structured context that can improve future chore recommendations.
- Keep the first slice focused on editable cards and structured data, not a spatial floor-plan builder.

## Non-Goals

- Do not build a drag-and-drop room layout editor.
- Do not attempt accurate room geometry, square footage, or architectural floor plans.
- Do not add household member or people management in this slice.
- Do not build authentication or household ownership changes in this slice.
- Do not change chore recommendation behavior yet, beyond preparing richer household data for future use.
- Do not preserve the old setup-form interaction if it conflicts with the new Households page direction.

## Page Structure

The page should use a two-region layout on desktop:

- Left panel: compact 2D elevation floor selector.
- Main panel: selected floor details and editable room cards.

On mobile, the floor selector stacks above the selected floor editor.

### Compact 2D Elevation Selector

The selector is a small side-view house, similar in scale to the compact navigator from the visual mockup. It should not dominate the page. Its job is to orient the user and make floor selection concrete.

Each floor appears as a horizontal band in the house:

- Upstairs / upper floors.
- Main floor.
- Basement, when present.

Clicking a floor band selects that floor. The selected band should have a clear active state.

Next to or below the house, show a compact text summary list of floors with room counts. The list mirrors the house selector and improves accessibility and scannability. Selecting a list row should select the same floor.

## Household Structure Management

Users need to manage the structure of the household, not only edit existing static floors.

### Add Floor

The page should provide an `Add floor` action. Adding a floor creates a new floor record with:

- A default name such as `Second floor` or `New floor`.
- A `levelType` of `upstairs` or `other`, depending on where it is inserted.
- Empty notes.
- Empty flooring chips.
- Default coverage and pet-impact values.
- No rooms initially.

The first version does not need arbitrary reordering controls. A conservative order is:

1. Upper floors, highest to lowest if multiple are later supported.
2. Main floor.
3. Basement.

If arbitrary floor ordering becomes necessary, it can be a future enhancement.

### Remove Floor

Users can remove a floor. Removing a floor also removes or detaches its rooms, so this action needs a confirmation state that states how many room cards will be removed.

The main floor should not be removable in the first slice. If the household only has one non-basement floor, it remains the required base floor.

### Basement Toggle

The basement should be managed explicitly because adding or removing it changes the house drawing.

If no basement exists, show an `Add basement` action. This creates a basement floor band and selects it.

If a basement exists, show a `Remove basement` action from the basement floor's detail area. Removing it requires confirmation and removes basement rooms.

## Floor Details

When a floor is selected, the main panel shows floor-level details before the room cards.

Floor fields:

- `Floor name`
- `Level type`: `upstairs`, `main`, `basement`, `other`
- `Flooring chips`: multi-select
- `Pet impact`: `none`, `low`, `medium`, `high`
- `Robot vacuum coverage`: `none`, `partial`, `most`, `all`
- `Robot mop coverage`: `none`, `partial`, `most`, `all`
- `Notes`

Flooring must use chips rather than a single select. A floor can be both `hardwood` and `rugs`, or `tile` and `mats`.

Initial flooring chip set:

- `hardwood`
- `tile`
- `carpet`
- `rugs`
- `vinyl`
- `laminate`
- `concrete`
- `mats`
- `mixed`
- `other`

The floor-level values act as defaults or summary context for the floor. Room cards can override them.

## Room Cards

The selected floor shows editable cards for rooms on that floor. Room cards are the first-slice editing surface, not a visual map.

Each room card should show:

- Room name.
- Flooring chips.
- Pet impact.
- Robot vacuum coverage.
- Robot mop coverage.

Room fields:

- `Room name`
- `Flooring chips`: multi-select, same chip set as floor details
- `Pet impact`: `inherit from floor`, `none`, `low`, `medium`, `high`
- `Robot vacuum coverage`: `inherit from floor`, `none`, `partial`, `most`, `all`
- `Robot mop coverage`: `inherit from floor`, `none`, `partial`, `most`, `all`
- Optional notes if the UI has room without crowding the first slice

Room cards should support:

- Add room.
- Edit room.
- Remove room.

Editing can be inline expansion or a side/detail panel. The first implementation should choose the simpler pattern that matches existing Chores row editing: expanding a card into an inline editor is acceptable.

## Data Model Direction

The frontend should model household structure separately from the old flat baseline shape.

Recommended types:

```ts
type CoverageLevel = "none" | "partial" | "most" | "all";
type PetImpact = "none" | "low" | "medium" | "high";
type FlooringSurface =
  | "hardwood"
  | "tile"
  | "carpet"
  | "rugs"
  | "vinyl"
  | "laminate"
  | "concrete"
  | "mats"
  | "mixed"
  | "other";

type HouseholdFloor = {
  id: string;
  name: string;
  levelType: "upstairs" | "main" | "basement" | "other";
  flooring: FlooringSurface[];
  petImpact: PetImpact;
  robotVacuumCoverage: CoverageLevel;
  robotMopCoverage: CoverageLevel;
  notes?: string;
  rooms: HouseholdRoom[];
};

type HouseholdRoom = {
  id: string;
  floorId: string;
  name: string;
  flooring: FlooringSurface[];
  petImpact: PetImpact | "inherit";
  robotVacuumCoverage: CoverageLevel | "inherit";
  robotMopCoverage: CoverageLevel | "inherit";
  notes?: string;
};
```

This spec does not require the exact persistence implementation yet. The implementation plan should decide whether to store this structure as a new JSON field first or normalize floors and rooms into separate database tables. A normalized model is likely better long term, but a JSON-backed first slice may be acceptable if it keeps the UI iteration fast.

## Existing Household Context

The old baseline fields map into the new model imperfectly. Since the app is not in production, migration can be simple.

Suggested first-load behavior:

- If no structured floors exist, create a default household structure in UI state.
- Use the current household name where available.
- Create one `Main floor`.
- Convert old room names into room cards on the main floor if available.
- Convert old flooring values into floor-level flooring chips where possible.
- Preserve old notes in the main floor notes or household notes.

## Interaction Flow

1. User opens `Households`.
2. The compact house selector shows current floors.
3. The main floor is selected by default unless the user previously selected another floor during the current page session.
4. User clicks a floor band.
5. Main panel updates to that floor's details and room cards.
6. User edits floor details with form controls and flooring chips.
7. User adds, edits, or removes room cards.
8. User adds or removes basement/floors through explicit actions.

## Error Handling

- If household structure fails to load, show a page-level error with a retry action.
- If saving floor details fails, keep the edited form state and show a recoverable status message.
- If adding/removing a floor fails, keep the previous structure and show a recoverable status message.
- If removing a floor would remove rooms, require confirmation before calling the delete action.
- If the selected floor is removed, select the nearest remaining floor. If the basement is removed, select the main floor.

## Accessibility

- Every floor band in the 2D house must be keyboard reachable and have an accessible name, such as `Select Main floor`.
- The text floor list must provide an equivalent way to select floors.
- Active floor state must not rely on color alone.
- Flooring chips must expose selected/unselected state.
- Remove floor and remove room confirmations must be accessible dialogs or inline confirmation controls.

## Testing

Add or update web tests to cover:

- Households page renders the compact 2D floor selector.
- Main floor is selected by default.
- Clicking a floor band changes the selected floor details.
- `Add floor` adds a selectable floor band and floor summary row.
- `Add basement` adds a basement band and selects it.
- `Remove basement` requires confirmation and removes the basement band.
- Main floor cannot be removed in the first slice.
- Floor details render flooring as multi-select chips.
- A floor can have multiple flooring chips selected, such as `hardwood` and `rugs`.
- Room cards render for the selected floor.
- Adding a room creates a room card on the selected floor.
- Editing a room can select multiple flooring chips.
- Removing a floor with rooms requires confirmation and communicates the room count.

If persistence changes are included in the implementation slice, add server tests for:

- Creating/updating household structure.
- Adding/removing floors.
- Adding/removing basement.
- Adding/updating/removing rooms.
- Preserving multi-surface flooring arrays.

## Visual Direction

Use the compact elevation-first mockup as the design reference:

`docs/households-compact-elevation-first.html`

The earlier comparison file remains useful for context:

`docs/households-2d-floor-selector-options.html`

The chosen direction is:

- Elevation-first interaction.
- Compact house size similar to the hybrid navigator option.
- Editable cards in the main panel rather than a 2D room map.

## Open Implementation Decisions

- Whether persistence should be normalized tables or a JSON structure on the household.
- Whether room editing should be inline expansion or a side panel.
- Whether floor addition should support multiple upper floors immediately or only one additional upper floor in the first slice.
- Whether the old baseline API should be replaced or kept as a compatibility wrapper during this transition.
