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

## Important Notes

- Use `db:deploy` in production, not `db:migrate`.
- Avoid `db:push` in production because it bypasses migration history.
- Migrations change schema only. They do not copy local data into production.
- The production service must have `DATABASE_URL` configured before running migration commands.
