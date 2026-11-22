import "server-only";
import type { Pool } from "pg";
import type { AppData } from "../types";
import { applyAcademicCalendar } from "../academic-calendar";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "INVALID_REQUEST",
  ) {
    super(message);
  }
}
const globalDb = globalThis as unknown as { absentiaPool?: Pool };
function mapDatabaseError(code: string | undefined, message: string, functionName?: string): never {
  if (functionName === "exclunich_sharing" && code === "22023" && message.startsWith("This timetable is for a different group, department, academic year or semester."))
    throw new ApiError("Timetable imports need an administrator update. Your profile and timetable have not been changed.", 503, "MIGRATION_REQUIRED");
  if (functionName === "exclunich_module_save" && ["42883", "PGRST202"].includes(code ?? ""))
    throw new ApiError("Starting absence balances are not enabled yet. Ask the administrator to enable this feature. Your module has not been changed.", 503, "MIGRATION_REQUIRED");
  if (code === "28000") throw new ApiError(message, 401, "UNAUTHORIZED");
  if (code === "42501") throw new ApiError(message, 403, "ONBOARDING_REQUIRED");
  if (code === "P0002") throw new ApiError(message, 404, "NOT_FOUND");
  if (code === "23505")
    throw new ApiError(
      "This module code already exists in this academic year and semester.",
      409,
      "DUPLICATE",
    );
  if (code === "22023" || code === "23514")
    throw new ApiError(
      code === "22023"
        ? message
        : "The supplied values violate a data integrity rule.",
      400,
    );
  if (code === "23503")
    throw new ApiError("The linked module or session is unavailable.", 400);
  throw new ApiError(
    "The database could not complete this operation. Please try again.",
    503,
    "DATABASE_ERROR",
  );
}
export function databaseConfigured() {
  return Boolean(
    process.env.DATABASE_URL ||
    (process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY)),
  );
}
/** The database API derives the owner exclusively from a verified, revocable session hash. */
export async function rpc<T = unknown>(
  action: string,
  body: Record<string, unknown> = {},
  credential: string | null = null,
  functionName: "absentia_api" | "exclunich_sharing" | "exclunich_module_save" = "absentia_api",
): Promise<T> {
  if (process.env.DATABASE_URL) {
    if (!globalDb.absentiaPool) {
      const { Pool } = await import("pg");
      globalDb.absentiaPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 8,
        connectionTimeoutMillis: 5000,
      });
    }
    try {
      const result = await globalDb.absentiaPool.query(
        {
          absentia_api: "select public.absentia_api($1,$2::jsonb,$3) as data",
          exclunich_sharing: "select public.exclunich_sharing($1,$2::jsonb,$3) as data",
          exclunich_module_save: "select public.exclunich_module_save($1,$2::jsonb,$3) as data",
        }[functionName],
        [action, JSON.stringify(body), credential],
      );
      const data = result.rows[0].data;
      return (action === "snapshot" ? applyAcademicCalendar(data as AppData) : data) as T;
    } catch (error) {
      const e = error as { code?: string; message: string };
      return mapDatabaseError(e.code, e.message, functionName);
    }
  }
  const url = process.env.SUPABASE_URL
    ?.trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/, "");
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key)
    throw new ApiError(
      "Database setup is required. Configure Supabase or a PostgreSQL connection to begin.",
      503,
      "SETUP_REQUIRED",
    );
  try {
    const response = await fetch(
      `${url}/rest/v1/rpc/${functionName}`,
      {
        method: "POST",
        headers: {
          apikey: key,
          ...(key.startsWith("sb_secret_")
            ? {}
            : { Authorization: `Bearer ${key}` }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_action: action,
          p_body: body,
          p_credential: credential,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      },
    );
    const data = await response.json();
    if (!response.ok)
      return mapDatabaseError(
        data.code,
        data.message || "Database request failed.",
        functionName,
      );
    return (action === "snapshot" ? applyAcademicCalendar(data as AppData) : data) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "The database is temporarily unavailable. Please try again.",
      503,
      "DATABASE_ERROR",
    );
  }
}
