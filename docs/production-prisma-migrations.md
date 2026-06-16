# Production Prisma Migrations

This app uses Prisma Migrate for production schema changes.

## One-Time Baseline Setup

The repository now includes a baseline migration:

```text
server/prisma/migrations/20260613160000_baseline_current_schema
```

If a production database already has this schema because it was previously updated with `prisma db push`, do not run the baseline SQL against it. Mark the baseline as already applied from the Render shell:

```bash
npm run db:resolve:baseline -w server
```

After that, production can use normal deploy migrations.

## Normal Future Workflow

Create schema deltas locally:

```bash
npm run db:migrate -w server -- --name describe_the_change
```

Commit and push the generated folder under:

```text
server/prisma/migrations
```

Apply pending migrations in Render:

```bash
npm run db:deploy -w server
```

## Task/Schedule Domain Rename Release

This release contains Prisma migrations that rename chore tables/columns to task tables/columns and add task inbox/import-link fields. Do not use `prisma db push` in production for this release.

Deployment order:

1. Deploy code and committed migration files.
2. In Render Shell, run `npm run db:deploy -w server`.
3. Restart the web service if Render does not restart it automatically.

Preferred automation:

- Add Render Pre-Deploy Command: `npm run db:deploy -w server`
- Keep Build Command separate from database migration.
- Keep `DATABASE_URL` pointed at the production database for the service running the pre-deploy command.

## Important Notes

- Use `db:deploy` in production, not `db:migrate`.
- Avoid `db:push` in production because it bypasses migration history.
- Migrations change schema only. They do not copy local data into production.
- The production service must have `DATABASE_URL` configured before running migration commands.
