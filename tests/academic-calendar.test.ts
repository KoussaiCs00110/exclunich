import { describe, expect, it } from "vitest";
import { ACADEMIC_PERIODS, academicPeriodForDate, academicPeriodForInterval, applyAcademicCalendar, teachingDates } from "../src/lib/academic-calendar";
import { createLocalDemo } from "../src/lib/local-demo";
import { getModuleStats, getUpcomingSessions } from "../src/lib/attendance";
import { localDateTimeToISO } from "../src/lib/timezone";

describe("shared academic calendar", () => {
  it.each(ACADEMIC_PERIODS)("includes both boundaries of $code and leaves the following day available", (period) => {
    expect(academicPeriodForDate(period.start)?.code).toBe(period.code);
    expect(academicPeriodForDate(period.end)?.code).toBe(period.code);
    const next = new Date(`${period.end}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    expect(academicPeriodForDate(next.toISOString().slice(0, 10))).toBeUndefined();
  });
  it("does not turn these exact periods into annual recurring holidays", () => {
    expect(academicPeriodForDate("2027-11-28")).toBeUndefined();
    expect(academicPeriodForDate("2028-03-20")).toBeUndefined();
  });
  it("uses local dates and treats interval ends as exclusive", () => {
    expect(academicPeriodForInterval("2026-11-27T22:00:00Z", "2026-11-27T23:00:00Z", "Africa/Algiers")).toBeUndefined();
    expect(academicPeriodForInterval("2026-11-27T23:00:00Z", "2026-11-28T00:00:00Z", "Africa/Algiers")?.code).toBe("test1");
    expect(academicPeriodForInterval("2026-12-03T22:30:00Z", "2026-12-04T00:00:00Z", "Africa/Algiers")?.code).toBe("test1");
    expect(academicPeriodForInterval("2026-12-03T23:00:00Z", "2026-12-04T00:00:00Z", "Africa/Algiers")).toBeUndefined();
  });
  it("keeps six teaching weeks in the existing ten-week B3 date range", () => {
    const counts = [7, 1, 2, 3, 4].map((weekday) => teachingDates("2026-11-22", "2027-01-28", weekday).length);
    expect(counts).toEqual([6, 6, 6, 6, 6]);
    expect(counts.reduce((total, count, index) => total + count * [4, 5, 2, 3, 2][index], 0)).toBe(96);
    expect(teachingDates("2026-11-28", "2026-12-03", 1)).toEqual([]);
  });
  it("preserves attendance history while excluding blocked classes from totals and reminders", () => {
    const data = createLocalDemo(new Date("2026-11-20T12:00:00Z"));
    const occurrence = { ...data.occurrences[0], starts_at: localDateTimeToISO("2026-11-30", "09:00"), ends_at: localDateTimeToISO("2026-11-30", "10:00"), cancelled: false };
    data.occurrences = [occurrence];
    data.attendance = [{ ...data.attendance[0], occurrence_id: occurrence.id, module_id: occurrence.module_id, attendance_status: "unjustified" }];
    const before = structuredClone(data);
    const after = applyAcademicCalendar(data);
    expect(after.attendance).toEqual(before.attendance);
    expect(data).toEqual(before);
    expect(after.occurrences[0].cancelled).toBe(true);
    const module = after.modules.find((item) => item.id === occurrence.module_id)!;
    expect(getModuleStats(module, before, new Date("2027-02-01T12:00:00Z"))).toMatchObject({ scheduled: 0, totalAbsences: 0 });
    expect(getModuleStats(module, after, new Date("2027-02-01T12:00:00Z"))).toMatchObject({ scheduled: 0, totalAbsences: 0, unrecorded: 0 });
    expect(getUpcomingSessions(after, 5, new Date("2026-11-30T07:45:00Z"))).toHaveLength(0);
  });
});
