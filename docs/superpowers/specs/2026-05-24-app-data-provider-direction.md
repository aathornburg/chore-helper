# App Data Provider Direction

Date: 2026-05-24

## Summary

After the Households floor editor slice is complete, refactor the current setup-focused household provider into an app data provider. The current `HouseholdSetupProvider` still assumes a single household ID can be restored from `localStorage`. That model should go away.

The next provider should focus on initial data loading for the authenticated user. Once auth is complete, the frontend should call `GET /api/households`, and the backend should resolve households for the currently authenticated user. The frontend should not persist or restore a household ID from browser storage.

## Direction

- Rename the provider away from setup language. `AppDataProvider` is the preferred direction unless a more domain-specific name emerges.
- Load all user households during app initialization after auth is ready.
- Shape provider state around loaded app data, not a single restored household ID.
- Remove `localStorage` household ID reads and writes.
- Treat `GET /api/households` as the primary initial data endpoint.
- Plan for each household payload to include the information needed by the main app views: household details, structure, chores, and chore recommendations.
- Auth should not introduce a selected, current, or active household concept. Consumers that still require one household may derive a temporary compatibility value from the loaded household list while they are being refactored, but the provider contract should not encode household selection.

## Backend Direction

`GET /api/households` should become an authenticated user-scoped endpoint:

- The frontend calls it without a household ID.
- The server uses the authenticated user/session to find accessible households.
- The response returns household-level data needed for initial app rendering.
- In the interim, before auth exists, the endpoint can return all households from the development store, but that should be treated as a temporary compatibility behavior.

## Migration Notes

- Keep this refactor separate from the floor editor implementation unless the editor is blocked by provider shape.
- Update `HouseholdsPage`, `ChoresPage`, `OptimizePage`, and dashboard consumers after the provider contract is changed.
- Remove setup-specific names only when the data-loading behavior changes too; a rename alone is not enough.
- Tests should prove app initialization does not depend on `chore-helper:household-id` in `localStorage`.
- Tests should verify the provider calls `/api/households` as the initial load path.

## Relationship To Floor Editor

The floor editor can continue using the current provider shape for this implementation slice. After the editor tasks are complete, this provider refactor should be the next cleanup/architecture slice so household data flow matches the upcoming auth and multi-household direction.
