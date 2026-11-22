import { DEFAULT_TIMEZONE, formatInZone } from "./timezone";
import { isNonTeachingOccurrence } from "./academic-calendar";
import { t } from "./i18n";
import type {
  AbsenceSimulation,
  AttendanceStats,
  SessionStats,
  AppData,
  Attendance,
  Module,
  ModuleStats,
  Occurrence,
  Language,
  RiskLevel,
  SessionType,
  Settings,
  Thresholds,
} from "./types";

export const DEFAULT_THRESHOLDS: Readonly<Thresholds> = Object.freeze({
  total: 5,
  unjustified: 3,
});

function threshold(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1
    ? value
    : fallback;
}

export function getThresholds(
  module: Pick<Module, "total_threshold" | "unjustified_threshold">,
  settings?: Pick<Settings, "total_threshold" | "unjustified_threshold">,
): Thresholds {
  return {
    total: threshold(
      module.total_threshold,
      threshold(settings?.total_threshold, DEFAULT_THRESHOLDS.total),
    ),
    unjustified: threshold(
      module.unjustified_threshold,
      threshold(
        settings?.unjustified_threshold,
        DEFAULT_THRESHOLDS.unjustified,
      ),
    ),
  };
}

/** All screens and simulations classify risk through this function. */
export function classifyRisk(
  justified: number,
  unjustified: number,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): RiskLevel {
  const limits = {
    total: threshold(thresholds.total, DEFAULT_THRESHOLDS.total),
    unjustified: threshold(
      thresholds.unjustified,
      DEFAULT_THRESHOLDS.unjustified,
    ),
  };
  const total = justified + unjustified;
  if (total >= limits.total || unjustified >= limits.unjustified)
    return "excluded";
  if (
    (total > 0 && total >= limits.total - 1) ||
    (unjustified > 0 && unjustified >= limits.unjustified - 1)
  )
    return "warning";
  return "safe";
}

function timestamp(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

export function hasSessionEnded(
  occurrence: Occurrence,
  now: Date | number = Date.now(),
): boolean {
  const end = Date.parse(occurrence.ends_at);
  return Number.isFinite(end) && end <= timestamp(now);
}

function latestAttendance(
  data: Pick<AppData, "occurrences" | "attendance">,
): Map<string, Attendance> {
  const occurrences = new Map(
    data.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const latest = new Map<string, Attendance>();
  for (const record of data.attendance) {
    if (occurrences.get(record.occurrence_id)?.module_id !== record.module_id)
      continue;
    const previous = latest.get(record.occurrence_id);
    if (
      !previous ||
      Date.parse(record.updated_at) >= Date.parse(previous.updated_at)
    )
      latest.set(record.occurrence_id, record);
  }
  return latest;
}

/**
 * Only explicit records belonging to a completed, uncancelled occurrence count.
 * An unmarked session never silently becomes present or absent. Latest correction
 * wins defensively; the database additionally enforces occurrence uniqueness.
 */
export function getCountedRecords(
  data: Pick<AppData, "occurrences" | "attendance"> & Partial<Pick<AppData, "student">>,
  now: Date | number = Date.now(),
): Attendance[] {
  const occurrences = new Map(
    data.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  return [...latestAttendance(data).values()].filter((record) => {
    const occurrence = occurrences.get(record.occurrence_id)!;
    return (
      !occurrence.cancelled &&
      !isNonTeachingOccurrence(occurrence, data.student?.timezone ?? DEFAULT_TIMEZONE) &&
      hasSessionEnded(occurrence, now) &&
      record.attendance_status !== "cancelled"
    );
  });
}

export const SESSION_TYPES: readonly SessionType[] = ["Lecture", "TD", "TP"];

/** Limits apply independently to a module’s Lecture, TD and TP sessions. */
export function getSessionStats(
  module: Module,
  data: AppData,
  sessionType: SessionType,
  now: Date | number = Date.now(),
): SessionStats {
  const limits = getThresholds(module, data.student);
  const latest = latestAttendance(data);
  const occurrences = data.occurrences.filter(
    (occurrence) =>
      occurrence.module_id === module.id &&
      occurrence.session_type === sessionType &&
      !occurrence.cancelled &&
      !isNonTeachingOccurrence(occurrence, data.student.timezone) &&
      latest.get(occurrence.id)?.attendance_status !== "cancelled",
  );
  const occurrenceIds = new Set(occurrences.map((occurrence) => occurrence.id));
  const records = getCountedRecords(data, now).filter(
    (record) => occurrenceIds.has(record.occurrence_id),
  );
  const initial = module.initial_absences_by_type?.[sessionType];
  const justified = records.filter(
    (record) => record.attendance_status === "justified",
  ).length + (initial?.justified ?? 0);
  const unjustified = records.filter(
    (record) => record.attendance_status === "unjustified",
  ).length + (initial?.unjustified ?? 0);
  const present = records.filter(
    (record) => record.attendance_status === "present",
  ).length;
  const totalAbsences = justified + unjustified;
  const completed = occurrences.filter((occurrence) =>
    hasSessionEnded(occurrence, now),
  ).length;
  const risk = classifyRisk(justified, unjustified, limits);
  return {
    moduleId: module.id,
    sessionType,
    initialAbsences: (initial?.justified ?? 0) + (initial?.unjustified ?? 0),
    justified,
    unjustified,
    totalAbsences,
    present,
    recorded: records.length,
    scheduled: occurrences.length,
    completed,
    unrecorded: Math.max(0, completed - records.length),
    attendanceRate: records.length
      ? Math.round((present / records.length) * 1000) / 10
      : null,
    remainingTotal: Math.max(0, limits.total - totalAbsences),
    remainingUnjustified: Math.max(0, limits.unjustified - unjustified),
    risk,
    critical: risk === "warning" && totalAbsences >= limits.total - 1,
    thresholds: limits,
  };
}

/** Module totals are informational; risk comes from the highest-risk session type. */
export function getModuleStats(
  module: Module,
  data: AppData,
  now: Date | number = Date.now(),
): ModuleStats {
  const sessionStats = SESSION_TYPES.map((type) => getSessionStats(module, data, type, now));
  const highestRisk = [...sessionStats].sort(compareModuleRisk)[0];
  const sum = (key: "justified" | "unjustified" | "initialAbsences" | "present" | "recorded" | "scheduled" | "completed" | "unrecorded") =>
    sessionStats.reduce((total, stats) => total + stats[key], 0);
  // Legacy balances have no session type. Preserve their totals until the student
  // assigns them; never guess a type or use a combined balance for exclusion.
  const unassignedJustified = module.initial_justified_absences ?? 0;
  const unassignedUnjustified = module.initial_unjustified_absences ?? 0;
  const unassignedInitialAbsences = unassignedJustified + unassignedUnjustified;
  const justified = sum("justified") + unassignedJustified;
  const unjustified = sum("unjustified") + unassignedUnjustified;
  const recorded = sum("recorded");
  const present = sum("present");
  return {
    moduleId: module.id,
    sessionStats,
    unassignedInitialAbsences,
    initialAbsences: sum("initialAbsences") + unassignedInitialAbsences,
    justified,
    unjustified,
    totalAbsences: justified + unjustified,
    present,
    recorded,
    scheduled: sum("scheduled"),
    completed: sum("completed"),
    unrecorded: sum("unrecorded"),
    attendanceRate: recorded ? Math.round((present / recorded) * 1000) / 10 : null,
    remainingTotal: Math.min(...sessionStats.map((stats) => stats.remainingTotal)),
    remainingUnjustified: Math.min(...sessionStats.map((stats) => stats.remainingUnjustified)),
    risk: highestRisk.risk,
    critical: highestRisk.risk === "warning" && sessionStats.some((stats) => stats.critical),
    thresholds: highestRisk.thresholds,
  };
}

export function simulateAbsence(
  current: SessionStats,
  kind: "justified" | "unjustified",
): AbsenceSimulation {
  const justified = current.justified + (kind === "justified" ? 1 : 0);
  const unjustified = current.unjustified + (kind === "unjustified" ? 1 : 0);
  const totalAbsences = justified + unjustified;
  const alreadyExcluded = current.risk === "excluded";
  const risk = alreadyExcluded
    ? "excluded"
    : classifyRisk(justified, unjustified, current.thresholds);
  const explanation = alreadyExcluded
    ? "You have reached the exclusion threshold already."
    : risk === "excluded"
      ? "Missing this session would trigger exclusion."
      : risk === "warning"
        ? "Missing this session would put this session type in the warning zone."
        : "Your projected attendance would remain within the limits. Attending is still the best way to protect your progress.";
  return {
    kind,
    justified,
    unjustified,
    totalAbsences,
    remainingTotal: Math.max(0, current.thresholds.total - totalAbsences),
    remainingUnjustified: Math.max(
      0,
      current.thresholds.unjustified - unjustified,
    ),
    risk,
    alreadyExcluded,
    explanation,
    hypothetical: true,
  };
}

export function getRiskExplanation(
  stats: AttendanceStats,
  language: Language = "en",
): string {
  if (stats.risk === "excluded") return t(language, "risk.currentExcluded");
  if (stats.critical) return t(language, "exclusionBoth");
  if (stats.risk === "warning") return t(language, "risk.currentWarning");
  return t(language, "risk.currentSafe");
}

export function compareModuleRisk(a: AttendanceStats, b: AttendanceStats): number {
  const order: Record<RiskLevel, number> = { excluded: 3, warning: 2, safe: 1 };
  return (
    order[b.risk] - order[a.risk] ||
    Number(b.critical) - Number(a.critical) ||
    Math.max(
      b.totalAbsences / b.thresholds.total,
      b.unjustified / b.thresholds.unjustified,
    ) -
      Math.max(
        a.totalAbsences / a.thresholds.total,
        a.unjustified / a.thresholds.unjustified,
      )
  );
}

export function getOverview(data: AppData, now: Date | number = Date.now()) {
  const activeModules = data.modules.filter((module) => !module.archived_at);
  const moduleStats = activeModules.map((module) => ({
    module,
    stats: getModuleStats(module, data, now),
  }));
  const sum = (
    key:
      | "justified"
      | "unjustified"
      | "totalAbsences"
      | "initialAbsences"
      | "present"
      | "recorded"
      | "scheduled"
      | "unrecorded",
  ) => moduleStats.reduce((value, { stats }) => value + stats[key], 0);
  const recorded = sum("recorded");
  const present = sum("present");
  return {
    totalModules: activeModules.length,
    unassignedInitialAbsences: moduleStats.reduce((total, { stats }) => total + stats.unassignedInitialAbsences, 0),
    sessionStats: moduleStats.flatMap(({ module, stats }) => stats.sessionStats.map((stats) => ({ module, stats }))).sort((a, b) => compareModuleRisk(a.stats, b.stats)),
    scheduled: sum("scheduled"),
    totalAbsences: sum("totalAbsences"),
    initialAbsences: sum("initialAbsences"),
    justified: sum("justified"),
    unjustified: sum("unjustified"),
    present,
    recorded,
    unrecorded: sum("unrecorded"),
    attendanceRate: recorded
      ? Math.round((present / recorded) * 1000) / 10
      : null,
    atRisk: moduleStats.filter(({ stats }) => stats.risk === "warning").length,
    excluded: moduleStats.filter(({ stats }) => stats.risk === "excluded")
      .length,
    safe: moduleStats.filter(({ stats }) => stats.risk === "safe").length,
    critical: moduleStats.filter(({ stats }) => stats.critical).length,
    moduleStats: moduleStats.sort((a, b) =>
      compareModuleRisk(a.stats, b.stats),
    ),
  };
}

export function getUpcomingSessions(
  data: AppData,
  limit = 5,
  now: Date | number = Date.now(),
): Occurrence[] {
  const activeModuleIds = new Set(
    data.modules
      .filter((module) => !module.archived_at)
      .map((module) => module.id),
  );
  const latest = latestAttendance(data);
  return data.occurrences
    .filter(
      (occurrence) =>
        activeModuleIds.has(occurrence.module_id) &&
        !occurrence.cancelled &&
        !isNonTeachingOccurrence(occurrence, data.student.timezone) &&
        latest.get(occurrence.id)?.attendance_status !== "cancelled" &&
        Date.parse(occurrence.starts_at) > timestamp(now),
    )
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, Math.max(0, limit));
}

export function getAttendanceByType(
  data: AppData,
  now: Date | number = Date.now(),
) {
  const counted = getCountedRecords(data, now);
  const occurrences = new Map(
    data.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  return (["Lecture", "TD", "TP"] as SessionType[]).map((type) => {
    const records = counted.filter(
      (record) => occurrences.get(record.occurrence_id)?.session_type === type,
    );
    const present = records.filter(
      (record) => record.attendance_status === "present",
    ).length;
    return {
      type,
      present,
      recorded: records.length,
      attendanceRate: records.length
        ? Math.round((present / records.length) * 1000) / 10
        : null,
    };
  });
}

/** Buckets actual records in the student's timezone; absent weeks have null rate. */
export function getAttendanceTrend(
  data: AppData,
  interval: "week" | "month" = "week",
  now: Date | number = Date.now(),
) {
  const occurrences = new Map(
    data.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const buckets = new Map<
    string,
    {
      period: string;
      present: number;
      justified: number;
      unjustified: number;
      recorded: number;
    }
  >();
  for (const record of getCountedRecords(data, now)) {
    const occurrence = occurrences.get(record.occurrence_id)!;
    const period = formatInZone(
      occurrence.starts_at,
      interval === "month" ? "yyyy-MM" : "RRRR-'W'II",
      data.student.timezone || "Africa/Algiers",
    );
    const bucket = buckets.get(period) || {
      period,
      present: 0,
      justified: 0,
      unjustified: 0,
      recorded: 0,
    };
    bucket.recorded += 1;
    if (record.attendance_status !== "cancelled")
      bucket[record.attendance_status] += 1;
    buckets.set(period, bucket);
  }
  return [...buckets.values()]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((bucket) => ({
      ...bucket,
      attendanceRate:
        Math.round((bucket.present / bucket.recorded) * 1000) / 10,
      absences: bucket.justified + bucket.unjustified,
    }));
}
