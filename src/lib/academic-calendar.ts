import type { AppData, Occurrence } from "./types";
import { localDateKey } from "./timezone";

export const ACADEMIC_PERIODS = [
  { code: "test1", start: "2026-11-28", end: "2026-12-03", en: "Test 1", fr: "Contrôle 1" },
  { code: "wh", start: "2026-12-19", end: "2027-01-01", en: "Winter holidays (WH)", fr: "Vacances d’hiver (WH)" },
  { code: "exam1", start: "2027-01-09", end: "2027-01-14", en: "January exams", fr: "Examens de janvier" },
  { code: "test2", start: "2027-03-13", end: "2027-03-18", en: "Test 2", fr: "Contrôle 2" },
  { code: "sh", start: "2027-03-20", end: "2027-04-01", en: "Spring holidays (SH)", fr: "Vacances de printemps (SH)" },
  { code: "exam2", start: "2027-05-08", end: "2027-05-13", en: "May exams", fr: "Examens de mai" },
] as const;

/** Inclusive dates in the student's configured timezone, for this academic year only. */
export function academicPeriodForDate(date: string) {
  return ACADEMIC_PERIODS.find((period) => date >= period.start && date <= period.end);
}

/** An interval ending at midnight does not occupy the next day. */
export function academicPeriodForInterval(startsAt: string, endsAt: string, timezone: string) {
  const first = localDateKey(startsAt, timezone);
  const last = localDateKey(Date.parse(endsAt) - 1, timezone);
  return ACADEMIC_PERIODS.find((period) => first <= period.end && last >= period.start);
}

export function isNonTeachingOccurrence(occurrence: Pick<Occurrence, "starts_at" | "ends_at">, timezone: string) {
  return Boolean(academicPeriodForInterval(occurrence.starts_at, occurrence.ends_at, timezone));
}

/** Keep historical records but exclude blocked classes from attendance calculations. */
export function applyAcademicCalendar(data: AppData): AppData {
  return {
    ...data,
    occurrences: data.occurrences.map((occurrence) =>
      isNonTeachingOccurrence(occurrence, data.student.timezone) && !occurrence.cancelled
        ? { ...occurrence, cancelled: true }
        : occurrence,
    ),
  };
}

export function teachingDates(start: string, end: string, weekday: number): string[] {
  const dates: string[] = [];
  for (let day = Date.parse(`${start}T12:00:00Z`); day <= Date.parse(`${end}T12:00:00Z`); day += 86400000) {
    if ((new Date(day).getUTCDay() || 7) !== weekday) continue;
    const key = new Date(day).toISOString().slice(0, 10);
    if (!academicPeriodForDate(key)) dates.push(key);
  }
  return dates;
}
