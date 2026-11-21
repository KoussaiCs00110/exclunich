"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileDown,
  History,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "./workspace";
import { ModuleIcon } from "./dashboard";
import { SessionPanel } from "./session-panel";
import type { Occurrence } from "@/lib/types";
import { formatInZone, localDateKey } from "@/lib/timezone";
import { attendanceCsv, attendancePdf, type ReportEntry } from "@/lib/reports";
import { downloadFile } from "@/lib/client";
import { t } from "@/lib/i18n";
import { Button } from "./ui/button";
export default function HistoryPage() {
  const { data, mutate } = useWorkspace();
  const params = useSearchParams();
  const lang = data.student.language;
  const fr = lang === "fr";
  const [search, setSearch] = useState("");
  const [moduleId, setModuleId] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [pending, setPending] = useState(params.get("pending") === "1");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Occurrence | null>(null);
  const [exporting, setExporting] = useState(false);
  const zone = data.student.timezone;
  const pageSize = 15;
  const filtered = useMemo(() => {
    const modules = new Map(data.modules.map((m) => [m.id, m]));
    const records = new Map(data.attendance.map((r) => [r.occurrence_id, r]));
    return data.occurrences
      .filter((o) => Date.parse(o.ends_at) <= Date.now())
      .map((o) => {
        const module = modules.get(o.module_id);
        return {
          occurrence: o,
          record: records.get(o.id),
          moduleName: module?.name || "",
          moduleCode: module?.code || "",
        };
      })
      .filter((entry) => {
        const { occurrence: o, record } = entry;
        const key = localDateKey(o.starts_at, zone);
        return (
          (pending
            ? !record && !o.cancelled
            : Boolean(record) || o.cancelled) &&
          (moduleId === "all" || o.module_id === moduleId) &&
          (status === "all" ||
            (o.cancelled ? "cancelled" : record?.attendance_status) ===
              status) &&
          (!from || key >= from) &&
          (!to || key <= to) &&
          `${entry.moduleName} ${entry.moduleCode} ${record?.note || ""} ${o.classroom}`
            .toLowerCase()
            .includes(search.toLowerCase())
        );
      })
      .sort((a, b) =>
        sort === "module"
          ? a.moduleName.localeCompare(b.moduleName)
          : sort === "oldest"
            ? Date.parse(a.occurrence.starts_at) -
              Date.parse(b.occurrence.starts_at)
            : Date.parse(b.occurrence.starts_at) -
              Date.parse(a.occurrence.starts_at),
      );
  }, [data, zone, moduleId, status, from, to, search, sort, pending]);
  useEffect(
    () => setPage(0),
    [moduleId, status, from, to, search, sort, pending],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const displayed = filtered.slice(
    Math.min(page, pages - 1) * pageSize,
    (Math.min(page, pages - 1) + 1) * pageSize,
  );
  const statusLabel = (entry: ReportEntry) =>
    entry.occurrence.cancelled
      ? t(lang, "cancelled")
      : entry.record
        ? t(lang, entry.record.attendance_status)
        : t(lang, "unrecorded");
  const exportCsv = () => {
    downloadFile(
      attendanceCsv(filtered, zone),
      `Exclunich-attendance-${localDateKey()}.csv`,
      "text/csv;charset=utf-8",
    );
    toast.success(fr ? "Export CSV prêt" : "Your CSV report is ready");
  };
  const exportPdf = async () => {
    setExporting(true);
    try {
      const bytes = await attendancePdf(filtered, data);
      downloadFile(
        new Uint8Array(bytes),
        `Exclunich-attendance-${localDateKey()}.pdf`,
        "application/pdf",
      );
      toast.success(fr ? "Export PDF prêt" : "Your PDF report is ready");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {fr ? "CHAQUE SÉANCE COMPTE" : "EVERY SESSION TELLS A STORY"}
          </div>
          <h1>{t(lang, "history")}</h1>
          <p>
            {fr
              ? "Retrouvez, corrigez et exportez vos présences."
              : "Find, review, and correct your attendance records."}
          </p>
        </div>
        <div className="page-heading-actions">
          <Button
            variant="secondary"
            disabled={!filtered.length}
            onClick={exportCsv}
          >
            <Download size={15} />
            {t(lang, "exportCsv")}
          </Button>
          <Button disabled={exporting || !filtered.length} onClick={exportPdf}>
            {exporting ? <span className="spinner" /> : <FileDown size={15} />}{" "}
            {t(lang, "exportPdf")}
          </Button>
        </div>
      </div>
      <div className="toolbar">
        <div className="segmented">
          <button
            className={!pending ? "active" : ""}
            onClick={() => setPending(false)}
          >
            {fr ? "Historique" : "Recorded history"}
          </button>
          <button
            className={pending ? "active" : ""}
            onClick={() => {
              setPending(true);
              setStatus("all");
            }}
          >
            {fr ? "À renseigner" : "To record"}
          </button>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>
          {filtered.length} {fr ? "séances" : "sessions"}
        </span>
      </div>
      <div className="toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            className="input"
            aria-label={t(lang, "search")}
            placeholder={
              fr
                ? "Rechercher un module, une salle ou une note…"
                : "Search modules, rooms, or notes…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input"
          value={moduleId}
          onChange={(e) => setModuleId(e.target.value)}
          aria-label={fr ? "Filtrer par module" : "Filter by module"}
        >
          <option value="all">{fr ? "Tous les modules" : "All modules"}</option>
          {data.modules.map((m) => (
            <option value={m.id} key={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={status}
          disabled={pending}
          onChange={(e) => setStatus(e.target.value)}
          aria-label={fr ? "Filtrer par statut" : "Filter by status"}
        >
          <option value="all">
            {fr ? "Tous les statuts" : "All statuses"}
          </option>
          {(["present", "justified", "unjustified", "cancelled"] as const).map(
            (s) => (
              <option value={s} key={s}>
                {t(lang, s)}
              </option>
            ),
          )}
        </select>
        <select
          className="input"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label={fr ? "Trier" : "Sort order"}
        >
          <option value="newest">{fr ? "Plus récent" : "Newest first"}</option>
          <option value="oldest">{fr ? "Plus ancien" : "Oldest first"}</option>
          <option value="module">{fr ? "Par module" : "Module name"}</option>
        </select>
      </div>
      <div className="toolbar date-filter">
        <label className="row" style={{ fontSize: 13 }}>
          {t(lang, "fromDate")}
          <input
            className="input"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="row" style={{ fontSize: 13 }}>
          {t(lang, "toDate")}
          <input
            className="input"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {(search || from || to || moduleId !== "all" || status !== "all") && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setSearch("");
              setModuleId("all");
              setStatus("all");
              setFrom("");
              setTo("");
            }}
          >
            {fr ? "Réinitialiser" : "Reset filters"}
          </button>
        )}
      </div>
      <section className="card">
        {displayed.length ? (
          <>
            <div className="table-wrap history-desktop">
              <table>
                <thead>
                  <tr>
                    <th>{fr ? "Séance" : "Session"}</th>
                    <th>{fr ? "Module" : "Module"}</th>
                    <th>{fr ? "Type / salle" : "Type / room"}</th>
                    <th>{fr ? "Statut" : "Status"}</th>
                    <th>{fr ? "Note" : "Note"}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((entry) => {
                    const module = data.modules.find(
                      (m) => m.id === entry.occurrence.module_id,
                    )!;
                    return (
                      <tr key={entry.occurrence.id}>
                        <td>
                          {formatInZone(
                            entry.occurrence.starts_at,
                            "dd MMM yyyy",
                            zone,
                          )}
                          <div className="module-code">
                            {formatInZone(
                              entry.occurrence.starts_at,
                              "HH:mm",
                              zone,
                            )}
                            –
                            {formatInZone(
                              entry.occurrence.ends_at,
                              "HH:mm",
                              zone,
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="row">
                            <ModuleIcon module={module} />
                            <div>
                              <span className="module-name">{module.name}</span>
                              <span className="module-code">{module.code}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge badge-${entry.occurrence.session_type}`}
                          >
                            {entry.occurrence.session_type}
                          </span>
                          <div className="module-code" style={{ marginTop: 4 }}>
                            {entry.occurrence.classroom || "—"}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge badge-${entry.occurrence.cancelled ? "cancelled" : entry.record?.attendance_status || "info"}`}
                          >
                            {statusLabel(entry)}
                          </span>
                        </td>
                        <td className="history-note">
                          {entry.record?.note || "—"}
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => setSelected(entry.occurrence)}
                          >
                            {pending
                              ? fr
                                ? "Renseigner"
                                : "Record"
                              : fr
                                ? "Modifier"
                                : "Review"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="history-mobile">
              {displayed.map((entry) => (
                <button
                  className="history-mobile-card"
                  key={entry.occurrence.id}
                  onClick={() => setSelected(entry.occurrence)}
                >
                  <div className="row justify-between">
                    <strong>{entry.moduleName}</strong>
                    <span
                      className={`badge badge-${entry.occurrence.cancelled ? "cancelled" : entry.record?.attendance_status || "info"}`}
                    >
                      {statusLabel(entry)}
                    </span>
                  </div>
                  <span className="muted">
                    {formatInZone(
                      entry.occurrence.starts_at,
                      "EEE dd MMM · HH:mm",
                      zone,
                    )}{" "}
                    · {entry.occurrence.session_type}
                  </span>
                  {entry.record?.note && <p>{entry.record.note}</p>}
                </button>
              ))}
            </div>
            <div className="table-footer">
              <span>
                {page * pageSize + 1}–
                {Math.min((page + 1) * pageSize, filtered.length)} /{" "}
                {filtered.length} {fr ? "séances" : "sessions"}
              </span>
              <div className="row">
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  aria-label={fr ? "Page précédente" : "Previous page"}
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={17} />
                </button>
                <span>
                  {page + 1} / {pages}
                </span>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  aria-label={fr ? "Page suivante" : "Next page"}
                  disabled={page >= pages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty">
            <ClipboardCheck size={34} />
            <h2>
              {pending
                ? fr
                  ? "Tout est à jour"
                  : "You’re all caught up"
                : fr
                  ? "Aucune présence à afficher"
                  : "A clean slate"}
            </h2>
            <p>
              {pending
                ? fr
                  ? "Aucune séance terminée ne reste à renseigner."
                  : "No completed sessions are waiting for an attendance record."
                : fr
                  ? "Les présences enregistrées apparaîtront ici. Essayez aussi de modifier les filtres."
                  : "Recorded sessions will appear here. You can also try adjusting your filters."}
            </p>
            {!pending && (
              <button
                className="btn"
                onClick={() => {
                  setPending(true);
                  setStatus("all");
                }}
              >
                {fr ? "Renseigner une présence" : "Record attendance"}
              </button>
            )}
          </div>
        )}
      </section>
      <p className="report-caption">
        {fr
          ? "Les exports incluent toutes les séances filtrées. Les séances futures ne comptent jamais comme absences."
          : "Exports include all filtered sessions. Future sessions never count as actual absences."}
      </p>
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
