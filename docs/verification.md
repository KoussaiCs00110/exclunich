# Verification record

Checked on 21 November 2026.

## Passed

- 91 automated tests across eight files: timetable sharing privacy and imports, local demo isolation and persistence, exclusion rules and simulator, corrections and module isolation, timezone and conflicts, token generation and hashing, recovery derivation, input validation, CSRF and request limits, trusted proxy handling, notification reconciliation, CSV safety, multipage Unicode PDF generation, and Supabase HTTP URL/key handling.
- Fresh PostgreSQL 18 migration and transactional security suite using an isolated single-user database: registration gate, tenant ownership, occurrence generation, future attendance rejection, duplicate correction handling, audit records, token/session revocation, pending recovery retry and replay rejection, notification deduplication, rate counters, schema privileges, and account deletion. The sharing suite also verifies cohort boundaries, snapshot field privacy, copied occurrence identity, preserved personal settings, duplicate imports across multiple tokens, expiry, owner-only revocation, and RLS configuration. Fixtures do not populate the application.
- TypeScript check and production Turbopack build, including standalone asset packaging. The earlier sandbox failure was resolved by allowing worker sockets and starting with a clean build cache.
- Locked dependencies installed in a separate temporary directory with `npm ci --ignore-scripts --offline`. This checks lockfile consistency; package lifecycle scripts were skipped.
- Server-backed PostgreSQL 18 migration and transactional integration/security suites, including effective anonymous-role RLS denial. The database was a new isolated local cluster; fixtures rolled back. The production app used a separate runtime role with schema usage and RPC execution permissions only.
- Eight Chromium browser checks against the production standalone app: registration and saved-secret confirmation, persisted attendance and risk, simulation immutability, corrections, CSV download, login/recovery, account deletion, route overflow, two-account timetable sharing, and Sunday sessions at desktop and iPhone 13 viewport sizes. Sharing coverage checks preview/import, private attendance and thresholds, independent identifiers, duplicate prevention, revocation and preservation of imported sessions. Calendar assertions cover visible navigation, distinct mobile Week/Day labels, visible module names, all seven desktop day columns, and opening Sunday session details even when the legacy profile flag is false.
- Desktop/mobile visual inspection of login, populated dashboard, attendance history and timetable. No document overflow, uncaught browser exceptions or HTTP 5xx responses occurred during capture. Screenshots are available locally in `.local/verification/`; these ignored artifacts are not shipped with the app.

## Changes made during verification

- Corrected the attendance-history browser assertion to select the visible desktop table or mobile cards.
- Added two-account timetable-sharing browser coverage and optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` support for an installed Chromium binary.
- Replaced the calendar's icon-font navigation with text arrows, which render under the existing font policy. Removed the shared Agenda label override so mobile Week and Day controls are distinct. Moved module names beside session types so compact calendar events retain their titles.
- Normalized Supabase project and Data API URL formats so `/rest/v1/` is included exactly once. Trimmed pasted API keys while preserving legacy service-role authorization. Seven adapter tests, the full unit suite, TypeScript and the production build pass after this change.
- Made Sunday visible for existing and new accounts without a database migration, removed the preference that hides Sunday, and made the timezone week helper return seven days. Desktop and mobile browser tests verify Sunday session visibility and details across repeated visits with the old profile flag disabled.
- Set the weekly timetable and mobile agenda to start on Sunday and end on Saturday. Calendar tests verify desktop column order and the order of Sunday, Monday and Saturday sessions in the mobile agenda; timezone tests cover the local Sunday midnight boundary.

## Repeat the browser checks

Use an isolated migrated database, set `LOCAL_DEMO_MODE=false`, and configure `TOKEN_PEPPER` and `APP_URL`. With Playwright's Chromium installed, `npm run test:e2e` starts the development server automatically. To test an already-running production build instead:

```bash
npm run build
# In a separate terminal, start with the isolated database and runtime environment:
npm start
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

If using a system Chromium installation, also set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. The mobile project emulates an iPhone viewport in Chromium; it does not verify Safari or a physical iPhone.

## Still required

1. Apply pending migrations to the selected Supabase project, configure the server secrets from `.env.example`, and verify the Supabase HTTP RPC path. Local verification used direct PostgreSQL.
2. Deploy to the user's Vercel or Render account using `docs/deployment.md`, then verify the target HTTPS deployment. No live Supabase connection or hosted deployment has been verified.
3. Complete the manual target-device checks in the deployment guide, particularly drag/resize, profile changes, notifications, PWA installation and offline behavior. Local Chromium automation and screenshot inspection do not cover every interaction, browser or real device.

Local production-build, database and browser verification now pass. Readiness for student use remains conditional on the target-environment and manual checks above.
