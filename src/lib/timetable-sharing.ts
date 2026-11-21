import { randomUUID } from "node:crypto";
import type { AppData, Module, Session, Occurrence, Student } from "./types";

export type SharedCohort = Pick<
  Student,
  "group_name" | "department" | "academic_year" | "semester"
>;
export interface TimetableSnapshot {
  version: 1;
  cohort: SharedCohort;
  timezone: string;
  modules: Pick<
    Module,
    "id" | "name" | "code" | "professor" | "color" | "semester"
  >[];
  sessions: Pick<
    Session,
    | "id"
    | "module_id"
    | "session_type"
    | "weekday"
    | "start_time"
    | "end_time"
    | "classroom"
    | "professor"
    | "recurrence_start"
    | "recurrence_end"
  >[];
  occurrences: Pick<
    Occurrence,
    | "id"
    | "session_id"
    | "module_id"
    | "occurrence_date"
    | "starts_at"
    | "ends_at"
    | "classroom"
    | "session_type"
    | "cancelled"
  >[];
}
export interface TimetableShareInfo {
  id: string;
  title: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  module_count: number;
  session_count: number;
}
export interface TimetableSharePreview extends TimetableShareInfo {
  snapshot: TimetableSnapshot;
  already_imported: boolean;
  is_owner: boolean;
}
export class SharingError extends Error {}
export function sameCohort(a: SharedCohort, b: SharedCohort) {
  const normalized = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return (
    ["group_name", "department", "academic_year", "semester"] as const
  ).every((key) => normalized(a[key]) === normalized(b[key]));
}

/** Explicit allowlist: account details, attendance, notes and risk settings never travel. */
export function buildTimetableSnapshot(data: AppData): TimetableSnapshot {
  const { group_name, department, academic_year, semester, timezone } =
    data.student;
  const modules = data.modules
    .filter((m) => !m.archived_at && m.semester === semester)
    .map(({ id, name, code, professor, color, semester }) => ({
      id,
      name,
      code,
      professor,
      color,
      semester,
    }));
  const moduleIds = new Set(modules.map((m) => m.id));
  const sessions = data.sessions
    .filter((s) => moduleIds.has(s.module_id))
    .map(
      ({
        id,
        module_id,
        session_type,
        weekday,
        start_time,
        end_time,
        classroom,
        professor,
        recurrence_start,
        recurrence_end,
      }) => ({
        id,
        module_id,
        session_type,
        weekday,
        start_time,
        end_time,
        classroom,
        professor,
        recurrence_start,
        recurrence_end,
      }),
    );
  const sessionIds = new Set(sessions.map((s) => s.id));
  const occurrences = data.occurrences
    .filter((o) => sessionIds.has(o.session_id))
    .map(
      ({
        id,
        session_id,
        module_id,
        occurrence_date,
        starts_at,
        ends_at,
        classroom,
        session_type,
        cancelled,
      }) => ({
        id,
        session_id,
        module_id,
        occurrence_date,
        starts_at,
        ends_at,
        classroom,
        session_type,
        cancelled,
      }),
    );
  if (!sessions.length)
    throw new SharingError(
      "Add sessions in your current semester before sharing your timetable.",
    );
  if (
    modules.length > 100 ||
    sessions.length > 300 ||
    occurrences.length > 5000
  )
    throw new SharingError(
      "This timetable is too large to share. Limit it to the current semester.",
    );
  return {
    version: 1,
    cohort: { group_name, department, academic_year, semester },
    timezone,
    modules,
    sessions,
    occurrences,
  };
}

/** Independent copies: importing a schedule never imports another student's attendance. */
export function importTimetableSnapshot(
  target: AppData,
  snapshot: TimetableSnapshot,
  importedSources: Record<string, string> = {},
) {
  if (!sameCohort(target.student, snapshot.cohort))
    throw new SharingError(
      "This timetable is for a different group, department, academic year or semester. Check your profile.",
    );
  if (target.student.timezone !== snapshot.timezone)
    throw new SharingError(
      `Set your timezone to ${snapshot.timezone} before importing this timetable.`,
    );
  const data = structuredClone(target);
  const sources = { ...importedSources };
  const stamp = new Date().toISOString();
  let modulesAdded = 0,
    sessionsAdded = 0;
  const moduleMap = new Map<string, string>();
  for (const source of snapshot.modules) {
    const incoming = snapshot.sessions.filter((s) => s.module_id === source.id);
    if (
      incoming.length &&
      incoming.every(
        (s) =>
          sources[s.id] &&
          data.sessions.some((existing) => existing.id === sources[s.id]),
      )
    )
      continue;
    let own = data.modules.find(
      (m) => m.code === source.code && m.semester === target.student.semester,
    );
    if (
      own &&
      (own.archived_at ||
        own.name.trim().toLowerCase() !== source.name.trim().toLowerCase())
    )
      throw new SharingError(
        `Module code ${source.code} is already used by another or archived module. Rename or restore it first.`,
      );
    if (!own) {
      own = {
        ...source,
        semester: target.student.semester,
        id: randomUUID(),
        description: "",
        total_threshold: null,
        unjustified_threshold: null,
        archived_at: null,
        created_at: stamp,
      };
      data.modules.push(own);
      modulesAdded++;
    }
    moduleMap.set(source.id, own.id);
  }
  const sessionMap = new Map<string, string>();
  for (const source of snapshot.sessions) {
    if (
      sources[source.id] &&
      data.sessions.some((s) => s.id === sources[source.id])
    )
      continue;
    const module_id = moduleMap.get(source.module_id);
    if (!module_id)
      throw new SharingError(
        "The shared timetable contains an invalid module.",
      );
    const id = randomUUID();
    data.sessions.push({ ...source, id, module_id, created_at: stamp });
    sessionMap.set(source.id, id);
    sources[source.id] = id;
    sessionsAdded++;
  }
  for (const source of snapshot.occurrences) {
    const session_id = sessionMap.get(source.session_id);
    if (!session_id) continue;
    const module_id = moduleMap.get(source.module_id);
    if (!module_id)
      throw new SharingError(
        "The shared timetable contains an invalid occurrence.",
      );
    data.occurrences.push({
      ...source,
      id: randomUUID(),
      session_id,
      module_id,
    });
  }
  return {
    data,
    importedSources: sources,
    modules_added: modulesAdded,
    sessions_added: sessionsAdded,
  };
}
