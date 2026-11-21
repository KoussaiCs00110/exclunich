"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Info,
  MapPin,
  Plus,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import {
  getModuleStats,
  getOverview,
  getUpcomingSessions,
  simulateAbsence,
} from "@/lib/attendance";
import { formatInZone } from "@/lib/timezone";
import { t, sessionTypeLabel, semesterLabel } from "@/lib/i18n";
import type { Module, ModuleStats, Occurrence } from "@/lib/types";
import { useWorkspace } from "./workspace";
import { SessionPanel } from "./session-panel";
import { Analytics } from "./analytics";
export function RiskBadge({ stats }: { stats: ModuleStats }) {
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
  stats: ModuleStats;
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
            <span className="module-code">{module.code}</span>
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
  const locale = lang === "fr" ? "fr-DZ" : "en-GB";
  const [selected, setSelected] = useState<Occurrence | null>(null);
  const overview = getOverview(data);
  const upcoming = getUpcomingSessions(data);
  const firstName = data.student.full_name.split(" ")[0];
  const zone = data.student.timezone;
  const rate = overview.attendanceRate;
  const stroke = rate === null ? 0 : (rate / 100) * 314.16;
  const metrics = [
    {
      label: t(lang, "attendanceRate"),
      value: rate === null ? "—" : `${rate}%`,
      icon: Activity,
      foot: t(lang, "dashboard.presentRecorded", {
        present: overview.present,
        recorded: overview.recorded,
      }),
      color: "var(--primary)",
    },
    {
      label: t(lang, "totalAbsences"),
      value: overview.totalAbsences,
      icon: CalendarDays,
      foot: t(lang, "dashboard.absenceBreakdown", {
        justified: overview.justified,
        unjustified: overview.unjustified,
      }),
      color: "var(--cyan)",
    },
    {
      label: t(lang, "dashboard.modulesAtRisk"),
      value: overview.atRisk,
      icon: ShieldAlert,
      foot: t(
        lang,
        overview.atRisk
          ? "dashboard.riskAttention"
          : "dashboard.withinWarnings",
      ),
      color: "var(--amber)",
    },
    {
      label: t(lang, "dashboard.scheduled"),
      value: overview.scheduled,
      icon: Clock3,
      foot: t(lang, "dashboard.sessionsToMark", { count: overview.unrecorded }),
      color: "var(--primary)",
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t(lang, "dashboard.eyebrow")}</div>
          <h1>
            {t(lang, "dashboard.welcome", { name: firstName })}
            <span className="text-primary">.</span>
          </h1>
          <p>{t(lang, "dashboard.subtitle")}</p>
        </div>
        <div className="page-heading-actions">
          <Link href="/history?pending=1" className="btn btn-secondary">
            <ClipboardCheck size={16} />
            {t(lang, "dashboard.record")}
          </Link>
          <Link href="/timetable?add=1" className="btn btn-primary">
            <Plus size={16} />
            {t(lang, "addSession")}
          </Link>
        </div>
      </div>
      {!overview.totalModules && (
        <div className="card onboarding">
          <div>
            <h2>{t(lang, "dashboard.onboardingTitle")}</h2>
            <p>{t(lang, "dashboard.onboardingBody")}</p>
            <div className="onboarding-steps">
              <span className="step-chip done">
                <Check size={12} />
                {t(lang, "dashboard.workspaceCreated")}
              </span>
              <span className="step-chip">
                <BookOpen size={12} />
                {t(lang, "dashboard.addModules")}
              </span>
              <span className="step-chip">
                <CalendarDays size={12} />
                {t(lang, "dashboard.buildTimetable")}
              </span>
            </div>
          </div>
          <Link className="btn btn-primary" href="/modules?add=1">
            <Plus size={16} />
            {t(lang, "dashboard.firstModule")}
          </Link>
        </div>
      )}
      <div className="stats-grid">
        {metrics.map(({ label, value, icon: Icon, foot, color }) => (
          <div className="card stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <span
                className="stat-icon"
                style={{
                  color,
                  background: `color-mix(in srgb, ${color} 10%, transparent)`,
                }}
              >
                <Icon size={17} />
              </span>
            </div>
            <div className="stat-value">{value}</div>
            <div className="stat-foot">
              {label === t(lang, "dashboard.modulesAtRisk") &&
              !overview.atRisk ? (
                <CheckCircle2 size={12} className="text-green" />
              ) : null}
              {foot}
            </div>
          </div>
        ))}
      </div>
      <div className="secondary-metrics">
        <span>
          <BookOpen size={14} />
          <b>{overview.totalModules}</b> {t(lang, "dashboard.activeModules")}
        </span>
        <span>
          <span className="legend-dot" style={{ background: "var(--amber)" }} />
          <b>{overview.justified}</b> {t(lang, "dashboard.justifiedAbsences")}
        </span>
        <span>
          <span className="legend-dot" style={{ background: "var(--red)" }} />
          <b>{overview.unjustified}</b>{" "}
          {t(lang, "dashboard.unjustifiedAbsences")}
        </span>
        <span>
          <ShieldX size={14} className={overview.excluded ? "text-red" : ""} />
          <b>{overview.excluded}</b> {t(lang, "dashboard.excludedModules")}
        </span>
      </div>
      <div className="dashboard-main">
        <div className="dashboard-column">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>{t(lang, "dashboard.riskMonitor")}</h2>
                <p>{t(lang, "dashboard.riskSubtitle")}</p>
              </div>
              <span className="badge">
                {t(lang, "dashboard.modulesCount", {
                  count: overview.totalModules,
                })}
              </span>
            </div>
            {overview.totalModules ? (
              <div className="risk-list">
                {overview.moduleStats.map(({ module, stats }) => (
                  <RiskRow key={module.id} module={module} stats={stats} />
                ))}
              </div>
            ) : (
              <div className="empty empty-small">
                <ShieldCheck size={27} />
                <h3>{t(lang, "dashboard.riskEmpty")}</h3>
                <p>{t(lang, "dashboard.riskEmptyBody")}</p>
              </div>
            )}
            <div className="card-footer">
              <Link href="/modules" className="text-link">
                {t(lang, "dashboard.allModules")}
              </Link>
            </div>
          </section>
          <section className="card">
            <div className="card-header">
              <div>
                <h2>{t(lang, "dashboard.insights")}</h2>
                <p>{t(lang, "dashboard.insightsBody")}</p>
              </div>
              <Link href="/statistics" className="text-link">
                {t(lang, "dashboard.allStatistics")}
              </Link>
            </div>
            <Analytics data={data} compact />
          </section>
          <div className="notice notice-info">
            <Info size={18} />
            <div>
              <strong>{t(lang, "dashboard.rulesTitle")}</strong>
              <p>
                {t(lang, "dashboard.rulesBody", {
                  unjustified: data.student.unjustified_threshold,
                  total: data.student.total_threshold,
                })}
              </p>
            </div>
          </div>
        </div>
        <div className="dashboard-column secondary">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>{t(lang, "dashboard.overview")}</h2>
                <p>{t(lang, "dashboard.overviewBody")}</p>
              </div>
              <span className="badge badge-info">
                {semesterLabel(data.student.semester, lang)}
              </span>
            </div>
            <div className="attendance-card-inner">
              <div className="attendance-ring">
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="var(--surface-3)"
                    strokeWidth="9"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={`${stroke} 314.16`}
                  />
                </svg>
                <div className="attendance-ring-value">
                  <strong>{rate === null ? "—" : `${rate}%`}</strong>
                  <small>{t(lang, "attendanceRate")}</small>
                </div>
              </div>
              <div className="attendance-legend">
                {[
                  [t(lang, "present"), overview.present, "var(--primary)"],
                  [
                    t(lang, "dashboard.justifiedLabel"),
                    overview.justified,
                    "var(--amber)",
                  ],
                  [
                    t(lang, "dashboard.unjustifiedLabel"),
                    overview.unjustified,
                    "var(--red)",
                  ],
                ].map(([label, value, color]) => (
                  <div className="legend-row" key={label}>
                    <span
                      className="legend-dot"
                      style={{ background: String(color) }}
                    />
                    <span>{label}</span>
                    <b>{value}</b>
                  </div>
                ))}
              </div>
            </div>
            <p className="help-caption">
              {t(lang, "dashboard.recordedBasis", { count: overview.recorded })}{" "}
              {overview.unrecorded > 0
                ? t(lang, "dashboard.pendingCount", {
                    count: overview.unrecorded,
                  })
                : t(lang, "dashboard.unmarkedExplanation")}
            </p>
          </section>
          <section className="card">
            <div className="card-header">
              <div>
                <h2>{t(lang, "dashboard.upNext")}</h2>
                <p>{t(lang, "dashboard.upNextBody")}</p>
              </div>
              <CalendarDays size={18} className="muted" />
            </div>
            {upcoming.length ? (
              <div className="upcoming-list">
                {upcoming.map((occurrence) => {
                  const module = data.modules.find(
                    (m) => m.id === occurrence.module_id,
                  )!;
                  const risk = simulateAbsence(
                    getModuleStats(module, data),
                    "unjustified",
                  );
                  return (
                    <button
                      key={occurrence.id}
                      className="upcoming-item"
                      onClick={() => setSelected(occurrence)}
                    >
                      <div className="session-time">
                        <span className="session-day">
                          {formatInZone(
                            occurrence.starts_at,
                            "EEE dd",
                            zone,
                            locale,
                          )}
                        </span>
                        <strong>
                          {formatInZone(occurrence.starts_at, "HH:mm", zone)}
                        </strong>
                        {formatInZone(occurrence.ends_at, "HH:mm", zone)}
                      </div>
                      <div className="upcoming-details">
                        <span className="module-name">{module.name}</span>
                        <div className="upcoming-meta">
                          <span
                            className={`badge badge-${occurrence.session_type}`}
                          >
                            {sessionTypeLabel(occurrence.session_type, lang)}
                          </span>
                          <MapPin size={10} />
                          {occurrence.classroom ||
                            t(lang, "dashboard.roomUnset")}
                        </div>
                        <span className={`badge badge-${risk.risk}`}>
                          {t(
                            lang,
                            risk.alreadyExcluded
                              ? "alreadyExcluded"
                              : risk.risk === "excluded"
                                ? "dashboard.exclusionIfMissed"
                                : risk.risk === "warning"
                                  ? "dashboard.warningIfMissed"
                                  : "dashboard.withinIfMissed",
                          )}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty empty-small">
                <CalendarDays size={27} />
                <h3>{t(lang, "dashboard.noUpcoming")}</h3>
                <p>{t(lang, "dashboard.noUpcomingBody")}</p>
                <Link href="/timetable" className="btn btn-sm">
                  {t(lang, "dashboard.openTimetable")}
                </Link>
              </div>
            )}
            <div className="card-footer">
              <Link href="/timetable" className="text-link">
                {t(lang, "dashboard.myTimetable")}
              </Link>
            </div>
          </section>
          <section className="card">
            <div className="card-header">
              <div>
                <h2>{t(lang, "dashboard.alerts")}</h2>
                <p>{t(lang, "dashboard.alertsBody")}</p>
              </div>
              <span className="badge">
                {overview.atRisk + overview.excluded}
              </span>
            </div>
            <div style={{ padding: "0 20px 20px", display: "grid", gap: 12 }}>
              {overview.moduleStats
                .filter(({ stats }) => stats.risk !== "safe")
                .slice(0, 3)
                .map(({ module, stats }) => (
                  <Link
                    href={`/modules/${module.id}`}
                    className={`notice ${stats.risk === "excluded" ? "notice-danger" : ""}`}
                    key={module.id}
                  >
                    <AlertTriangle size={17} />
                    <div>
                      <strong>{module.name}</strong>
                      <p>
                        {stats.risk === "excluded"
                          ? t(lang, "dashboard.exclusionReached")
                          : stats.critical
                            ? t(lang, "dashboard.criticalAlert")
                            : t(lang, "dashboard.warningAlert", {
                                unjustified: stats.unjustified,
                                total: stats.totalAbsences,
                              })}
                      </p>
                    </div>
                  </Link>
                ))}
              {overview.atRisk + overview.excluded === 0 && (
                <div className="notice notice-info">
                  <ShieldCheck size={18} />
                  <div>
                    <strong>
                      {t(
                        lang,
                        overview.totalModules
                          ? "dashboard.withinLimits"
                          : "dashboard.freshStart",
                      )}
                    </strong>
                    <p>
                      {t(
                        lang,
                        overview.totalModules
                          ? "dashboard.noWarnings"
                          : "dashboard.alertsEmpty",
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
          <div className="quick-actions">
            <Link href="/history" className="quick-action">
              <ClipboardCheck size={18} />
              {t(lang, "history")}
            </Link>
            <Link href="/settings" className="quick-action">
              <ShieldCheck size={18} />
              {t(lang, "dashboard.preferences")}
            </Link>
          </div>
        </div>
      </div>
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
