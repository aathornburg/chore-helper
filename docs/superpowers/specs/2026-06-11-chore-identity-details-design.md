# Chore Identity Details Design

## Goal

Make it clear who is responsible for a chore and who imported calendar-originated work, without making the calendar harder to scan.

## Approved Direction

Use the minimal identity treatment from Option A.

Calendar cards show assignee identity through compact initials on card variants that already render secondary metadata. Title-only month cards omit the token to preserve scan density. The initials are glanceable, but they are not the only accessible identity surface. Full names and source details live in the chore detail modal.

## Calendar Surface

Calendar initials always represent the assignee.

For scheduled chore occurrences:

- Month cards show a compact assignee initials token only on variants that already render the time/status line. Title-only month cards omit initials.
- Week, day, and list rows show the initials token in the existing metadata area.
- The title remains the primary scan target.

For Google-imported items that become chores:

- If the item has an assignee, the calendar initials represent that assignee.
- Importer/source information does not appear on the calendar card.
- Importer/source information is shown in the detail modal.

For imported shared calendar events that are not chore occurrences:

- If there is no assignee field, the card omits initials.
- The event detail view shows who imported it and the source provider.

## Accessibility

Initials tokens must meet these requirements:

- The token has a full accessible label, such as `Assigned to Morgan Member`.
- The helper text appears on hover and keyboard focus.
- The token has a visible focus outline.
- Color contrast for initials and helper text must meet WCAG AA for normal text.
- The modal repeats full names as normal visible text, so initials are never the only way to identify a person.

The approved mockup used these contrast checks:

- Initials token text/background: `6.24:1`.
- Tooltip text/background: `12.93:1`.

## Chore Detail Modal

The detail modal puts identity and source information near the top, under the title.

For manual chores, show:

- Assigned to: full member name.
- Date/time and duration.
- Source: Manual chore.

For Google-imported chores or shared calendar events, show:

- Assigned to: full member name, when the object has an assignee.
- Date/time and duration.
- Source: Google Calendar.
- Imported by: full member name.

If an imported item has both an assignee and an importer, both appear with distinct labels. The assignee answers "who owns this work"; the importer answers "where did this shared item come from."

## Data Flow

The existing calendar page already has most of the data needed:

- `ChoreOccurrence.assignedUserId` identifies the assignee for scheduled chores.
- `CleanlyCalendarEvent.createdByUserId` identifies the user who created/imported a shared calendar event.
- Household members loaded for the calendar can translate user IDs into display names and initials.

Implementation adds small view helpers rather than duplicate lookup logic:

- `memberForUserId(userId)` to resolve a household member.
- `memberInitials(userId)` for the initials token.
- `memberDisplayName(userId, fallback)` for visible modal text and accessible labels.
- `eventImporterLabel(event)` for Google/import source rows.

## UI Components

Create a local render helper for the calendar page first. Extract it later only if another page needs the same token. It accepts:

- Initials.
- Accessible label.
- Optional visible helper text.
- A compact style suitable for calendar cards.

The token renders as non-button content. Inside clickable calendar cards, the card remains the keyboard focus target and the token helper appears when the card is hovered or focused; the token still carries its own accessible label. If the token is ever rendered outside a clickable card, it can become independently focusable to expose the same helper. It does not behave like a command and does not use button styling.

## Testing

Add focused tests for:

- Calendar cards show assignee initials for scheduled chore occurrences.
- Initials expose full assignee text through accessible labeling.
- Imported Google chores/events show importer/source details in the detail modal.
- When both assignee and importer exist, the modal distinguishes `Assigned to` from `Imported by`.
- Calendar cards do not show importer text as the initials identity when an assignee exists.

## Out Of Scope

- Reassigning imported calendar events.
- Adding avatars or uploaded profile photos.
- Changing Google Calendar import policy behavior.
- Surfacing importer details on dense calendar cards.
