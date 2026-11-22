"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  Clock3,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  getModuleStats,
  SESSION_TYPES,
  getRiskExplanation,
  simulateAbsence,
} from "@/lib/attendance";
import { formatInZone } from "@/lib/timezone";
import { t, semesterLabel, sessionTypeLabel } from "@/lib/i18n";
import type { InitialAbsencesByType, Module, Occurrence } from "@/lib/types";
import { useWorkspace } from "./workspace";
import { ModuleIcon, RiskBadge, RiskRow } from "./dashboard";
import { Modal } from "./modal";
import { SessionPanel } from "./session-panel";
const colors = [
  "#93AA84",
  "#C49B77",
  "#97ABA4",
  "#C7B27F",
  "#83A991",
  "#CD8B78",
  "#B39DA1",
  "#9EACC1",
];
export function ModuleEditor({
  module,
  onClose,
}: {
  module?: Module;
  onClose: () => void;
}) {
  const { data, mutate } = useWorkspace();
  const lang = data.student.language;
  const [values, setValues] = useState({
    name: module?.name || "",
    code: module?.code || "",
    professor: module?.professor || "",
    description: module?.description || "",
    semester: module?.semester || data.student.semester,
    color: module?.color || colors[0],
    total_threshold: module?.total_threshold?.toString() || "",
    unjustified_threshold: module?.unjustified_threshold?.toString() || "",
    initial_justified_absences: String(module?.initial_justified_absences ?? 0),
    initial_unjustified_absences: String(module?.initial_unjustified_absences ?? 0),
  });
  const [initialByType, setInitialByType] = useState<InitialAbsencesByType>(module?.initial_absences_by_type ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = (key: keyof typeof values, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const includeInitial = module?.initial_justified_absences !== undefined || module?.initial_unjustified_absences !== undefined || Number(values.initial_justified_absences) !== 0 || Number(values.initial_unjustified_absences) !== 0;
      await mutate("module_save", {
        ...values,
        id: module?.id,
        initial_absences_by_type: initialByType,
        total_threshold: values.total_threshold
          ? Number(values.total_threshold)
          : null,
        unjustified_threshold: values.unjustified_threshold
          ? Number(values.unjustified_threshold)
          : null,
        initial_justified_absences: includeInitial ? Number(values.initial_justified_absences) : undefined,
        initial_unjustified_absences: includeInitial ? Number(values.initial_unjustified_absences) : undefined,
      });
      toast.success(t(lang, module ? "module.updated" : "module.created"));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={t(lang, module ? "module.edit" : "module.new")}
      onClose={onClose}
    >
      <form onSubmit={submit} onInvalidCapture={(event) => {
        const details = (event.target as HTMLElement).closest("details");
        if (details) details.open = true;
      }}>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="module-name">{t(lang, "module.name")}</label>
            <input
              className="input"
              id="module-name"
              value={values.name}
              onChange={(e) => field("name", e.target.value)}
              required
              maxLength={120}
              autoFocus
              placeholder={t(lang, "module.namePlaceholder")}
            />
          </div>
          <div className="field">
            <label htmlFor="module-code">{t(lang, "module.code")}</label>
            <input
              className="input"
              id="module-code"
              value={values.code}
              onChange={(e) => field("code", e.target.value)}
              required
              maxLength={30}
              placeholder={t(lang, "module.codePlaceholder")}
            />
          </div>
          <div className="field">
            <label htmlFor="module-semester">{t(lang, "semester")}</label>
            <select
              className="input"
              id="module-semester"
              value={values.semester}
              onChange={(e) => field("semester", e.target.value)}
            >
              {[
                ...new Set([
                  values.semester,
                  ...Array.from({ length: 10 }, (_, i) => `Semester ${i + 1}`),
                ]),
              ].map((value) => (
                <option key={value} value={value}>
                  {semesterLabel(value, lang)}
                </option>
              ))}
            </select>
          </div>
          <details className="span-2 module-form-options" open={Boolean(
            (module?.initial_justified_absences ?? 0) + (module?.initial_unjustified_absences ?? 0) ||
            Object.values(module?.initial_absences_by_type ?? {}).some((balance) => balance.justified || balance.unjustified)
          )}>
            <summary>{t(lang, "module.initialTitle")}</summary>
            <fieldset className="initial-absence-fields" aria-describedby="initial-absence-help">
              <p id="initial-absence-help">{t(lang, "module.initialBody")}</p>
              {SESSION_TYPES.map((type) => (
                <div className="form-grid" key={type}>
                  {(["justified", "unjustified"] as const).map((kind) => (
                    <div className="field" key={kind}>
                      <label htmlFor={`module-initial-${type}-${kind}`}>{sessionTypeLabel(type, lang)} · {t(lang, kind === "justified" ? "module.initialJustified" : "module.initialUnjustified")}</label>
                      <input className="input" id={`module-initial-${type}-${kind}`} type="number" min={0} max={1000} step={1}
                        value={initialByType[type]?.[kind] ?? 0}
                        onChange={(event) => setInitialByType((previous) => ({ ...previous, [type]: { justified: previous[type]?.justified ?? 0, unjustified: previous[type]?.unjustified ?? 0, [kind]: Number(event.target.value) } }))} />
                    </div>
                  ))}
                </div>
              ))}
              {((module?.initial_justified_absences ?? 0) + (module?.initial_unjustified_absences ?? 0) > 0) && (
                <>
                  <p>{t(lang, "module.unassignedNotice", { count: (module?.initial_justified_absences ?? 0) + (module?.initial_unjustified_absences ?? 0) })}</p>
                  <div className="form-grid">
                    {(["justified", "unjustified"] as const).map((kind) => {
                      const key = kind === "justified" ? "initial_justified_absences" : "initial_unjustified_absences";
                      return <div className="field" key={kind}>
                        <label htmlFor={`module-unassigned-${kind}`}>{t(lang, "module.unassigned")} · {t(lang, kind === "justified" ? "module.initialJustified" : "module.initialUnjustified")}</label>
                        <input className="input" id={`module-unassigned-${kind}`} type="number" min={0} max={1000} step={1} value={values[key]} onChange={(event) => field(key, event.target.value)} />
                      </div>;
                    })}
                  </div>
                </>
              )}
              <p className="initial-absence-fine-print">{t(lang, "module.initialRate")}</p>
            </fieldset>
          </details>
          <details className="span-2 module-form-options">
            <summary>{lang === "fr" ? "Options du module" : "Module options"}</summary>
            <div className="form-grid">
              <div className="field span-2">
                <label htmlFor="module-professor">
                  {t(lang, "module.professor")}
                </label>
                <input
                  className="input"
                  id="module-professor"
                  value={values.professor}
                  onChange={(e) => field("professor", e.target.value)}
                  maxLength={120}
                  placeholder={t(lang, "module.professorPlaceholder")}
                />
              </div>
              <div className="field span-2">
                <label htmlFor="module-description">
                  {t(lang, "module.description")}
                </label>
                <textarea
                  className="input"
                  id="module-description"
                  value={values.description}
                  onChange={(e) => field("description", e.target.value)}
                  maxLength={4000}
                  placeholder={t(lang, "module.descriptionPlaceholder")}
                />
              </div>
              <div className="field span-2">
                <label>{t(lang, "module.color")}</label>
                <div
                  className="color-picker"
                  role="group"
                  aria-label={t(lang, "module.color")}
                >
                  {colors.map((color) => (
                    <button
                      className={`color-swatch ${values.color.toUpperCase() === color ? "selected" : ""}`}
                      type="button"
                      key={color}
                      style={{ background: color }}
                      onClick={() => field("color", color)}
                      aria-label={t(lang, "module.selectColor", { color })}
                      aria-pressed={values.color.toUpperCase() === color}
                    />
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="module-total">
                  {t(lang, "module.totalThreshold")}
                </label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={50}
                  id="module-total"
                  value={values.total_threshold}
                  onChange={(e) => field("total_threshold", e.target.value)}
                  placeholder={t(lang, "module.defaultThreshold", {
                    count: data.student.total_threshold,
                  })}
                />
                <small>{t(lang, "module.blankThreshold")}</small>
              </div>
              <div className="field">
                <label htmlFor="module-unjustified">
                  {t(lang, "module.unjustifiedThreshold")}
                </label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={50}
                  id="module-unjustified"
                  value={values.unjustified_threshold}
                  onChange={(e) => field("unjustified_threshold", e.target.value)}
                  placeholder={t(lang, "module.defaultThreshold", {
                    count: data.student.unjustified_threshold,
                  })}
                />
              </div>
            </div>
          </details>
        </div>
        <div className="form-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            {t(lang, "cancel")}
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <span className="spinner" /> : <BookOpen size={16} />}{" "}
            {t(lang, module ? "save" : "module.create")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function ModulesPage() {
  const { data, mutate } = useWorkspace();
  const lang = data.student.language;
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [semester, setSemester] = useState("all");
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<Module | true | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (params.get("add") === "1") setEditing(true);
  }, [params]);
  const filtered = data.modules.filter(
    (m) =>
      Boolean(m.archived_at) === archived &&
      (semester === "all" || m.semester === semester) &&
      `${m.name} ${m.code} ${m.professor}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const archive = async (module: Module) => {
    setBusy(module.id);
    try {
      await mutate("module_archive", {
        id: module.id,
        archived: !module.archived_at,
      });
      toast.success(
        t(lang, module.archived_at ? "module.restored" : "module.archived"),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <div className="page-heading module-list-heading">
        <div>
          <h1>{t(lang, "modules")}</h1>
        </div>
        <div className="page-heading-actions">
          <button className="btn btn-primary" onClick={() => setEditing(true)}>
            <Plus size={16} />
            {t(lang, "addModule")}
          </button>
        </div>
      </div>
      <div className="toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            className="input"
            aria-label={t(lang, "module.search")}
            placeholder={t(lang, "module.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
          aria-label={t(lang, "module.filterSemester")}
        >
          <option value="all">{t(lang, "module.allSemesters")}</option>
          {[
            ...new Set([
              data.student.semester,
              ...data.modules.map((m) => m.semester),
            ]),
          ]
            .sort()
            .map((s) => (
              <option key={s} value={s}>
                {semesterLabel(s, lang)}
              </option>
            ))}
        </select>
        <div className="segmented">
          <button
            className={!archived ? "active" : ""}
            onClick={() => setArchived(false)}
          >
            {t(lang, "module.active")}
          </button>
          <button
            className={archived ? "active" : ""}
            onClick={() => setArchived(true)}
          >
            {t(lang, "module.archivedTab")}
          </button>
        </div>
      </div>
      {filtered.length ? (
        <div className="module-grid">
          {filtered.map((module) => {
            const stats = getModuleStats(module, data);
            return (
              <article
                className={`card module-card ${archived ? "archived" : ""}`}
                key={module.id}
              >
                <div className="module-card-top">
                  <ModuleIcon module={module} />
                  <RiskBadge stats={stats} />
                </div>
                <Link href={`/modules/${module.id}`}>
                  <div className="module-code">
                    {module.code} · {module.academic_year && `${module.academic_year} · `}
                    {semesterLabel(module.semester, lang)}
                  </div>
                  <h2>{module.name}</h2>
                </Link>
                <p className="row">
                  <UserRound size={13} />
                  {module.professor || t(lang, "module.professorUnset")}
                </p>
                <div className="module-stats">
                  <div className="module-stat">
                    <strong>
                      {stats.attendanceRate === null
                        ? "—"
                        : `${stats.attendanceRate}%`}
                    </strong>
                    <small>{t(lang, "attendance")}</small>
                  </div>
                  <div className="module-stat">
                    <strong>{stats.totalAbsences}</strong>
                    <small>{t(lang, "absences")}</small>
                  </div>
                  <div className="module-stat">
                    <strong>{stats.scheduled}</strong>
                    <small>{t(lang, "sessions")}</small>
                  </div>
                </div>
                {stats.initialAbsences > 0 && <p className="initial-absence-summary">{t(lang, "module.initialSummary", { count: stats.initialAbsences })}</p>}
                {stats.unassignedInitialAbsences > 0 && <p className="help-caption">{t(lang, "module.unassignedNotice", { count: stats.unassignedInitialAbsences })}</p>}
                {stats.sessionStats.map((session) => (
                  <div key={session.sessionType}>
                    <div className="bar-caption">
                      <span>{sessionTypeLabel(session.sessionType, lang)}</span>
                      <span>{session.totalAbsences}/{session.thresholds.total} · {session.unjustified}/{session.thresholds.unjustified} {t(lang, "risk.unjustified")}</span>
                      <RiskBadge stats={session} />
                    </div>
                    <div className="progress"><span style={{ width: `${Math.min(100, Math.max(session.totalAbsences / session.thresholds.total, session.unjustified / session.thresholds.unjustified) * 100)}%`, background: session.risk === "safe" ? module.color : session.risk === "warning" ? "var(--amber)" : "var(--red)" }} /></div>
                  </div>
                ))}
                <div className="module-card-actions">
                  <Link href={`/modules/${module.id}`} className="text-link">
                    {t(lang, "module.view")}
                  </Link>
                  <div className="row" style={{ gap: 3 }}>
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => setEditing(module)}
                      aria-label={t(lang, "module.editNamed", {
                        name: module.name,
                      })}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      disabled={busy === module.id}
                      className="btn btn-ghost btn-icon"
                      onClick={() => archive(module)}
                      aria-label={t(
                        lang,
                        archived ? "module.restore" : "module.archive",
                      )}
                    >
                      {archived ? (
                        <RotateCcw size={15} />
                      ) : (
                        <Archive size={15} />
                      )}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="card empty">
          <BookOpen size={34} />
          <h2>
            {t(
              lang,
              search
                ? "module.noMatches"
                : archived
                  ? "module.noArchived"
                  : "module.noModules",
            )}
          </h2>
          <p>
            {t(lang, archived ? "module.archiveEmptyBody" : "module.emptyBody")}
          </p>
          {!archived && (
            <button
              className="btn btn-primary"
              onClick={() => setEditing(true)}
            >
              <Plus size={15} />
              {t(lang, "module.add")}
            </button>
          )}
        </div>
      )}
      {editing && (
        <ModuleEditor
          module={editing === true ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
export function ModuleDetail({ id }: { id: string }) {
  const { data, mutate } = useWorkspace();
  const lang = data.student.language;
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Occurrence | null>(null);
  const [busy, setBusy] = useState(false);
  const module = data.modules.find((m) => m.id === id);
  if (!module)
    return (
      <div className="card empty">
        <BookOpen size={32} />
        <h2>{t(lang, "module.notFound")}</h2>
        <p>{t(lang, "module.notFoundBody")}</p>
        <Link href="/modules" className="btn">
          {t(lang, "module.back")}
        </Link>
      </div>
    );
  const stats = getModuleStats(module, data);
  const schedule = data.sessions.filter((s) => s.module_id === id);
  const occurrences = data.occurrences
    .filter((o) => o.module_id === id)
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const records = data.attendance.filter((r) => r.module_id === id);
  const zone = data.student.timezone;
  const remove = async () => {
    if (!window.confirm(t(lang, "module.deleteConfirm", { name: module.name })))
      return;
    setBusy(true);
    try {
      await mutate("module_delete", { id });
      window.location.assign("/modules");
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };
  const changeArchive = async () => {
    setBusy(true);
    try {
      await mutate("module_archive", { id, archived: !module.archived_at });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Link
        className="text-link row"
        style={{ marginBottom: 20 }}
        href="/modules"
      >
        <ChevronLeft size={15} />
        {t(lang, "modules")}
      </Link>
      <div className="page-heading">
        <div>
          <div className="row" style={{ marginBottom: 7 }}>
            <ModuleIcon module={module} />
            <span className="eyebrow" style={{ marginBottom: 0 }}>
              {module.code} · {module.academic_year && `${module.academic_year} · `}
              {semesterLabel(module.semester, lang)}
            </span>
            <RiskBadge stats={stats} />
          </div>
          <h1>{module.name}</h1>
          <p>
            {module.professor || t(lang, "module.professorUnset")}
            {module.description ? ` · ${module.description}` : ""}
          </p>
        </div>
        <div className="page-heading-actions">
          <button className="btn" onClick={() => setEditing(true)}>
            <Pencil size={15} />
            {t(lang, "module.edit")}
          </button>
          <Link
            href={`/timetable?module=${id}&add=1`}
            className="btn btn-primary"
          >
            <Plus size={15} />
            {t(lang, "addSession")}
          </Link>
        </div>
      </div>
      <div className="stats-grid">
        {[
          [
            t(lang, "attendance"),
            stats.attendanceRate === null ? "—" : `${stats.attendanceRate}%`,
          ],
          [
            t(lang, "totalAbsences"),
            stats.totalAbsences,
          ],
          [t(lang, "dashboard.justifiedLabel"), stats.justified],
          [
            t(lang, "dashboard.unjustifiedLabel"),
            stats.unjustified,
          ],
        ].map(([label, value]) => (
          <div className="card stat-card" key={label}>
            <div className="stat-top">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>
      {stats.initialAbsences > 0 && (
        <div className="card initial-absence-notice">
          <strong>{t(lang, "module.initialSummary", { count: stats.initialAbsences })}</strong>
          <p>{t(lang, "module.initialRate")}</p>
          {stats.unassignedInitialAbsences > 0 && <p>{t(lang, "module.unassignedNotice", { count: stats.unassignedInitialAbsences })}</p>}
        </div>
      )}
      <div className="module-details-grid">
        <div className="stack">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>{t(lang, "module.sessionHistory")}</h2>
                <p>{t(lang, "module.historyBody")}</p>
              </div>
              <span className="badge">
                {t(lang, "module.recordsCount", { count: records.length })}
              </span>
            </div>
            {occurrences.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t(lang, "module.session")}</th>
                      <th>{t(lang, "module.room")}</th>
                      <th>{t(lang, "attendance")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {occurrences.slice(0, 50).map((o) => {
                      const record = records.find(
                        (r) => r.occurrence_id === o.id,
                      );
                      return (
                        <tr key={o.id}>
                          <td>
                            {formatInZone(
                              o.starts_at,
                              "EEE dd MMM · HH:mm",
                              zone,
                              lang === "fr" ? "fr-DZ" : "en-GB",
                            )}
                            <div className="module-code">
                              {sessionTypeLabel(o.session_type, lang)}
                            </div>
                          </td>
                          <td>{o.classroom || "—"}</td>
                          <td>
                            <span
                              className={`badge badge-${o.cancelled ? "cancelled" : record?.attendance_status || "info"}`}
                            >
                              {o.cancelled
                                ? t(lang, "cancelled")
                                : record?.attendance_status
                                  ? t(lang, record.attendance_status)
                                  : t(
                                      lang,
                                      Date.parse(o.ends_at) > Date.now()
                                        ? "module.upcoming"
                                        : "module.notRecorded",
                                    )}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => setSelected(o)}
                            >
                              {t(lang, "module.details")}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <CalendarDays size={29} />
                <h3>{t(lang, "module.noSessions")}</h3>
                <p>{t(lang, "module.noSessionsBody")}</p>
              </div>
            )}
          </section>
          <section className="card card-body">
            <h2>{t(lang, "module.weeklySchedule")}</h2>
            {schedule.length ? (
              schedule.map((s) => (
                <div className="schedule-line" key={s.id}>
                  <CalendarDays size={16} />
                  <div>
                    <strong>
                      {
                        (lang === "fr"
                          ? [
                              "",
                              "Lundi",
                              "Mardi",
                              "Mercredi",
                              "Jeudi",
                              "Vendredi",
                              "Samedi",
                              "Dimanche",
                            ]
                          : [
                              "",
                              "Monday",
                              "Tuesday",
                              "Wednesday",
                              "Thursday",
                              "Friday",
                              "Saturday",
                              "Sunday",
                            ])[s.weekday]
                      }{" "}
                      · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                    </strong>
                    <small>
                      {sessionTypeLabel(s.session_type, lang)} ·{" "}
                      {s.classroom || t(lang, "dashboard.roomUnset")} ·{" "}
                      {s.recurrence_start} {t(lang, "module.dateTo")}{" "}
                      {s.recurrence_end}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ fontSize: 14, marginBottom: 0 }}>
                {t(lang, "module.scheduleEmpty")}
              </p>
            )}
          </section>
        </div>
        <div className="stack">
          <section className="card card-body">
            <h2>{t(lang, "module.assessment")}</h2>
            {stats.sessionStats.map((stats) => (
              <div key={stats.sessionType}>
                <RiskRow module={module} stats={stats} />
                <div
                  className={`notice ${stats.risk === "excluded" ? "notice-danger" : stats.risk === "safe" ? "notice-info" : ""}`}
                >
                  <ShieldCheck size={17} />
                  <div>
                    <strong>{getRiskExplanation(stats, lang)}</strong>
                    <p>
                      {t(lang, "module.projections", {
                        unjustified: t(
                          lang,
                          simulateAbsence(stats, "unjustified").risk,
                        ),
                        justified: t(
                          lang,
                          simulateAbsence(stats, "justified").risk,
                        ),
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </section>
          <section className="card card-body">
            <h2>{t(lang, "module.manage")}</h2>
            <p style={{ fontSize: 13 }}>{t(lang, "module.manageBody")}</p>
            <div className="row wrap">
              <button className="btn" disabled={busy} onClick={changeArchive}>
                {module.archived_at ? (
                  <RotateCcw size={15} />
                ) : (
                  <Archive size={15} />
                )}{" "}
                {t(
                  lang,
                  module.archived_at ? "module.restore" : "module.archive",
                )}
              </button>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={remove}
              >
                <Trash2 size={15} />
                {t(lang, "delete")}
              </button>
            </div>
          </section>
        </div>
      </div>
      {editing && (
        <ModuleEditor module={module} onClose={() => setEditing(false)} />
      )}{" "}
      {selected && (
        <SessionPanel
          data={data}
          occurrence={selected}
          onClose={() => setSelected(null)}
          onMutate={mutate}
        />
      )}
    </>
  );
}
