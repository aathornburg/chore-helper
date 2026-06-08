# Local Postgres Setup with Docker

This project uses Prisma with Postgres for local persistence. In local development, Postgres runs in Docker, and Prisma connects to it through `DATABASE_URL`.

## Why Docker?

Docker lets us run a real Postgres database locally without installing Postgres directly on Windows. The database data is stored in a Docker volume on your machine, not in the repo.

This is free to run locally. The only cost is local machine resources: disk, RAM, and CPU.

## Install Docker Desktop

1. Download Docker Desktop for Windows:
   <https://www.docker.com/products/docker-desktop/>

2. Run the installer.

3. Use the default WSL 2 based engine if prompted.

4. Restart your computer if Docker asks you to.

5. Open Docker Desktop and wait until it says Docker is running.

6. Verify Docker from PowerShell:

   ```powershell
   docker --version
   docker compose version
   ```

   Both commands should print version information. If PowerShell says `docker` is not recognized, close and reopen PowerShell after Docker Desktop finishes starting.

## Local Database Shape

The local Postgres container uses:

```txt
Database: chore_helper
User: chore_helper
Password: chore_helper_password
Host: localhost
Port: 5432
```

The matching Prisma connection string is:

```txt
DATABASE_URL="postgresql://chore_helper:chore_helper_password@localhost:5432/chore_helper?schema=public"
```

This value should live in `server/.env`. The repo includes `server/.env.example` so future contributors know what to create.

Invitation delivery settings belong in the same file:

```dotenv
RESEND_API_KEY=""
INVITATION_FROM_EMAIL="Clenella <invites@example.com>"
APP_BASE_URL="http://localhost:5173"
```

When the server runs locally without Resend credentials, invitation creation logs the
acceptance link in the server output instead of sending outbound email. In production,
configure a verified Resend sender and `APP_BASE_URL`; without them invitation email
delivery fails closed.

## Google Calendar Local Setup

To test Google Calendar import/export locally:

1. Create or select a Google Cloud project.
2. Enable the Google Calendar API.
3. Configure the OAuth consent screen and add your Google account as a test user while the app is in testing mode.
4. Create a Web application OAuth client.
5. Add this authorized redirect URI:

```txt
http://localhost:3001/api/me/calendar/google/callback
```

6. Add these values to `server/.env`:

```dotenv
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_CALENDAR_REDIRECT_URI="http://localhost:3001/api/me/calendar/google/callback"
GOOGLE_OAUTH_STATE_SECRET="replace_with_random_state_secret"
GOOGLE_TOKEN_ENCRYPTION_KEY="replace_with_random_token_secret"
```

The local MVP uses user-triggered sync only. Users connect Google Calendar, pick source/destination calendars in Settings, review events to share, and explicitly export visible Clenella calendar events.

## Start the Database

From the repo root:

```powershell
npm run db:up
```

This starts the Postgres container in the background.

To check logs:

```powershell
npm run db:logs
```

To stop the database container:

```powershell
npm run db:down
```

Stopping the container does not delete the database data. The data stays in the Docker volume.

## Apply the Prisma Schema

After Postgres is running:

```powershell
npm run db:push
```

This creates or updates the local database tables from the Prisma schema.

The unified Calendar schedule schema intentionally replaces the earlier development
chore, schedule, and occurrence shape. Existing local development rows in those
tables may be reset rather than migrated. When applying this schema change, run:

```powershell
npm.cmd run db:generate -w server
npm.cmd run db:push -w server -- --accept-data-loss
```

For day-to-day development, this is the simplest command. Later, when the schema stabilizes, we can use migration files with:

```powershell
npm run db:migrate -w server
```

## Run Persistent Store Tests

The persistent-store tests delete the records they create. Run them only against a
dedicated database whose name ends in `_test`, never against your local app data.

Create the disposable test database once after the Postgres container is running:

```powershell
docker exec chore-helper-postgres psql -U chore_helper -d chore_helper -c "CREATE DATABASE chore_helper_test OWNER chore_helper;"
```

Then run the database-backed tests from the repo root:

```powershell
$env:DATABASE_URL="postgresql://chore_helper:chore_helper_password@localhost:5432/chore_helper_test?schema=public"
npm.cmd run test:db -w server
```

`test:db` first verifies that `DATABASE_URL` points at a database whose name ends in
`_test`, then runs a forced Prisma schema reset with accepted data loss. This keeps
the persistent test workflow compatible with intentional local schema breaks while
refusing to reset the normal `chore_helper` development database.

To reset only the persistent test schema without running the tests:

```powershell
$env:DATABASE_URL="postgresql://chore_helper:chore_helper_password@localhost:5432/chore_helper_test?schema=public"
npm.cmd run test:db:reset -w server
```

These tests verify membership, invitation acceptance, role administration, household
time-zone settings, chore persistence, household structure persistence, and timed
schedule/occurrence persistence through the Prisma store. They reset and clear data,
so continue to run them only against `chore_helper_test`.

## Inspect the Database

Prisma Studio gives you a browser UI for the database:

```powershell
npm run db:studio
```

This lets you see households, baselines, chores, and recommendations directly.

## Normal Local Workflow

1. Start Docker Desktop.

2. Start Postgres:

   ```powershell
   npm run db:up
   ```

3. Apply the schema:

   ```powershell
   npm run db:push
   ```

4. Start the app services.

5. Use Prisma Studio when you want to inspect database records:

   ```powershell
   npm run db:studio
   ```

## Troubleshooting

If `docker` is not recognized:

- Make sure Docker Desktop is installed.
- Make sure Docker Desktop is running.
- Close and reopen PowerShell.
- Restart your computer if Docker was just installed.

If Prisma cannot connect:

- Confirm Docker is running.
- Confirm the Postgres container is up with `docker ps`.
- Confirm `server/.env` contains the `DATABASE_URL` shown above.
- Confirm port `5432` is not already used by another local Postgres install.

If you want to reset local data:

```powershell
docker compose down -v
npm run db:up
npm run db:push
```

The `-v` flag deletes the Docker volume, so it removes all local database data.
