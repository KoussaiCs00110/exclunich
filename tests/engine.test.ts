import { describe, expect, it } from "vitest";
import {
  classifyRisk,
  getCountedRecords,
  getModuleStats,
  getSessionStats,
  getOverview,
  getThresholds,
  getUpcomingSessions,
  simulateAbsence,
  getAttendanceTrend,
  getAttendanceByType,
} from "../src/lib/attendance";
import { buildNotifications, buildCurrentNotifications } from "../src/lib/notifications";
import type {
  AppData,
  AttendanceStatus,
  Module,
  Student,
} from "../src/lib/types";

const NOW = new Date("2026-11-20T12:00:00Z");
const student: Student = {
  id: "student-a",
  full_name: "Test Student",
  student_identifier: null,
  academic_year: "2026/2027",
  department: "Computer Science",
  group_name: "G1",
  semester: "S3",
  registration_complete: true,
  timezone: "Africa/Algiers",
  language: "en",
  theme: "dark",
  total_threshold: 5,
  unjustified_threshold: 3,
  show_sunday: false,
  notifications_enabled: true,
  created_at: "2026-01-01T00:00:00Z",
};
const moduleA: Module = {
  id: "module-a",
  name: "Computer Networks",
  code: "NET",
  professor: "Dr. Test",
  color: "#4c8dff",
  description: null,
  semester: "S3",
  total_threshold: null,
  unjustified_threshold: null,
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
};

function fixture(statuses: AttendanceStatus[] = []): AppData {
  return {
    student: { ...student },
    modules: [{ ...moduleA }],
    sessions: [],
    notifications: [],
    audit: [],
    occurrences: statuses.map((_, index) => ({
      id: `occ-${index}`,
      session_id: "session-a",
      module_id: moduleA.id,
      starts_at: `2026-11-${String(index + 1).padStart(2, "0")}T08:00:00Z`,
      ends_at: `2026-11-${String(index + 1).padStart(2, "0")}T09:30:00Z`,
      session_type: "Lecture",
      classroom: "A12",
      cancelled: false,
    })),
    attendance: statuses.map((status, index) => ({
      id: `attendance-${index}`,
      occurrence_id: `occ-${index}`,
      module_id: moduleA.id,
      attendance_status: status,
      note: null,
      created_at: "2026-11-10T12:00:00Z",
      updated_at: "2026-11-10T12:00:00Z",
    })),
  };
}
const stats = (data: AppData, module = data.modules[0]) =>
  getModuleStats(module, data, NOW);

describe("mid-semester starting balances", () => {
  it("combines earlier and dated absences once without inventing an attendance denominator", () => {
    const data = fixture(["present", "justified"]);
    data.modules[0].initial_absences_by_type = { Lecture: { justified: 1, unjustified: 2 } };
    const before = structuredClone(data);
    const current = stats(data);
    expect(current).toMatchObject({ justified: 2, unjustified: 2, initialAbsences: 3, totalAbsences: 4, recorded: 2, scheduled: 2, completed: 2, unrecorded: 0, attendanceRate: 50, risk: "warning" });
    expect(simulateAbsence(current.sessionStats[0], "unjustified").risk).toBe("excluded");
    expect(simulateAbsence(current.sessionStats[0], "justified").risk).toBe("excluded");
    expect(data).toEqual(before);
    expect(getAttendanceTrend(data, "month", NOW)[0].absences).toBe(1);
    expect(getAttendanceByType(data, NOW)[0].recorded).toBe(2);
  });
  it("recognizes an earlier exclusion with no recorded sessions", () => {
    const data = fixture();
    data.modules[0].initial_absences_by_type = { Lecture: { justified: 0, unjustified: 3 } };
    expect(stats(data)).toMatchObject({ totalAbsences: 3, risk: "excluded", attendanceRate: null, recorded: 0, scheduled: 0, unrecorded: 0 });
    expect(getOverview(data, NOW)).toMatchObject({ totalAbsences: 3, initialAbsences: 3, excluded: 1 });
  });
  it("replaces a corrected starting balance and keeps dated corrections independent", () => {
    const data = fixture(["unjustified"]);
    data.modules[0].initial_absences_by_type = { Lecture: { justified: 0, unjustified: 2 } };
    expect(stats(data).risk).toBe("excluded");
    data.modules[0].initial_absences_by_type!.Lecture!.unjustified = 1;
    expect(stats(data)).toMatchObject({ totalAbsences: 2, risk: "warning" });
    data.attendance[0].attendance_status = "present";
    expect(stats(data)).toMatchObject({ totalAbsences: 1, attendanceRate: 100, risk: "safe" });
    data.modules[0].initial_absences_by_type!.Lecture!.unjustified = 0;
    expect(stats(data).totalAbsences).toBe(0);
  });
  it("keeps balances scoped to their module and preserves archived history", () => {
    const data = fixture();
    data.modules[0].initial_justified_absences = 4;
    data.modules.push({ ...moduleA, id: "other", code: "OTHER" });
    expect(stats(data, data.modules[1]).totalAbsences).toBe(0);
    data.modules[0].archived_at = NOW.toISOString();
    expect(getOverview(data, NOW).totalAbsences).toBe(0);
    expect(stats(data).totalAbsences).toBe(4);
  });
  it("emits and reconciles starting-balance warnings for a newly added module", () => {
    const after = fixture();
    after.modules[0].initial_absences_by_type = { Lecture: { justified: 0, unjustified: 2 } };
    const before = { ...fixture(), modules: [] };
    expect(buildNotifications(before, after, { now: NOW }).map((item) => item.type)).toContain("warning_unjustified");
    expect(buildCurrentNotifications(after).map((item) => item.type)).toContain("warning_unjustified");
    expect(buildNotifications(after, structuredClone(after), { now: NOW })).toEqual([]);
  });
});

describe("central exclusion engine — required scenarios", () => {
  it("1 justified + 1 unjustified = SAFE", () =>
    expect(stats(fixture(["justified", "unjustified"])).risk).toBe("safe"));
  it("2 justified + 1 unjustified = SAFE", () =>
    expect(stats(fixture(["justified", "justified", "unjustified"])).risk).toBe(
      "safe",
    ));
  it("2 unjustified + 2 justified = WARNING", () => {
    expect(
      stats(fixture(["unjustified", "unjustified", "justified", "justified"])),
    ).toMatchObject({
      risk: "warning",
      totalAbsences: 4,
      justified: 2,
      unjustified: 2,
      remainingTotal: 1,
      remainingUnjustified: 1,
      critical: true,
    });
  });
  it("3 unjustified = EXCLUDED", () =>
    expect(
      stats(fixture(["unjustified", "unjustified", "unjustified"])).risk,
    ).toBe("excluded"));
  it("5 justified = EXCLUDED", () =>
    expect(stats(fixture(Array(5).fill("justified"))).risk).toBe("excluded"));
  it("2 unjustified + 2 justified then simulate unjustified = EXCLUDED without mutation", () => {
    const data = fixture([
      "unjustified",
      "unjustified",
      "justified",
      "justified",
    ]);
    const original = JSON.stringify(data);
    expect(simulateAbsence(stats(data).sessionStats[0], "unjustified")).toMatchObject({
      risk: "excluded",
      totalAbsences: 5,
      unjustified: 3,
      justified: 2,
      hypothetical: true,
    });
    expect(JSON.stringify(data)).toBe(original);
  });
  it("2 unjustified + 2 justified then simulate justified = EXCLUDED without mutation", () => {
    const data = fixture([
      "unjustified",
      "unjustified",
      "justified",
      "justified",
    ]);
    expect(simulateAbsence(stats(data).sessionStats[0], "justified")).toMatchObject({
      risk: "excluded",
      totalAbsences: 5,
      unjustified: 2,
      justified: 3,
    });
    expect(data.attendance).toHaveLength(4);
  });
  it("cancelled sessions do not count regardless of an existing absence record", () => {
    const data = fixture(["cancelled", "unjustified"]);
    data.occurrences[1].cancelled = true;
    expect(stats(data)).toMatchObject({
      totalAbsences: 0,
      recorded: 0,
      unrecorded: 0,
      attendanceRate: null,
    });
  });
  it("present sessions do not count as absences", () => {
    expect(stats(fixture(["present", "present"]))).toMatchObject({
      totalAbsences: 0,
      present: 2,
      recorded: 2,
      attendanceRate: 100,
      risk: "safe",
    });
  });
  it("editing an absence recalculates risk immediately", () => {
    const data = fixture(["unjustified", "unjustified", "unjustified"]);
    expect(stats(data).risk).toBe("excluded");
    data.attendance[2].attendance_status = "present";
    expect(stats(data)).toMatchObject({
      risk: "warning",
      unjustified: 2,
      totalAbsences: 2,
      present: 1,
    });
  });
  it("deleting an absence recalculates risk and shows an unrecorded session", () => {
    const data = fixture(["unjustified", "unjustified", "unjustified"]);
    data.attendance.pop();
    expect(stats(data)).toMatchObject({
      risk: "warning",
      totalAbsences: 2,
      unrecorded: 1,
    });
  });
  it("an already excluded module remains excluded in both simulations", () => {
    const current = stats(
      fixture(["unjustified", "unjustified", "unjustified"]),
    );
    for (const kind of ["justified", "unjustified"] as const) {
      expect(simulateAbsence(current.sessionStats[0], kind)).toMatchObject({
        alreadyExcluded: true,
        risk: "excluded",
      });
    }
  });
  it("one module does not affect another, including incorrectly cross-linked records", () => {
    const data = fixture(["unjustified", "unjustified", "unjustified"]);
    data.modules.push({ ...moduleA, id: "module-b", code: "ALG" });
    expect(stats(data, data.modules[1])).toMatchObject({
      totalAbsences: 0,
      risk: "safe",
    });
    data.attendance.push({
      ...data.attendance[0],
      id: "bad-record",
      module_id: "module-b",
    });
    expect(stats(data, data.modules[1]).totalAbsences).toBe(0);
  });
  it("future and currently running sessions are not actual absences", () => {
    const data = fixture(["unjustified", "unjustified"]);
    data.occurrences[0].starts_at = "2026-11-21T08:00:00Z";
    data.occurrences[0].ends_at = "2026-11-21T09:30:00Z";
    data.occurrences[1].starts_at = "2026-11-20T11:30:00Z";
    data.occurrences[1].ends_at = "2026-11-20T12:30:00Z";
    expect(stats(data)).toMatchObject({
      totalAbsences: 0,
      recorded: 0,
      unrecorded: 0,
    });
  });
});

describe("configured limits and data integrity", () => {
  it("module thresholds override defaults independently", () => {
    const data = fixture(["justified", "justified", "justified"]);
    data.student.total_threshold = 10;
    data.modules[0].total_threshold = 3;
    expect(stats(data).risk).toBe("excluded");
    expect(getThresholds(data.modules[0], data.student)).toEqual({
      total: 3,
      unjustified: 3,
    });
    data.modules[0].total_threshold = null;
    expect(stats(data).risk).toBe("safe");
  });
  it("exclusion takes priority over both warnings", () => {
    expect(classifyRisk(2, 3)).toBe("excluded");
    expect(classifyRisk(20, 0)).toBe("excluded");
  });
  it("remaining allowances never become negative", () => {
    expect(stats(fixture(Array(8).fill("unjustified")))).toMatchObject({
      remainingTotal: 0,
      remainingUnjustified: 0,
    });
  });
  it("empty records have unknown attendance rate rather than invented 100%", () => {
    expect(stats(fixture())).toMatchObject({
      attendanceRate: null,
      risk: "safe",
    });
    expect(getOverview(fixture(), NOW).attendanceRate).toBeNull();
  });
  it("the latest correction wins defensively when input has a duplicate", () => {
    const data = fixture(["unjustified"]);
    data.attendance.push({
      ...data.attendance[0],
      id: "correction",
      attendance_status: "present",
      updated_at: "2026-11-11T12:00:00Z",
    });
    expect(stats(data)).toMatchObject({
      unjustified: 0,
      present: 1,
      recorded: 1,
    });
  });
  it("records without an occurrence are ignored", () => {
    const data = fixture(["unjustified"]);
    data.occurrences = [];
    expect(getCountedRecords(data, NOW)).toEqual([]);
  });
  it("attendance percentage uses explicitly recorded eligible sessions only", () => {
    const data = fixture(["present", "justified", "present", "cancelled"]);
    data.attendance.pop();
    expect(stats(data)).toMatchObject({
      attendanceRate: 66.7,
      unrecorded: 1,
      recorded: 3,
    });
  });
  it("upcoming sessions omit archived modules and cancellations", () => {
    const data = fixture(["present", "present"]);
    data.occurrences.forEach((occ) => {
      occ.starts_at = "2026-11-21T09:00:00Z";
      occ.ends_at = "2026-11-21T10:00:00Z";
    });
    data.occurrences[0].cancelled = true;
    expect(getUpcomingSessions(data, 5, NOW)).toHaveLength(1);
    data.modules[0].archived_at = "2026-11-19T12:00:00Z";
    expect(getUpcomingSessions(data, 5, NOW)).toHaveLength(0);
  });
  it("analytics use the same counted records as the dashboard", () => {
    const data = fixture(["present", "justified", "unjustified"]);
    const trend = getAttendanceTrend(data, "month", NOW);
    expect(trend).toEqual([
      {
        period: "2026-11",
        present: 1,
        justified: 1,
        unjustified: 1,
        recorded: 3,
        attendanceRate: 33.3,
        absences: 2,
      },
    ]);
    expect(getAttendanceByType(data, NOW)[0]).toMatchObject({
      type: "Lecture",
      recorded: 3,
      attendanceRate: 33.3,
    });
  });
});

describe("notification transitions", () => {
  it("first absence is emitted once from a zero-to-one transition", () => {
    const after = fixture(["unjustified"]);
    expect(
      buildNotifications(fixture(), after, { now: NOW }).map((n) => n.type),
    ).toEqual(["first_absence"]);
    expect(buildNotifications(after, after, { now: NOW })).toEqual([]);
  });
  it("alerts at four total and critical state, then prioritizes exclusion", () => {
    const before = fixture(["justified", "justified", "justified"]);
    const warning = fixture([
      "justified",
      "justified",
      "justified",
      "justified",
    ]);
    expect(
      buildNotifications(before, warning, { now: NOW }).map((n) => n.type),
    ).toEqual(["warning_total", "critical"]);
    const excluded = fixture(Array(5).fill("justified"));
    expect(
      buildNotifications(warning, excluded, { now: NOW }).map((n) => n.type),
    ).toEqual(["exclusion"]);
  });
  it("repeated approaching-session notifications share a deduplication key", () => {
    const data = fixture(["present"]);
    data.occurrences[0].starts_at = "2026-11-20T12:15:00Z";
    data.occurrences[0].ends_at = "2026-11-20T13:15:00Z";
    const a = buildNotifications(data, data, { now: NOW });
    const b = buildNotifications(data, data, {
      now: new Date("2026-11-20T12:05:00Z"),
    });
    expect(a[0].type).toBe("session_reminder");
    expect(a[0].dedupe_key).toBe(b[0].dedupe_key);
  });
  it("respects disabled notifications", () => {
    const data = fixture(["unjustified"]);
    data.student.notifications_enabled = false;
    expect(buildNotifications(fixture(), data, { now: NOW })).toEqual([]);
  });
});

describe("durable correction notification reconciliation", () => {
  it("replays corrected/deleted audit events using stable unique event keys", async () => {
    const { buildAuditNotifications } =
      await import("../src/lib/notifications");
    const data = fixture(["justified"]);
    data.audit = [
      {
        id: "audit-1",
        action: "corrected",
        entity_type: "attendance",
        entity_id: "occ-0",
        after_data: { module_id: moduleA.id, occurrence_id: "occ-0" },
        created_at: NOW.toISOString(),
      },
      {
        id: "audit-2",
        action: "deleted",
        entity_type: "attendance",
        entity_id: "occ-0",
        before_data: { module_id: moduleA.id, occurrence_id: "occ-0" },
        created_at: NOW.toISOString(),
      },
      {
        id: "audit-3",
        action: "created",
        entity_type: "attendance",
        entity_id: "occ-0",
        after_data: { module_id: moduleA.id, occurrence_id: "occ-0" },
        created_at: NOW.toISOString(),
      },
      {
        id: "audit-4",
        action: "deleted",
        entity_type: "attendance",
        entity_id: "gone",
        before_data: { module_id: "deleted-module" },
        created_at: NOW.toISOString(),
      },
    ];
    const drafts = buildAuditNotifications(data);
    expect(drafts.map((item) => item.dedupe_key)).toEqual([
      "attendance_audit:audit-1",
      "attendance_audit:audit-2",
    ]);
    expect(drafts[0]).toMatchObject({
      module_id: moduleA.id,
      occurrence_id: "occ-0",
      type: "attendance_modified",
    });
    expect(buildAuditNotifications(data)).toEqual(drafts);
    data.student.notifications_enabled = false;
    expect(buildAuditNotifications(data)).toEqual([]);
  });
});

describe("cancellation denominator consistency", () => {
  it("attendance-level and occurrence-level cancellations have the same scheduled/recorded/pending counts", () => {
    const attendanceCancelled = fixture(["cancelled", "present"]);
    const occurrenceCancelled = fixture(["unjustified", "present"]);
    occurrenceCancelled.occurrences[0].cancelled = true;
    for (const data of [attendanceCancelled, occurrenceCancelled]) {
      expect(stats(data)).toMatchObject({
        scheduled: 1,
        completed: 1,
        recorded: 1,
        unrecorded: 0,
        attendanceRate: 100,
        totalAbsences: 0,
      });
    }
  });
  it("a newer correction from cancelled to present restores the session denominator", () => {
    const data = fixture(["cancelled"]);
    data.attendance.push({
      ...data.attendance[0],
      id: "new",
      attendance_status: "present",
      updated_at: "2026-11-11T12:00:00Z",
    });
    expect(stats(data)).toMatchObject({
      scheduled: 1,
      completed: 1,
      recorded: 1,
      attendanceRate: 100,
    });
  });
});

describe("independent absence limits for Lecture, TD and TP", () => {
  function mixed() {
    const data = fixture(["unjustified", "unjustified", "unjustified", "justified", "justified", "justified"]);
    data.occurrences.forEach((occurrence, index) => {
      occurrence.session_type = (["Lecture", "TD", "TP"] as const)[index % 3];
      occurrence.session_id = `series-${index}`;
    });
    return data;
  }

  it("does not pool absences across types when classifying a module", () => {
    const data = mixed();
    expect(stats(data)).toMatchObject({ totalAbsences: 6, unjustified: 3, risk: "safe", remainingTotal: 3, remainingUnjustified: 2 });
    for (const type of ["Lecture", "TD", "TP"] as const) {
      expect(getSessionStats(data.modules[0], data, type, NOW)).toMatchObject({ sessionType: type, totalAbsences: 2, justified: 1, unjustified: 1, recorded: 2, risk: "safe" });
    }
    expect(getOverview(data, NOW)).toMatchObject({ totalAbsences: 6, excluded: 0, atRisk: 0, safe: 1, recorded: 6 });
  });

  it("combines multiple timetable series of the same type within a module", () => {
    const data = fixture(Array(3).fill("unjustified"));
    data.occurrences.forEach((occurrence, index) => {
      occurrence.session_type = "TD";
      occurrence.session_id = `series-${index}`;
    });
    expect(getSessionStats(data.modules[0], data, "TD", NOW).risk).toBe("excluded");
    expect(getSessionStats(data.modules[0], data, "Lecture", NOW).risk).toBe("safe");
    expect(stats(data).risk).toBe("excluded");
    expect(getOverview(data, NOW).excluded).toBe(1);
  });

  it("simulates only the selected type even when another type is excluded", () => {
    const data = mixed();
    data.modules[0].initial_absences_by_type = { TD: { justified: 0, unjustified: 2 } };
    const original = structuredClone(data);
    const lecture = getSessionStats(data.modules[0], data, "Lecture", NOW);
    const td = getSessionStats(data.modules[0], data, "TD", NOW);
    expect(simulateAbsence(lecture, "justified")).toMatchObject({ risk: "safe", totalAbsences: 3, alreadyExcluded: false });
    expect(simulateAbsence(lecture, "unjustified")).toMatchObject({ risk: "warning", unjustified: 2, alreadyExcluded: false });
    expect(simulateAbsence(td, "justified")).toMatchObject({ risk: "excluded", alreadyExcluded: true });
    expect(data).toEqual(original);
  });

  it("adds earlier balances only to their assigned type and counts totals once", () => {
    const data = mixed();
    data.modules[0].initial_absences_by_type = { TD: { justified: 1, unjustified: 1 }, TP: { justified: 0, unjustified: 2 } };
    expect(getSessionStats(data.modules[0], data, "Lecture", NOW)).toMatchObject({ initialAbsences: 0, totalAbsences: 2, risk: "safe" });
    expect(getSessionStats(data.modules[0], data, "TD", NOW)).toMatchObject({ initialAbsences: 2, totalAbsences: 4, risk: "warning", critical: true });
    expect(getSessionStats(data.modules[0], data, "TP", NOW)).toMatchObject({ initialAbsences: 2, unjustified: 3, risk: "excluded" });
    expect(stats(data)).toMatchObject({ initialAbsences: 4, totalAbsences: 10, recorded: 6, attendanceRate: 0, risk: "excluded" });
    expect(getOverview(data, NOW)).toMatchObject({ initialAbsences: 4, totalAbsences: 10, excluded: 1, critical: 0 });
    data.modules.push({ ...moduleA, id: "other" });
    expect(getSessionStats(data.modules[1], data, "TP", NOW).totalAbsences).toBe(0);
  });

  it("preserves unassigned legacy balances without guessing an exclusion type", () => {
    const data = fixture();
    data.modules[0].initial_unjustified_absences = 3;
    expect(stats(data)).toMatchObject({ totalAbsences: 3, initialAbsences: 3, unassignedInitialAbsences: 3, risk: "safe" });
    expect(getOverview(data, NOW)).toMatchObject({ totalAbsences: 3, unassignedInitialAbsences: 3, excluded: 0 });
    expect(buildNotifications(fixture(), data, { now: NOW })).toEqual([]);
    data.modules[0].initial_unjustified_absences = 0;
    data.modules[0].initial_absences_by_type = { TP: { justified: 0, unjustified: 3 } };
    expect(stats(data)).toMatchObject({ totalAbsences: 3, unassignedInitialAbsences: 0, risk: "excluded" });
  });

  it("keeps cancellations, future records and latest corrections scoped to their types", () => {
    const data = mixed();
    data.occurrences[0].cancelled = true;
    data.attendance[1].attendance_status = "cancelled";
    data.occurrences[2].ends_at = "2026-11-21T09:30:00Z";
    data.attendance.push({ ...data.attendance[3], id: "corrected", attendance_status: "present", updated_at: "2026-11-11T12:00:00Z" });
    expect(getSessionStats(data.modules[0], data, "Lecture", NOW)).toMatchObject({ totalAbsences: 0, recorded: 1, present: 1, scheduled: 1, attendanceRate: 100 });
    expect(getSessionStats(data.modules[0], data, "TD", NOW)).toMatchObject({ totalAbsences: 1, recorded: 1, scheduled: 1 });
    expect(getSessionStats(data.modules[0], data, "TP", NOW)).toMatchObject({ totalAbsences: 1, recorded: 1, scheduled: 2, completed: 1 });
  });

  it("generates separate, deduplicated alerts for each type", () => {
    const before = mixed();
    const after = structuredClone(before);
    after.modules[0].initial_absences_by_type = { TD: { justified: 0, unjustified: 1 }, TP: { justified: 0, unjustified: 1 } };
    const alerts = buildNotifications(before, after, { now: NOW });
    expect(alerts.map((item) => item.type)).toEqual(["warning_unjustified", "warning_unjustified"]);
    expect(alerts[0].message).toContain("TD");
    expect(alerts[1].message).toContain("TP");
    expect(new Set(alerts.map((item) => item.dedupe_key)).size).toBe(2);
    const excluded = structuredClone(after);
    excluded.modules[0].initial_absences_by_type!.TD!.unjustified = 2;
    expect(buildNotifications(after, excluded, { now: NOW })).toMatchObject([{ type: "exclusion", message: expect.stringContaining("TD") }]);
    expect(buildNotifications(excluded, excluded, { now: NOW })).toEqual([]);
    expect(buildCurrentNotifications(after).filter((item) => item.type === "warning_unjustified")).toHaveLength(2);
  });
});
