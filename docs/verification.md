# Verification record

Checked on 21 November 2026.

## Passed

- 109 automated tests across nine files: timetable sharing privacy and imports, local demo isolation and persistence, exclusion rules and simulator, corrections and module isolation, timezone and conflicts, token generation and hashing, recovery derivation, input validation, CSRF and request limits, trusted proxy handling, notification reconciliation, CSV safety, multipage Unicode PDF generation, Supabase HTTP URL/key handling, term-change archiving, academic-year isolation and academic-calendar exclusions.
- Fresh PostgreSQL 18 migration and transactional security suite using an isolated single-user database: registration gate, tenant ownership, occurrence generation, future attendance rejection, duplicate correction handling, audit records, token/session revocation, pending recovery retry and replay rejection, notification deduplication, rate counters, schema privileges, and account deletion. The sharing suite also verifies cohort boundaries, snapshot field privacy, copied occurrence identity, preserved personal settings, duplicate imports across multiple tokens, expiry, owner-only revocation, and RLS configuration. Fixtures do not populate the application.
- TypeScript check and production Turbopack build, including standalone asset packaging. The earlier sandbox failure was resolved by allowing worker sockets and starting with a clean build cache.
- Locked dependencies installed in a separate temporary directory with `npm ci --ignore-scripts --offline`. This checks lockfile consistency; package lifecycle scripts were skipped.
- Server-backed PostgreSQL 18 migration and transactional integration/security suites, including effective anonymous-role RLS denial. The database was a new isolated local cluster; fixtures rolled back. The production app used a separate runtime role with schema usage and RPC execution permissions only.
- Fourteen Chromium browser checks against the production standalone app: registration and saved-secret confirmation, persisted attendance and risk, simulation immutability, corrections, CSV download, login/recovery, account deletion, route overflow, two-account timetable sharing, Sunday sessions, semester/year changes and shared non-teaching dates at desktop and iPhone 13 viewport sizes. Calendar tests use different groups with personal modules, check inclusive periods, skipped weeks, resumed classes and rejected moves. Term tests verify automatic archiving and preserved history.
- Desktop/mobile visual inspection of login, populated dashboard, attendance history and timetable. No document overflow, uncaught browser exceptions or HTTP 5xx responses occurred during capture. Screenshots are available locally in `.local/verification/`; these ignored artifacts are not shipped with the app.

## Changes made during verification

- Corrected the attendance-history browser assertion to select the visible desktop table or mobile cards.
- Added two-account timetable-sharing browser coverage and optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` support for an installed Chromium binary.
- Replaced the calendar's icon-font navigation with text arrows, which render under the existing font policy. Removed the shared Agenda label override so mobile Week and Day controls are distinct. Moved module names beside session types so compact calendar events retain their titles.
- Normalized Supabase project and Data API URL formats so `/rest/v1/` is included exactly once. Trimmed pasted API keys while preserving legacy service-role authorization. Seven adapter tests, the full unit suite, TypeScript and the production build pass after this change.
- Made Sunday visible for existing and new accounts without a database migration, removed the preference that hides Sunday, and made the timezone week helper return seven days. Desktop and mobile browser tests verify Sunday session visibility and details across repeated visits with the old profile flag disabled.
- Set the weekly timetable and mobile agenda to start on Sunday and end on Saturday. Calendar tests verify desktop column order and the order of Sunday, Monday and Saturday sessions in the mobile agenda; timezone tests cover the local Sunday midnight boundary.
- Added an atomic database trigger for semester/year changes and matching local-demo behavior. Module academic years preserve history and allow same-code modules in later years; sharing imports and snapshots respect that year. SQL checks cover transaction rollback, unchanged settings, isolation, archive preservation and new-year imports. A populated database upgrade was verified with the restricted app role, including a safe refusal before migration and a successful change afterward.
- Added the six shared non-teaching periods for 2026–2027. Pure tests cover every boundary, local midnight, preserved attendance, reminders, imports and legacy snapshot reads. PostgreSQL tests verify recurrence skips, rejected rescheduling/restoration, owner-only cleanup and preserved recorded history. An application test with the calendar trigger disabled verified six active and four persistently cancelled dates in a ten-week recurrence.

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

1. Apply any pending term migration and `202611210002_academic_calendar.sql` to the live Supabase project for direct database enforcement and global stored-row cleanup. The calendar migration has been verified against isolated PostgreSQL databases. The application also enforces exclusions while that migration is pending.
2. Verify semester/year changes and database calendar enforcement through the target HTTPS deployment after its database updates.
3. Complete the manual target-device checks in the deployment guide, particularly drag/resize, profile changes, notifications, PWA installation and offline behavior. Local Chromium automation and screenshot inspection do not cover every interaction, browser or real device.

Local production-build, database and browser verification now pass. Readiness for student use remains conditional on the target-environment and manual checks above.
