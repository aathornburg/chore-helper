# Private Remote Beta Deployment Plan

## Summary

Recommended beginner-friendly setup for this app:

- **Domain/DNS:** Cloudflare Registrar + Cloudflare DNS
- **Frontend:** Vercel hosting `web` at `https://app.yourdomain.com`
- **Backend API:** Render web service hosting `server` at `https://api.yourdomain.com`
- **Database:** Render Postgres for simplest pairing with Render API, or Neon if you want a strong standalone Postgres provider
- **Auth:** Clerk production instance
- **Google Calendar:** Google Cloud OAuth app in testing mode with beta tester emails
- **CI/CD:** GitHub Actions for checks, plus Vercel/Render auto-deploy from `main`

This gives testers a realistic HTTPS/domain experience, makes Google OAuth work correctly, and avoids exposing a local machine.

## Step 1: Buy And Configure A Domain

Recommended:

- **Cloudflare Registrar:** best default if you are comfortable using Cloudflare DNS. Fair pricing, excellent DNS, no nonsense.
- **Porkbun:** friendly and cheap, good for buying domains.
- **Namecheap:** fine, popular, slightly busier UI.
- **Squarespace Domains:** acceptable, especially if you inherited a Google Domains setup.
- **GoDaddy:** works, but avoid it unless you already use it.

Recommended structure:

```text
app.yourdomain.com       -> frontend
api.yourdomain.com       -> backend API
```

Use Cloudflare DNS even if you buy the domain elsewhere. It makes DNS, HTTPS, and future tunnels/proxying easier.

## Step 2: Prepare The App For Production Hosting

Before deploying, add production-ready app config:

- Add server scripts:
  - `server build`: compile TypeScript to `dist`
  - `server start`: run compiled `dist/src/index.js`
- Make the server listen on the platform-provided `PORT`.
- Keep `VITE_API_BASE_URL` as the frontend API switch:
  - production value: `https://api.yourdomain.com`
- Replace broad `cors()` with allowed origins:
  - local dev: `http://localhost:5173`, `http://localhost:4200`
  - beta: `https://app.yourdomain.com`
- Move from `prisma db push` to Prisma migrations for hosted database changes.
- Keep using the existing `/api/health` check for host health checks.

Recommended beta default: do these minimal production-readiness changes before the first deploy.

## Step 3: Create The Database

Options:

- **Render Postgres:** easiest if API is on Render. Good beta default.
- **Neon:** very good managed Postgres, strong free/dev experience, connection pooling available.
- **Railway Postgres:** easiest if you host the whole app on Railway.
- **Supabase Postgres:** good if you may later want Supabase features, but unnecessary for this app right now.
- **Prisma Postgres:** natural Prisma ecosystem fit, worth considering if you want Prisma-managed hosting.

Recommendation:

- Use **Render Postgres** if you want fewer moving pieces.
- Use **Neon** if you want a dedicated Postgres provider and nice branching/pooling.

Set the backend `DATABASE_URL` to the hosted database URL. If using Neon with Prisma in production, use the pooled connection string for app runtime where appropriate.

## Step 4: Deploy The Backend API

Recommended: Render web service.

Render settings:

```text
Root directory: server
Build command: npm install && npm run build -w server
Start command: npm run start -w server
Environment: Node
```

Because this is a monorepo, the exact commands may be easier from repo root:

```text
Build command: npm ci && npm run build -w server
Start command: npm run start -w server
```

Backend env vars:

```text
DATABASE_URL=...
CLERK_SECRET_KEY=...
CLERK_PUBLISHABLE_KEY=...
APP_BASE_URL=https://app.yourdomain.com

AGENT_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_AGENT_MODEL=gpt-5.5

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALENDAR_REDIRECT_URI=https://api.yourdomain.com/api/me/calendar/google/callback
GOOGLE_OAUTH_STATE_SECRET=<long random secret>
GOOGLE_TOKEN_ENCRYPTION_KEY=<long random secret>

RESEND_API_KEY=...
INVITATION_FROM_EMAIL=Clenella <invites@yourdomain.com>
```

Add custom domain in Render:

```text
api.yourdomain.com
```

Then add the DNS record Render gives you in Cloudflare.

## Step 5: Deploy The Frontend

Recommended: Vercel.

Vercel project settings:

```text
Framework: Vite
Root directory: web
Build command: npm run build -w web
Output directory: web/dist
```

If Vercel has trouble with the monorepo root, set install/build from repo root or configure the root carefully. Vercel's Vite docs note that Vite-exposed env vars must use the `VITE_` prefix, which this app already does.

Frontend env vars:

```text
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_CLERK_PUBLISHABLE_KEY=...
```

Add custom domain:

```text
app.yourdomain.com
```

Then add the DNS record Vercel gives you in Cloudflare.

## Step 6: Configure Clerk Production

Create a **production** Clerk instance, separate from local dev.

Configure:

- Allowed origins / redirect URLs:
  - `https://app.yourdomain.com`
- Frontend publishable key in Vercel:
  - `VITE_CLERK_PUBLISHABLE_KEY`
- Backend secret key in Render:
  - `CLERK_SECRET_KEY`

Keep signups restricted for beta if possible:

- invite-only users, or
- limited allowed emails, or
- manual tester onboarding.

Recommendation: use Clerk production for the beta so testers exercise the real auth flow.

## Step 7: Configure Google Calendar OAuth

In Google Cloud:

1. Create/select a project.
2. Configure OAuth consent screen.
3. Put the app in **Testing** mode for private beta.
4. Add tester email addresses.
5. Create OAuth client:
   - Type: Web application
6. Add authorized redirect URI:

```text
https://api.yourdomain.com/api/me/calendar/google/callback
```

Do not use private LAN IPs. Google OAuth accepts localhost for same-machine local dev and real HTTPS domains for hosted usage, but not `192.168.x.x` callback URLs.

Recommendation: keep Google OAuth in testing mode until you are ready for broader public access.

## Step 8: Configure Email Invitations

The app already references Resend.

Options:

- **Resend:** best fit for this repo, already wired.
- **Postmark:** excellent transactional email, more polished but another integration.
- **SendGrid/Mailgun:** common, more enterprise-feeling.

Recommendation: use **Resend**.

Set DNS records Resend gives you for your sending domain, then set:

```text
RESEND_API_KEY=...
INVITATION_FROM_EMAIL=Clenella <invites@yourdomain.com>
APP_BASE_URL=https://app.yourdomain.com
```

## Step 9: Add CI/CD

Use two layers:

1. **GitHub Actions checks**
2. **Provider auto-deploys**

GitHub Actions should run on PRs and pushes to `main`:

```text
npm ci
npm run typecheck -ws
npm run test -ws
npm run build -w web
npm run build -w server
```

For this repo, note the current server full test command has shown a Windows/Vitest worker issue locally; CI on Linux may not have it. If needed, use the stable server command:

```text
npm run test -w server -- --pool=threads
```

Deployment:

- Vercel auto-deploys frontend when `main` changes.
- Render auto-deploys backend when `main` changes.
- Render runs DB migration command before starting the server once migrations are added.

Recommendation: keep deploys automatic from `main`, but require GitHub Actions to pass before merging.

## Step 10: First Beta Launch Checklist

Before inviting testers:

- `https://app.yourdomain.com` loads.
- `https://api.yourdomain.com/api/health` returns `{ ok: true }`.
- Sign in works with Clerk production.
- App can create/join a household.
- Google Calendar connect works.
- Calendar import works.
- Calendar export works.
- Optimize recommendation generation works with `AGENT_PROVIDER=openai`.
- Optimize chat works with OpenAI-backed provider.
- Invitations send real email.
- Database backup/restore path is known.
- You have a way to inspect server logs in Render.
- You have a short beta feedback channel: text thread, form, or GitHub issues.

Recommendation: start with 2 testers, then 5, then 10. Keep the beta invite-only.

## Assumptions And Defaults

- Use `app.yourdomain.com` and `api.yourdomain.com`, not the root domain, for the first beta.
- Use Render for API and Postgres unless you prefer Neon for database hosting.
- Use Vercel for the Vite frontend.
- Use Clerk production, not dev keys, for beta.
- Use Google OAuth testing mode with allowlisted beta users.
- Keep the app private/invite-only until auth, calendar sync, and data cleanup are boringly reliable.

## Sources

- Vercel Vite deployment and `VITE_` env behavior: https://vercel.com/docs/frameworks/vite
- Vercel environment variables: https://vercel.com/docs/projects/environment-variables
- Render deploys and auto-deploys: https://render.com/docs/deploys
- Render web services: https://render.com/docs/web-services
- Render Postgres: https://render.com/docs/postgresql
- Clerk production deployment checklist: https://clerk.com/docs/guides/development/deployment/production
- GitHub Actions Node build/test workflow: https://docs.github.com/en/actions/guides/building-and-testing-nodejs
- Neon connection pooling / Prisma: https://neon.com/docs/connect/connection-pooling and https://www.prisma.io/docs/orm/overview/databases/neon
