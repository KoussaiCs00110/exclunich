"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ChevronRight,
  Info,
  MapPin,
  Plus,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import {
  getPendingSessions,
  getOverview,
  getUpcomingSessions,
  simulateAbsence,
} from "@/lib/attendance";
import { formatInZone, localDateKey } from "@/lib/timezone";
import { t, sessionTypeLabel, semesterLabel } from "@/lib/i18n";
import type { Module, AttendanceStats, SessionStats, Occurrence } from "@/lib/types";
import { useWorkspace } from "./workspace";
import { SessionPanel } from "./session-panel";

export function RiskBadge({ stats }: { stats: AttendanceStats }) {
  const { data } = useWorkspace();
  const lang = data.student.language;
  return (
    <span className={`badge badge-${stats.risk}`}>
      {stats.risk === "excluded" ? (
        <ShieldX size={11} />
      ) : stats.risk === "warning" ? (
        <AlertTriangle size={11} />
      ) : (
        <ShieldCheck size={11} />
      )}{" "}
      {t(
        lang,
        stats.risk === "excluded"
          ? "excluded"
          : stats.critical
            ? "critical"
            : stats.risk === "warning"
              ? "warning"
              : "safe",
      )}
    </span>
  );
}
export function ModuleIcon({ module }: { module: Module }) {
  return (
    <span
      className="module-color"
      style={{ "--module-color": module.color } as React.CSSProperties}
    >
      {module.code.slice(0, 2).toUpperCase()}
    </span>
  );
}
export function RiskRow({
  module,
  stats,
}: {
  module: Module;
  stats: SessionStats;
}) {
  const { data } = useWorkspace();
  const lang = data.student.language;
  return (
    <div className="risk-row">
      <div className="risk-row-top">
        <Link className="module-title" href={`/modules/${module.id}`}>
          <ModuleIcon module={module} />
          <div>
            <span className="module-name">{module.name}</span>
            <span className="module-code">{module.code} · {sessionTypeLabel(stats.sessionType, lang)}</span>
          </div>
        </Link>
        <RiskBadge stats={stats} />
      </div>
      <div className="risk-summary">
        <span>
          <b>{stats.totalAbsences}</b> {t(lang, "risk.totalAbsences")}
        </span>
        <span>
          <b>{stats.justified}</b> {t(lang, "risk.justified")}
        </span>
        <span>
          <b>{stats.unjustified}</b> {t(lang, "risk.unjustified")}
        </span>
      </div>
      <div className="risk-bars">
        <div>
          <div className="bar-caption">
            <span>{t(lang, "totalAbsences")}</span>
            <span>
              {stats.totalAbsences} / {stats.thresholds.total}
            </span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-label={t(lang, "risk.totalThreshold")}
            aria-valuenow={stats.totalAbsences}
            aria-valuemax={stats.thresholds.total}
          >
            <span
              style={{
                width: `${Math.min(100, (stats.totalAbsences / stats.thresholds.total) * 100)}%`,
                background:
                  stats.risk === "excluded"
                    ? "var(--red)"
                    : stats.risk === "warning"
                      ? "var(--amber)"
                      : "var(--primary)",
              }}
            />
          </div>
          <div className="allowance">
            {t(lang, "risk.untilExclusion", { count: stats.remainingTotal })}
          </div>
        </div>
        <div>
          <div className="bar-caption">
            <span>{t(lang, "dashboard.unjustifiedLabel")}</span>
            <span>
              {stats.unjustified} / {stats.thresholds.unjustified}
            </span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-label={t(lang, "risk.unjustifiedThreshold")}
            aria-valuenow={stats.unjustified}
            aria-valuemax={stats.thresholds.unjustified}
          >
            <span
              style={{
                width: `${Math.min(100, (stats.unjustified / stats.thresholds.unjustified) * 100)}%`,
                background:
                  stats.unjustified >= stats.thresholds.unjustified
                    ? "var(--red)"
                    : "var(--cyan)",
              }}
            />
          </div>
          <div className="allowance">
            {t(lang, "risk.untilExclusion", {
              count: stats.remainingUnjustified,
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
export default function Dashboard() {
  const { data, mutate } = useWorkspace();
  const lang = data.student.language;
  const fr = lang === "fr";
  const zone = data.student.timezone;
  const locale = fr ? "fr-DZ" : "en-GB";
  const [selected, setSelected] = useState<Occurrence | null>(null);
  const [showAllLimits, setShowAllLimits] = useState(false);
  const now = Date.now();
  const today = localDateKey(now, zone);
  const overview = getOverview(data, now);
  const modules = new Map(overview.moduleStats.map(({ module }) => [module.id, module]));
  const pending = getPendingSessions(data, now).filter((session) => modules.has(session.module_id));
  const upcoming = getUpcomingSessions(data, 3, now);
  const scheduledTypes = new Set(data.sessions.map((session) => `${session.module_id}:${session.session_type}`));
  const limits = overview.sessionStats.filter(({ module, stats }) =>
    stats.scheduled > 0 || stats.initialAbsences > 0 || scheduledTypes.has(`${module.id}:${stats.sessionType}`),
  );
  const flagged = limits.filter(({ stats }) => stats.risk !== "safe");
  const visibleLimits = showAllLimits ? limits : flagged.slice(0, 4);
  const byType = new Map(limits.map(({ module, stats }) => [`${module.id}:${stats.sessionType}`, stats]));

  const renderSession = (occurrence: Occurrence, toRecord = false) => {
    const module = modules.get(occurrence.module_id)!;
    const stats = byType.get(`${module.id}:${occurrence.session_type}`);
    const projection = stats && !toRecord ? simulateAbsence(stats, "unjustified") : null;
    const date = localDateKey(occurrence.starts_at, zone) === today
      ? fr ? "Aujourd’hui" : "Today"
      : formatInZone(occurrence.starts_at, "d MMM", zone, locale);
    return (
      <button
        type="button"
        key={occurrence.id}
        className={`task-session ${toRecord ? "task-session-pending" : "upcoming-item"}`}
        onClick={() => setSelected(occurrence)}
      >
        <span className="task-session-time">
          <small>{date}</small>
          <strong>{formatInZone(occurrence.starts_at, "HH:mm", zone)}</strong>
        </span>
        <span className="task-session-class">
          <strong>{module.name}</strong>
          <span className="task-session-meta">
            {sessionTypeLabel(occurrence.session_type, lang)}
            {occurrence.classroom && <span><MapPin size={12} aria-hidden="true" />{occurrence.classroom}</span>}
          </span>
          {projection && projection.risk !== "safe" && (
            <span className={`badge badge-${projection.risk}`}>
              {t(lang, projection.alreadyExcluded ? "alreadyExcluded" : projection.risk === "excluded" ? "dashboard.exclusionIfMissed" : "dashboard.warningIfMissed")}
            </span>
          )}
        </span>
        {toRecord && <span className="task-session-action">{fr ? "Renseigner" : "Record"}</span>}
        <ChevronRight size={17} aria-hidden="true" />
      </button>
    );
  };

  return (
    <div className="student-dashboard">
      <div className="page-heading task-heading">
        <div>
          <h1>{t(lang, "dashboard.welcome", { name: data.student.full_name.trim().split(/\s+/)[0] })}</h1>
          <p>{formatInZone(now, "EEEE d MMMM", zone, locale)} · {semesterLabel(data.student.semester, lang)}</p>
        </div>
        {overview.totalModules > 0 && (
          <div className="page-heading-actions">
            <Link href="/timetable?add=1" className="btn btn-secondary">
              <Plus size={16} />{t(lang, "addSession")}
            </Link>
          </div>
        )}
      </div>

      {overview.totalModules === 0 ? (
        <section className="card semester-setup" aria-labelledby="semester-setup-title">
          <span className="task-icon"><BookOpen size={23} aria-hidden="true" /></span>
          <div>
            <h2 id="semester-setup-title">{fr ? "Configurez votre semestre" : "Set up your semester"}</h2>
            <p>{fr ? "Ajoutez un module, puis planifiez vos cours, TD et TP." : "Add a module, then schedule its lectures, TDs, and TPs."}</p>
            <div className="row wrap">
              <Link href="/modules?add=1" className="btn btn-primary"><Plus size={16} />{t(lang, "dashboard.firstModule")}</Link>
              <Link href="/timetable?import=1" className="btn btn-ghost">{fr ? "Importer un emploi du temps" : "Import a timetable"}<ChevronRight size={16} aria-hidden="true" /></Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="dashboard-tasks">
            <section className="card task-card" aria-labelledby="attendance-task-title">
              <div className="task-card-header">
                <span className="task-icon"><ClipboardCheck size={20} aria-hidden="true" /></span>
                <div>
                  <h2 id="attendance-task-title">{t(lang, "dashboard.record")}</h2>
                  {pending.length > 0 && <p>{pending.length === 1
                  ? fr ? "1 séance à renseigner" : "1 session to record"
                  : t(lang, "dashboard.sessionsToMark", { count: pending.length })}</p>}
                </div>
              </div>
              {pending.length ? (
                <div className="task-sessions">{pending.slice(0, 3).map((item) => renderSession(item, true))}</div>
              ) : (
                <p className="task-empty" role="status"><CheckCircle2 size={17} aria-hidden="true" />{fr ? "Vos séances terminées sont à jour." : "You’re all caught up"}</p>
              )}
              <Link className="task-card-link" href={pending.length ? "/history?pending=1" : "/history"}>
                {pending.length ? fr ? "Voir toutes les séances à renseigner" : "View all sessions to record" : t(lang, "history")}
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </section>

            <section className="card task-card" aria-labelledby="upcoming-task-title">
              <div className="task-card-header">
                <span className="task-icon"><CalendarDays size={20} aria-hidden="true" /></span>
                <h2 id="upcoming-task-title">{t(lang, "dashboard.upNext")}</h2>
              </div>
              {upcoming.length ? (
                <div className="task-sessions">{upcoming.map((item) => renderSession(item))}</div>
              ) : (
                <p className="task-empty">{fr ? "Aucune séance à venir." : "No upcoming classes scheduled."}</p>
              )}
              <Link className="task-card-link" href="/timetable">
                {t(lang, "dashboard.openTimetable")}<ChevronRight size={16} aria-hidden="true" />
              </Link>
            </section>
          </div>

          <section className="card task-card dashboard-limits" aria-labelledby="absence-limits-title">
            <div className="task-card-header">
              <span className="task-icon"><ShieldAlert size={20} aria-hidden="true" /></span>
              <div>
                <h2 id="absence-limits-title">{fr ? "Limites d’absence" : "Absence limits"}</h2>
                <p>{fr ? "Calculées séparément pour les cours, TD et TP." : "Tracked separately for lectures, TDs, and TPs."}</p>
              </div>
            </div>
            {!flagged.length && !showAllLimits && (
              <p className="task-empty"><ShieldCheck size={17} aria-hidden="true" />{fr ? "Aucun type de séance n’a atteint un seuil d’alerte." : "No session types have reached a warning threshold."}</p>
            )}
            <div id="dashboard-limit-list">
              {visibleLimits.map(({ module, stats }) => (
                <Link key={`${module.id}:${stats.sessionType}`} href={`/modules/${module.id}`} className="dashboard-limit-row">
                  <ModuleIcon module={module} />
                  <span className="dashboard-limit-label">
                    <strong>{module.name} · {sessionTypeLabel(stats.sessionType, lang)}</strong>
                    <small>
                      {stats.totalAbsences}/{stats.thresholds.total} {t(lang, "risk.totalAbsences")}
                      {" · "}
                      {stats.unjustified}/{stats.thresholds.unjustified} {t(lang, "risk.unjustified")}
                    </small>
                    {stats.critical && <small>{t(lang, "dashboard.criticalAlert")}</small>}
                  </span>
                  <RiskBadge stats={stats} />
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              ))}
            </div>
            {overview.unassignedInitialAbsences > 0 && (
              <Link className="dashboard-balance-notice" href="/modules">
                <Info size={16} aria-hidden="true" />{fr ? "Certaines absences antérieures sont à affecter à un type de séance." : "Assign earlier absences to a session type so they count toward its limit."}
              </Link>
            )}
            {limits.length > flagged.slice(0, 4).length && (
              <button type="button" className="task-card-link" aria-expanded={showAllLimits} aria-controls="dashboard-limit-list" onClick={() => setShowAllLimits(!showAllLimits)}>
                {showAllLimits ? fr ? "Masquer les détails" : "Show less" : fr ? "Voir toutes les limites" : "View all limits"}
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            )}
          </section>

          <section className="card task-card dashboard-summary" aria-labelledby="attendance-summary-title">
            <div className="task-card-header">
              <span className="task-icon"><Activity size={20} aria-hidden="true" /></span>
              <div><h2 id="attendance-summary-title">{t(lang, "dashboard.overview")}</h2></div>
            </div>
            <dl>
              <div><dt>{t(lang, "attendanceRate")}</dt><dd>{overview.attendanceRate === null ? "—" : `${overview.attendanceRate}%`}</dd><small>{t(lang, "dashboard.presentRecorded", { present: overview.present, recorded: overview.recorded })}</small></div>
              <div><dt>{t(lang, "totalAbsences")}</dt><dd>{overview.totalAbsences}</dd><small>{t(lang, "dashboard.absenceBreakdown", { justified: overview.justified, unjustified: overview.unjustified })}</small></div>
              <div><dt>{t(lang, "dashboard.scheduled")}</dt><dd>{overview.scheduled}</dd><small>{t(lang, "dashboard.modulesCount", { count: overview.totalModules })}</small></div>
            </dl>
            <Link className="task-card-link" href="/statistics">
              {t(lang, "dashboard.allStatistics")}<ChevronRight size={16} aria-hidden="true" />
            </Link>
          </section>
        </>
      )}
      {selected && (
        <SessionPanel
          data={data}
          occurrence={selected}
          onClose={() => setSelected(null)}
          onMutate={mutate}
        />
      )}
    </div>
  );
}
