import { getModuleStats, getUpcomingSessions } from "./attendance";
import type { AppData, NotificationDraft } from "./types";

/** Pure transition builder. Persist using a unique (student_id, dedup_key). */
export function buildNotifications(
  before: AppData,
  after: AppData,
  options: { now?: Date | number; modifiedOccurrenceId?: string } = {},
): NotificationDraft[] {
  if (!after.student.notifications_enabled) return [];
  const now = options.now ?? Date.now();
  const french = after.student.language === "fr";
  const nowMs = now instanceof Date ? now.getTime() : now;
  const drafts: NotificationDraft[] = [];
  for (const module of after.modules.filter((item) => !item.archived_at)) {
    const current = getModuleStats(module, after, now);
    const previousModule =
      before.modules.find((item) => item.id === module.id) || module;
    const previous = getModuleStats(previousModule, before, now);
    const add = (type: string, title: string, message: string, suffix = "") =>
      drafts.push({
        type,
        title,
        message,
        module_id: module.id,
        occurrence_id: null,
        dedupe_key: `${type}:${module.id}:${suffix}`,
      });
    if (!previous.totalAbsences && current.totalAbsences) {
      add(
        "first_absence",
        french ? "Première absence enregistrée" : "First absence recorded",
        french
          ? `${module.name} : votre première absence a été enregistrée. Surveillez les limites de ce module.`
          : `${module.name}: your first absence has been recorded. Keep an eye on your module limits.`,
      );
    }
    if (current.risk === "excluded" && previous.risk !== "excluded") {
      add(
        "exclusion",
        french ? "Seuil d’exclusion atteint" : "Exclusion threshold reached",
        french
          ? `${module.name} compte ${current.totalAbsences} absences au total, dont ${current.unjustified} non justifiées.`
          : `${module.name} has ${current.totalAbsences} total and ${current.unjustified} unjustified absences.`,
        `${current.thresholds.total}:${current.thresholds.unjustified}`,
      );
    } else if (current.risk !== "excluded") {
      if (
        current.unjustified >= current.thresholds.unjustified - 1 &&
        current.unjustified > 0 &&
        previous.unjustified < current.thresholds.unjustified - 1
      ) {
        add(
          "warning_unjustified",
          french
            ? "Alerte d’absences non justifiées"
            : "Unjustified absence warning",
          french
            ? `${module.name} : une absence non justifiée supplémentaire entraînerait une exclusion.`
            : `${module.name}: one more unjustified absence would reach exclusion.`,
          String(current.thresholds.unjustified),
        );
      }
      if (
        current.totalAbsences >= current.thresholds.total - 1 &&
        current.totalAbsences > 0 &&
        previous.totalAbsences < current.thresholds.total - 1
      ) {
        add(
          "warning_total",
          french ? "Alerte du total des absences" : "Total absence warning",
          french
            ? `${module.name} : une absence supplémentaire, justifiée ou non, entraînerait une exclusion.`
            : `${module.name}: one more absence of either kind would reach exclusion.`,
          String(current.thresholds.total),
        );
      }
      if (current.critical && !previous.critical) {
        add(
          "critical",
          french
            ? "Votre présence mérite votre attention"
            : "Attendance needs your attention",
          french
            ? `${module.name} : manquer une autre séance entraînerait une exclusion, même avec un justificatif.`
            : `${module.name}: missing another session would trigger exclusion regardless of justification.`,
          String(current.thresholds.total),
        );
      }
    }
  }
  if (options.modifiedOccurrenceId) {
    const oldRecord = before.attendance.find(
      (record) => record.occurrence_id === options.modifiedOccurrenceId,
    );
    const newRecord = after.attendance.find(
      (record) => record.occurrence_id === options.modifiedOccurrenceId,
    );
    if (oldRecord && JSON.stringify(oldRecord) !== JSON.stringify(newRecord)) {
      const module = after.modules.find(
        (item) => item.id === oldRecord.module_id,
      );
      drafts.push({
        type: "attendance_modified",
        title: french ? "Présence corrigée" : "Attendance record corrected",
        message: french
          ? `${module?.name || "Module"} : une présence a été ${newRecord ? "modifiée" : "supprimée"}. Vos totaux ont été recalculés.`
          : `${module?.name || "Module"}: an attendance record was ${newRecord ? "updated" : "deleted"}. Your totals have been recalculated.`,
        module_id: oldRecord.module_id,
        occurrence_id: oldRecord.occurrence_id,
        dedupe_key: `attendance_modified:${oldRecord.occurrence_id}:${newRecord?.updated_at || `deleted:${oldRecord.updated_at}`}`,
      });
    }
  }
  const cutoff = nowMs + 30 * 60 * 1000;
  for (const occurrence of getUpcomingSessions(
    after,
    after.occurrences.length,
    now,
  )) {
    if (Date.parse(occurrence.starts_at) > cutoff) break;
    const module = after.modules.find(
      (item) => item.id === occurrence.module_id,
    )!;
    drafts.push({
      type: "session_reminder",
      title: french
        ? "Votre prochaine séance commence bientôt"
        : "Your next session starts soon",
      message: french
        ? `${module.name} · ${occurrence.session_type === "Lecture" ? "Cours" : occurrence.session_type}${occurrence.classroom ? ` · ${occurrence.classroom}` : ""} commence dans moins de 30 minutes.`
        : `${module.name} · ${occurrence.session_type}${occurrence.classroom ? ` · ${occurrence.classroom}` : ""} starts within 30 minutes.`,
      module_id: module.id,
      occurrence_id: occurrence.id,
      dedupe_key: `session_reminder:${occurrence.id}`,
    });
  }
  return drafts;
}

/** Reconciles durable correction events after retries or an interrupted request. */
export function buildAuditNotifications(data: AppData): NotificationDraft[] {
  if (!data.student.notifications_enabled) return [];
  const french = data.student.language === "fr";
  const drafts: NotificationDraft[] = [];
  for (const audit of data.audit) {
    if (
      audit.entity_type !== "attendance" ||
      !["corrected", "deleted"].includes(audit.action)
    )
      continue;
    const record = audit.after_data || audit.before_data;
    if (!record || typeof record.module_id !== "string") continue;
    const module = data.modules.find((item) => item.id === record.module_id);
    if (!module) continue;
    const candidateOccurrenceId =
      typeof record.occurrence_id === "string"
        ? record.occurrence_id
        : audit.entity_id;
    const occurrenceId = data.occurrences.some(
      (occurrence) => occurrence.id === candidateOccurrenceId,
    )
      ? candidateOccurrenceId
      : null;
    drafts.push({
      type: "attendance_modified",
      title: french ? "Présence corrigée" : "Attendance record corrected",
      message: french
        ? `${module.name} : une présence a été ${audit.action === "deleted" ? "supprimée" : "modifiée"}. Vos totaux ont été recalculés.`
        : `${module.name}: an attendance record was ${audit.action === "deleted" ? "deleted" : "updated"}. Your totals have been recalculated.`,
      module_id: module.id,
      occurrence_id: occurrenceId,
      dedupe_key: `attendance_audit:${audit.id}`,
    });
  }
  return drafts;
}
