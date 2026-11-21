import { describe, it, expect } from "vitest";
import { createLocalDemo } from "../src/lib/local-demo";
import {
  buildTimetableSnapshot,
  importTimetableSnapshot,
  sameCohort,
} from "../src/lib/timetable-sharing";
import {
  generateTimetableToken,
  timetableTokenHash,
} from "../src/lib/server/credentials";
import { sharingSchema } from "../src/lib/sharing-schema";
import type { AppData } from "../src/lib/types";
const source = () => createLocalDemo(new Date("2026-11-20T12:00:00Z"));
const recipient = (): AppData => ({
  ...source(),
  modules: [],
  sessions: [],
  occurrences: [],
  attendance: [],
  notifications: [],
  audit: [],
});
describe("timetable sharing privacy and import integrity", () => {
  it("excludes blocked classes from new shares and skips them in older snapshots", () => {
    const data = source();
    const payload = buildTimetableSnapshot(data);
    payload.occurrences[0].starts_at = "2026-11-30T08:00:00Z";
    payload.occurrences[0].ends_at = "2026-11-30T09:00:00Z";
    const result = importTimetableSnapshot(recipient(), payload);
    expect(result.data.occurrences).toHaveLength(payload.occurrences.length - 1);
    const occurrence = data.occurrences[0];
    occurrence.starts_at = "2026-11-30T08:00:00Z";
    occurrence.ends_at = "2026-11-30T09:00:00Z";
    expect(buildTimetableSnapshot(data).occurrences.some((item) => item.id === occurrence.id)).toBe(false);
  });
  it("allowlists schedule fields and omits private student data", () => {
    const data = source();
    data.student.full_name = "PRIVATE_NAME";
    data.modules[0].description = "PRIVATE_NOTE";
    data.attendance[0].note = "PRIVATE_ATTENDANCE";
    data.modules[0].initial_justified_absences = 4;
    data.modules[0].initial_unjustified_absences = 2;
    const encoded = JSON.stringify(buildTimetableSnapshot(data));
    for (const secret of [
      "PRIVATE_NAME",
      "PRIVATE_NOTE",
      "PRIVATE_ATTENDANCE",
      "attendance",
      "threshold",
      "student_id",
      "student_identifier",
      "initial_justified_absences",
      "initial_unjustified_absences",
    ])
      expect(encoded).not.toContain(secret);
  });
  it("excludes archived and other-semester modules", () => {
    const data = source();
    data.modules[0].archived_at = new Date().toISOString();
    data.modules[1].semester = "Other";
    expect(buildTimetableSnapshot(data).modules).toHaveLength(2);
  });
  it("imports new identities and exact times without importing attendance", () => {
    const payload = buildTimetableSnapshot(source());
    const target = recipient();
    const before = JSON.stringify(target);
    const result = importTimetableSnapshot(target, payload);
    expect(result.modules_added).toBe(4);
    expect(result.sessions_added).toBe(4);
    expect(result.data.attendance).toEqual([]);
    expect(result.data.student.id).toBe(target.student.id);
    expect(result.data.occurrences.map((o) => o.starts_at)).toEqual(
      payload.occurrences.map((o) => o.starts_at),
    );
    expect(
      result.data.modules.every(
        (m) => !payload.modules.some((s) => s.id === m.id),
      ),
    ).toBe(true);
    expect(
      result.data.occurrences.every((o) =>
        result.data.sessions.some(
          (s) => s.id === o.session_id && s.module_id === o.module_id,
        ),
      ),
    ).toBe(true);
    expect(JSON.stringify(target)).toBe(before);
    expect(
      result.data.modules.every(
        (m) => m.total_threshold === null && m.unjustified_threshold === null,
      ),
    ).toBe(true);
    expect(result.data.modules.every((m) => m.initial_justified_absences === 0 && m.initial_unjustified_absences === 0)).toBe(true);
  });
  it("preserves cancellations", () => {
    const data = source();
    data.occurrences[0].cancelled = true;
    expect(
      importTimetableSnapshot(recipient(), buildTimetableSnapshot(data)).data
        .occurrences[0].cancelled,
    ).toBe(true);
  });
  it("prevents duplicate series across snapshots or tokens", () => {
    const payload = buildTimetableSnapshot(source());
    const first = importTimetableSnapshot(recipient(), payload);
    const second = importTimetableSnapshot(
      first.data,
      payload,
      first.importedSources,
    );
    expect(second.sessions_added).toBe(0);
    expect(second.modules_added).toBe(0);
    expect(second.data.occurrences).toHaveLength(first.data.occurrences.length);
  });
  it("preserves matching personal module settings and records", () => {
    const data = source();
    const target = recipient();
    target.modules = [
      {
        ...data.modules[0],
        id: target.student.id,
        total_threshold: 9,
        initial_justified_absences: 1,
        initial_unjustified_absences: 2,
        professor: "My professor",
      },
    ];
    target.attendance = [
      { ...data.attendance[0], module_id: target.student.id },
    ];
    const result = importTimetableSnapshot(
      target,
      buildTimetableSnapshot(data),
    );
    expect(result.data.modules[0].total_threshold).toBe(9);
    expect(result.data.modules[0].professor).toBe("My professor");
    expect(result.data.modules[0]).toMatchObject({ initial_justified_absences: 1, initial_unjustified_absences: 2 });
    expect(result.data.attendance).toEqual(target.attendance);
    expect(result.modules_added).toBe(3);
  });
  it("fails atomically on a module-code conflict", () => {
    const data = source();
    const target = recipient();
    target.modules = [{ ...data.modules[1], name: "Unrelated subject" }];
    const before = JSON.stringify(target);
    expect(() =>
      importTimetableSnapshot(target, buildTimetableSnapshot(data)),
    ).toThrow("already used");
    expect(JSON.stringify(target)).toBe(before);
  });
  it("does not share restored modules belonging to another academic year", () => {
    const data = source();
    data.modules[0].academic_year = "2025–2026";
    const snapshot = buildTimetableSnapshot(data);
    expect(snapshot.modules.some((module) => module.id === data.modules[0].id)).toBe(false);
    expect(snapshot.sessions.some((session) => session.module_id === data.modules[0].id)).toBe(false);
  });
  it("imports a new-year module without conflicting with a same-code archive", () => {
    const data = source();
    const target = recipient();
    const old = {
      ...data.modules[0],
      academic_year: "2025–2026",
      archived_at: "2026-01-01T00:00:00Z",
    };
    target.modules = [old];
    const result = importTimetableSnapshot(target, buildTimetableSnapshot(data));
    const matches = result.data.modules.filter((module) => module.code === old.code);
    expect(matches).toHaveLength(2);
    expect(matches.find((module) => !module.archived_at)?.academic_year).toBe(target.student.academic_year);
    expect(result.data.modules.find((module) => module.id === old.id)).toEqual(old);
  });
  it("rejects another cohort or timezone", () => {
    const payload = buildTimetableSnapshot(source());
    for (const field of [
      "group_name",
      "department",
      "academic_year",
      "semester",
      "timezone",
    ] as const) {
      const target = recipient();
      target.student[field] = "Other";
      expect(() => importTimetableSnapshot(target, payload)).toThrow();
      expect(target.modules).toHaveLength(0);
    }
  });
  it("normalizes declared cohort capitalization and spaces", () => {
    const data = source();
    expect(
      sameCohort(data.student, {
        ...data.student,
        group_name: " group   03 ",
        department: "computer science",
      }),
    ).toBe(true);
  });
  it("requires scheduled sessions", () => {
    const data = source();
    data.sessions = [];
    expect(() => buildTimetableSnapshot(data)).toThrow("Add sessions");
  });
});
describe("sharing token security", () => {
  it("generates independent, high-entropy sharing credentials and normalized hashes", () => {
    const tokens = Array.from({ length: 100 }, () => generateTimetableToken());
    expect(new Set(tokens).size).toBe(100);
    for (const token of tokens) {
      expect(token).toMatch(
        /^EXSH(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){8}$/,
      );
      expect(timetableTokenHash(token)).toMatch(/^[a-f0-9]{64}$/);
      expect(timetableTokenHash(token)).toBe(
        timetableTokenHash(token.toLowerCase().replaceAll("-", " ")),
      );
    }
  });
  it("rejects login tokens and unsafe expiry; strips forged owner and snapshot fields", () => {
    expect(
      sharingSchema.safeParse({ action: "preview", token: "ABS-LOCAL-DEMO" })
        .success,
    ).toBe(false);
    expect(
      sharingSchema.safeParse({
        action: "create",
        title: "Group",
        expires_days: 365,
      }).success,
    ).toBe(false);
    const parsed = sharingSchema.parse({
      action: "create",
      title: "Group",
      expires_days: 7,
      owner_id: "forged",
      snapshot: { forged: true },
    });
    expect(parsed).not.toHaveProperty("owner_id");
    expect(parsed).not.toHaveProperty("snapshot");
    expect(
      sharingSchema.safeParse({
        action: "preview",
        token: generateTimetableToken(),
      }).success,
    ).toBe(true);
  });
});
