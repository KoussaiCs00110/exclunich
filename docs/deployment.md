# Deploy with Supabase on Vercel or Render

The same Next.js application works on either host. Supabase stores the data; the host runs the authenticated server API. The browser never receives a Supabase secret key.

## Supabase

1. Create a Supabase project and open its SQL editor.
2. For a new database, run all files in `supabase/migrations` in numbered order as project owner. For an existing database, run only pending migrations. An installation that already has timetable sharing needs `202611210001_term_archiving.sql`. Do not rerun the foundation or sharing migration on a populated project. The new migration preserves existing records, adds module academic years, and atomically archives the current timetable when either term field changes.
3. Obtain the project URL and server secret key from the project's API settings. The `sb_secret_…` key is preferred; the legacy service-role JWT is also supported under `SUPABASE_SERVICE_ROLE_KEY`.
4. Save a stable `TOKEN_PEPPER` generated with `openssl rand -hex 32`. Keep a secure backup; rotating this secret invalidates access tokens and recovery codes.

Use the project origin for `SUPABASE_URL`, for example `https://your-project.supabase.co`. The HTTP adapter also accepts a pasted Data API URL ending in `/rest/v1/` and normalizes it before building RPC URLs.

## Vercel

1. Push this repository to your Git provider, then import it into Vercel. Select the Next.js framework and this directory as the project root.
2. Add server environment variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `TOKEN_PEPPER`, `APP_URL`, and `TRUST_PROXY=vercel`. This mode trusts the platform client-IP header only when Vercel supplies `VERCEL=1`; do not set `VERCEL` yourself on another host.
3. Set `APP_URL` to the exact production HTTPS origin, without a path or trailing slash. Configure separate origins and a separate Supabase test project for preview deployments.
4. Deploy. `vercel.json` uses `npm install` and `npm run build`. No local disk is required for runtime data.

## Render

1. Push this repository, create a Blueprint using `render.yaml`, and choose your plan in Render. The supplied blueprint declares a paid Starter instance; review Render's current pricing before provisioning.
2. Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `APP_URL` to the final HTTPS URL. Render generates `TOKEN_PEPPER`; back it up and preserve it when recreating the service.
3. The build installs development dependencies needed by Next.js and creates the production build. `npm start` listens on Render's provided `PORT`.
4. Alternatively, create a Docker web service using the included multi-stage `Dockerfile` and configure the same environment variables.

## Checks before student use

Run `npm test`, `npm run test:db:offline` (Linux PostgreSQL binaries), `npm run typecheck`, and `npm run build`. Run `npm run test:integration` against an isolated migrated server-backed database to check effective-role RLS denial. Then run `npm run test:e2e` against an isolated configured test database, with Chromium installed via `npx playwright install chromium`. Alternatively, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chromium executable. Set `E2E_BASE_URL` to test an already-running app, including the production standalone build. Browser test fixtures create and delete their own accounts and must not target a production project.

Manually verify registration and saving both secrets, login, interrupted recovery retry, module creation, recurring sessions, dragging and resizing, attendance corrections, both simulator choices, notification links, CSV/PDF export, profile changes, and mobile installation. The automated browser suite also checks major routes for horizontal overflow at desktop and mobile viewport sizes.

Enable managed database backups. Restrict host management access. Keep all database and token secrets server-only and preserve the pepper across deployments. Rate limiting is persistent in PostgreSQL; add hosting-level abuse protection for public registration. On Vercel, `TRUST_PROXY=vercel` uses the documented platform-supplied `x-vercel-forwarded-for` header, gated on its runtime `VERCEL=1` flag ([request headers](https://vercel.com/docs/headers/request-headers), [system variables](https://vercel.com/docs/environment-variables/system-environment-variables)). On Render, the default shared network bucket avoids trusting unverified forwarded headers. Tune `AUTH_NETWORK_LIMIT` and `REGISTRATION_NETWORK_LIMIT` for expected concurrent campus use; defaults are 240 authentication attempts and 60 registrations per 15 minutes. Credential-specific limits remain 8. Configure platform-level abuse controls as well.

## Current verification boundary

The production build, TypeScript check, 97 unit tests, offline and server-backed PostgreSQL suites, and twelve desktop/mobile Chromium browser checks pass locally. Browser checks used the production standalone app and a restricted database runtime role. Login, populated dashboard, history and timetable screenshots were also inspected. See [the verification record](verification.md) for scope and repeatable commands. Registration, login, module persistence and deletion of a disposable account passed against the hosted deployment after the Supabase URL correction. Automatic term archiving requires applying the new migration to that live database; it has been verified against an isolated populated upgrade database. Complete the remaining target HTTPS and manual checks before student use.

## Troubleshooting the setup message

The login page's generic setup message can also indicate a database connection failure. In Vercel's Production environment, confirm the project URL, a current active server secret key, a stable `TOKEN_PEPPER` and the exact HTTPS `APP_URL`. Leave `DATABASE_URL` unset when using Supabase HTTP. Supabase's API-key settings are separate from Vercel's environment: after rotating a key, update `SUPABASE_SECRET_KEY` in Vercel and redeploy. A deleted or revoked key cannot authenticate even when the database migrations are installed.
