import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import type { AppData } from "@/lib/types";
import {
  buildAuditNotifications,
  buildCurrentNotifications,
  buildNotifications,
} from "@/lib/notifications";
import { credentialFromCookie, SESSION_COOKIE } from "@/lib/server/auth";
import { secretHash } from "@/lib/server/credentials";
import { ApiError, rpc } from "@/lib/server/database";
import { failure, readBody, success } from "@/lib/server/http";
import { dataSchema } from "@/lib/server/validation";
import { academicPeriodForInterval, isNonTeachingOccurrence, teachingDates } from "@/lib/academic-calendar";
import {
  localDemoEnabled,
  localDemoSnapshot,
  mutateLocalDemo,
} from "@/lib/server/local-demo";

export const runtime = "nodejs";
export async function GET() {
  try {
    if (await localDemoEnabled()) return success(await localDemoSnapshot());
    const credential = await credentialFromCookie();
    const data = await rpc<AppData>("snapshot", {}, credential);
    // Reconcile current state as well as reminders. Unique keys make this safe after
    // an interrupted mutation/notification response or a temporary emission failure.
    const drafts = [
      ...buildCurrentNotifications(data),
      ...buildAuditNotifications(data),
    ];
    if (drafts.length) {
      try {
        await rpc(
          "notifications_emit",
          {
            notifications: drafts.map((n) => ({
              ...n,
              dedup_key: n.dedupe_key,
            })),
          },
          credential,
        );
        return success(await rpc<AppData>("snapshot", {}, credential));
      } catch {
        /* Keep student data available; a later refresh retries delivery. */
      }
    }
    return success(data);
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const input = dataSchema.parse(await readBody(request));
    if (await localDemoEnabled()) return success(await mutateLocalDemo(input));
    const credential = await credentialFromCookie();
    const before = ["profile_save", "session_save", "occurrence_save", "attendance_save", "module_save"].includes(input.action)
      ? await rpc<AppData>("snapshot", {}, credential)
      : null;
    if (input.action === "profile_save") {
      const changingTerm =
        before!.student.semester !== input.semester ||
        before!.student.academic_year !== input.academic_year;
      if (
        changingTerm &&
        before!.modules.some(
          (module) => !module.archived_at && !module.academic_year,
        )
      )
        throw new ApiError(
          "A database update is required before changing your semester or academic year. Your profile and timetable have not been changed.",
          503,
          "MIGRATION_REQUIRED",
        );
    }
    if (input.action === "session_save" && !teachingDates(input.recurrence_start, input.recurrence_end, input.weekday).length)
      throw new ApiError("No teaching dates remain in this range because of the academic calendar.");
    if (input.action === "occurrence_save" && input.cancelled !== true) {
      const occurrence = before!.occurrences.find((item) => item.id === input.id);
      if (occurrence && academicPeriodForInterval(input.starts_at ?? occurrence.starts_at, input.ends_at ?? occurrence.ends_at, before!.student.timezone))
        throw new ApiError("Regular classes cannot be scheduled during tests, holidays or exams.");
    }
    if (input.action === "attendance_save" && input.attendance_status !== "cancelled") {
      const occurrence = before!.occurrences.find((item) => item.id === input.occurrence_id);
      if (occurrence && isNonTeachingOccurrence(occurrence, before!.student.timezone))
        throw new ApiError("Attendance cannot be recorded during tests, holidays or exams.");
    }
    const shouldNotify = [
      "attendance_save",
      "attendance_delete",
      "occurrence_save",
      "profile_save",
      "module_save",
    ].includes(input.action);
    const body: Record<string, unknown> = { ...input };
    if (input.action === "account_delete") {
      body.current_token_hash = secretHash(input.currentToken, "access");
      delete body.currentToken;
    }
    const result = await rpc(input.action, body, credential,
      input.action === "module_save" && input.initial_absences_by_type !== undefined
        ? "exclunich_module_save_by_type"
        : input.action === "module_save" && (input.initial_justified_absences !== undefined || input.initial_unjustified_absences !== undefined)
        ? "exclunich_module_save" : "absentia_api");
    if (input.action === "session_save") {
      // Also support deployed databases before the calendar trigger is installed.
      const after = await rpc<AppData>("snapshot", {}, credential);
      const sessionId = (result as { id: string }).id;
      const recorded = new Set(after.attendance.map((item) => item.occurrence_id));
      for (const occurrence of after.occurrences) {
        if (occurrence.session_id === sessionId && !recorded.has(occurrence.id) && isNonTeachingOccurrence(occurrence, after.student.timezone))
          await rpc("occurrence_save", { id: occurrence.id, cancelled: true }, credential);
      }
    }
    if (input.action === "account_delete") {
      (await cookies()).delete(SESSION_COOKIE);
      return success(result);
    }
    if (shouldNotify) {
      try {
        const after = await rpc<AppData>("snapshot", {}, credential);
        const drafts = [
          ...(before ? buildNotifications(before, after) : buildCurrentNotifications(after)),
          ...buildAuditNotifications(after),
        ];
        if (drafts.length)
          await rpc(
            "notifications_emit",
            {
              notifications: drafts.map((n) => ({
                ...n,
                dedup_key: n.dedupe_key,
              })),
            },
            credential,
          );
      } catch {
        /* The mutation committed; current-state notifications reconcile on refresh. */
      }
    }
    return success(result);
  } catch (error) {
    return failure(error);
  }
}
