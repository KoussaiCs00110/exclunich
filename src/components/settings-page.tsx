"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Bell,
  Check,
  Database,
  Download,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "./workspace";
import { Modal } from "./modal";
import { SecretDisplay } from "./auth-page";
import { downloadFile, requestApi } from "@/lib/client";
import { t } from "@/lib/i18n";

const settingsSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name.").max(100),
  student_identifier: z.string().trim().max(60),
  academic_year: z.string().trim().min(1).max(30),
  department: z.string().trim().min(1).max(100),
  group_name: z.string().trim().min(1).max(40),
  semester: z.string().trim().min(1).max(30),
  timezone: z.string().min(1),
  language: z.enum(["en", "fr"]),
  theme: z.enum(["dark", "light", "system"]),
  total_threshold: z.number().int().min(1).max(50),
  unjustified_threshold: z.number().int().min(1).max(50),
  show_sunday: z.boolean(),
  notifications_enabled: z.boolean(),
});
type SettingsForm = z.infer<typeof settingsSchema>;
type Section = "profile" | "preferences" | "rules" | "security" | "data";
type SecretAction = "rotate_token" | "rotate_recovery";

export function SettingsPage() {
  const { data, mutate, refresh } = useWorkspace();
  const router = useRouter();
  const [section, setSection] = useState<Section>("profile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secretAction, setSecretAction] = useState<SecretAction | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const lang = data.student.language;
  const phrase = (en: string, fr: string) => (lang === "fr" ? fr : en);
  const defaults = useMemo(
    (): SettingsForm => ({
      full_name: data.student.full_name,
      student_identifier: data.student.student_identifier ?? "",
      academic_year: data.student.academic_year,
      department: data.student.department,
      group_name: data.student.group_name,
      semester: data.student.semester,
      timezone: data.student.timezone,
      language: data.student.language,
      theme: data.student.theme,
      total_threshold: data.student.total_threshold,
      unjustified_threshold: data.student.unjustified_threshold,
      show_sunday: data.student.show_sunday,
      notifications_enabled: data.student.notifications_enabled,
    }),
    [data.student],
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: defaults,
  });
  useEffect(() => {
    if (!isDirty) reset(defaults);
  }, [defaults, isDirty, reset]);
  const timezones = useMemo(() => {
    try {
      return [
        ...new Set([
          "Africa/Algiers",
          "UTC",
          data.student.timezone,
          ...Intl.supportedValuesOf("timeZone"),
        ]),
      ];
    } catch {
      return [
        ...new Set([
          "Africa/Algiers",
          "UTC",
          data.student.timezone,
          "Europe/Paris",
          "Europe/London",
          "Asia/Dubai",
          "America/New_York",
        ]),
      ];
    }
  }, [data.student.timezone]);

  const save = handleSubmit(
    async (values: SettingsForm) => {
      setBusy(true);
      setError("");
      try {
        const changingTerm =
          values.semester !== data.student.semester ||
          values.academic_year !== data.student.academic_year;
        await mutate("profile_save", values);
        reset(values);
        toast.success(
          changingTerm
            ? phrase(
                "New term saved. Previous modules and timetable archived.",
                "Nouvelle période enregistrée. Les anciens modules et l’emploi du temps ont été archivés.",
              )
            : phrase("Settings saved", "Paramètres enregistrés"),
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Your settings could not be saved.",
        );
      } finally {
        setBusy(false);
      }
    },
    () => {
      setError(
        phrase(
          "Check the highlighted fields before saving.",
          "Vérifiez les champs signalés avant d’enregistrer.",
        ),
      );
    },
  );

  const sections = [
    { id: "profile", label: t(lang, "profile"), icon: UserRound },
    {
      id: "preferences",
      label: phrase("Preferences", "Préférences"),
      icon: Globe2,
    },
    {
      id: "rules",
      label: phrase("Exclusion rules", "Règles d’exclusion"),
      icon: SlidersHorizontal,
    },
    {
      id: "security",
      label: phrase("Access & recovery", "Accès et récupération"),
      icon: LockKeyhole,
    },
    {
      id: "data",
      label: phrase("Data & privacy", "Données et confidentialité"),
      icon: Database,
    },
  ] as const;
  const years = [
    ...new Set([
      data.student.academic_year,
      ...Array.from(
        { length: 5 },
        (_, index) =>
          `${new Date().getFullYear() - 2 + index}–${new Date().getFullYear() - 1 + index}`,
      ),
    ]),
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {phrase("MAKE IT YOURS", "VOTRE ESPACE")}
          </span>
          <h1>{t(lang, "settings")}</h1>
          <p>
            {phrase(
              "Your profile, preferences, and peace of mind.",
              "Votre profil, vos préférences et votre sérénité.",
            )}
          </p>
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            try {
              await requestApi("/api/auth", { action: "logout" });
              router.replace("/login");
              router.refresh();
            } catch (cause) {
              toast.error((cause as Error).message);
            }
          }}
        >
          {t(lang, "logout")}
        </button>
      </div>
      <div className="settings-grid">
        <nav
          className="settings-nav"
          aria-label={phrase("Settings sections", "Rubriques des paramètres")}
        >
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={section === id ? "active" : ""}
              aria-current={section === id ? "page" : undefined}
              onClick={() => {
                setSection(id);
                setError("");
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <section className="card settings-section">
          {section === "profile" && (
            <>
              <h2>{t(lang, "profile")}</h2>
              <p>
                {phrase(
                  "Keep your academic details up to date.",
                  "Gardez vos informations universitaires à jour.",
                )}
              </p>
              <form onSubmit={save} noValidate>
                <div className="form-grid">
                  <div className="field span-2">
                    <label htmlFor="settings-full-name">
                      {t(lang, "fullName")}
                    </label>
                    <input
                      id="settings-full-name"
                      className="input"
                      autoComplete="name"
                      {...register("full_name")}
                    />
                    {errors.full_name && (
                      <span className="field-error">
                        {errors.full_name.message}
                      </span>
                    )}
                  </div>
                  <div className="field span-2">
                    <label htmlFor="settings-student-id">
                      {phrase("Student identifier", "Identifiant étudiant")}{" "}
                      <span className="muted">
                        {phrase("(optional)", "(facultatif)")}
                      </span>
                    </label>
                    <input
                      id="settings-student-id"
                      className="input"
                      {...register("student_identifier")}
                    />
                    {errors.student_identifier && (
                      <span className="field-error">
                        {errors.student_identifier.message}
                      </span>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="settings-year">
                      {t(lang, "academicYear")}
                    </label>
                    <select
                      id="settings-year"
                      className="input"
                      {...register("academic_year")}
                    >
                      {years.map((year) => (
                        <option key={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="settings-semester">
                      {t(lang, "semester")}
                    </label>
                    <select
                      id="settings-semester"
                      className="input"
                      {...register("semester")}
                    >
                      {[
                        ...new Set([
                          data.student.semester,
                          ...Array.from(
                            { length: 10 },
                            (_, index) => `Semester ${index + 1}`,
                          ),
                        ]),
                      ].map((semester) => (
                        <option key={semester}>{semester}</option>
                      ))}
                    </select>
                  </div>
                  <p className="muted span-2">
                    {phrase(
                      "Changing your semester or academic year automatically archives your current modules and timetable. Your attendance history stays saved. Add or import the new term’s modules and sessions afterward.",
                      "Changer de semestre ou d’année universitaire archive automatiquement vos modules et votre emploi du temps actuels. Votre historique de présence est conservé. Ajoutez ou importez ensuite les modules et séances de la nouvelle période.",
                    )}
                  </p>
                  <div className="field">
                    <label htmlFor="settings-department">
                      {t(lang, "department")}
                    </label>
                    <input
                      id="settings-department"
                      className="input"
                      {...register("department")}
                    />
                    {errors.department && (
                      <span className="field-error">
                        {errors.department.message}
                      </span>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="settings-group">{t(lang, "group")}</label>
                    <input
                      id="settings-group"
                      className="input"
                      {...register("group_name")}
                    />
                    {errors.group_name && (
                      <span className="field-error">
                        {errors.group_name.message}
                      </span>
                    )}
                  </div>
                </div>
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busy || !isDirty}
                  >
                    {busy
                      ? phrase("Saving…", "Enregistrement…")
                      : t(lang, "save")}
                  </button>
                </div>
              </form>
            </>
          )}

          {section === "preferences" && (
            <>
              <h2>
                {phrase("Everyday preferences", "Préférences quotidiennes")}
              </h2>
              <p>
                {phrase(
                  "Set up your workspace for the way you study.",
                  "Adaptez votre espace à votre façon d’étudier.",
                )}
              </p>
              <form onSubmit={save}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="settings-theme">{t(lang, "theme")}</label>
                    <select
                      id="settings-theme"
                      className="input"
                      {...register("theme")}
                    >
                      <option value="dark">{t(lang, "dark")}</option>
                      <option value="light">{t(lang, "light")}</option>
                      <option value="system">{t(lang, "system")}</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="settings-language">
                      {t(lang, "language")}
                    </label>
                    <select
                      id="settings-language"
                      className="input"
                      {...register("language")}
                    >
                      <option value="en">English</option>
                      <option value="fr">Français</option>
                    </select>
                  </div>
                  <div className="field span-2">
                    <label htmlFor="settings-timezone">
                      {t(lang, "timezone")}
                    </label>
                    <select
                      id="settings-timezone"
                      className="input"
                      {...register("timezone")}
                    >
                      {timezones.map((zone) => (
                        <option key={zone}>{zone}</option>
                      ))}
                    </select>
                    <small>
                      {phrase(
                        "Changing timezone changes how dates are displayed. Saved session instants stay the same.",
                        "Le fuseau modifie l’affichage des dates. Les instants des séances déjà enregistrées restent identiques.",
                      )}
                    </small>
                  </div>
                  <label className="checkbox-row span-2">
                    <input
                      type="checkbox"
                      {...register("notifications_enabled")}
                    />
                    <span>
                      {phrase(
                        "Enable in-app attendance alerts and session reminders",
                        "Activer les alertes de présence et les rappels de séance dans l’application",
                      )}
                    </span>
                  </label>
                </div>
                <div className="notice notice-info">
                  <Bell size={18} />
                  <div>
                    <strong>
                      {phrase(
                        "Stay informed while using Exclunich",
                        "Restez informé dans Exclunich",
                      )}
                    </strong>
                    <p>
                      {phrase(
                        "In-app reminders refresh when you open or use the app. Browser push notifications are not enabled.",
                        "Les rappels se mettent à jour lorsque vous ouvrez ou utilisez l’application. Les notifications push du navigateur ne sont pas activées.",
                      )}
                    </p>
                  </div>
                </div>
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busy || !isDirty}
                  >
                    {busy
                      ? phrase("Saving…", "Enregistrement…")
                      : t(lang, "save")}
                  </button>
                </div>
              </form>
            </>
          )}

          {section === "rules" && (
            <>
              <h2>{phrase("Exclusion thresholds", "Seuils d’exclusion")}</h2>
              <p>
                {phrase(
                  "Set the default limits used by your attendance risk engine.",
                  "Définissez les limites par défaut de votre suivi du risque d’exclusion.",
                )}
              </p>
              <div className="notice notice-warning">
                <ShieldAlert size={20} />
                <div>
                  <strong>
                    {phrase(
                      "Reaching either limit triggers exclusion",
                      "Atteindre une des limites entraîne l’exclusion",
                    )}
                  </strong>
                  <p>
                    {phrase(
                      "NSCS defaults: 3 unjustified absences or 5 total absences in one module. Justified absences still count toward the total.",
                      "Valeurs NSCS par défaut : 3 absences non justifiées ou 5 absences au total dans un module. Les absences justifiées comptent dans le total.",
                    )}
                  </p>
                </div>
              </div>
              <form onSubmit={save}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="settings-total-threshold">
                      {t(lang, "totalLimit")}
                    </label>
                    <input
                      id="settings-total-threshold"
                      type="number"
                      className="input"
                      min={1}
                      max={50}
                      step={1}
                      {...register("total_threshold", { valueAsNumber: true })}
                    />
                    {errors.total_threshold && (
                      <span className="field-error">
                        {errors.total_threshold.message}
                      </span>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="settings-unjustified-threshold">
                      {t(lang, "unjustifiedLimit")}
                    </label>
                    <input
                      id="settings-unjustified-threshold"
                      type="number"
                      className="input"
                      min={1}
                      max={50}
                      step={1}
                      {...register("unjustified_threshold", {
                        valueAsNumber: true,
                      })}
                    />
                    {errors.unjustified_threshold && (
                      <span className="field-error">
                        {errors.unjustified_threshold.message}
                      </span>
                    )}
                  </div>
                </div>
                <p
                  className="muted"
                  style={{ marginTop: 18, fontSize: 14, lineHeight: 1.7 }}
                >
                  {phrase(
                    "Warnings appear one absence before either threshold. Module-specific overrides take priority. Updating these limits recalculates your risks immediately; confirm the official rules with your department.",
                    "Les alertes apparaissent une absence avant chaque seuil. Les limites propres à un module sont prioritaires. Toute modification recalcule immédiatement vos risques ; vérifiez les règles officielles auprès de votre département.",
                  )}
                </p>
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busy || !isDirty}
                  >
                    {busy
                      ? phrase("Saving…", "Enregistrement…")
                      : t(lang, "save")}
                  </button>
                </div>
              </form>
            </>
          )}

          {section === "security" && (
            <>
              <h2>{phrase("Access & recovery", "Accès et récupération")}</h2>
              <p>
                {phrase(
                  "Your credentials belong to you. Exclunich only stores cryptographic hashes.",
                  "Vos identifiants vous appartiennent. Exclunich conserve uniquement leurs empreintes cryptographiques.",
                )}
              </p>
              <div className="notice notice-info">
                <ShieldCheck size={19} />
                <div>
                  <strong>
                    {phrase(
                      "Save your recovery code separately",
                      "Conservez votre code de récupération séparément",
                    )}
                  </strong>
                  <p>
                    {phrase(
                      "If your token is lost, your single-use recovery code creates a new token and recovery code, and revokes every existing session.",
                      "En cas de perte du jeton, votre code à usage unique génère un nouveau jeton et un nouveau code, puis révoque toutes les sessions.",
                    )}
                  </p>
                </div>
              </div>
              <div className="security-row">
                <div>
                  <h3>{phrase("Access token", "Jeton d’accès")}</h3>
                  <p>
                    {phrase(
                      "Generate a new access token. Your previous token and all other sessions stop working immediately.",
                      "Générez un nouveau jeton. L’ancien jeton et les autres sessions cessent de fonctionner immédiatement.",
                    )}
                  </p>
                </div>
                <button
                  className="btn"
                  type="button"
                  onClick={() => setSecretAction("rotate_token")}
                >
                  <KeyRound size={16} />
                  {phrase("Regenerate token", "Régénérer le jeton")}
                </button>
              </div>
              <div className="security-row">
                <div>
                  <h3>{t(lang, "recoveryCode")}</h3>
                  <p>
                    {phrase(
                      "Replace your recovery code if you lost it or suspect it was exposed. The previous recovery code is invalidated.",
                      "Remplacez le code si vous l’avez perdu ou s’il a pu être exposé. L’ancien code devient invalide.",
                    )}
                  </p>
                </div>
                <button
                  className="btn"
                  type="button"
                  onClick={() => setSecretAction("rotate_recovery")}
                >
                  <LockKeyhole size={16} />
                  {phrase("Replace code", "Remplacer le code")}
                </button>
              </div>
              <p
                className="muted"
                style={{ fontSize: 13, lineHeight: 1.7, marginTop: 20 }}
              >
                {phrase(
                  "Both actions require your current access token. If both the token and recovery code are lost, Exclunich cannot securely verify ownership or restore access.",
                  "Ces actions nécessitent votre jeton actuel. Si le jeton et le code sont tous deux perdus, Exclunich ne peut pas vérifier votre identité ni rétablir l’accès en toute sécurité.",
                )}
              </p>
            </>
          )}

          {section === "data" && (
            <>
              <h2>
                {phrase(
                  "Your data. Your control.",
                  "Vos données, votre contrôle.",
                )}
              </h2>
              <p>
                {phrase(
                  "Take a copy of your workspace or permanently delete your account.",
                  "Téléchargez une copie de votre espace ou supprimez définitivement votre compte.",
                )}
              </p>
              <div className="security-row">
                <div>
                  <h3>
                    {phrase(
                      "Download a complete data export",
                      "Télécharger toutes vos données",
                    )}
                  </h3>
                  <p>
                    {phrase(
                      "A JSON file with your profile, modules, timetable, attendance, notifications, and change history. Access tokens and recovery codes are never included.",
                      "Un fichier JSON contenant votre profil, vos modules, séances, présences, notifications et historique. Aucun jeton ni code de récupération n’est inclus.",
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    downloadFile(
                      JSON.stringify(
                        {
                          exported_at: new Date().toISOString(),
                          application: "Exclunich",
                          ...data,
                        },
                        null,
                        2,
                      ),
                      `Exclunich-data-${new Date().toISOString().slice(0, 10)}.json`,
                      "application/json",
                    );
                    toast.success(
                      phrase("Data export downloaded", "Export téléchargé"),
                    );
                  }}
                >
                  <Download size={16} />
                  {phrase("Export JSON", "Exporter en JSON")}
                </button>
              </div>
              <div className="security-row">
                <div>
                  <h3 className="text-danger">
                    {phrase(
                      "Permanently delete account",
                      "Supprimer définitivement le compte",
                    )}
                  </h3>
                  <p>
                    {phrase(
                      "Deletes all student data and revokes every credential and session. This action cannot be undone.",
                      "Supprime toutes vos données et révoque tous les identifiants et sessions. Cette action est irréversible.",
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 size={16} />
                  {phrase("Delete account", "Supprimer le compte")}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
      {secretAction && (
        <SecurityModal
          action={secretAction}
          onClose={() => setSecretAction(null)}
          onComplete={refresh}
          language={lang}
        />
      )}
      {deleteOpen && (
        <DeleteAccountModal
          onClose={() => setDeleteOpen(false)}
          language={lang}
        />
      )}
    </>
  );
}

function SecurityModal({
  action,
  onClose,
  onComplete,
  language,
}: {
  action: SecretAction;
  onClose: () => void;
  onComplete: () => Promise<void>;
  language: "en" | "fr";
}) {
  const [currentToken, setCurrentToken] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secrets, setSecrets] = useState<{
    token?: string;
    recoveryCode?: string;
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const phrase = (en: string, fr: string) => (language === "fr" ? fr : en);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await requestApi<{
        token?: string;
        recoveryCode?: string;
      }>("/api/auth", { action, currentToken });
      setSecrets(result);
      setCurrentToken("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Credentials could not be replaced.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    if (!saved) return;
    setBusy(true);
    try {
      await onComplete();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Refresh failed. Your new credential is still active.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        secrets
          ? phrase(
              "Save your new credential",
              "Enregistrez votre nouvel identifiant",
            )
          : action === "rotate_token"
            ? phrase("Regenerate access token", "Régénérer le jeton d’accès")
            : phrase(
                "Replace recovery code",
                "Remplacer le code de récupération",
              )
      }
      description={
        secrets
          ? phrase(
              "Shown only once. Your previous credential is already invalid.",
              "Affiché une seule fois. L’ancien identifiant est déjà invalide.",
            )
          : phrase(
              "Confirm your current access token to continue.",
              "Confirmez votre jeton actuel pour continuer.",
            )
      }
      onClose={() => {
        if (!busy && (!secrets || saved)) onClose();
      }}
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {secrets ? (
        <>
          <SecretDisplay secrets={secrets} language={language} />
          <label className="checkbox-row" style={{ marginTop: 18 }}>
            <input
              type="checkbox"
              checked={saved}
              onChange={(event) => setSaved(event.target.checked)}
            />
            <span>
              {phrase(
                "I saved this new credential in a secure place.",
                "J’ai enregistré cet identifiant dans un endroit sûr.",
              )}
            </span>
          </label>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              type="button"
              disabled={!saved || busy}
              onClick={finish}
            >
              <Check size={16} />
              {busy
                ? phrase("Finishing…", "Finalisation…")
                : phrase("Done", "Terminé")}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="notice notice-warning">
            <ShieldAlert size={18} />
            <div>
              <p>
                {action === "rotate_token"
                  ? phrase(
                      "Your old token and all other sessions will be revoked immediately. Save the replacement before closing this window.",
                      "L’ancien jeton et les autres sessions seront révoqués immédiatement. Enregistrez le nouveau jeton avant de fermer.",
                    )
                  : phrase(
                      "Your old recovery code will stop working immediately. Your access token stays the same.",
                      "L’ancien code cessera de fonctionner immédiatement. Votre jeton d’accès reste identique.",
                    )}
              </p>
            </div>
          </div>
          <div className="field">
            <label htmlFor="security-current-token">
              {phrase("Current access token", "Jeton d’accès actuel")}
            </label>
            <div className="token-input">
              <input
                id="security-current-token"
                type={show ? "text" : "password"}
                className="input mono"
                value={currentToken}
                onChange={(event) => setCurrentToken(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                required
                maxLength={100}
              />
              <div className="token-input-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={show ? "Hide access token" : "Show access token"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              {t(language, "cancel")}
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy || !currentToken.trim()}
            >
              {busy
                ? phrase("Replacing…", "Remplacement…")
                : phrase("Generate replacement", "Générer le remplacement")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function DeleteAccountModal({
  onClose,
  language,
}: {
  onClose: () => void;
  language: "en" | "fr";
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const phrase = (en: string, fr: string) => (language === "fr" ? fr : en);
  async function remove(event: React.FormEvent) {
    event.preventDefault();
    if (confirmation !== "DELETE") return;
    setBusy(true);
    setError("");
    try {
      await requestApi("/api/data", {
        action: "account_delete",
        currentToken: token,
        confirmation,
      });
      setToken("");
      router.replace("/login");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Account deletion failed.",
      );
      setBusy(false);
    }
  }
  return (
    <Modal
      title={phrase(
        "Delete your Exclunich account?",
        "Supprimer votre compte Exclunich ?",
      )}
      description={phrase(
        "This permanently deletes all your student data. There is no undo.",
        "Toutes vos données seront supprimées définitivement, sans retour possible.",
      )}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={remove}>
        <div className="field">
          <label htmlFor="delete-current-token">
            {phrase("Current access token", "Jeton d’accès actuel")}
          </label>
          <input
            id="delete-current-token"
            className="input mono"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            required
            maxLength={100}
          />
        </div>
        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="delete-confirmation">
            {phrase(
              "Type DELETE to confirm",
              "Saisissez DELETE pour confirmer",
            )}
          </label>
          <input
            id="delete-confirmation"
            className="input"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            required
            pattern="DELETE"
          />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            {t(language, "cancel")}
          </button>
          <button
            className="btn btn-danger"
            type="submit"
            disabled={busy || !token.trim() || confirmation !== "DELETE"}
          >
            <Trash2 size={16} />
            {busy
              ? phrase("Deleting…", "Suppression…")
              : phrase("Delete permanently", "Supprimer définitivement")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default SettingsPage;
