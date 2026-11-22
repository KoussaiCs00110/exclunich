"use client";
import { useEffect, useState } from "react";
import {
  Copy,
  Download,
  KeyRound,
  Share2,
  Trash2,
  Clipboard,
  CalendarDays,
  Check,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import type { AppData } from "@/lib/types";
import type {
  TimetableShareInfo,
  TimetableSharePreview,
} from "@/lib/timetable-sharing";
import { requestApi, downloadFile, copyText } from "@/lib/client";
import { formatInZone } from "@/lib/timezone";
import { Modal } from "./modal";
import "./timetable-sharing.css";

export function TimetableSharing({
  data,
  onImported,
}: {
  data: AppData;
  onImported: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"share" | "import">("share");
  const [shares, setShares] = useState<TimetableShareInfo[]>([]);
  const [title, setTitle] = useState(
    `${data.student.group_name} · ${data.student.semester}`,
  );
  const [days, setDays] = useState(7);
  const [created, setCreated] = useState<
    (TimetableShareInfo & { token: string }) | null
  >(null);
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<TimetableSharePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lang = data.student.language;
  const phrase = (en: string, fr: string) => (lang === "fr" ? fr : en);
  const load = async () => {
    setLoading(true);
    try {
      setShares(
        await requestApi<TimetableShareInfo[]>("/api/timetable-sharing"),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("import") === "1") {
      setTab("import");
      setOpen(true);
    }
  }, []);
  useEffect(() => {
    if (open && tab === "share") void load();
  }, [open, tab]);
  const perform = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    void perform(async () => {
      setCreated(
        await requestApi("/api/timetable-sharing", {
          action: "create",
          title,
          expires_days: days,
        }),
      );
      await load();
    });
  };
  const inspect = (e: React.FormEvent) => {
    e.preventDefault();
    void perform(async () => {
      setPreview(
        await requestApi<TimetableSharePreview>("/api/timetable-sharing", {
          action: "preview",
          token,
        }),
      );
    });
  };
  const importSchedule = () =>
    void perform(async () => {
      const result = await requestApi<{
        modules_added: number;
        sessions_added: number;
      }>("/api/timetable-sharing", { action: "import", token });
      await onImported();
      toast.success(
        phrase(
          `${result.sessions_added} sessions imported. Your attendance stays private.`,
          `${result.sessions_added} séances importées. Vos présences restent privées.`,
        ),
      );
      setPreview(null);
      setToken("");
      setOpen(false);
    });
  const close = () => {
    if (busy) return;
    setOpen(false);
    setCreated(null);
    setPreview(null);
    setToken("");
    setError("");
  };
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Share2 size={16} />
        {phrase("Share / import", "Partager / importer")}
      </button>
      {open && (
        <Modal
          title={phrase(
            "A timetable for your group",
            "Un emploi du temps pour votre groupe",
          )}
          description={phrase(
            "Share your schedule. Keep your attendance to yourself.",
            "Partagez les séances. Gardez vos présences pour vous.",
          )}
          onClose={close}
          wide
        >
          <div
            className="segmented sharing-tabs"
            role="group"
            aria-label={phrase(
              "Timetable sharing options",
              "Options de partage",
            )}
          >
            <button
              type="button"
              disabled={busy}
              className={tab === "share" ? "active" : ""}
              aria-pressed={tab === "share"}
              onClick={() => {
                setTab("share");
                setError("");
              }}
            >
              <Share2 size={14} />
              {phrase("Share mine", "Partager le mien")}
            </button>
            <button
              type="button"
              disabled={busy}
              className={tab === "import" ? "active" : ""}
              aria-pressed={tab === "import"}
              onClick={() => {
                setTab("import");
                setError("");
              }}
            >
              <KeyRound size={14} />
              {phrase("Use a token", "Utiliser un jeton")}
            </button>
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {tab === "share" ? (
            <>
              <div className="notice notice-info sharing-notice">
                <CalendarDays size={18} />
                <div>
                  <strong>
                    {data.student.group_name} · {data.student.semester}
                  </strong>
                  <p>
                    {phrase(
                      "A snapshot of your current semester: modules, professors, rooms, dates and times. Attendance, notes, personal thresholds and account credentials are never shared.",
                      "Une copie de votre semestre actuel : modules, enseignants, salles, dates et horaires. Présences, notes, seuils personnels et identifiants ne sont jamais partagés.",
                    )}
                  </p>
                </div>
              </div>
              <form onSubmit={create} className="sharing-create">
                <div className="field">
                  <label htmlFor="share-title">
                    {phrase("Timetable name", "Nom de l’emploi du temps")}
                  </label>
                  <input
                    id="share-title"
                    className="input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={100}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="share-expiry">
                    {phrase("Token expires after", "Expiration du jeton")}
                  </label>
                  <select
                    id="share-expiry"
                    className="input"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  >
                    {[1, 7, 30].map((day) => (
                      <option value={day} key={day}>
                        {day}{" "}
                        {phrase(
                          day === 1 ? "day" : "days",
                          day === 1 ? "jour" : "jours",
                        )}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn btn-primary" disabled={busy}>
                  {busy ? <span className="spinner" /> : <Share2 size={15} />}{" "}
                  {phrase("Create sharing token", "Créer un jeton de partage")}
                </button>
              </form>
              {created && (
                <div className="token-reveal sharing-token">
                  <label>
                    {phrase(
                      "Copy this timetable token · shown once",
                      "Copiez ce jeton de partage · affiché une fois",
                    )}
                  </label>
                  <div className="token-value">{created.token}</div>
                  <div className="token-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        copyText(created.token)
                          .then(() =>
                            toast.success(
                              phrase("Token copied", "Jeton copié"),
                            ),
                          )
                          .catch(() =>
                            toast.error(
                              phrase(
                                "Select and copy the token manually.",
                                "Sélectionnez et copiez le jeton manuellement.",
                              ),
                            ),
                          )
                      }
                    >
                      <Copy size={13} />
                      {phrase("Copy", "Copier")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        downloadFile(
                          `Exclunich timetable: ${created.title}\n${created.token}\nExpires: ${created.expires_at}\nUse this in My Timetable > Share / import. This is not an account login token.\n`,
                          "Exclunich-timetable-token.txt",
                        )
                      }
                    >
                      <Download size={13} />
                      {phrase("Save TXT", "Enregistrer TXT")}
                    </button>
                  </div>
                </div>
              )}
              <p className="sharing-caption">
                {phrase(
                  "Anyone with a valid sharing token can preview and import this timetable, regardless of group, department, academic year or semester. Classes are copied into the recipient’s current term; profile details are not changed. Later edits do not sync.",
                  "Toute personne disposant d’un jeton valide peut consulter et importer cet emploi du temps, quels que soient son groupe, département, année ou semestre. Les séances sont copiées dans sa période actuelle sans modifier son profil. Les modifications ultérieures ne sont pas synchronisées.",
                )}
              </p>
              <div className="sharing-list-heading">
                <h3>
                  {phrase("Your sharing tokens", "Vos jetons de partage")}
                </h3>
                {loading && <span className="spinner" />}
              </div>
              {!loading && !shares.length && (
                <p className="sharing-caption">
                  {phrase(
                    "No sharing tokens yet. Create one above.",
                    "Aucun jeton de partage. Créez-en un ci-dessus.",
                  )}
                </p>
              )}
              <div className="sharing-list">
                {shares.map((share) => {
                  const active =
                    !share.revoked_at &&
                    Date.parse(share.expires_at) > Date.now();
                  return (
                    <div className="sharing-list-item" key={share.id}>
                      <div>
                        <strong>{share.title}</strong>
                        <small>
                          {share.module_count} {phrase("modules", "modules")} ·{" "}
                          {share.session_count}{" "}
                          {phrase("weekly sessions", "séances hebdomadaires")}
                        </small>
                        <small>
                          {share.revoked_at
                            ? phrase("Revoked", "Révoqué")
                            : active
                              ? phrase("Expires ", "Expire le ") +
                                formatInZone(
                                  share.expires_at,
                                  "dd MMM yyyy · HH:mm",
                                  data.student.timezone,
                                )
                              : phrase("Expired", "Expiré")}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={busy || !active}
                        onClick={() =>
                          void perform(async () => {
                            await requestApi("/api/timetable-sharing", {
                              action: "revoke",
                              id: share.id,
                            });
                            if (created?.id === share.id) setCreated(null);
                            await load();
                          })
                        }
                      >
                        <Trash2 size={14} />
                        {phrase("Revoke", "Révoquer")}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <form onSubmit={inspect}>
                <div className="field">
                  <label htmlFor="import-timetable-token">
                    {phrase(
                      "Timetable sharing token",
                      "Jeton de partage de l’emploi du temps",
                    )}
                  </label>
                  <div className="row">
                    <input
                      id="import-timetable-token"
                      className="input mono"
                      placeholder="EXSH-…"
                      value={token}
                      onChange={(e) => {
                        setToken(e.target.value);
                        setPreview(null);
                      }}
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={100}
                      required
                    />
                    <button
                      type="button"
                      className="btn btn-icon"
                      aria-label={phrase(
                        "Paste sharing token",
                        "Coller le jeton de partage",
                      )}
                      onClick={() =>
                        navigator.clipboard
                          .readText()
                          .then((value) => {
                            setToken(value.trim());
                            setPreview(null);
                          })
                          .catch(() =>
                            toast.error(
                              phrase(
                                "Paste the token in the input.",
                                "Collez le jeton dans le champ.",
                              ),
                            ),
                          )
                      }
                    >
                      <Clipboard size={16} />
                    </button>
                  </div>
                  <small>
                    {phrase(
                      "Ask a classmate for a token starting with EXSH. Never share your personal login token.",
                      "Demandez à un camarade un jeton commençant par EXSH. Ne partagez jamais votre jeton personnel de connexion.",
                    )}
                  </small>
                </div>
                <div className="form-actions">
                  <button
                    className="btn btn-primary"
                    disabled={busy || !token.trim()}
                  >
                    {busy ? (
                      <span className="spinner" />
                    ) : (
                      <CalendarDays size={16} />
                    )}{" "}
                    {phrase("Preview timetable", "Aperçu de l’emploi du temps")}
                  </button>
                </div>
              </form>
              {preview && (
                <section className="sharing-preview">
                  <div className="row justify-between">
                    <h3>{preview.title}</h3>
                    <span className="badge badge-info">
                      {preview.snapshot.cohort.group_name}
                    </span>
                  </div>
                  <p className="sharing-caption">
                    {preview.module_count} {phrase("modules", "modules")} ·{" "}
                    {preview.session_count}{" "}
                    {phrase("weekly sessions", "séances hebdomadaires")} ·{" "}
                    {preview.snapshot.timezone}
                  </p>
                  <div className="sharing-modules">
                    {preview.snapshot.modules.map((module) => (
                      <div key={module.id}>
                        <span
                          className="legend-dot"
                          style={{ background: module.color }}
                        />
                        <strong>{module.name}</strong>
                        <small>{module.code}</small>
                      </div>
                    ))}
                  </div>
                  <div className="table-wrap sharing-schedule">
                    <table>
                      <thead>
                        <tr>
                          <th>{phrase("Day", "Jour")}</th>
                          <th>{phrase("Module / type", "Module / type")}</th>
                          <th>{phrase("Time", "Horaire")}</th>
                          <th>{phrase("Room", "Salle")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.snapshot.sessions.map((session) => (
                          <tr key={session.id}>
                            <td>
                              {
                                (lang === "fr"
                                  ? [
                                      "",
                                      "Lun",
                                      "Mar",
                                      "Mer",
                                      "Jeu",
                                      "Ven",
                                      "Sam",
                                      "Dim",
                                    ]
                                  : [
                                      "",
                                      "Mon",
                                      "Tue",
                                      "Wed",
                                      "Thu",
                                      "Fri",
                                      "Sat",
                                      "Sun",
                                    ])[session.weekday]
                              }
                            </td>
                            <td>
                              {
                                preview.snapshot.modules.find(
                                  (m) => m.id === session.module_id,
                                )?.code
                              }{" "}
                              · {session.session_type}
                            </td>
                            <td>
                              {session.start_time.slice(0, 5)}–
                              {session.end_time.slice(0, 5)}
                            </td>
                            <td>{session.classroom || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.is_owner || preview.already_imported ? (
                    <div className="notice notice-info">
                      <Check size={17} />
                      <p>
                        {preview.is_owner
                          ? phrase(
                              "This timetable is already yours. Give the token to someone in your group.",
                              "Cet emploi du temps est déjà le vôtre. Donnez le jeton à un camarade de votre groupe.",
                            )
                          : phrase(
                              "You already imported this timetable. Your attendance and edits are preserved.",
                              "Cet emploi du temps a déjà été importé. Vos présences et modifications sont conservées.",
                            )}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="notice sharing-notice">
                        <AlertTriangle size={17} />
                        <p>
                          {phrase(
                            "Import adds independent copies and reuses matching module codes. Your existing records stay saved. Existing module codes with different names must be resolved first. Review any overlapping times after importing.",
                            "L’import ajoute des copies indépendantes et réutilise les codes de modules correspondants. Vos données sont conservées. Les codes associés à un autre nom doivent être corrigés. Vérifiez les chevauchements après l’import.",
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary full-width"
                        disabled={busy}
                        onClick={importSchedule}
                      >
                        {busy ? (
                          <span className="spinner" />
                        ) : (
                          <Download size={16} />
                        )}{" "}
                        {phrase(
                          "Import into my timetable",
                          "Importer dans mon emploi du temps",
                        )}
                      </button>
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
