#!/usr/bin/env bash
# Tests real PostgreSQL without a server or network sockets. Requires initdb and postgres.
set -euo pipefail
project_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cluster_dir="$(mktemp -d "${TMPDIR:-/tmp}/absentia-pg-check.XXXXXXXX")"
trap 'rm -rf -- "$cluster_dir"' EXIT
initdb -D "$cluster_dir/data" -A trust --no-locale > "$cluster_dir/init.log" 2>&1
printf 'create role anon; create role authenticated; create role service_role;\n' | postgres --single -j -c absentia.offline=on -D "$cluster_dir/data" postgres > "$cluster_dir/roles.log" 2>&1
for migration in "$project_root"/supabase/migrations/*.sql; do
 postgres --single -j -c absentia.offline=on -D "$cluster_dir/data" postgres < "$migration" > "$cluster_dir/migrate.log" 2>&1
 if rg -q 'ERROR|FATAL' "$cluster_dir/migrate.log"; then cat "$cluster_dir/migrate.log"; exit 1; fi
done
postgres --single -j -c absentia.offline=on -D "$cluster_dir/data" postgres < "$project_root/scripts/db-security-test.sql" > "$cluster_dir/tests.log" 2>&1
if rg -q 'ERROR|FATAL' "$cluster_dir/tests.log"; then cat "$cluster_dir/tests.log"; exit 1; fi
if ! rg -q 'PASS: all database workflow and security assertions completed' "$cluster_dir/tests.log"; then cat "$cluster_dir/tests.log"; exit 1; fi
postgres --single -j -c absentia.offline=on -D "$cluster_dir/data" postgres < "$project_root/scripts/db-sharing-test.sql" > "$cluster_dir/sharing.log" 2>&1
if rg -q 'ERROR|FATAL' "$cluster_dir/sharing.log"; then cat "$cluster_dir/sharing.log"; exit 1; fi
if ! rg -q 'PASS: timetable sharing' "$cluster_dir/sharing.log"; then cat "$cluster_dir/sharing.log"; exit 1; fi
# Single-user -j mode needs an empty line after its final command.
{ cat "$project_root/scripts/db-term-test.sql"; printf '\n'; } | postgres --single -j -c absentia.offline=on -D "$cluster_dir/data" postgres > "$cluster_dir/term.log" 2>&1
if rg -q 'ERROR|FATAL' "$cluster_dir/term.log"; then cat "$cluster_dir/term.log"; exit 1; fi
if ! rg -q 'PASS: term archiving' "$cluster_dir/term.log"; then cat "$cluster_dir/term.log"; exit 1; fi
{ cat "$project_root/scripts/db-calendar-test.sql"; printf '\n'; } | postgres --single -j -c absentia.offline=on -D "$cluster_dir/data" postgres > "$cluster_dir/calendar.log" 2>&1
if rg -q 'ERROR|FATAL' "$cluster_dir/calendar.log"; then cat "$cluster_dir/calendar.log"; exit 1; fi
if ! rg -q 'PASS: academic calendar' "$cluster_dir/calendar.log"; then cat "$cluster_dir/calendar.log"; exit 1; fi
{ cat "$project_root/scripts/db-initial-absences-test.sql"; printf '\n'; } | postgres --single -j -c absentia.offline=on -D "$cluster_dir/data" postgres > "$cluster_dir/initial-absences.log" 2>&1
if rg -q 'ERROR|FATAL' "$cluster_dir/initial-absences.log"; then cat "$cluster_dir/initial-absences.log"; exit 1; fi
if ! rg -q 'PASS: initial absence balances' "$cluster_dir/initial-absences.log"; then cat "$cluster_dir/initial-absences.log"; exit 1; fi
printf 'PASS: real PostgreSQL migration, authentication, recovery, isolation, attendance, rate limits, RLS configuration and deletion (effective-role RLS requires a server).\n'
printf 'PASS: timetable sharing, privacy, cohort restrictions, duplication, expiry and revocation.\n'
printf 'PASS: automatic term archiving, transaction rollback, preserved history and academic-year isolation.\n'
printf 'PASS: academic calendar exclusions, inclusive dates, recurrence, historical records and cleanup.\n'
printf 'PASS: initial absence balances, atomic updates, isolation, private sharing and term archives.\n'
