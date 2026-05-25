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
INVITATION_FROM_EMAIL="Cleanly <invites@example.com>"
APP_BASE_URL="http://localhost:5173"
```

When the server runs locally without Resend credentials, invitation creation logs the
acceptance link in the server output instead of sending outbound email. In production,
configure a verified Resend sender and `APP_BASE_URL`; without them invitation email
delivery fails closed.

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

Then run the schema setup and database-backed tests from the repo root:

```powershell
$env:DATABASE_URL="postgresql://chore_helper:chore_helper_password@localhost:5432/chore_helper_test?schema=public"
npm.cmd run db:push -w server
npm.cmd run test:db -w server
```

These tests verify membership, invitation acceptance, role administration, household
time-zone settings, chore persistence, and household structure persistence through
the Prisma store.

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
