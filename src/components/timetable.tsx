"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import luxonPlugin from "@fullcalendar/luxon3";
import frLocale from "@fullcalendar/core/locales/fr";
import type {
  DateSelectArg,
  EventApi,
  EventClickArg,
  EventContentArg,
  EventMountArg,
} from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  AlertTriangle,
  CalendarDays,
  Copy,
  MapPin,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { getModuleStats, simulateAbsence } from "@/lib/attendance";
import type { AppData, Occurrence } from "@/lib/types";
import { SessionPanel } from "./session-panel";
import { Modal } from "./modal";
import { TimetableSharing } from "./timetable-sharing";
import "./timetable.css";

export interface TimetableProps {
  data: AppData;
  onMutate: (action: string, body: Record<string, unknown>) => Promise<unknown>;
  onRefresh?: () => Promise<void>;
}

type Draft = {
  module_id: string;
  session_type: "Lecture" | "TD" | "TP";
  date: string;
  start_time: string;
  end_time: string;
  classroom: string;
  professor: string;
  repeat_weeks: number;
  recurrence_end: string;
  scope: "occurrence" | "series";
};
type ConflictMutation = {
  action: string;
  body: Record<string, unknown>;
  conflicts: Occurrence[];
  after?: () => void;
};

function errorMessage(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "The session could not be saved. Please try again.";
}

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function overlap(
  data: AppData,
  startsAt: string,
  endsAt: string,
  ignoredId?: string,
) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  return data.occurrences.filter(
    (item) =>
      !item.cancelled &&
      item.id !== ignoredId &&
      new Date(item.starts_at).getTime() < end &&
      new Date(item.ends_at).getTime() > start,
  );
}

export function Timetable({ data, onMutate, onRefresh }: TimetableProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    occurrence?: Occurrence;
    duplicate?: boolean;
    initialDate?: string;
    initialEnd?: string;
    initialModule?: string;
  } | null>(null);
  const [conflict, setConflict] = useState<ConflictMutation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const timezone = data.student.timezone || "Africa/Algiers";
  const lang = data.student.language;
  const phrase = (en: string, fr: string) => (lang === "fr" ? fr : en);
  const modules = data.modules.filter((module) => !module.archived_at);
  const selected = data.occurrences.find(
    (occurrence) => occurrence.id === selectedId,
  );

  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const change = () => {
      setMobile(query.matches);
      calendarRef.current
        ?.getApi()
        .changeView(query.matches ? "listDay" : "timeGridWeek");
    };
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const moduleId = parameters.get("module");
    const validModuleId = data.modules.some(
      (module) => module.id === moduleId && !module.archived_at,
    )
      ? moduleId
      : null;
    if (validModuleId) setModuleFilter(validModuleId);
    if (parameters.get("add") === "1" && modules.length > 0)
      setEditor({ initialModule: validModuleId ?? undefined });
    const occurrenceId = parameters.get("session");
    const occurrence = data.occurrences.find(
      (item) => item.id === occurrenceId,
    );
    if (occurrence) {
      setSelectedId(occurrence.id);
      calendarRef.current?.getApi().gotoDate(occurrence.starts_at);
    }
    // URL parameters describe the initial workspace view only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const risks = useMemo(
    () =>
      new Map(
        data.modules.map((module) => [
          module.id,
          simulateAbsence(getModuleStats(module, data), "unjustified").risk,
        ]),
      ),
    [data],
  );
  const events = useMemo(
    () =>
      data.occurrences
        .filter((occurrence) => {
          const module = data.modules.find(
            (item) => item.id === occurrence.module_id,
          );
          return (
            module &&
            !module.archived_at &&
            (moduleFilter === "all" || moduleFilter === occurrence.module_id) &&
            (typeFilter === "all" || typeFilter === occurrence.session_type)
          );
        })
        .map((occurrence) => {
          const module = data.modules.find(
            (item) => item.id === occurrence.module_id,
          )!;
          const recorded = data.attendance.some(
            (item) => item.occurrence_id === occurrence.id,
          );
          return {
            id: occurrence.id,
            title: module.name,
            start: occurrence.starts_at,
            end: occurrence.ends_at,
            backgroundColor: `${module.color}22`,
            borderColor: module.color,
            textColor: "var(--text, #e7edf7)",
            classNames: [
              "absentia-calendar-event",
              occurrence.cancelled ? "is-cancelled" : "",
              `risk-${risks.get(module.id)}`,
            ],
            editable: !recorded && !occurrence.cancelled,
            extendedProps: {
              occurrence,
              module,
              risk: risks.get(module.id),
              recorded,
            },
          };
        }),
    [data, moduleFilter, typeFilter, risks],
  );

  async function runMutation(
    action: string,
    body: Record<string, unknown>,
    after?: () => void,
  ) {
    setBusy(true);
    setError("");
    try {
      await onMutate(action, body);
      after?.();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function moveEvent(info: { event: EventApi; revert: () => void }) {
    if (!info.event.start || !info.event.end) {
      info.revert();
      return;
    }
    const starts_at = info.event.start.toISOString();
    const ends_at = info.event.end.toISOString();
    const collisions = overlap(data, starts_at, ends_at, info.event.id);
    const body = { id: info.event.id, starts_at, ends_at };
    info.revert();
    if (collisions.length > 0)
      setConflict({ action: "occurrence_save", body, conflicts: collisions });
    else void runMutation("occurrence_save", body);
  }

  function renderEvent(info: EventContentArg) {
    const occurrence = info.event.extendedProps.occurrence as Occurrence;
    return (
      <div className="calendar-event-content">
        <div className="calendar-event-top">
          <span>
            {occurrence.session_type === "Lecture"
              ? phrase("Lecture", "Cours")
              : occurrence.session_type}
          </span>
          <strong>{info.event.title}</strong>
          {occurrence.cancelled ? (
            <span>{phrase("Cancelled", "Annulée")}</span>
          ) : (
            info.event.extendedProps.risk === "excluded" && (
              <AlertTriangle
                size={13}
                aria-label={phrase(
                  "An additional absence reaches exclusion",
                  "Une absence supplémentaire entraîne l’exclusion",
                )}
              />
            )
          )}
        </div>
        <span className="calendar-event-time">
          {formatInTimeZone(occurrence.starts_at, timezone, "HH:mm")} –{" "}
          {formatInTimeZone(occurrence.ends_at, timezone, "HH:mm")}
        </span>
        <span className="calendar-event-room">
          <MapPin size={11} />
          {occurrence.classroom || phrase("Room TBC", "Salle à préciser")}
        </span>
      </div>
    );
  }

  return (
    <div className="timetable-page">
      <div className="page-heading timetable-heading">
        <div>
          <span className="eyebrow">
            {phrase("YOUR ACADEMIC WEEK", "VOTRE SEMAINE UNIVERSITAIRE")}
          </span>
          <h1>{phrase("My timetable", "Mon emploi du temps")}</h1>
          <p className="muted">
            {phrase(
              "Your week, with attendance in perspective.",
              "Votre semaine, avec une vision claire de vos présences.",
            )}
          </p>
        </div>
        <div className="timetable-heading-actions">
          <TimetableSharing
            data={data}
            onImported={async () => {
              if (onRefresh) await onRefresh();
              else window.location.reload();
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={modules.length === 0}
            onClick={() => setEditor({})}
          >
            <Plus size={18} />
            {phrase("Add session", "Ajouter une séance")}
          </button>
        </div>
      </div>
      {modules.length === 0 ? (
        <div className="card timetable-empty">
          <CalendarDays size={38} />
          <h2>
            {phrase("Make room for your semester", "Préparez votre semestre")}
          </h2>
          <p className="muted">
            {phrase(
              "Create your modules first, then add lectures, TDs, and TPs to your weekly timetable.",
              "Créez vos modules, puis ajoutez les cours, TD et TP à votre emploi du temps.",
            )}
          </p>
          <a href="/modules" className="btn btn-primary">
            {phrase("Create a module", "Créer un module")}
          </a>
        </div>
      ) : (
        <>
          <div className="card timetable-card">
            <div className="timetable-filters">
              <span className="timetable-filter-label">
                <SlidersHorizontal size={16} />
                {phrase("Filters", "Filtres")}
              </span>
              <label>
                <span className="sr-only">
                  {phrase("Filter by module", "Filtrer par module")}
                </span>
                <select
                  className="input"
                  value={moduleFilter}
                  onChange={(event) => setModuleFilter(event.target.value)}
                >
                  <option value="all">
                    {phrase("All modules", "Tous les modules")}
                  </option>
                  {modules.map((module) => (
                    <option key={module.id} value={module.id}>
                      {module.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">
                  {phrase(
                    "Filter by session type",
                    "Filtrer par type de séance",
                  )}
                </span>
                <select
                  className="input"
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                >
                  <option value="all">
                    {phrase("All session types", "Tous les types")}
                  </option>
                  <option value="Lecture">{phrase("Lecture", "Cours")}</option>
                  <option value="TD">TD</option>
                  <option value="TP">TP</option>
                </select>
              </label>
              <span className="timetable-timezone">{timezone}</span>
            </div>
            <div className="timetable-calendar" aria-busy={busy}>
              <FullCalendar
                ref={calendarRef}
                plugins={[
                  timeGridPlugin,
                  dayGridPlugin,
                  interactionPlugin,
                  listPlugin,
                  luxonPlugin,
                ]}
                locale={lang === "fr" ? frLocale : "en"}
                initialView="timeGridWeek"
                timeZone={timezone}
                firstDay={0}
                hiddenDays={[]}
                allDaySlot={false}
                slotMinTime="07:00:00"
                slotMaxTime="21:00:00"
                scrollTime="08:00:00"
                slotDuration="00:30:00"
                snapDuration="00:15:00"
                slotLabelFormat={{
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }}
                eventTimeFormat={{
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }}
                dayHeaderFormat={{ weekday: "short", day: "numeric" }}
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: mobile
                    ? "listWeek,listDay"
                    : "timeGridWeek,timeGridDay,listWeek",
                }}
                buttonText={{
                  prev: "‹",
                  next: "›",
                  today: phrase("Today", "Aujourd’hui"),
                  week: phrase("Week", "Semaine"),
                  day: phrase("Day", "Jour"),
                  listWeek: mobile ? phrase("Week", "Semaine") : "Agenda",
                  listDay: phrase("Day", "Jour"),
                }}
                buttonIcons={false}
                titleFormat={
                  mobile
                    ? { month: "short", day: "numeric" }
                    : { month: "long", year: "numeric", day: "numeric" }
                }
                nowIndicator
                editable
                eventResizableFromStart
                selectable
                selectMirror
                select={(selection: DateSelectArg) => {
                  setEditor({
                    initialDate: selection.start.toISOString(),
                    initialEnd: selection.end.toISOString(),
                  });
                  calendarRef.current?.getApi().unselect();
                }}
                dateClick={(info: DateClickArg) => {
                  if (info.view.type.startsWith("list")) return;
                  setEditor({ initialDate: info.date.toISOString() });
                }}
                events={events}
                eventContent={renderEvent}
                eventClick={(info: EventClickArg) =>
                  setSelectedId(info.event.id)
                }
                eventDrop={moveEvent}
                eventResize={moveEvent}
                eventMinHeight={68}
                height="auto"
                noEventsContent={phrase(
                  "No sessions this week. Add a session to start building your timetable.",
                  "Aucune séance cette semaine. Ajoutez une séance à votre emploi du temps.",
                )}
                dayMaxEvents={false}
                eventDidMount={(info: EventMountArg) => {
                  info.el.setAttribute(
                    "aria-label",
                    `${info.event.title}, ${info.event.extendedProps.occurrence.session_type}, ${info.timeText}. ${phrase("Open session details.", "Ouvrir les détails de la séance.")}`,
                  );
                }}
              />
            </div>
            <footer className="timetable-footer">
              <span>
                {mobile
                  ? phrase(
                      "Tap a session to record attendance or explore its risk.",
                      "Touchez une séance pour enregistrer la présence ou explorer le risque.",
                    )
                  : phrase(
                      "Select an empty time slot to add a session. Drag or resize to adjust it.",
                      "Sélectionnez un créneau pour ajouter une séance. Déplacez ou redimensionnez-la pour l’ajuster.",
                    )}
              </span>
              <span>
                <AlertTriangle size={14} />
                {phrase(
                  "An additional absence reaches exclusion",
                  "Une absence supplémentaire entraîne l’exclusion",
                )}
              </span>
            </footer>
          </div>
          <div className="timetable-module-legend">
            {modules.map((module) => (
              <button
                key={module.id}
                type="button"
                onClick={() =>
                  setModuleFilter(
                    moduleFilter === module.id ? "all" : module.id,
                  )
                }
                className={moduleFilter === module.id ? "selected" : ""}
              >
                <span style={{ backgroundColor: module.color }} />
                {module.code || module.name}
              </button>
            ))}
          </div>
        </>
      )}
      {error && (
        <div className="session-info form-error" role="alert">
          {error}
          <button
            className="btn btn-ghost"
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {selected && !editor && (
        <SessionPanel
          data={data}
          occurrence={selected}
          onClose={() => setSelectedId(null)}
          onMutate={onMutate}
          onEdit={(occurrence) => {
            setSelectedId(null);
            setEditor({ occurrence });
          }}
        />
      )}
      {editor && (
        <SessionEditor
          key={`${editor.occurrence?.id ?? "new"}:${Boolean(editor.duplicate)}`}
          data={data}
          occurrence={editor.occurrence}
          duplicate={editor.duplicate}
          initialDate={editor.initialDate}
          initialEnd={editor.initialEnd}
          initialModule={editor.initialModule}
          onClose={() => setEditor(null)}
          onMutate={onMutate}
          onDuplicate={(occurrence) =>
            setEditor({ occurrence, duplicate: true })
          }
        />
      )}
      {conflict && (
        <Modal
          title={phrase("A timetable conflict", "Un conflit d’emploi du temps")}
          description={phrase(
            `This time overlaps with ${conflict.conflicts.length} scheduled session(s).`,
            `Ce créneau chevauche ${conflict.conflicts.length} séance(s).`,
          )}
          onClose={() => {
            if (!busy) setConflict(null);
          }}
        >
          <div className="conflict-dialog" style={{ width: "100%" }}>
            <div className="conflict-icon">
              <AlertTriangle size={24} />
            </div>
            <ul>
              {conflict.conflicts.map((item) => (
                <li key={item.id}>
                  {
                    data.modules.find((module) => module.id === item.module_id)
                      ?.name
                  }
                  <span>
                    {formatInTimeZone(item.starts_at, timezone, "EEE HH:mm")} –{" "}
                    {formatInTimeZone(item.ends_at, timezone, "HH:mm")}
                  </span>
                </li>
              ))}
            </ul>
            <div className="session-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setConflict(null)}
                disabled={busy}
              >
                {phrase("Keep original time", "Garder l’horaire initial")}
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={() => {
                  void runMutation(conflict.action, conflict.body, () => {
                    conflict.after?.();
                    setConflict(null);
                  });
                }}
              >
                {busy
                  ? phrase("Saving…", "Enregistrement…")
                  : phrase(
                      "Save overlapping session",
                      "Enregistrer malgré le conflit",
                    )}
              </button>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

interface EditorProps {
  data: AppData;
  occurrence?: Occurrence;
  duplicate?: boolean;
  initialDate?: string;
  initialEnd?: string;
  initialModule?: string;
  onClose: () => void;
  onMutate: (action: string, body: Record<string, unknown>) => Promise<unknown>;
  onDuplicate: (occurrence: Occurrence) => void;
}

function SessionEditor({
  data,
  occurrence,
  duplicate,
  initialDate,
  initialEnd,
  initialModule,
  onClose,
  onMutate,
  onDuplicate,
}: EditorProps) {
  const editorRef = useRef<HTMLElement>(null);
  const timezone = data.student.timezone || "Africa/Algiers";
  const phrase = (en: string, fr: string) =>
    data.student.language === "fr" ? fr : en;
  const template = data.sessions.find(
    (item) => item.id === occurrence?.session_id,
  );
  const initialStart =
    occurrence?.starts_at ?? initialDate ?? new Date().toISOString();
  const date = formatInTimeZone(initialStart, timezone, "yyyy-MM-dd");
  const [draft, setDraft] = useState<Draft>(() => ({
    module_id:
      occurrence?.module_id ??
      initialModule ??
      data.modules.find((module) => !module.archived_at)?.id ??
      "",
    session_type: occurrence?.session_type ?? "Lecture",
    date: duplicate ? addCalendarDays(date, 7) : date,
    start_time: occurrence
      ? formatInTimeZone(occurrence.starts_at, timezone, "HH:mm")
      : initialDate
        ? formatInTimeZone(initialDate, timezone, "HH:mm")
        : "08:00",
    end_time: occurrence
      ? formatInTimeZone(occurrence.ends_at, timezone, "HH:mm")
      : initialEnd
        ? formatInTimeZone(initialEnd, timezone, "HH:mm")
        : initialDate
          ? formatInTimeZone(
              new Date(new Date(initialDate).getTime() + 90 * 60 * 1000),
              timezone,
              "HH:mm",
            )
          : "09:30",
    classroom: occurrence?.classroom ?? "",
    professor: occurrence?.professor ?? "",
    repeat_weeks: 1,
    recurrence_end: template?.recurrence_end ?? date,
    scope: "occurrence",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [allowOverlap, setAllowOverlap] = useState(false);
  const editing = Boolean(occurrence && !duplicate);
  const moduleLocked = editing && draft.scope === "occurrence";
  const [start, end] = useMemo(() => {
    try {
      return [
        fromZonedTime(
          `${draft.date}T${draft.start_time}:00`,
          timezone,
        ).toISOString(),
        fromZonedTime(
          `${draft.date}T${draft.end_time}:00`,
          timezone,
        ).toISOString(),
      ];
    } catch {
      return ["", ""];
    }
  }, [draft.date, draft.start_time, draft.end_time, timezone]);
  const repeats =
    editing && draft.scope === "series"
      ? Math.max(
          1,
          Math.floor(
            (new Date(draft.recurrence_end).getTime() -
              new Date(draft.date).getTime()) /
              604800000,
          ) + 1,
        )
      : draft.repeat_weeks;
  const collisions = useMemo(() => {
    if (!start || !end) return [];
    const found = new Map<string, Occurrence>();
    for (let index = 0; index < Math.min(repeats, 53); index++) {
      const recurringDate = addCalendarDays(draft.date, index * 7);
      const recurringStart = fromZonedTime(
        `${recurringDate}T${draft.start_time}:00`,
        timezone,
      ).toISOString();
      const recurringEnd = fromZonedTime(
        `${recurringDate}T${draft.end_time}:00`,
        timezone,
      ).toISOString();
      for (const item of overlap(
        data,
        recurringStart,
        recurringEnd,
        editing ? occurrence?.id : undefined,
      )) {
        if (
          editing &&
          draft.scope === "series" &&
          item.session_id === occurrence?.session_id
        )
          continue;
        found.set(item.id, item);
      }
    }
    return [...found.values()];
  }, [data, draft.scope, start, end, repeats, editing, occurrence]);

  useEffect(() => {
    setAllowOverlap(false);
  }, [draft.date, draft.start_time, draft.end_time, draft.repeat_weeks]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    editorRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const elements = Array.from(
        editorRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])",
        ) ?? [],
      ).filter((item) => item.offsetParent !== null);
      const first = elements[0],
        last = elements.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === editorRef.current)
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
      previousFocus?.focus();
    };
  }, [onClose]);

  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!start || !end || new Date(end) <= new Date(start)) {
      setError(
        phrase(
          "End time must be later than start time on the same day.",
          "L’heure de fin doit suivre l’heure de début le même jour.",
        ),
      );
      return;
    }
    if (collisions.length > 0 && !allowOverlap) {
      setError(
        phrase(
          "Review the overlapping sessions and confirm before saving.",
          "Vérifiez les conflits et confirmez avant d’enregistrer.",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      if (editing && draft.scope === "occurrence")
        await onMutate("occurrence_save", {
          id: occurrence!.id,
          starts_at: start,
          ends_at: end,
          classroom: draft.classroom,
        });
      else {
        const isoWeekday = new Date(`${draft.date}T12:00:00Z`).getUTCDay() || 7;
        const recurrenceEnd =
          editing && draft.scope === "series"
            ? draft.recurrence_end
            : addCalendarDays(draft.date, (draft.repeat_weeks - 1) * 7);
        await onMutate("session_save", {
          ...(editing ? { id: occurrence!.session_id } : {}),
          module_id: draft.module_id,
          session_type: draft.session_type,
          weekday: isoWeekday,
          start_time: draft.start_time,
          end_time: draft.end_time,
          classroom: draft.classroom,
          professor: draft.professor,
          recurrence_start: draft.date,
          recurrence_end: recurrenceEnd,
        });
      }
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function removeSeries() {
    if (
      !occurrence ||
      !window.confirm(
        phrase(
          "Delete this session series and all its occurrences and attendance records? This cannot be undone.",
          "Supprimer cette série, toutes ses séances et présences ? Cette action est irréversible.",
        ),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await onMutate("session_delete", { id: occurrence.session_id });
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="session-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={editorRef}
        tabIndex={-1}
        className="session-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-editor-title"
      >
        <header className="session-panel-header">
          <div>
            <span className="eyebrow">
              {phrase("TIMETABLE BUILDER", "CONSTRUCTION DE L’EMPLOI DU TEMPS")}
            </span>
            <h2 id="session-editor-title">
              {duplicate
                ? phrase("Duplicate session", "Dupliquer une séance")
                : editing
                  ? phrase("Edit session", "Modifier la séance")
                  : phrase("Add a session", "Ajouter une séance")}
            </h2>
          </div>
          <button
            className="btn btn-ghost icon-button"
            type="button"
            aria-label="Close session editor"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <form onSubmit={save}>
          {editing && (
            <label className="field">
              {phrase("Apply changes to", "Appliquer les modifications à")}
              <select
                className="input"
                value={draft.scope}
                onChange={(event) => {
                  const scope = event.target.value as Draft["scope"];
                  setDraft((current) => ({
                    ...current,
                    scope,
                    ...(scope === "series" && template
                      ? {
                          date: template.recurrence_start,
                          start_time: template.start_time.slice(0, 5),
                          end_time: template.end_time.slice(0, 5),
                          recurrence_end: template.recurrence_end,
                        }
                      : {}),
                  }));
                }}
              >
                <option value="occurrence">
                  {phrase("This session only", "Cette séance uniquement")}
                </option>
                <option value="series">
                  {phrase("The weekly series", "Toute la série hebdomadaire")}
                </option>
              </select>
            </label>
          )}
          <label className="field">
            Module
            <select
              className="input"
              required
              value={draft.module_id}
              disabled={moduleLocked || busy}
              onChange={(event) => field("module_id", event.target.value)}
            >
              {data.modules
                .filter(
                  (module) =>
                    !module.archived_at || module.id === occurrence?.module_id,
                )
                .map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="session-form-grid">
            <label className="field">
              {phrase("Session type", "Type de séance")}
              <select
                className="input"
                value={draft.session_type}
                disabled={moduleLocked || busy}
                onChange={(event) =>
                  field(
                    "session_type",
                    event.target.value as Draft["session_type"],
                  )
                }
              >
                <option value="Lecture">{phrase("Lecture", "Cours")}</option>
                <option>TD</option>
                <option>TP</option>
              </select>
            </label>
            <label className="field">
              {draft.scope === "series" && editing
                ? phrase("First occurrence", "Première séance")
                : "Date"}
              <input
                className="input"
                type="date"
                required
                value={draft.date}
                disabled={busy}
                onChange={(event) => field("date", event.target.value)}
                autoFocus
              />
            </label>
            <label className="field">
              {phrase("Start time", "Heure de début")}
              <input
                className="input"
                type="time"
                required
                step={300}
                value={draft.start_time}
                disabled={busy}
                onChange={(event) => field("start_time", event.target.value)}
              />
            </label>
            <label className="field">
              {phrase("End time", "Heure de fin")}
              <input
                className="input"
                type="time"
                required
                step={300}
                value={draft.end_time}
                disabled={busy}
                onChange={(event) => field("end_time", event.target.value)}
              />
            </label>
            <label className="field">
              {phrase("Classroom", "Salle")}
              <input
                className="input"
                maxLength={120}
                value={draft.classroom}
                disabled={busy}
                onChange={(event) => field("classroom", event.target.value)}
                placeholder={phrase("e.g. Room B12", "ex. Salle B12")}
              />
            </label>
            <label className="field">
              {phrase("Professor", "Professeur")}{" "}
              <span className="muted">{phrase("optional", "facultatif")}</span>
              <input
                className="input"
                maxLength={160}
                value={draft.professor}
                disabled={moduleLocked || busy}
                onChange={(event) => field("professor", event.target.value)}
                placeholder={phrase("Professor name", "Nom du professeur")}
              />
            </label>
          </div>
          {!editing && (
            <label className="field">
              {phrase("Repeat weekly", "Répétition hebdomadaire")}
              <select
                className="input"
                value={draft.repeat_weeks}
                disabled={busy}
                onChange={(event) =>
                  field("repeat_weeks", Number(event.target.value))
                }
              >
                <option value={1}>
                  {phrase(
                    "No repeat · one session",
                    "Sans répétition · une séance",
                  )}
                </option>
                {[2, 4, 6, 8, 12, 16, 20, 24].map((weeks) => (
                  <option value={weeks} key={weeks}>
                    {phrase(
                      `Every week for ${weeks} weeks`,
                      `Chaque semaine pendant ${weeks} semaines`,
                    )}
                  </option>
                ))}
              </select>
            </label>
          )}
          {editing && draft.scope === "series" && (
            <>
              <label className="field">
                {phrase("Repeat until", "Répéter jusqu’au")}
                <input
                  className="input"
                  type="date"
                  required
                  min={draft.date}
                  value={draft.recurrence_end}
                  onChange={(event) =>
                    field("recurrence_end", event.target.value)
                  }
                />
              </label>
              <p className="session-fine-print">
                {phrase(
                  "Recorded attendance is protected. Changes that would move recorded sessions will be rejected.",
                  "Les présences enregistrées sont protégées. Les modifications qui déplaceraient ces séances seront refusées.",
                )}
              </p>
            </>
          )}
          <p className="session-fine-print">
            {phrase(
              `All times use ${timezone}. Sessions are generated for the selected weekday.`,
              `Tous les horaires utilisent ${timezone}. Les séances suivent le jour choisi.`,
            )}
          </p>
          {moduleLocked && (
            <p className="session-fine-print">
              {phrase(
                "To change the module, session type, or professor, select the weekly series above.",
                "Pour changer le module, le type ou le professeur, sélectionnez la série hebdomadaire ci-dessus.",
              )}
            </p>
          )}
          {collisions.length > 0 && (
            <div className="session-conflict-warning">
              <strong>
                <AlertTriangle size={16} />
                {phrase(
                  `${collisions.length} overlapping ${collisions.length === 1 ? "session" : "sessions"}`,
                  `${collisions.length} séance(s) en conflit`,
                )}
              </strong>
              <ul>
                {collisions.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    {
                      data.modules.find(
                        (module) => module.id === item.module_id,
                      )?.name
                    }{" "}
                    ·{" "}
                    {formatInTimeZone(item.starts_at, timezone, "dd MMM HH:mm")}
                  </li>
                ))}
              </ul>
              <label>
                <input
                  type="checkbox"
                  checked={allowOverlap}
                  onChange={(event) => setAllowOverlap(event.target.checked)}
                />
                {phrase(
                  "I reviewed the conflict and want to save this time.",
                  "J’ai vérifié le conflit et souhaite enregistrer ce créneau.",
                )}
              </label>
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="session-actions">
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              {phrase("Cancel", "Annuler")}
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy || (collisions.length > 0 && !allowOverlap)}
            >
              {busy
                ? phrase("Saving…", "Enregistrement…")
                : editing
                  ? phrase("Save changes", "Enregistrer")
                  : phrase("Add session", "Ajouter une séance")}
            </button>
          </div>
        </form>
        {editing && occurrence && (
          <footer className="session-editor-footer">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => onDuplicate(occurrence)}
            >
              <Copy size={15} />
              {phrase("Duplicate", "Dupliquer")}
            </button>
            <button
              type="button"
              className="btn btn-ghost destructive"
              disabled={busy}
              onClick={removeSeries}
            >
              <Trash2 size={15} />
              {phrase("Delete series", "Supprimer la série")}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

export default Timetable;
