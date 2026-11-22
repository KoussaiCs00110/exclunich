"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatInTimeZone } from "date-fns-tz";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileClock,
  MapPin,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { getSessionStats, simulateAbsence } from "@/lib/attendance";
import { formatInZone } from "@/lib/timezone";
import type { AppData, AttendanceStatus, Occurrence } from "@/lib/types";
import "./timetable.css";

export interface SessionPanelProps {
  data: AppData;
  occurrence: Occurrence;
  onClose: () => void;
  onMutate: (action: string, body: Record<string, unknown>) => Promise<unknown>;
  onRefresh?: () => Promise<void>;
  onEdit?: (occurrence: Occurrence) => void;
}

const statusLabels: Record<AttendanceStatus, string> = {
  present: "Present",
  justified: "Absent · Justified",
  unjustified: "Absent · Unjustified",
  cancelled: "Cancelled",
};

export function SessionPanel({
  data,
  occurrence,
  onClose,
  onMutate,
  onEdit,
}: SessionPanelProps) {
  const attendanceFormId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);
  const liveOccurrence =
    data.occurrences.find((item) => item.id === occurrence.id) ?? occurrence;
  const module = data.modules.find(
    (item) => item.id === liveOccurrence.module_id,
  );
  const attendance = data.attendance.find(
    (item) => item.occurrence_id === liveOccurrence.id,
  );
  const [scenario, setScenario] = useState<"justified" | "unjustified">(
    "unjustified",
  );
  const [status, setStatus] = useState<AttendanceStatus>(
    attendance?.attendance_status ?? "present",
  );
  const [note, setNote] = useState(attendance?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const timezone = data.student.timezone || "Africa/Algiers";
  const lang = data.student.language;
  const phrase = (en: string, fr: string) => (lang === "fr" ? fr : en);
  const completed = new Date(liveOccurrence.ends_at).getTime() <= Date.now();
  const visible = Boolean(module && overlayRoot);

  useEffect(() => {
    setOverlayRoot(document.body);
  }, []);

  useEffect(() => {
    setStatus(attendance?.attendance_status ?? "present");
    setNote(attendance?.note ?? "");
  }, [
    attendance?.id,
    attendance?.attendance_status,
    attendance?.note,
    occurrence.id,
  ]);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => {
      backdropRef.current?.style.setProperty("--session-viewport-height", `${viewport.height}px`);
      backdropRef.current?.style.setProperty("--session-viewport-top", `${viewport.offsetTop}px`);
    };
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const elements = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],summary,input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        ) ?? [],
      ).filter((item) => item.getClientRects().length > 0);
      const first = elements[0],
        last = elements.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panelRef.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [visible]);

  if (!module || !overlayRoot) return null;
  const stats = getSessionStats(module, data, liveOccurrence.session_type);
  const simulation = simulateAbsence(stats, scenario);
  const otherSimulation = simulateAbsence(
    stats,
    scenario === "justified" ? "unjustified" : "justified",
  );
  const excludedEitherWay =
    simulation.risk === "excluded" && otherSimulation.risk === "excluded";
  const auditEntries = data.audit
    .filter(
      (entry) =>
        entry.entity_id === attendance?.id || entry.entity_id === occurrence.id,
    )
    .slice(0, 5);

  async function saveAttendance(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await onMutate("attendance_save", {
        occurrence_id: occurrence.id,
        attendance_status: status,
        note,
      });
      setMessage(
        phrase(
          "Attendance saved.",
          "Présence enregistrée.",
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Attendance could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeAttendance() {
    if (
      !attendance ||
      !window.confirm(
        phrase(
          "Remove this attendance record? The correction will remain in your change history.",
          "Supprimer cette présence ? La correction restera dans l’historique des modifications.",
        ),
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await onMutate("attendance_delete", {
        id: attendance.id,
        occurrence_id: occurrence.id,
      });
      setMessage(
        phrase(
          "Attendance record removed. Your module totals have been updated.",
          "Présence supprimée. Les totaux du module ont été mis à jour.",
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Attendance could not be removed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleCancellation() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await onMutate("occurrence_save", {
        id: occurrence.id,
        cancelled: !liveOccurrence.cancelled,
      });
      setMessage(
        liveOccurrence.cancelled
          ? phrase("Session restored.", "Séance rétablie.")
          : phrase(
              "Session cancelled. It will not count toward attendance.",
              "Séance annulée. Elle ne compte plus dans les présences.",
            ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Session could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      ref={backdropRef}
      className="session-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        className="session-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-title"
        tabIndex={-1}
      >
        <header className="session-panel-header">
          <span className="eyebrow">
            {phrase("SESSION DETAILS", "DÉTAILS DE LA SÉANCE")}
          </span>
          <button
            type="button"
            className="btn btn-ghost icon-button"
            aria-label={phrase("Close session details", "Fermer les détails")}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="session-panel-body">
        <div className="session-module-heading">
          <span
            className="module-color-mark"
            style={{ backgroundColor: module.color }}
          />
          <div>
            <span className="muted">
              {module.code} ·{" "}
              {liveOccurrence.session_type === "Lecture"
                ? phrase("Lecture", "Cours")
                : liveOccurrence.session_type}
            </span>
            <h2 id="session-title">{module.name}</h2>
          </div>
        </div>
        <div className="session-metadata">
          <span>
            <CalendarDays size={16} />
            {formatInZone(
              liveOccurrence.starts_at,
              "EEEE, dd MMMM yyyy",
              timezone,
              lang === "fr" ? "fr-DZ" : "en-GB",
            )}
          </span>
          <span>
            <Clock3 size={16} />
            {formatInTimeZone(
              liveOccurrence.starts_at,
              timezone,
              "HH:mm",
            )} – {formatInTimeZone(liveOccurrence.ends_at, timezone, "HH:mm")}{" "}
            <small>{timezone}</small>
          </span>
          <span>
            <MapPin size={16} />
            {liveOccurrence.classroom ||
              phrase("Classroom not set", "Salle non définie")}
          </span>
          {liveOccurrence.professor && (
            <span className="muted">
              {phrase("Professor", "Professeur")} {liveOccurrence.professor}
            </span>
          )}
        </div>
        {liveOccurrence.cancelled && (
          <div className="session-info">
            {phrase(
              "This session is cancelled. It does not count as an absence.",
              "Cette séance est annulée et ne compte pas comme une absence.",
            )}
          </div>
        )}

        <section className="session-section session-attendance">
          <div className="section-title-row">
            <h3>
              {attendance
                ? phrase("Correct attendance", "Corriger la présence")
                : phrase("Record attendance", "Enregistrer la présence")}
            </h3>
            {attendance && (
              <span className="attendance-recorded">
                <CheckCircle2 size={14} />
                {phrase("Recorded", "Enregistrée")}
              </span>
            )}
          </div>
          {!completed && !liveOccurrence.cancelled ? (
            <div className="session-info">
              <Clock3 size={17} />
              <span>
                {phrase(
                  "You can record attendance after this session ends.",
                  "Vous pourrez renseigner votre présence à la fin de cette séance.",
                )}
              </span>
            </div>
          ) : liveOccurrence.cancelled ? (
            <p className="muted">
              {phrase(
                "Restore this session before recording attendance.",
                "Rétablissez la séance avant d’enregistrer la présence.",
              )}
            </p>
          ) : (
            <form id={attendanceFormId} onSubmit={saveAttendance}>
              <fieldset className="attendance-options" disabled={busy}>
                <legend className="sr-only">{phrase("Attendance status", "Statut de présence")}</legend>
                {(
                  Object.entries(statusLabels) as [AttendanceStatus, string][]
                ).map(([value, label]) => (
                  <label
                    className={status === value ? `chosen ${value}` : ""}
                    key={value}
                  >
                    <input
                      type="radio"
                      name="attendance-status"
                      value={value}
                      checked={status === value}
                      onChange={() => setStatus(value)}
                    />
                    <span>
                      {phrase(
                        label,
                        {
                          present: "Présent",
                          justified: "Absent · Justifiée",
                          unjustified: "Absent · Non justifiée",
                          cancelled: "Annulée",
                        }[value],
                      )}
                    </span>
                    {status === value && <Check size={15} />}
                  </label>
                ))}
              </fieldset>
              <label className="field session-note-label">
                Note{" "}
                <span className="muted">
                  {phrase("optional", "facultative")}
                </span>
                <textarea
                  className="input"
                  rows={2}
                  maxLength={2000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={phrase(
                    "Add context or a justification reference…",
                    "Ajoutez un contexte ou une référence de justificatif…",
                  )}
                />
              </label>
              {attendance && (
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={removeAttendance}
                >
                  <Trash2 size={16} />
                  {phrase("Remove record", "Supprimer la présence")}
                </button>
              )}
            </form>
          )}
        </section>
        <section className="session-section">
          <div className="section-title-row">
            <h3>{phrase("Absence limits", "Limites d’absence")} · {liveOccurrence.session_type === "Lecture" ? phrase("Lecture", "Cours") : liveOccurrence.session_type}</h3>
            <span className={`risk-chip ${stats.risk}`}>
              {stats.risk === "excluded"
                ? phrase("Excluded", "Exclu")
                : stats.risk === "warning"
                  ? phrase("Warning", "Attention")
                  : phrase("Within limits", "Dans les limites")}
            </span>
          </div>
          <div className="session-counters">
            <div>
              <strong>
                {stats.totalAbsences}
                <small> / {stats.thresholds.total}</small>
              </strong>
              <span>{phrase("Total absences", "Absences au total")}</span>
            </div>
            <div>
              <strong>
                {stats.unjustified}
                <small> / {stats.thresholds.unjustified}</small>
              </strong>
              <span>{phrase("Unjustified", "Non justifiées")}</span>
            </div>
            <div>
              <strong>{stats.justified}</strong>
              <span>{phrase("Justified", "Justifiées")}</span>
            </div>
          </div>
          <p className="session-fine-print">
            {phrase(
              `To exclusion threshold: ${stats.remainingTotal} total ${stats.remainingTotal === 1 ? "absence" : "absences"}, or ${stats.remainingUnjustified} unjustified. Reaching either threshold triggers exclusion.`,
              `Avant le seuil d’exclusion : ${stats.remainingTotal} absence(s) au total ou ${stats.remainingUnjustified} non justifiée(s). Atteindre une de ces limites entraîne l’exclusion.`,
            )}
          </p>
        </section>

        {!liveOccurrence.cancelled && (
          <details className="session-section simulator-section" open={!completed}>
            <summary>{phrase("Attendance risk simulator", "Simulateur de risque")}</summary>
            <p className="muted">
              {phrase(
                "See how one additional absence would affect this session type. Try a hypothetical absence.",
                "Voyez l’effet d’une absence supplémentaire sur ce type de séance. Essayez une absence hypothétique.",
              )}
            </p>
            <div
              className="simulator-toggle"
              role="group"
              aria-label="Hypothetical absence type"
            >
              <button
                type="button"
                aria-pressed={scenario === "unjustified"}
                className={scenario === "unjustified" ? "selected" : ""}
                onClick={() => setScenario("unjustified")}
              >
                {phrase("Unjustified absence", "Absence non justifiée")}
              </button>
              <button
                type="button"
                aria-pressed={scenario === "justified"}
                className={scenario === "justified" ? "selected" : ""}
                onClick={() => setScenario("justified")}
              >
                {phrase("Justified absence", "Absence justifiée")}
              </button>
            </div>
            <div
              className={`simulation-result ${simulation.risk}`}
              aria-live="polite"
            >
              {simulation.risk === "safe" ? (
                <ShieldCheck size={23} />
              ) : (
                <ShieldAlert size={23} />
              )}
              <div>
                <strong>
                  {simulation.alreadyExcluded
                    ? phrase("Already excluded", "Déjà exclu")
                    : simulation.risk === "excluded"
                      ? phrase(
                          "Exclusion threshold reached",
                          "Seuil d’exclusion atteint",
                        )
                      : simulation.risk === "warning"
                        ? phrase("Warning zone", "Zone d’alerte")
                        : phrase("Within the limits", "Dans les limites")}
                </strong>
                <p>
                  {simulation.alreadyExcluded
                    ? phrase(
                        "You have reached the exclusion threshold already.",
                        "Vous avez déjà atteint le seuil d’exclusion.",
                      )
                    : excludedEitherWay
                      ? phrase(
                          "Missing this session would trigger exclusion regardless of justification.",
                          "Manquer cette séance entraînerait une exclusion, même avec un justificatif.",
                        )
                      : phrase(
                          simulation.explanation,
                          simulation.risk === "excluded"
                            ? "Manquer cette séance entraînerait une exclusion."
                            : simulation.risk === "warning"
                              ? "Manquer cette séance placerait ce type de séance en zone d’alerte."
                              : "Votre présence projetée reste dans les limites. Assister aux cours reste la meilleure façon de protéger votre progression.",
                        )}
                </p>
              </div>
            </div>
            <div className="projected-counters">
              <span>
                {phrase("Projected total", "Total projeté")}{" "}
                <strong>{simulation.totalAbsences}</strong>
              </span>
              <span>
                {phrase("Projected unjustified", "Non justifiées projetées")}{" "}
                <strong>{simulation.unjustified}</strong>
              </span>
              <span>
                {phrase("Projected justified", "Justifiées projetées")}{" "}
                <strong>{simulation.justified}</strong>
              </span>
            </div>
          </details>
        )}

        {auditEntries.length > 0 && (
          <details className="session-section session-change-history">
            <summary><FileClock size={17} aria-hidden="true" />{phrase("Change history", "Historique des modifications")}</summary>
            <ul className="session-audit-list">
              {auditEntries.map((entry) => (
                <li key={entry.id}>
                  <span>{entry.action.replaceAll("_", " ")}</span>
                  <time>
                    {formatInZone(
                      entry.created_at,
                      "dd MMM · HH:mm",
                      timezone,
                      lang === "fr" ? "fr-DZ" : "en-GB",
                    )}
                  </time>
                </li>
              ))}
            </ul>
          </details>
        )}
        </div>
        <footer className="session-panel-footer">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="form-success" role="status">
              {message}
            </p>
          )}
          <div className="session-footer-actions">
            {completed && !liveOccurrence.cancelled && (
              <button className="btn btn-primary session-save" type="submit" form={attendanceFormId} disabled={busy}>
                {busy
                  ? phrase("Saving…", "Enregistrement…")
                  : attendance
                    ? phrase("Save correction", "Enregistrer la correction")
                    : phrase("Save attendance", "Enregistrer la présence")}
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onEdit(liveOccurrence)}
              >
                <Pencil size={16} />
                {phrase("Edit session", "Modifier la séance")}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={toggleCancellation}
            >
              {liveOccurrence.cancelled
                ? phrase("Restore session", "Rétablir la séance")
                : phrase("Cancel session", "Annuler la séance")}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    overlayRoot,
  );
}

export default SessionPanel;
