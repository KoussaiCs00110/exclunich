"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ShieldCheck,
  CalendarDays,
  Activity,
  Eye,
  EyeOff,
  Clipboard,
  Copy,
  Download,
  KeyRound,
  Check,
  LockKeyhole,
  Languages,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "./logo";
import { copyText, downloadFile, requestApi } from "@/lib/client";
import { semesterLabel, t } from "@/lib/i18n";
import type { Language } from "@/lib/types";
import { DEPARTMENTS, GROUPS } from "@/lib/academic-profile";

const registrationSchema = (language: Language) =>
  z.object({
    full_name: z
      .string()
      .trim()
      .min(2, t(language, "auth.nameError"))
      .max(100, t(language, "auth.tooLong", { count: 100 })),
    student_identifier: z
      .string()
      .trim()
      .max(60, t(language, "auth.tooLong", { count: 60 })),
    academic_year: z.string().min(1, t(language, "auth.required")),
    department: z
      .string()
      .trim()
      .min(1, t(language, "auth.departmentError"))
      .refine((value) => DEPARTMENTS.some((department) => department === value), t(language, "auth.departmentError")),
    group_name: z
      .string()
      .trim()
      .min(1, t(language, "auth.groupError"))
      .refine((value) => GROUPS.some((group) => group === value), t(language, "auth.groupError")),
    semester: z.string().min(1, t(language, "auth.required")),
  });
type Registration = z.infer<ReturnType<typeof registrationSchema>>;
type Secrets = { token?: string; recoveryCode?: string };

function authError(error: unknown, language: Language): string {
  const message = error instanceof Error ? error.message : "";
  if (/invalid access token|current access token is incorrect/i.test(message))
    return t(language, "auth.invalidToken");
  if (/recovery.*(invalid|used|expired)|invalid.*recovery/i.test(message))
    return t(language, "auth.invalidRecovery");
  if (/too many|rate limit/i.test(message))
    return t(language, "auth.rateLimited");
  if (/session.*expired|sign in again/i.test(message))
    return t(language, "auth.sessionExpired");
  if (/origin.*verif/i.test(message)) return t(language, "auth.originError");
  if (/configur|database|SUPABASE|not available/i.test(message))
    return t(language, "auth.setupError");
  if (/fetch|network|server could not complete/i.test(message))
    return t(language, "auth.networkError");
  return language === "en" && message ? message : t(language, "error");
}

export function SecretDisplay({
  secrets,
  language = "en",
}: {
  secrets: Secrets;
  language?: Language;
}) {
  return (
    <>
      {(
        [
          [t(language, "auth.accessToken"), secrets.token, "access-token"],
          [
            t(language, "auth.recoveryCode"),
            secrets.recoveryCode,
            "recovery-code",
          ],
        ] as const
      )
        .filter(([, value]) => value)
        .map(([label, value, file]) => (
          <div className="token-reveal" key={file}>
            <label>
              {label} · {t(language, "auth.onlyOnce")}
            </label>
            <div
              className={`token-value ${file === "recovery-code" ? "recovery-value" : ""}`}
            >
              {value}
            </div>
            <div className="token-actions">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  copyText(value!)
                    .then(() =>
                      toast.success(t(language, "auth.copied", { label })),
                    )
                    .catch(() =>
                      toast.error(t(language, "auth.clipboardUnavailable")),
                    )
                }
              >
                <Copy size={13} />
                {t(language, "auth.copy")}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  downloadFile(
                    `Exclunich ${label}\n${value}\n\n${t(language, "auth.keepSecret")} ${t(language, file === "recovery-code" ? "auth.recoveryFile" : "auth.accessFile")}\n`,
                    `Exclunich-${file}.txt`,
                  )
                }
              >
                <Download size={13} />
                {t(language, "auth.saveTxt")}
              </button>
            </div>
          </div>
        ))}
    </>
  );
}

export default function AuthPage({
  mode,
  localDemo = false,
}: {
  mode: "login" | "register" | "recover";
  localDemo?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [language, setLanguage] = useState<Language>("en");
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [secrets, setSecrets] = useState<Secrets | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const year = new Date().getFullYear();
  const academicYear = `${year}–${year + 1}`;
  const {
    register,
    handleSubmit,
    clearErrors,
    formState: { errors },
  } = useForm<Registration>({
    resolver: zodResolver(registrationSchema(language)),
    defaultValues: {
      full_name: "",
      student_identifier: "",
      academic_year: academicYear,
      department: "",
      group_name: "",
      semester: "Semester 1",
    },
  });

  useEffect(() => {
    try {
      const preference = localStorage.getItem("absentia-language");
      if (preference === "en" || preference === "fr") setLanguage(preference);
    } catch {
      /* Language preference remains optional on restricted browsers. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    if (mode === "register" && params.get("step") === "save") setPending(true);
  }, [mode, params]);

  const changeLanguage = (value: Language) => {
    setLanguage(value);
    setError("");
    clearErrors();
    try {
      localStorage.setItem("absentia-language", value);
    } catch {
      /* No credentials are stored in browser storage. */
    }
  };
  const finish = async () => {
    if (!saved) return;
    setLoading(true);
    setError("");
    try {
      await requestApi("/api/auth", { action: "confirm", saved: true });
      setSecrets(null);
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(authError(cause, language));
    } finally {
      setLoading(false);
    }
  };
  const submitRegistration = handleSubmit(async (values: Registration) => {
    setLoading(true);
    setError("");
    try {
      const result = await requestApi<Secrets>("/api/auth", {
        action: "register",
        ...values,
        language,
      });
      setSecrets(result);
      setPending(false);
    } catch (cause) {
      setError(authError(cause, language));
    } finally {
      setLoading(false);
    }
  });
  const submitSecret = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "recover") {
        const result = await requestApi<Secrets>("/api/auth", {
          action: "recover",
          recoveryCode: token,
        });
        setToken("");
        setSecrets(result);
      } else {
        const result = await requestApi<{ registration_complete?: boolean }>(
          "/api/auth",
          { action: "login", token },
        );
        setToken("");
        router.replace(
          result.registration_complete === false ? "/register?step=save" : "/",
        );
        router.refresh();
      }
    } catch (cause) {
      setError(authError(cause, language));
    } finally {
      setLoading(false);
    }
  };
  const paste = async () => {
    try {
      setToken((await navigator.clipboard.readText()).trim());
    } catch {
      toast.error(t(language, "auth.pasteHelp"));
    }
  };
  const title = t(
    language,
    secrets
      ? "auth.keysTitle"
      : pending
        ? "auth.pendingTitle"
        : mode === "register"
          ? "auth.registerTitle"
          : mode === "recover"
            ? "auth.recoverTitle"
            : "auth.loginTitle",
  );
  const intro = t(
    language,
    secrets
      ? "auth.secretsIntro"
      : pending
        ? "auth.pendingIntro"
        : mode === "register"
          ? "auth.registerIntro"
          : mode === "recover"
            ? "auth.recoverIntro"
            : "auth.loginIntro",
  );

  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Link href="/login">
          <Logo />
        </Link>
        <div className="auth-story-content">
          <div className="auth-kicker">{t(language, "auth.kicker")}</div>
          <h1>
            {t(language, "auth.stayPresent")}
            <br />
            <span>{t(language, "auth.stayAhead")}</span>
          </h1>
          <p>{t(language, "auth.story")}</p>
          <div className="auth-feature">
            <CalendarDays size={19} />
            {t(language, "auth.timetableFeature")}
          </div>
          <div className="auth-feature">
            <Activity size={19} />
            {t(language, "auth.riskFeature")}
          </div>
          <div className="auth-feature">
            <ShieldCheck size={19} />
            {t(language, "auth.privacyFeature")}
          </div>
          <div className="auth-planner" aria-hidden="true">
            <div className="planner-top">
              <span>
                {language === "fr"
                  ? "Une semaine à la fois"
                  : "One week at a time"}
              </span>
              <CalendarDays />
            </div>
            <div className="planner-grid">
              {(language === "fr"
                ? ["LUN", "MAR", "MER"]
                : ["MON", "TUE", "WED"]
              ).map((day, index) => (
                <div key={day}>
                  <div className="planner-day">{day}</div>
                  <div className={`planner-entry ${index === 1 ? "rust" : ""}`}>
                    <strong>{["08:30", "10:00", "09:00"][index]}</strong>
                    {
                      (language === "fr"
                        ? ["Réseaux · TD", "Algorithmique", "Bases de données"]
                        : ["Networks · TD", "Algorithms", "Databases"])[index]
                    }
                  </div>
                  <div
                    className={`planner-entry ${index === 1 ? "blank" : "rust"}`}
                  >
                    {index !== 1 && (
                      <>
                        <strong>{index === 0 ? "13:00" : "14:30"}</strong>
                        {language === "fr"
                          ? "Travaux pratiques"
                          : "Practical session"}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="planner-note">
              {language === "fr"
                ? "Un peu plus de clarté."
                : "A little more room to breathe."}
            </div>
          </div>
        </div>
        <div className="auth-story-foot">
          <ShieldCheck size={14} />
          {t(language, "auth.storyFooter")}
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-content">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
              marginBottom: 24,
            }}
          >
            <Languages size={16} className="muted" aria-hidden="true" />
            <label className="sr-only" htmlFor="auth-language">
              {t(language, "language")}
            </label>
            <select
              id="auth-language"
              className="input"
              style={{ width: "auto", minWidth: 120 }}
              value={language}
              onChange={(event) =>
                changeLanguage(event.target.value as Language)
              }
            >
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </div>
          <Link href="/login" className="auth-mini-brand">
            <Logo />
          </Link>
          <span className="badge badge-info">
            <KeyRound size={12} />
            {t(
              language,
              secrets
                ? "auth.badgeSecrets"
                : mode === "register"
                  ? "auth.badgeRegister"
                  : mode === "recover"
                    ? "auth.badgeRecover"
                    : "auth.badgeLogin",
            )}
          </span>
          {localDemo && (
            <div className="notice notice-info" role="status">
              <KeyRound size={18} />
              <div>
                <strong>
                  {language === "fr"
                    ? "Connexion de test locale"
                    : "Local testing login"}
                </strong>
                <p>
                  {language === "fr"
                    ? "Utilisez ce jeton pour ouvrir les données fictives :"
                    : "Use this token to open the synthetic demo:"}{" "}
                  <code>ABS-LOCAL-DEMO</code>
                </p>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setToken("ABS-LOCAL-DEMO")}
                >
                  {language === "fr" ? "Remplir le jeton" : "Fill demo token"}
                </button>
              </div>
            </div>
          )}
          <h2>{title}</h2>
          <p>{intro}</p>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {secrets ? (
            <>
              <div className="notice notice-info">
                <LockKeyhole size={18} />
                <div>
                  <strong>{t(language, "auth.keepPrivate")}</strong>
                  <p>{t(language, "auth.secretsWarning")}</p>
                </div>
              </div>
              <SecretDisplay secrets={secrets} language={language} />
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={saved}
                  onChange={(event) => setSaved(event.target.checked)}
                />
                <span>{t(language, "auth.savedSeparately")}</span>
              </label>
              <button
                className="btn btn-primary"
                disabled={!saved || loading}
                onClick={finish}
              >
                {loading ? <span className="spinner" /> : <Check size={17} />}{" "}
                {t(language, "auth.openWorkspace")}
              </button>
            </>
          ) : pending ? (
            <>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={saved}
                  onChange={(event) => setSaved(event.target.checked)}
                />
                <span>{t(language, "auth.savedCredentials")}</span>
              </label>
              <button
                className="btn btn-primary"
                disabled={!saved || loading}
                onClick={finish}
              >
                {t(language, "auth.completeRegistration")}
              </button>
              <div className="auth-footer">
                <Link href="/recover">
                  {t(language, "auth.recoverWithCode")}
                </Link>
              </div>
            </>
          ) : mode === "register" ? (
            <form onSubmit={submitRegistration} noValidate>
              <div className="form-grid">
                <div className="field span-2">
                  <label htmlFor="full_name">{t(language, "fullName")}</label>
                  <input
                    id="full_name"
                    autoComplete="name"
                    placeholder={t(language, "auth.namePlaceholder")}
                    className="input"
                    {...register("full_name")}
                  />
                  {errors.full_name && (
                    <span className="field-error">
                      {errors.full_name.message}
                    </span>
                  )}
                </div>
                <div className="field span-2">
                  <label htmlFor="student_identifier">
                    {t(language, "auth.studentIdentifier")}{" "}
                    <span className="muted">
                      {t(language, "auth.optional")}
                    </span>
                  </label>
                  <input
                    id="student_identifier"
                    className="input"
                    placeholder={t(language, "auth.identifierPlaceholder")}
                    {...register("student_identifier")}
                  />
                  {errors.student_identifier && (
                    <span className="field-error">
                      {errors.student_identifier.message}
                    </span>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="academic_year">
                    {t(language, "academicYear")}
                  </label>
                  <select
                    id="academic_year"
                    className="input"
                    {...register("academic_year")}
                  >
                    {[year - 1, year, year + 1].map((value) => (
                      <option key={value}>
                        {value}–{value + 1}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="semester">{t(language, "semester")}</label>
                  <select
                    id="semester"
                    className="input"
                    {...register("semester")}
                  >
                    {Array.from({ length: 10 }, (_, index) => {
                      const value = `Semester ${index + 1}`;
                      return (
                        <option key={value} value={value}>
                          {semesterLabel(value, language)}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="department">
                    {t(language, "department")}
                  </label>
                  <select
                    id="department"
                    className="input"
                    {...register("department")}
                  >
                    <option value="" disabled>{t(language, "auth.departmentPlaceholder")}</option>
                    {DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
                  </select>
                  {errors.department && (
                    <span className="field-error">
                      {errors.department.message}
                    </span>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="group_name">{t(language, "group")}</label>
                  <select
                    id="group_name"
                    className="input"
                    {...register("group_name")}
                  >
                    <option value="" disabled>{t(language, "auth.groupPlaceholder")}</option>
                    {GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
                  </select>
                  {errors.group_name && (
                    <span className="field-error">
                      {errors.group_name.message}
                    </span>
                  )}
                </div>
              </div>
              <button className="btn btn-primary" disabled={loading}>
                {loading ? (
                  <span className="spinner" />
                ) : (
                  <KeyRound size={17} />
                )}{" "}
                {t(language, "auth.createWorkspace")}
              </button>
            </form>
          ) : (
            <form onSubmit={submitSecret}>
              <div className="field">
                <label htmlFor="access-token">
                  {t(
                    language,
                    mode === "recover"
                      ? "auth.recoveryCode"
                      : "auth.accessToken",
                  )}
                </label>
                <div className="token-input">
                  <input
                    id="access-token"
                    type={show ? "text" : "password"}
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    className="input mono"
                    placeholder={
                      mode === "recover"
                        ? "REC-••••-••••-••••-••••"
                        : "ABS-••••-••••-••••-••••"
                    }
                    autoComplete="off"
                    spellCheck={false}
                    required
                    maxLength={100}
                  />
                  <div className="token-input-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      title={t(language, "auth.paste")}
                      aria-label={t(language, "auth.paste")}
                      onClick={paste}
                    >
                      <Clipboard size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={t(
                        language,
                        show ? "auth.hideToken" : "auth.showToken",
                      )}
                      onClick={() => setShow(!show)}
                    >
                      {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <small>
                  {t(
                    language,
                    mode === "recover" ? "auth.recoveryHelp" : "auth.tokenHelp",
                  )}
                </small>
              </div>
              <button
                className="btn btn-primary"
                disabled={loading || !token.trim()}
              >
                {loading ? (
                  <span className="spinner" />
                ) : (
                  <LockKeyhole size={16} />
                )}{" "}
                {t(
                  language,
                  mode === "recover" ? "auth.recoverAccount" : "auth.login",
                )}
              </button>
            </form>
          )}
          {!secrets && !pending && (
            <>
              <div className="auth-footer">
                {mode === "register" ? (
                  <>
                    {t(language, "auth.existingWorkspace")}{" "}
                    <Link href="/login">{t(language, "auth.loginLink")}</Link>
                  </>
                ) : mode === "recover" ? (
                  <Link href="/login">{t(language, "auth.backLogin")}</Link>
                ) : (
                  <>
                    {t(language, "auth.newHere")}{" "}
                    <Link href="/register">
                      {t(language, "auth.createAccount")}
                    </Link>
                  </>
                )}
              </div>
              {mode === "login" && (
                <div className="auth-footer" style={{ marginTop: 12 }}>
                  <Link href="/recover">{t(language, "auth.lostToken")}</Link>
                </div>
              )}
              <div className="auth-divider">
                <ShieldCheck size={17} />
                <span>
                  {t(
                    language,
                    mode === "recover"
                      ? "auth.recoveryLimit"
                      : "auth.securityHelp",
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
