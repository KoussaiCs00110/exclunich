"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  CalendarRange,
  ChartNoAxesCombined,
  CircleHelp,
} from "lucide-react";
import type { AppData } from "@/lib/types";
import {
  getAttendanceByType,
  getAttendanceTrend,
  getModuleStats,
  getOverview,
} from "@/lib/attendance";
import { localDateKey } from "@/lib/timezone";
import { t } from "@/lib/i18n";

const palette = {
  present: "var(--green)",
  justified: "var(--cyan)",
  unjustified: "var(--amber)",
  safe: "var(--green)",
  warning: "var(--amber)",
  excluded: "var(--red)",
  primary: "var(--primary)",
};
const tooltipStyle = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 9,
  color: "var(--text)",
  fontSize: 13,
};
const axisStyle = { fill: "var(--muted)", fontSize: 12 };
const chartMargin = { top: 15, right: 15, bottom: 4, left: -15 };

function EmptyChart({ label }: { label: string }) {
  return (
    <div
      style={{
        height: "100%",
        minHeight: 180,
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        padding: 25,
      }}
    >
      <div>
        <BarChart3
          size={28}
          style={{ margin: "0 auto 12px", color: "var(--muted)", opacity: 0.6 }}
        />
        <p style={{ margin: 0, fontSize: 14 }}>{label}</p>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
  legend,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  legend?: { name: string; color: string; value?: number }[];
}) {
  return (
    <section className="card chart-card" aria-label={title}>
      <div className="card-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <ChartNoAxesCombined size={17} className="muted" />
      </div>
      <div className="chart-container" style={{ minWidth: 0 }}>
        {children}
      </div>
      {legend && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px 20px",
            padding: "0 24px 20px",
            fontSize: 13,
            color: "var(--muted)",
          }}
        >
          {legend.map((item) => (
            <span
              key={item.name}
              style={{ display: "flex", alignItems: "center", gap: 7 }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: item.color,
                }}
              />
              {item.name}
              {item.value != null && (
                <b style={{ color: "var(--text)", marginLeft: 3 }}>
                  {item.value}
                </b>
              )}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export function Analytics({
  data,
  compact = false,
}: {
  data: AppData;
  compact?: boolean;
}) {
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAnimate(!preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const language = data.student.language;
  const isFrench = language === "fr";
  const [semester, setSemester] = useState(data.student.semester);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [interval, setInterval] = useState<"week" | "month">("week");
  const dateError = from && to && from > to;
  const semesters = [
    ...new Set([
      data.student.semester,
      ...data.modules.map((module) => module.semester),
    ]),
  ].sort();
  const semesterData = useMemo(() => {
    const modules = data.modules.filter(
      (module) =>
        !module.archived_at &&
        (compact || !semester || module.semester === semester),
    );
    const ids = new Set(modules.map((module) => module.id));
    return {
      ...data,
      modules,
      occurrences: data.occurrences.filter((occurrence) =>
        ids.has(occurrence.module_id),
      ),
      attendance: data.attendance.filter((record) => ids.has(record.module_id)),
    };
  }, [data, semester, compact]);
  const filteredData = useMemo(() => {
    if (compact) return semesterData;
    const occurrences = semesterData.occurrences.filter((occurrence) => {
      const date = localDateKey(occurrence.starts_at, data.student.timezone);
      return (!from || date >= from) && (!to || date <= to);
    });
    const occurrenceIds = new Set(
      occurrences.map((occurrence) => occurrence.id),
    );
    return {
      ...semesterData,
      // Undated starting balances cannot be assigned to a selected date range.
      modules: from || to ? semesterData.modules.map((module) => ({ ...module, initial_justified_absences: 0, initial_unjustified_absences: 0 })) : semesterData.modules,
      occurrences,
      attendance: semesterData.attendance.filter((record) =>
        occurrenceIds.has(record.occurrence_id),
      ),
    };
  }, [semesterData, from, to, compact, data.student.timezone]);
  const now = Date.now();
  const overview = getOverview(filteredData, now);
  const riskOverview = getOverview(semesterData, now);
  const perModule = filteredData.modules.map((module) => ({
    module,
    stats: getModuleStats(module, filteredData, now),
  }));
  const attendanceByModule = perModule
    .filter(({ stats }) => stats.recorded > 0)
    .map(({ module, stats }) => ({
      name: module.code || module.name,
      fullName: module.name,
      rate: stats.attendanceRate,
      color: module.color,
      recorded: stats.recorded,
    }));
  const absencesByModule = perModule
    .filter(({ stats }) => stats.totalAbsences > 0)
    .map(({ module, stats }) => ({
      name: module.code || module.name,
      fullName: module.name,
      justified: stats.justified,
      unjustified: stats.unjustified,
    }));
  const absenceDistribution = [
    {
      name: t(language, "justified"),
      value: overview.justified,
      color: palette.justified,
    },
    {
      name: t(language, "unjustified"),
      value: overview.unjustified,
      color: palette.unjustified,
    },
  ];
  const riskDistribution = [
    {
      name: t(language, "safe"),
      value: riskOverview.safe,
      color: palette.safe,
    },
    {
      name: t(language, "warning"),
      value: riskOverview.atRisk,
      color: palette.warning,
    },
    {
      name: t(language, "excluded"),
      value: riskOverview.excluded,
      color: palette.excluded,
    },
  ];
  const trend = getAttendanceTrend(filteredData, interval, now).map(
    (point) => ({
      ...point,
      label:
        interval === "month"
          ? new Date(`${point.period}-15T12:00:00Z`).toLocaleDateString(
              isFrench ? "fr-DZ" : "en-GB",
              { month: "short", year: "2-digit", timeZone: "UTC" },
            )
          : `${isFrench ? "Sem." : "Week"} ${Number(point.period.split("W")[1])}`,
    }),
  );
  const byType = getAttendanceByType(filteredData, now).filter(
    (item) => item.recorded > 0,
  );
  const noRecords = t(language, "noAttendance");
  const chartPercent = (value: number) => `${value}%`;
  const rate =
    overview.attendanceRate == null ? "—" : `${overview.attendanceRate}%`;

  const attendanceChart = (
    <ChartCard
      title={t(language, "attendanceByModule")}
      description={
        isFrench
          ? "Présences enregistrées, par module"
          : "Recorded attendance, by module"
      }
    >
      {attendanceByModule.length ? (
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart
            accessibilityLayer
            data={attendanceByModule}
            margin={chartMargin}
            barCategoryGap="32%"
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 4"
            />
            <XAxis
              dataKey="name"
              tick={axisStyle}
              axisLine={false}
              tickLine={false}
              tickMargin={10}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={axisStyle}
              axisLine={false}
              tickLine={false}
              tickFormatter={chartPercent}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: "var(--text)" }}
              cursor={{ fill: "var(--surface-2)" }}
              formatter={(value: unknown) => [
                `${value}%`,
                t(language, "attendanceRate"),
              ]}
            />
            <Bar
              isAnimationActive={animate}
              dataKey="rate"
              radius={[5, 5, 0, 0]}
              maxBarSize={42}
            >
              {attendanceByModule.map((module) => (
                <Cell key={module.name} fill={module.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <EmptyChart label={noRecords} />
      )}
    </ChartCard>
  );

  const distributionChart = (
    <ChartCard
      title={t(language, "absenceDistribution")}
      description={
        isFrench
          ? `${overview.totalAbsences} absences enregistrées`
          : `${overview.totalAbsences} recorded absences`
      }
      legend={absenceDistribution}
    >
      {overview.totalAbsences ? (
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart accessibilityLayer>
            <Pie
              isAnimationActive={animate}
              data={absenceDistribution.filter((item) => item.value > 0)}
              dataKey="value"
              nameKey="name"
              innerRadius="57%"
              outerRadius="82%"
              paddingAngle={4}
              stroke="var(--surface)"
              strokeWidth={3}
            >
              {absenceDistribution
                .filter((item) => item.value > 0)
                .map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={{ color: "var(--text)" }}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <EmptyChart
          label={
            isFrench
              ? "Aucune absence pour cette période"
              : "No absences in this period"
          }
        />
      )}
    </ChartCard>
  );

  if (compact)
    return (
      <div className="charts-grid analytics-compact">
        {attendanceChart}
        {distributionChart}
      </div>
    );

  return (
    <div className="stack">
      <section
        className="card"
        style={{ padding: 20 }}
        aria-label={
          isFrench ? "Filtres des statistiques" : "Statistics filters"
        }
      >
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "end",
            flexWrap: "wrap",
          }}
        >
          <label className="field" style={{ flex: "1 1 155px" }}>
            <span>{t(language, "semester")}</span>
            <select
              className="input"
              value={semester}
              onChange={(event) => setSemester(event.target.value)}
            >
              <option value="">{t(language, "all")}</option>
              {semesters.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: "1 1 155px" }}>
            <span>{t(language, "fromDate")}</span>
            <input
              className="input"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="field" style={{ flex: "1 1 155px" }}>
            <span>{t(language, "toDate")}</span>
            <input
              className="input"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label className="field" style={{ flex: "1 1 155px" }}>
            <span>{isFrench ? "Regroupement" : "Group by"}</span>
            <select
              className="input"
              value={interval}
              onChange={(event) =>
                setInterval(event.target.value as "week" | "month")
              }
            >
              <option value="week">{t(language, "weekly")}</option>
              <option value="month">{t(language, "monthly")}</option>
            </select>
          </label>
          {(from || to || semester !== data.student.semester) && (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setFrom("");
                setTo("");
                setSemester(data.student.semester);
              }}
            >
              {isFrench ? "Réinitialiser" : "Reset filters"}
            </button>
          )}
        </div>
        {dateError && (
          <p
            role="alert"
            className="text-red"
            style={{ margin: "12px 0 0", fontSize: 14 }}
          >
            {isFrench
              ? "La date de fin doit suivre la date de début."
              : "The end date must be on or after the start date."}
          </p>
        )}
      </section>
      {riskOverview.initialAbsences > 0 && <p className="muted initial-absence-summary">{t(language, "analytics.initialNotice")}</p>}
      <div className="stats-grid">
        {[
          {
            label: t(language, "attendanceRate"),
            value: rate,
            detail: `${overview.recorded} ${isFrench ? "séances renseignées" : "recorded sessions"}`,
            color: palette.present,
          },
          {
            label: t(language, "totalAbsences"),
            value: overview.totalAbsences,
            detail: `${overview.justified} ${isFrench ? "justifiées" : "justified"} · ${overview.unjustified} ${isFrench ? "non justifiées" : "unjustified"}`,
            color: palette.unjustified,
          },
          {
            label: t(language, "unrecorded"),
            value: overview.unrecorded,
            detail: isFrench
              ? "Séances terminées à renseigner"
              : "Completed sessions to record",
            color: palette.primary,
          },
          {
            label: isFrench ? "Modules en alerte" : "Modules at risk",
            value: riskOverview.atRisk + riskOverview.excluded,
            detail: `${riskOverview.excluded} ${isFrench ? "exclus" : "excluded"} · ${riskOverview.critical} ${isFrench ? "critiques" : "critical"}`,
            color: palette.excluded,
          },
        ].map((item) => (
          <div className="card stat-card" key={item.label}>
            <div className="stat-top">
              {item.label}
              <CalendarRange size={16} style={{ color: item.color }} />
            </div>
            <div className="stat-value">{item.value}</div>
            <div className="stat-foot muted">{item.detail}</div>
          </div>
        ))}
      </div>
      <section
        className="card chart-card"
        aria-label={t(language, "attendanceEvolution")}
      >
        <div className="card-header">
          <div>
            <h2>{t(language, "attendanceEvolution")}</h2>
            <p>
              {isFrench
                ? "Calculé uniquement à partir des séances terminées et renseignées"
                : "Calculated from completed sessions with an attendance record"}
            </p>
          </div>
          <span className="badge">
            {t(language, interval === "week" ? "weekly" : "monthly")}
          </span>
        </div>
        <div className="chart-container" style={{ height: 275, minWidth: 0 }}>
          {trend.length ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart accessibilityLayer data={trend} margin={chartMargin}>
                <defs>
                  <linearGradient
                    id="attendance-fill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={palette.primary}
                      stopOpacity={0.22}
                    />
                    <stop
                      offset="100%"
                      stopColor={palette.primary}
                      stopOpacity={0.01}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="3 4"
                />
                <XAxis
                  dataKey="label"
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={10}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={chartPercent}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: "var(--text)" }}
                  formatter={(value: unknown) => [
                    `${value}%`,
                    t(language, "attendanceRate"),
                  ]}
                />
                <Area
                  isAnimationActive={animate}
                  type="monotone"
                  dataKey="attendanceRate"
                  name={t(language, "attendanceRate")}
                  stroke={palette.primary}
                  strokeWidth={2.5}
                  fill="url(#attendance-fill)"
                  dot={{ r: 3, strokeWidth: 2, fill: "var(--surface)" }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label={noRecords} />
          )}
        </div>
      </section>
      <div className="charts-grid">
        {attendanceChart}
        {distributionChart}
      </div>
      <div className="charts-grid">
        <ChartCard
          title={t(language, "absencesByModule")}
          legend={absenceDistribution.map(({ name, color }) => ({
            name,
            color,
          }))}
        >
          {absencesByModule.length ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart
                accessibilityLayer
                data={absencesByModule}
                margin={chartMargin}
                barCategoryGap="30%"
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="3 4"
                />
                <XAxis
                  dataKey="name"
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={10}
                />
                <YAxis
                  allowDecimals={false}
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: "var(--text)" }}
                  cursor={{ fill: "var(--surface-2)" }}
                />
                <Bar
                  isAnimationActive={animate}
                  name={t(language, "justified")}
                  dataKey="justified"
                  stackId="absences"
                  fill={palette.justified}
                  maxBarSize={42}
                />
                <Bar
                  isAnimationActive={animate}
                  name={t(language, "unjustified")}
                  dataKey="unjustified"
                  stackId="absences"
                  fill={palette.unjustified}
                  radius={[5, 5, 0, 0]}
                  maxBarSize={42}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart
              label={
                isFrench
                  ? "Aucune absence pour cette période"
                  : "No absences in this period"
              }
            />
          )}
        </ChartCard>
        <ChartCard
          title={t(language, "riskDistribution")}
          description={
            isFrench
              ? "Risque cumulé actuel du semestre"
              : "Current cumulative semester risk"
          }
          legend={riskDistribution}
        >
          {riskOverview.totalModules ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart accessibilityLayer>
                <Pie
                  isAnimationActive={animate}
                  data={riskDistribution.filter((item) => item.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="57%"
                  outerRadius="82%"
                  paddingAngle={4}
                  stroke="var(--surface)"
                  strokeWidth={3}
                >
                  {riskDistribution
                    .filter((item) => item.value > 0)
                    .map((item) => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "var(--text)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label={t(language, "noModules")} />
          )}
        </ChartCard>
      </div>
      <ChartCard
        title={t(language, "attendanceByType")}
        description={
          isFrench
            ? "Cours, travaux dirigés et travaux pratiques"
            : "Lectures, tutorials, and practical sessions"
        }
      >
        {byType.length ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              accessibilityLayer
              data={byType}
              margin={chartMargin}
              barCategoryGap="38%"
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="3 4"
              />
              <XAxis
                dataKey="type"
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
                tickMargin={10}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
                tickFormatter={chartPercent}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: unknown) => [
                  `${value}%`,
                  t(language, "attendanceRate"),
                ]}
              />
              <Bar
                isAnimationActive={animate}
                dataKey="attendanceRate"
                fill={palette.primary}
                maxBarSize={55}
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart label={noRecords} />
        )}
      </ChartCard>
      <p
        className="muted"
        style={{
          display: "flex",
          alignItems: "start",
          gap: 8,
          fontSize: 13,
          margin: 0,
        }}
      >
        <CircleHelp size={16} style={{ marginTop: 2 }} />
        {isFrench
          ? "Le taux de présence utilise les séances terminées et renseignées. Les séances annulées et futures sont exclues. Les séances non renseignées sont affichées séparément."
          : "Attendance rate uses completed sessions with a recorded status. Cancelled and future sessions are excluded. Unrecorded sessions are shown separately."}
      </p>
      <div className="sr-only">
        <table>
          <caption>{t(language, "attendanceByModule")}</caption>
          <thead>
            <tr>
              <th>{isFrench ? "Module" : "Module"}</th>
              <th>{t(language, "attendanceRate")}</th>
              <th>{t(language, "totalAbsences")}</th>
              <th>{t(language, "unrecorded")}</th>
            </tr>
          </thead>
          <tbody>
            {perModule.map(({ module, stats }) => (
              <tr key={module.id}>
                <td>{module.name}</td>
                <td>
                  {stats.attendanceRate == null
                    ? t(language, "unknownRate")
                    : `${stats.attendanceRate}%`}
                </td>
                <td>{stats.totalAbsences}</td>
                <td>{stats.unrecorded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Analytics;
