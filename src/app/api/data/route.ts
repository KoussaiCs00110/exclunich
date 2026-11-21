import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import type { AppData } from "@/lib/types";
import {
  buildAuditNotifications,
  buildNotifications,
} from "@/lib/notifications";
import { credentialFromCookie, SESSION_COOKIE } from "@/lib/server/auth";
import { secretHash } from "@/lib/server/credentials";
import { ApiError, rpc } from "@/lib/server/database";
import { failure, readBody, success } from "@/lib/server/http";
import { dataSchema } from "@/lib/server/validation";
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
      ...buildNotifications({ ...data, attendance: [] }, data),
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
    if (input.action === "profile_save") {
      const before = await rpc<AppData>("snapshot", {}, credential);
      const changingTerm =
        before.student.semester !== input.semester ||
        before.student.academic_year !== input.academic_year;
      if (
        changingTerm &&
        before.modules.some(
          (module) => !module.archived_at && !module.academic_year,
        )
      )
        throw new ApiError(
          "A database update is required before changing your semester or academic year. Your profile and timetable have not been changed.",
          503,
          "MIGRATION_REQUIRED",
        );
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
    const result = await rpc(input.action, body, credential);
    if (input.action === "account_delete") {
      (await cookies()).delete(SESSION_COOKIE);
      return success(result);
    }
    if (shouldNotify) {
      try {
        const after = await rpc<AppData>("snapshot", {}, credential);
        const drafts = [
          ...buildNotifications({ ...after, attendance: [] }, after),
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
