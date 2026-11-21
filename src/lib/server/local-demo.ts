import "server-only";
import { cookies, headers } from "next/headers";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createLocalDemo, localDemoAllowed } from "../local-demo";
import type { AppData, Notification } from "../types";
import { buildNotifications } from "../notifications";
import { localDateKey, localDateTimeToISO, isValidTimezone } from "../timezone";
import { ApiError } from "./database";
import {
  buildTimetableSnapshot,
  importTimetableSnapshot,
  sameCohort,
  SharingError,
  type TimetableSnapshot,
  type TimetableShareInfo,
} from "../timetable-sharing";
import { generateTimetableToken, timetableTokenHash } from "./credentials";

export const DEMO_COOKIE = "absentia_local_demo";
const statePath = () =>
  path.join(process.cwd(), ".local", "frontend-demo.json");
type DemoShare = TimetableShareInfo & {
  token_hash: string;
  snapshot: TimetableSnapshot;
  owner_id: string;
  imported_by: string[];
};
type State = {
  data: AppData;
  dedupKeys: string[];
  shares?: DemoShare[];
  importedSources?: Record<string, string>;
};
const globalDemo = globalThis as typeof globalThis & {
  absentiaDemoQueue?: Promise<unknown>;
};
export async function localDemoEnabled() {
  return localDemoAllowed(process.env, (await headers()).get("host") || "");
}
async function readState(): Promise<State> {
  try {
    return JSON.parse(await readFile(statePath(), "utf8")) as State;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new ApiError(
        "Local demo data could not be read. Rename .local/frontend-demo.json to reset it.",
        503,
      );
    return { data: createLocalDemo(), dedupKeys: [] };
  }
}
async function saveState(state: State) {
  const target = statePath();
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
  await rename(temporary, target);
}
async function locked<T>(operation: () => Promise<T>): Promise<T> {
  const current = (globalDemo.absentiaDemoQueue || Promise.resolve()).then(
    operation,
  );
  globalDemo.absentiaDemoQueue = current.catch(() => {});
  return current;
}
async function authorize() {
  if (
    !(await localDemoEnabled()) ||
    (await cookies()).get(DEMO_COOKIE)?.value !== "active"
  )
    throw new ApiError(
      "Please log in with the local demo token.",
      401,
      "UNAUTHORIZED",
    );
}
export async function localDemoSnapshot(): Promise<AppData> {
  await authorize();
  return locked(async () => {
    const state = await readState();
    await saveState(state);
    return state.data;
  });
}
export async function mutateLocalDemo(
  input: Record<string, unknown>,
): Promise<unknown> {
  await authorize();
  return locked(async () => {
    const state = await readState();
    const data = state.data;
    const before = structuredClone(data);
    const stamp = new Date().toISOString();
    const action = String(input.action);
    const id = String(input.id || "");
    let result: unknown = { ok: true };
    const missing = () => new ApiError("This demo item no longer exists.", 404);
    const module = () => {
      const item = data.modules.find((m) => m.id === id);
      if (!item) throw missing();
      return item;
    };
    if (action === "module_save") {
      const moduleYear = id
        ? module().academic_year ?? data.student.academic_year
        : data.student.academic_year;
      const values = {
        name: String(input.name),
        code: String(input.code),
        professor: String(input.professor || ""),
        description: String(input.description || ""),
        color: String(input.color),
        semester: String(input.semester),
        total_threshold: input.total_threshold as number | null,
        unjustified_threshold: input.unjustified_threshold as number | null,
      };
      if (
        data.modules.some(
          (m) =>
            m.id !== id &&
            m.code === values.code &&
            m.semester === values.semester &&
            (m.academic_year ?? data.student.academic_year) === moduleYear,
        )
      )
        throw new ApiError(
          "This module code already exists in this academic year and semester.",
          409,
        );
      if (id) {
        Object.assign(module(), values);
        result = { id };
      } else {
        const newId = randomUUID();
        data.modules.push({
          ...values,
          id: newId,
          archived_at: null,
          academic_year: data.student.academic_year,
          created_at: stamp,
        });
        result = { id: newId };
      }
    } else if (action === "module_archive") {
      module().archived_at = input.archived ? stamp : null;
    } else if (action === "module_delete") {
      module();
      data.modules = data.modules.filter((m) => m.id !== id);
      data.sessions = data.sessions.filter((s) => s.module_id !== id);
      data.occurrences = data.occurrences.filter((o) => o.module_id !== id);
      data.attendance = data.attendance.filter((a) => a.module_id !== id);
      data.notifications = data.notifications.filter((n) => n.module_id !== id);
    } else if (action === "session_save") {
      const owner = data.modules.find(
        (m) => m.id === input.module_id && !m.archived_at,
      );
      if (!owner) throw missing();
      let session = data.sessions.find((s) => s.id === id);
      if (id && !session) throw missing();
      const hasAttendance = (occurrenceId: string) =>
        data.attendance.some((a) => a.occurrence_id === occurrenceId);
      if (
        session &&
        session.module_id !== input.module_id &&
        data.occurrences.some((o) => o.session_id === id && hasAttendance(o.id))
      )
        throw new ApiError(
          "A session with attendance cannot be moved to another module.",
        );
      if (session) {
        data.occurrences = data.occurrences.filter(
          (o) => o.session_id !== id || hasAttendance(o.id),
        );
        Object.assign(session, input);
      } else {
        session = {
          ...input,
          id: randomUUID(),
          created_at: stamp,
        } as unknown as AppData["sessions"][number];
        data.sessions.push(session);
      }
      for (
        let day = Date.parse(`${session.recurrence_start}T12:00:00Z`);
        day <= Date.parse(`${session.recurrence_end}T12:00:00Z`);
        day += 86400000
      ) {
        if ((new Date(day).getUTCDay() || 7) !== session.weekday) continue;
        const date = new Date(day).toISOString().slice(0, 10);
        if (
          data.occurrences.some(
            (o) => o.session_id === session!.id && o.occurrence_date === date,
          )
        )
          continue;
        data.occurrences.push({
          id: randomUUID(),
          session_id: session.id,
          module_id: session.module_id,
          occurrence_date: date,
          starts_at: localDateTimeToISO(
            date,
            session.start_time,
            data.student.timezone,
          ),
          ends_at: localDateTimeToISO(
            date,
            session.end_time,
            data.student.timezone,
          ),
          session_type: session.session_type,
          classroom: session.classroom,
          professor: session.professor,
          cancelled: false,
        });
      }
      result = { id: session.id };
    } else if (action === "session_delete") {
      if (!data.sessions.some((s) => s.id === id)) throw missing();
      const removed = new Set(
        data.occurrences.filter((o) => o.session_id === id).map((o) => o.id),
      );
      data.sessions = data.sessions.filter((s) => s.id !== id);
      data.occurrences = data.occurrences.filter((o) => !removed.has(o.id));
      data.attendance = data.attendance.filter(
        (a) => !removed.has(a.occurrence_id),
      );
      data.notifications = data.notifications.filter(
        (n) => !n.occurrence_id || !removed.has(n.occurrence_id),
      );
    } else if (action === "occurrence_save") {
      const item = data.occurrences.find((o) => o.id === id);
      if (!item) throw missing();
      const attendance = data.attendance.find((a) => a.occurrence_id === id);
      if (attendance && (input.starts_at || input.ends_at))
        throw new ApiError("Remove attendance before moving this session.");
      const starts = String(input.starts_at || item.starts_at),
        ends = String(input.ends_at || item.ends_at);
      if (Date.parse(ends) <= Date.parse(starts))
        throw new ApiError("End time must be after start time.");
      Object.assign(
        item,
        { starts_at: starts, ends_at: ends },
        input.classroom !== undefined ? { classroom: input.classroom } : {},
        input.cancelled !== undefined ? { cancelled: input.cancelled } : {},
      );
      if (item.cancelled && attendance) {
        const previous = { ...attendance };
        attendance.attendance_status = "cancelled";
        attendance.updated_at = stamp;
        data.audit.unshift({
          id: randomUUID(),
          action: "corrected",
          entity_type: "attendance",
          entity_id: id,
          before_data: previous,
          after_data: { ...attendance },
          created_at: stamp,
        });
      }
    } else if (action === "attendance_save") {
      const occurrence = data.occurrences.find(
        (o) => o.id === input.occurrence_id,
      );
      if (!occurrence) throw missing();
      if (Date.parse(occurrence.ends_at) > Date.now())
        throw new ApiError(
          "Attendance can only be recorded after the session ends.",
        );
      if (occurrence.cancelled && input.attendance_status !== "cancelled")
        throw new ApiError("Restore this session before recording attendance.");
      const existing = data.attendance.find(
        (a) => a.occurrence_id === occurrence.id,
      );
      const previous = existing ? { ...existing } : null;
      const record = {
        id: existing?.id || randomUUID(),
        module_id: occurrence.module_id,
        occurrence_id: occurrence.id,
        attendance_status:
          input.attendance_status as AppData["attendance"][number]["attendance_status"],
        note: String(input.note || ""),
        created_at: existing?.created_at || stamp,
        updated_at: stamp,
      };
      if (existing) {
        if (
          existing.attendance_status === record.attendance_status &&
          existing.note === record.note
        )
          return existing;
        Object.assign(existing, record);
      } else data.attendance.push(record);
      data.audit.unshift({
        id: randomUUID(),
        action: previous ? "corrected" : "created",
        entity_type: "attendance",
        entity_id: occurrence.id,
        before_data: previous,
        after_data: record,
        created_at: stamp,
      });
      result = record;
    } else if (action === "attendance_delete") {
      const previous = data.attendance.find((a) => a.id === id);
      if (!previous) throw missing();
      data.attendance = data.attendance.filter((a) => a.id !== id);
      data.audit.unshift({
        id: randomUUID(),
        action: "deleted",
        entity_type: "attendance",
        entity_id: previous.occurrence_id,
        before_data: { ...previous },
        created_at: stamp,
      });
    } else if (action === "profile_save") {
      if (!isValidTimezone(String(input.timezone)))
        throw new ApiError("Choose a valid timezone.");
      if (
        input.semester !== data.student.semester ||
        input.academic_year !== data.student.academic_year
      ) {
        for (const item of data.modules) {
          item.academic_year ??= data.student.academic_year;
          item.archived_at ??= stamp;
        }
      }
      const {
        action: unused,
        id: ignored,
        student_id: ignoredOwner,
        ...values
      } = input;
      Object.assign(data.student, values);
    } else if (action === "notifications_read") {
      data.notifications.forEach((n) => {
        if (!id || n.id === id) n.is_read = true;
      });
    } else if (action === "notification_delete") {
      data.notifications = data.notifications.filter((n) => n.id !== id);
    } else if (action === "account_delete") {
      throw new ApiError(
        "This is a shared synthetic demo. To reset it, stop the dev server and rename .local/frontend-demo.json.",
      );
    } else throw new ApiError("This action is unavailable in the local demo.");
    for (const draft of buildNotifications(before, data))
      if (!state.dedupKeys.includes(draft.dedupe_key)) {
        state.dedupKeys.push(draft.dedupe_key);
        data.notifications.unshift({
          id: randomUUID(),
          title: draft.title,
          message: draft.message,
          type: draft.type,
          module_id: draft.module_id,
          occurrence_id: draft.occurrence_id,
          is_read: false,
          created_at: stamp,
        } satisfies Notification);
      }
    await saveState(state);
    return result;
  });
}

export async function localDemoSharing(
  input: Record<string, unknown>,
): Promise<unknown> {
  await authorize();
  return locked(async () => {
    const state = await readState();
    const shares = state.shares || [];
    state.shares = shares;
    const info = ({
      id,
      title,
      created_at,
      expires_at,
      revoked_at,
      module_count,
      session_count,
    }: DemoShare) => ({
      id,
      title,
      created_at,
      expires_at,
      revoked_at,
      module_count,
      session_count,
    });
    if (input.action === "list")
      return shares
        .filter((s) => s.owner_id === state.data.student.id)
        .map(info)
        .reverse();
    if (input.action === "create") {
      if (
        shares.filter(
          (s) =>
            s.owner_id === state.data.student.id &&
            !s.revoked_at &&
            Date.parse(s.expires_at) > Date.now(),
        ).length >= 10
      )
        throw new SharingError(
          "Revoke an existing token first. You can have 10 active timetable shares.",
        );
      const snapshot = buildTimetableSnapshot(state.data);
      const token = generateTimetableToken();
      const share: DemoShare = {
        id: randomUUID(),
        owner_id: state.data.student.id,
        title: String(input.title),
        created_at: new Date().toISOString(),
        expires_at: new Date(
          Date.now() + Number(input.expires_days) * 86400000,
        ).toISOString(),
        revoked_at: null,
        token_hash: timetableTokenHash(token),
        snapshot,
        module_count: snapshot.modules.length,
        session_count: snapshot.sessions.length,
        imported_by: [],
      };
      shares.push(share);
      await saveState(state);
      return { ...info(share), token };
    }
    if (input.action === "revoke") {
      const share = shares.find(
        (s) => s.id === input.id && s.owner_id === state.data.student.id,
      );
      if (!share) throw new SharingError("Timetable share not found.");
      share.revoked_at = share.revoked_at || new Date().toISOString();
      await saveState(state);
      return { ok: true };
    }
    const share = shares.find(
      (s) =>
        s.token_hash === timetableTokenHash(String(input.token)) &&
        !s.revoked_at &&
        Date.parse(s.expires_at) > Date.now(),
    );
    if (!share)
      throw new SharingError(
        "This timetable token is invalid, expired or revoked.",
      );
    if (!sameCohort(state.data.student, share.snapshot.cohort))
      throw new SharingError(
        "This timetable is for a different group, department, academic year or semester. Check your profile.",
      );
    const already_imported = share.imported_by.includes(state.data.student.id),
      is_owner = share.owner_id === state.data.student.id;
    if (input.action === "preview")
      return {
        ...info(share),
        snapshot: share.snapshot,
        already_imported,
        is_owner,
      };
    if (is_owner)
      throw new SharingError(
        "This timetable is already yours. Give this token to a classmate.",
      );
    if (already_imported)
      return { modules_added: 0, sessions_added: 0, already_imported: true };
    const imported = importTimetableSnapshot(
      state.data,
      share.snapshot,
      state.importedSources,
    );
    state.data = imported.data;
    state.importedSources = imported.importedSources;
    share.imported_by.push(state.data.student.id);
    await saveState(state);
    return {
      modules_added: imported.modules_added,
      sessions_added: imported.sessions_added,
      already_imported: false,
    };
  });
}
