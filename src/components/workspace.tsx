"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  History,
  ChartNoAxesCombined,
  Bell,
  Settings,
  Sun,
  Moon,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import type { AppData } from "@/lib/types";
import { formatInZone } from "@/lib/timezone";
import { requestApi } from "@/lib/client";
import { Logo } from "./logo";
import { t, semesterLabel } from "@/lib/i18n";
type Mutate = (
  action: string,
  payload?: Record<string, unknown>,
) => Promise<unknown>;
const Context = createContext<{
  data: AppData;
  refresh: () => Promise<void>;
  mutate: Mutate;
}>({} as never);
export function useWorkspace() {
  return useContext(Context);
}
const links = [
  { href: "/", label: "Dashboard", key: "dashboard", icon: LayoutDashboard },
  {
    href: "/timetable",
    label: "My Timetable",
    key: "timetable",
    icon: CalendarDays,
  },
  { href: "/modules", label: "My Modules", key: "modules", icon: BookOpen },
  {
    href: "/history",
    label: "Attendance History",
    key: "history",
    icon: History,
  },
  {
    href: "/statistics",
    label: "Statistics",
    key: "statistics",
    icon: ChartNoAxesCombined,
  },
  {
    href: "/notifications",
    label: "Notifications",
    key: "notifications",
    icon: Bell,
  },
  { href: "/settings", label: "Settings", key: "settings", icon: Settings },
];
export function Workspace({
  initialData,
  children,
  demo = false,
}: {
  initialData: AppData;
  children: React.ReactNode;
  demo?: boolean;
}) {
  const [data, setData] = useState(initialData);
  const [collapsed, setCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const lang = data.student.language;
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await requestApi<AppData>("/api/data"));
    } finally {
      setRefreshing(false);
    }
  }, []);
  const mutate = useCallback<Mutate>(
    async (action, payload = {}) => {
      const result = await requestApi("/api/data", { action, ...payload });
      await refresh();
      return result;
    },
    [refresh],
  );
  useEffect(() => {
    const theme = data.student.theme;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "light" : "dark") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    document.documentElement.lang = lang;
    return () => media.removeEventListener("change", apply);
  }, [data.student.theme, lang]);
  useEffect(() => {
    const update = () => {
      refresh().catch(() => {});
    };
    window.addEventListener("focus", update);
    const timer = setInterval(update, 60000);
    return () => {
      window.removeEventListener("focus", update);
      clearInterval(timer);
    };
  }, [refresh]);
  const toggleTheme = async () => {
    try {
      await mutate("profile_save", {
        ...data.student,
        student_identifier: data.student.student_identifier ?? "",
        theme:
          document.documentElement.dataset.theme === "light" ? "dark" : "light",
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const logout = async () => {
    try {
      await requestApi("/api/auth", { action: "logout" });
      router.replace("/login");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const unread = data.notifications.filter((n) => !n.is_read).length;
  const active = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);
  const current = links.find((l) => active(l.href)) || links[0];
  const initials = data.student.full_name
    .split(" ")
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <Context.Provider value={{ data, refresh, mutate }}>
      <div className={`app ${collapsed ? "sidebar-collapsed" : ""}`}>
        <aside className="sidebar">
          <Link href="/" aria-label={t(lang, "workspace.home")}>
            <Logo />
          </Link>
          <p className="workspace-label">{t(lang, "workspace.student")}</p>
          <nav aria-label={t(lang, "workspace.mainNavigation")}>
            {links.map(({ href, label, key, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                title={t(lang, `nav.${key}` as never)}
                aria-current={active(href) ? "page" : undefined}
                className={`nav-link ${active(href) ? "active" : ""}`}
              >
                <Icon size={19} />
                <span>{t(lang, `nav.${key}` as never) || label}</span>
                {href === "/notifications" && unread > 0 && (
                  <span className="nav-count">{unread}</span>
                )}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="semester-card">
              <div className="row">
                <BookOpen size={15} className="text-primary" />
                <strong>{semesterLabel(data.student.semester, lang)}</strong>
              </div>
              <small>
                {data.student.academic_year} · {data.student.group_name}
              </small>
              <div className="semester-progress">
                <span />
              </div>
            </div>
            <div className="profile-strip">
              <Link
                href="/settings"
                className="avatar"
                aria-label={t(lang, "workspace.editProfile")}
              >
                {initials}
              </Link>
              <div className="profile-info grow">
                <div className="profile-name">{data.student.full_name}</div>
                <div className="profile-caption">
                  {t(lang, "workspace.studentCaption")}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-icon logout-button"
                aria-label={t(lang, "logout")}
                onClick={logout}
              >
                <LogOut size={17} />
              </button>
            </div>
            <button
              className="btn btn-ghost btn-icon collapse-toggle"
              aria-label={t(
                lang,
                collapsed ? "workspace.expand" : "workspace.collapse",
              )}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? (
                <PanelLeftOpen size={17} />
              ) : (
                <PanelLeftClose size={17} />
              )}
            </button>
          </div>
        </aside>
        <div className="app-main">
          <header className="topbar">
            <div className="topbar-context">
              <Link href="/" className="mobile-logo">
                <Logo />
              </Link>
              <span className="desktop-context">
                {t(lang, "workspace.workspace")}
              </span>
              <ChevronRight className="desktop-context" size={14} />
              <b className="desktop-context">
                {t(lang, `nav.${current.key}` as never)}
              </b>
            </div>
            <div className="topbar-actions">
              <span className="date-label">
                <CalendarDays size={14} />
                {formatInZone(
                  new Date(),
                  "EEE, dd MMM yyyy",
                  data.student.timezone,
                  lang === "fr" ? "fr-DZ" : "en-GB",
                )}
              </span>
              <button
                className="btn btn-ghost btn-icon"
                disabled={refreshing}
                aria-label={t(lang, "workspace.refresh")}
                onClick={() => refresh().catch((e) => toast.error(e.message))}
              >
                <RefreshCw size={17} className={refreshing ? "spinning" : ""} />
              </button>
              <button
                className="btn btn-ghost btn-icon"
                aria-label={t(lang, "workspace.switchTheme")}
                onClick={toggleTheme}
              >
                <Sun size={18} />
              </button>
              <Link
                className="btn btn-ghost btn-icon"
                aria-label={t(lang, "workspace.notificationsUnread", {
                  count: unread,
                })}
                href="/notifications"
              >
                <Bell size={18} />
                {unread > 0 && <span className="unread-dot" />}
              </Link>
              <div className="divider" />
              <Link
                href="/settings"
                className="avatar"
                aria-label={t(lang, "workspace.openProfile")}
              >
                {initials}
              </Link>
            </div>
          </header>
          <main className="content">
            {demo && (
              <div
                className="notice notice-info"
                role="status"
                style={{ marginBottom: 24 }}
              >
                <ShieldCheck size={18} />
                <div>
                  <strong>
                    {lang === "fr"
                      ? "Démo locale · Données fictives"
                      : "Local demo · Synthetic data"}
                  </strong>
                  <p>
                    {lang === "fr"
                      ? "Les modifications sont enregistrées uniquement sur cet ordinateur. Les fonctions de sécurité du compte nécessitent Supabase."
                      : "Changes are saved only on this computer. Account security features require Supabase. No real student data is used."}
                  </p>
                </div>
              </div>
            )}
            <div key={path} className="page-transition">
              {children}
            </div>
          </main>
          <footer className="workspace-footer">
            <ShieldCheck size={13} />
            {t(lang, "workspace.footer")}
            <span>{data.student.timezone} · NSCS</span>
          </footer>
        </div>
        <nav
          className="mobile-nav"
          aria-label={t(lang, "workspace.mobileNavigation")}
        >
          {[links[0], links[1], links[2], links[4], links[6]].map(
            ({ href, key, icon: Icon }) => (
              <Link
                href={href}
                key={href}
                className={active(href) ? "active" : ""}
                aria-current={active(href) ? "page" : undefined}
              >
                <Icon />
                <span>{t(lang, `workspace.mobile.${key}` as never)}</span>
              </Link>
            ),
          )}
        </nav>
      </div>
    </Context.Provider>
  );
}
