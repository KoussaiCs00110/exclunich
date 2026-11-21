"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  BellOff,
  CalendarClock,
  Check,
  CheckCheck,
  FilePenLine,
  Info,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatInZone } from "@/lib/timezone";
import { t } from "@/lib/i18n";
import { useWorkspace } from "./workspace";
import { SessionPanel } from "./session-panel";

const types: Record<string, { en: string; fr: string }> = {
  first_absence: { en: "First absence", fr: "Première absence" },
  warning_unjustified: {
    en: "Unjustified warning",
    fr: "Alerte non justifiée",
  },
  warning_total: { en: "Total absence warning", fr: "Alerte du total" },
  critical: { en: "Critical risk", fr: "Risque critique" },
  exclusion: { en: "Exclusion", fr: "Exclusion" },
  session_reminder: { en: "Session reminder", fr: "Rappel de séance" },
  attendance_modified: {
    en: "Attendance correction",
    fr: "Correction de présence",
  },
};

export function NotificationsPage() {
  const { data, mutate } = useWorkspace();
  const [type, setType] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const lang = data.student.language;
  const phrase = (en: string, fr: string) => (lang === "fr" ? fr : en);
  const unread = data.notifications.filter(
    (notification) => !notification.is_read,
  ).length;
  const notifications = useMemo(
    () =>
      data.notifications
        .filter(
          (notification) =>
            (type === "all" || notification.type === type) &&
            (!unreadOnly || !notification.is_read),
        )
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [data.notifications, type, unreadOnly],
  );
  const session = data.occurrences.find(
    (occurrence) => occurrence.id === sessionId,
  );
  const availableTypes = [
    ...new Set([
      ...Object.keys(types),
      ...data.notifications.map((notification) => notification.type),
    ]),
  ];

  async function act(
    action: string,
    payload: Record<string, unknown>,
    busyKey: string,
  ) {
    setBusy(busyKey);
    try {
      await mutate(action, payload);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : phrase(
              "The notification could not be updated.",
              "La notification n’a pas pu être mise à jour.",
            ),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {phrase(
              "A LITTLE NOTICE. A BIG DIFFERENCE.",
              "UN RAPPEL QUI CHANGE TOUT.",
            )}
          </span>
          <h1>{t(lang, "notifications")}</h1>
          <p>
            {unread
              ? phrase(
                  `${unread} unread ${unread === 1 ? "update" : "updates"}. Keep your semester in view.`,
                  `${unread} ${unread === 1 ? "notification non lue" : "notifications non lues"}. Gardez votre semestre en vue.`,
                )
              : phrase(
                  "You’re all caught up. Your attendance alerts live here.",
                  "Vous êtes à jour. Vos alertes de présence sont ici.",
                )}
          </p>
        </div>
        <div className="page-heading-actions">
          <button
            className="btn"
            type="button"
            disabled={unread === 0 || busy !== null}
            onClick={() => {
              void act("notifications_read", {}, "all");
            }}
          >
            <CheckCheck size={17} />
            {t(lang, "markAllRead")}
          </button>
        </div>
      </div>
      {!data.student.notifications_enabled && (
        <div className="notice notice-info" style={{ marginBottom: 20 }}>
          <BellOff size={19} />
          <div>
            <strong>
              {phrase(
                "New in-app alerts are paused",
                "Les nouvelles alertes sont suspendues",
              )}
            </strong>
            <p>
              {phrase(
                "You can enable attendance alerts in your preferences.",
                "Vous pouvez les réactiver dans vos préférences.",
              )}{" "}
              <Link className="text-link" href="/settings">
                {t(lang, "settings")}
              </Link>
            </p>
          </div>
        </div>
      )}
      <div className="toolbar">
        <select
          className="input"
          aria-label={phrase(
            "Filter notification type",
            "Filtrer par type de notification",
          )}
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="all">
            {phrase("All notification types", "Tous les types")}
          </option>
          {availableTypes.map((key) => (
            <option value={key} key={key}>
              {types[key]?.[lang] ?? key.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <div
          className="segmented"
          role="group"
          aria-label={phrase(
            "Filter read status",
            "Filtrer par état de lecture",
          )}
        >
          <button
            type="button"
            className={!unreadOnly ? "active" : ""}
            aria-pressed={!unreadOnly}
            onClick={() => setUnreadOnly(false)}
          >
            {t(lang, "all")}{" "}
            <span className="muted">({data.notifications.length})</span>
          </button>
          <button
            type="button"
            className={unreadOnly ? "active" : ""}
            aria-pressed={unreadOnly}
            onClick={() => setUnreadOnly(true)}
          >
            {phrase("Unread", "Non lues")}{" "}
            <span className="muted">({unread})</span>
          </button>
        </div>
      </div>
      {notifications.length > 0 ? (
        <div className="notification-list">
          {notifications.map((notification) => {
            const Icon =
              notification.type === "session_reminder"
                ? CalendarClock
                : notification.type === "attendance_modified"
                  ? FilePenLine
                  : [
                        "exclusion",
                        "critical",
                        "warning_total",
                        "warning_unjustified",
                      ].includes(notification.type)
                    ? ShieldAlert
                    : Info;
            const linkedSession =
              notification.occurrence_id &&
              data.occurrences.some(
                (occurrence) => occurrence.id === notification.occurrence_id,
              );
            return (
              <article
                key={notification.id}
                className={`card notification ${notification.is_read ? "" : "unread"}`}
              >
                <div
                  className="notification-icon"
                  style={
                    notification.type === "exclusion"
                      ? {
                          color: "var(--red)",
                          background:
                            "color-mix(in srgb,var(--red) 9%,transparent)",
                        }
                      : [
                            "critical",
                            "warning_total",
                            "warning_unjustified",
                          ].includes(notification.type)
                        ? {
                            color: "var(--amber)",
                            background:
                              "color-mix(in srgb,var(--amber) 9%,transparent)",
                          }
                        : undefined
                  }
                >
                  <Icon size={19} />
                </div>
                <div className="grow">
                  <div
                    className="row wrap"
                    style={{ justifyContent: "space-between", gap: 8 }}
                  >
                    <h3 style={{ marginBottom: 0 }}>{notification.title}</h3>
                    <span className="badge" style={{ fontSize: 11 }}>
                      {types[notification.type]?.[lang] ??
                        notification.type.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p>{notification.message}</p>
                  <div className="row wrap" style={{ gap: 12 }}>
                    <small>
                      <time dateTime={notification.created_at}>
                        {formatInZone(
                          notification.created_at,
                          "dd MMM yyyy · HH:mm",
                          data.student.timezone,
                        )}
                      </time>
                    </small>
                    {linkedSession ? (
                      <button
                        type="button"
                        className="text-link"
                        style={{
                          background: "none",
                          border: 0,
                          padding: 0,
                          fontSize: 12,
                        }}
                        onClick={() => {
                          setSessionId(notification.occurrence_id!);
                          if (!notification.is_read)
                            void act(
                              "notifications_read",
                              { id: notification.id },
                              notification.id,
                            );
                        }}
                      >
                        {phrase("View session", "Voir la séance")}
                      </button>
                    ) : notification.module_id &&
                      data.modules.some(
                        (module) => module.id === notification.module_id,
                      ) ? (
                      <Link
                        className="text-link"
                        style={{ fontSize: 12 }}
                        href={`/modules/${notification.module_id}`}
                        onClick={() => {
                          if (!notification.is_read)
                            void act(
                              "notifications_read",
                              { id: notification.id },
                              notification.id,
                            );
                        }}
                      >
                        {phrase("View module", "Voir le module")}
                      </Link>
                    ) : null}
                  </div>
                </div>
                <div className="notification-actions">
                  {!notification.is_read && (
                    <button
                      className="btn btn-ghost btn-icon"
                      type="button"
                      aria-label={`${t(lang, "markRead")}: ${notification.title}`}
                      title={t(lang, "markRead")}
                      disabled={busy !== null}
                      onClick={() => {
                        void act(
                          "notifications_read",
                          { id: notification.id },
                          notification.id,
                        );
                      }}
                    >
                      <Check size={16} />
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-icon"
                    type="button"
                    aria-label={`${t(lang, "delete")}: ${notification.title}`}
                    title={t(lang, "delete")}
                    disabled={busy !== null}
                    onClick={() => {
                      void act(
                        "notification_delete",
                        { id: notification.id },
                        notification.id,
                      );
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="card empty">
          <Bell size={34} />
          <h2>
            {unreadOnly
              ? phrase("All caught up", "Vous êtes à jour")
              : type !== "all"
                ? phrase(
                    "No matching notifications",
                    "Aucune notification correspondante",
                  )
                : phrase(
                    "A quieter kind of inbox",
                    "Une boîte de réception sereine",
                  )}
          </h2>
          <p>
            {phrase(
              "Attendance warnings, session reminders, and corrections appear here when they happen.",
              "Les alertes de présence, rappels et corrections apparaîtront ici.",
            )}
          </p>
          {(unreadOnly || type !== "all") && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setType("all");
                setUnreadOnly(false);
              }}
            >
              {phrase(
                "Show all notifications",
                "Afficher toutes les notifications",
              )}
            </button>
          )}
        </div>
      )}
      {session && (
        <SessionPanel
          data={data}
          occurrence={session}
          onClose={() => setSessionId(null)}
          onMutate={mutate}
        />
      )}
    </>
  );
}

export default NotificationsPage;
