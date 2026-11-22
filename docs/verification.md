# Verification record

Checked on 22 November 2026.

## Passed

- 120 automated tests across nine files: timetable sharing privacy and imports, local demo isolation and persistence, exclusion rules and simulator, corrections and module isolation, timezone and conflicts, token generation and hashing, recovery derivation, fixed academic-profile choices and normalization, CSRF and request limits, trusted proxy handling, notification reconciliation, CSV safety, multipage Unicode PDF generation, Supabase HTTP URL/key handling, term-change archiving, academic-year isolation, academic-calendar exclusions and mid-semester starting balances.
- Fresh PostgreSQL 18 migration and transactional security suite using an isolated single-user database: registration gate, tenant ownership, occurrence generation, future attendance rejection, duplicate correction handling, audit records, token/session revocation, pending recovery retry and replay rejection, notification deduplication, rate counters, schema privileges, and account deletion. The sharing suite verifies access across different profile fields, snapshot field privacy, recipient term mapping, copied occurrence identity, preserved personal settings, duplicate imports across multiple tokens, expiry, owner-only revocation, and RLS configuration. Fixtures do not populate the application.
- TypeScript check and production Turbopack build, including standalone asset packaging. The earlier sandbox failure was resolved by allowing worker sockets and starting with a clean build cache.
- Locked dependencies installed in a separate temporary directory with `npm ci --ignore-scripts --offline`. This checks lockfile consistency; package lifecycle scripts were skipped.
- Server-backed PostgreSQL 18 migration and transactional integration/security suites, including effective anonymous-role RLS denial. The database was a new isolated local cluster; fixtures rolled back. The production app used a separate runtime role with schema usage and RPC execution permissions only.
- Eighteen Chromium browser checks against the production standalone app: registration and saved-secret confirmation, persisted attendance and risk, simulation immutability, corrections, CSV download, login/recovery, account deletion, route overflow, two-account timetable sharing, Sunday sessions, semester/year changes, shared non-teaching dates, starting balances and phone timetable readability. Sharing tests use accounts with different department, group, year and semester values. Registration checks inspect all profile options; settings checks change department/group while preserving modules and attendance. Phone checks cover 320×568, 390×844 and 844×390 layouts and reachable controls with animations enabled.
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
- Added visible-period banners, day-header badges and shaded columns for tests, exams and holidays. Focused production browser checks verify inclusive end-day badges, notices appearing and clearing as weeks change, and mobile empty-agenda explanations. English/French desktop and mobile screenshots were inspected for the exam period.
- Added private justified/unjustified starting balances per module. PostgreSQL tests cover integer bounds, atomic rollback, retry audit deduplication, expired sessions, tenant isolation, trusted RPC grants, legacy edits, sharing privacy, archived values and new-year defaults. Engine tests cover totals, simulations, independent corrections, unchanged attendance denominators and current-alert reconciliation. Desktop English and mobile French module-editor/detail screenshots were inspected. Sunday visibility tests use a fixed teaching week so a real test/holiday period cannot invalidate their fixtures.
- Fixed phone agenda rows expanding beyond the card: module names wrap across the available width, and time/room details appear below. Session overlays now render under the document body, outside the page animation whose retained transform created a containing block and trapped the panel below navigation. Details use a viewport-sized shell, independent content scrolling, visible header/footer actions, safe-area padding and visual-viewport resize handling. English/French phone screenshots and landscape views were inspected; no new database migration is needed for these layout fixes.
- Removed group, department, academic-year and semester matching from sharing preview/import in PostgreSQL and the local demo. Valid token, ownership, expiry/revocation, privacy, timezone consistency and duplicate-import rules remain checked. Imports map into the recipient's own term and leave their profile unchanged. Added department/group selectors and matching server validation; recognized legacy spelling variants normalize without rewriting old profiles automatically.

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

1. Apply pending SQL migrations to the live Supabase project, including `202611210002_academic_calendar.sql` for database calendar enforcement, `202611210003_initial_absences.sql` for starting balances, and `202611220001_open_timetable_sharing.sql` to remove profile matching from existing sharing RPCs. All migrations have been verified in isolated PostgreSQL databases; this workspace has no live database-owner connection. Application calendar exclusions already work while the calendar migration is pending.
2. Verify semester/year changes, database calendar enforcement and starting-balance saves through the target HTTPS deployment after its database updates.
3. Complete the manual target-device checks in the deployment guide, particularly drag/resize, profile changes, notifications, PWA installation and offline behavior. Local Chromium automation and screenshot inspection do not cover every interaction, browser or real device.

Local production-build, database and browser verification now pass. Readiness for student use remains conditional on the target-environment and manual checks above.
