# Core Authenticated Page Refresh Design

## Purpose

Apply the new Today dashboard visual language across Calendar, Households, and Family, then give Optimize a larger assistant-workspace refresh. The refreshed app should feel like one product: compact authenticated header, warm off-white surfaces, crisp blue-teal primary actions, dense operational panels, and green reserved for completed chores.

## Visual Direction

Use the mockups in `web/public/core-refresh-mockups/` as the direction reference, not as pixel-perfect source code. The primary product color should shift from green to a clean blue-teal for navigation, active states, primary actions, selected dates, and assistant emphasis. Green remains the completion color because it already communicates "done" well.

Completed chores must be visually quiet and space-efficient. They should render at the bottom of chore lists within the same day, hour, or agenda group. Their checkmark should be a small status icon, not a large control, and completed rows should take no more height than comparable incomplete rows.

## Page Scope

### Calendar

Calendar keeps its current month/week/day/list capability and power-user density. The refreshed shell should make the page feel aligned with Today, but the month view must continue to render a full month grid, including leading/trailing outside-month days as needed. Week and day views keep their time-grid behavior. Completed chores remain inline at the bottom of each relevant list.

### Households

Households should move from "setup form" energy toward a property dashboard. The top of the page should summarize household health, room/floor coverage, due-today context, and setup gaps. Existing floor/room editing functionality remains intact, but its surrounding layout should feel like the same compact operational system as Today.

### Family

Family should become a lightweight collaboration hub. It should still support members, invitations, role changes, and removals, but the main presentation should foreground household members, pending invitations, and coordination needs.

### Optimize

Optimize needs a larger refresh than the other pages. It should feel like the app's assistant workspace: prompt-first, strongly emphasized, and organized around reviewable recommendations, household signals, and approved changes. Existing recommendation and chat flows remain functional, but the page layout should make Optimize feel like the primary place to ask for chore-planning help.

## Responsive Behavior

Desktop should use full-width app bands and two-column compositions where useful. Mobile should prioritize the most actionable content first and stack secondary panels below it. Calendar mobile month view may use a compact month grid or an agenda-forward month summary, but it must not imply that month view is only a week.

## Constraints

- Do not add a new CSS framework or icon dependency.
- Keep the current React, TypeScript, Vite, and Testing Library stack.
- Preserve existing API behavior and data contracts.
- Validate mobile by resizing the browser window, per project preference.
- Keep mockups available for review, but production implementation should use the app's React/CSS files.

## Reference

- Mockup index: `web/public/core-refresh-mockups/index.html`
- Calendar mockup: `web/public/core-refresh-mockups/calendar.html`
- Households mockup: `web/public/core-refresh-mockups/households.html`
- Family mockup: `web/public/core-refresh-mockups/family.html`
- Optimize mockup: `web/public/core-refresh-mockups/optimize.html`
