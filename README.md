# Exclunich

A Next.js attendance and exclusion manager for NSCS students. PostgreSQL stores profiles, modules, recurring schedules, individual session occurrences, attendance, corrections, notifications and revocable sessions. Student access uses generated credentials rather than passwords.

This repository contains the application and Supabase migration. A configured database and runtime secrets are required; it does not silently replace persistence with browser storage or seed a real account with demo records.

## Run locally

### Frontend testing without Supabase

Set `LOCAL_DEMO_MODE=true` and `APP_URL=http://localhost:3000` in `.env.local`, install dependencies, and run `npm run dev:local`. Open `http://localhost:3000/login` and use **ABS-LOCAL-DEMO** (or click **Fill demo token**).

The demo includes synthetic modules, attendance and upcoming sessions. Module, timetable, attendance, profile, notifications and report interactions work with a separate `.local/frontend-demo.json` file. Account creation, credential rotation, recovery and deletion require a real backend and return an explanation in this mode. To reset the demo, stop the dev server and rename that JSON file. No Supabase configuration or token pepper is needed for this demo.

This mode requires `NODE_ENV=development`, an explicit flag, a loopback host, and no Vercel/Render environment markers. Production always uses normal authentication. Set the flag to `false` to test real authentication locally. `npm run dev:local` binds only to this computer; keep the default localhost port 3000 so it matches `APP_URL`.

Requirements: Node.js 22 or newer, npm, and either a Supabase project or PostgreSQL 15+.

```bash
npm install
cp .env.example .env.local
```

Set these values in `.env.local`:

- `TOKEN_PEPPER`: a stable random secret of at least 32 characters. Generate one with `openssl rand -hex 32`, and keep a secure backup outside the database.
- `APP_URL`: `http://localhost:3000` for development; the exact HTTPS origin in production.
- `SUPABASE_URL` and `SUPABASE_SECRET_KEY`: the project's URL and **server secret** API key. The older JWT service-role key can instead be supplied as `SUPABASE_SERVICE_ROLE_KEY`.

For a new project, apply all SQL files in `supabase/migrations` in numbered order using the Supabase SQL editor as database owner. For an existing installation, apply only pending migrations; do not rerun installed migrations. Install [automatic term archiving](supabase/migrations/202611210001_term_archiving.sql) after sharing, followed by [academic-calendar enforcement](supabase/migrations/202611210002_academic_calendar.sql). This installs the schema, constraints, indexes, RLS and restricted RPCs. There are no public browser credentials to configure.

```bash
npm run dev
```

Open `http://localhost:3000`, register, save the access token and separate recovery code, and explicitly confirm that both are saved. Then add modules and sessions. Only sessions that have ended can receive attendance records. New accounts start empty.

### Direct PostgreSQL alternative

Set `DATABASE_URL` instead of the Supabase variables. The same database schema and transactional API are used; the application never implements a separate persistence model.

To apply pending migrations, use an owner connection:

```bash
npm run db:migrate
```

For runtime, use a restricted database role with schema usage and execution permission on `public.absentia_api(text,jsonb,text)` and `public.exclunich_sharing(text,jsonb,text)`. It does not need direct table privileges. Keep migration-owner credentials separate from runtime credentials. Never commit a connection string or `.env.local`.

## Architecture

```text
Browser → Next.js protected pages / JSON route handlers
        → server validation, same-origin checks, credential hashing
        → PostgreSQL absentia_api(action, body, session_hash)
        → session verification, tenant ownership, constraints, atomic mutations
```

`src/lib/attendance.ts` is the single exclusion engine used by dashboard, module views, simulator, analytics and notification generation. `src/lib/timezone.ts` handles calendar dates in the configured IANA timezone. Defaults are Africa/Algiers, 5 total absences and 3 unjustified absences. Module thresholds can override student defaults.

The relational model separates weekly session templates from concrete dated occurrences. An attendance record references exactly one occurrence. A composite owner/module foreign key prevents linking another student's records. Cancelled occurrences and cancelled attendance never count. Future occurrences are excluded from actual attendance totals. Unrecorded sessions remain visible and do not invent absences or presence.

The timetable runs from Sunday through Saturday for every account. Older profile settings cannot hide Sunday sessions. Weekly and daily views, the mobile agenda and session details use the same complete schedule.

The shared academic calendar applies to every student's own timetable. For 2026–2027, regular classes are excluded on these inclusive dates:

| Period | First day | Last day |
| --- | --- | --- |
| Test 1 | 28 November 2026 | 3 December 2026 |
| Winter holidays (WH) | 19 December 2026 | 1 January 2027 |
| January exams | 9 January 2027 | 14 January 2027 |
| Test 2 | 13 March 2027 | 18 March 2027 |
| Spring holidays (SH) | 20 March 2027 | 1 April 2027 |
| May exams | 8 May 2027 | 13 May 2027 |

Dates use the student's configured timezone and apply to this exact year; they are not annual repeating holidays. Recurring schedules keep their selected end date and resume after each excluded period. The app prevents scheduling, moving or restoring regular classes into these dates, excludes existing blocked classes from calendar views, attendance totals and reminders, and skips blocked dates during timetable imports. The timetable's Academic calendar panel lists the periods. When a visible day or week overlaps a period, a colored banner shows its name, dates and the reason regular classes are suspended. Desktop day headers also show badges and shaded columns; empty mobile agendas name the period. Labels follow the student's English or French language setting.

The calendar migration enforces the same rules inside PostgreSQL, removes existing unrecorded classes on excluded dates, and marks recorded classes cancelled while preserving their original attendance and notes. Before that migration is installed, the app applies the calendar on reads and persists cancellations for newly generated blocked classes; existing stored rows are cleaned up when the migration runs.

Changing the saved semester or academic year automatically archives all currently active modules and their timetable in the same database transaction as the profile update. Sessions, occurrences, attendance and notes stay saved and remain available through Archived modules and Attendance History. The active timetable and dashboard start empty; add or import the new term's schedule using the same account. Saving unchanged term fields or editing other settings does not archive anything.

Modules retain their academic year, allowing the same module code and semester in a later year. The term-archiving migration assigns existing modules the owner's currently saved year because earlier records did not store one. Apply this migration before enabling term changes on an existing deployment; the server blocks changes to an active legacy timetable until the migration is installed.

Session creation materializes weekly occurrences for the selected date range, up to 366 days. Editing a series preserves recorded occurrences as historical entries and rebuilds unrecorded occurrences. Changing the profile timezone preserves existing absolute occurrence timestamps; rebuilding a series interprets its local times in the newly selected timezone. Moving or resizing a single occurrence preserves its identity; recorded occurrences must have their attendance removed before rescheduling. Deleting a module or series removes its linked sessions and attendance, so the interface requires a confirmation.

Notifications are built from the shared calculation engine after mutations and reconciled from current state on refresh. A unique student/event key prevents duplicates, including after a notification is removed from view. Upcoming-session reminders are evaluated while the app requests fresh data. There is no background push or email notification service configured.

## Authentication and data security

- Access and recovery credentials contain 32 randomly generated readable characters, grouped for copying. Only domain-separated HMAC-SHA256 hashes are stored.
- A successful login issues an independent random 256-bit session. The database stores its SHA256 hash, revocation state and absolute 14-day expiry.
- Production cookies use `__Host-absentia`, `HttpOnly`, `Secure`, `SameSite=Strict` and path `/`. Development uses a local cookie name.
- Protected server layouts and every database operation verify a live session. Student identity comes from that session, never a client-supplied `student_id`.
- All tables have RLS enabled with no public browser policies or browser grants. Only the trusted server role can execute the API function. The service role bypasses RLS; the RPC explicitly verifies ownership and uses composite foreign keys. This design does **not** expose service credentials or use the permanent access token as a Supabase credential.
- Account operations serialize on the student row and recheck session validity after waiting, preventing token-login/revocation races.
- Auth attempt limits live in PostgreSQL, so they survive server restarts and run before credential validation. Credential and network buckets use HMACs. Without a trusted proxy, network limiting uses a shared bucket. Defaults are 240 auth attempts and 60 registrations per 15 minutes; credential-specific limits remain 8. `AUTH_NETWORK_LIMIT` and `REGISTRATION_NETWORK_LIMIT` can be tuned for shared campus networks. Production should also use platform abuse controls.
- Mutations require JSON and an exact matching `Origin`. Production refuses mutations without `APP_URL`. Inputs are validated with Zod; database constraints provide an additional boundary.
- Token rotation requires the current token and revokes every older session and token immediately. Recovery-code rotation also requires the current token.
- Attendance corrections retain before/after audit entries. Saving an unchanged record is idempotent. Notifications have database-enforced deduplication.

### Recovery and interrupted requests

Save the recovery code separately from the access token. It can replace a lost access token without deleting modules or attendance. Recovery revokes existing tokens and sessions and produces a new access token and recovery code.

Replacement secrets are derived with domain-separated HMAC from the original random recovery code. The database stores only hashes. If the response is interrupted, the original recovery code may retry **that exact pending replacement** while its replacement hashes are still active and the student has not confirmed saving it. Confirmation disables the retry flag permanently. A subsequent recovery cannot resurrect an older replacement. This makes response loss recoverable while keeping completed recovery codes single-use.

If both access and recovery credentials are lost, there is no verified email or identity channel with which to prove account ownership. The application explains that limitation instead of offering an insecure identity bypass. Losing the server's `TOKEN_PEPPER` also invalidates both credential types; back it up securely. Registration interrupted before any credentials are delivered can be started again because that account has no academic data yet.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

The pure tests cover exclusion rules, configurable thresholds, simulations, module isolation, present/cancelled/future records, edits/deletes, timezone calculations, notification transitions, credential generation and input validation.

Run the transactional database suite against a migrated **isolated test database**:

```bash
npm run test:integration
```

It tests registration gating, tenant isolation, unique attendance, corrections and audits, cancellation, future-record rejection, token/session revocation, recovery retry and replay protection, durable rate limits, RLS privileges and account deletion. Its fixtures are rolled back. Against a real server it also impersonates the anonymous role to check effective RLS denial.

On Linux with PostgreSQL binaries available, a separate isolated cluster can run the same checks without a network server:

```bash
npm run test:db:offline
```

Single-user PostgreSQL grants implicit superuser powers, so the offline suite checks RLS configuration and grants but skips effective role impersonation. Run the server-backed suite to verify that boundary in the target database.

Browser end-to-end and visual verification require a running server, a configured test database and installed browser dependencies. Source-level tests and real SQL assertions do not substitute for those checks.

## Deploy

For the requested Supabase + Vercel/Render setup, follow [the deployment guide](docs/deployment.md). The repository includes `vercel.json`, `render.yaml`, and a Dockerfile.

Use a Node-compatible Next.js host such as a managed Next.js platform or a Node server. Install dependencies from `package.json`, configure the server-only environment, apply the migration, run the checks, then build and start the app:

```bash
npm run build
npm start
```

Set `APP_URL` to the final HTTPS origin before accepting registration. Preserve `TOKEN_PEPPER` across all instances and releases. Do not prefix any credential or database environment variable with `NEXT_PUBLIC_`. Provision database backups and use a separate test project for validation.

`TRUST_PROXY=vercel` trusts only `x-vercel-forwarded-for` when the Vercel runtime exposes `VERCEL=1`; do not set that platform flag manually elsewhere. Vercel documents its [client-IP headers](https://vercel.com/docs/headers/request-headers) and [runtime platform flag](https://vercel.com/docs/environment-variables/system-environment-variables).

`TRUST_PROXY=cloudflare` is appropriate only when direct origin access is blocked and Cloudflare supplies `cf-connecting-ip`. Otherwise leave it as `none` and configure deployment-level rate limiting. A spoofable forwarded-IP header must never be used for brute-force protection.

The PWA manifest and service worker support installation. Authenticated API responses and student pages must not be cached as offline data; loss of connectivity should show the offline state and resume with fresh server data.

No live Supabase project or hosted deployment is implied by this repository. Verify registration, login, recovery, module/session editing, mobile timetable interactions, exports and account deletion in the target environment before inviting students.

## Main source locations

- `src/app`: Next.js routes, protected student shell and JSON APIs.
- `src/components`: responsive student UI and reusable controls.
- `src/lib/attendance.ts`: exclusion and simulation engine.
- `src/lib/notifications.ts`: deterministic notification transitions.
- `src/lib/server`: credential handling, server sessions, validation and database adapter.
- `supabase/migrations`: normalized PostgreSQL schema and session-scoped RPC.
- `tests` and `scripts/db-security-test.sql`: pure and real database checks.

## Visual identity and motion

The interface uses forest green, sage, ivory and terracotta, with separate accessible warning and exclusion colours in both themes. Adwaita Sans and DejaVu Serif are self-hosted as Latin/extended-Latin WOFF2 subsets; their licenses are included in `public/fonts`. Personal module colours are preserved; the local demo uses a muted coordinated palette.

Page entrances, staggered cards, hover feedback and dialog transitions use CSS. Chart animations also follow the device’s reduced-motion setting. No animation package or remote font service is required.

## Share a timetable with your group

Open **My Timetable → Share / import → Share mine**, choose a name and expiry, and copy the generated `EXSH-…` token. Give this timetable token to classmates; your account login token remains private. Tokens expire after 1, 7 or 30 days and can be revoked from the same panel. The token is shown once and only its cryptographic hash is stored.

Classmates use **Share / import → Use a token**, preview the modules and weekly sessions, then import. Group, department, academic year and semester must match the saved profiles, with case and whitespace normalized. Profile group declarations are self-reported, not university-verified membership. The timezone must match before importing.

Shares are frozen schedule snapshots. Imported schedules become independent copies; changes do not synchronize. Attendance, notes, account details and individual exclusion thresholds never transfer. Matching module codes and names are reused without changing the recipient's settings. Conflicting or archived module codes must be resolved first. Source session mappings and import receipts prevent duplicate imports, including when the owner generates a second token for the same series. Revocation stops future access but leaves imported personal copies intact.

The local demo supports token creation, preview and revocation. A demo token belongs to the existing demo account, so importing it into that same account is prevented. Use two real test accounts with matching groups for the complete cross-student workflow. Run `npm run test:db:offline` for real PostgreSQL tests of import ownership, privacy, duplicate prevention, group checks, expiry and revocation.

Existing database RPC names, session cookies and access-token prefixes are retained across the Exclunich rename so existing accounts and pending recovery attempts continue to work.
