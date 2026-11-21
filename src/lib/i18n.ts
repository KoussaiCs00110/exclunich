import type { Language } from "./types";
import { uiMessages, type UiKey } from "./i18n-ui";
import { authMessages, type AuthMessageKey } from "./i18n-auth";

export const messages = {
  en: {
    dashboard: "Dashboard",
    timetable: "My Timetable",
    modules: "My Modules",
    history: "Attendance History",
    statistics: "Statistics",
    notifications: "Notifications",
    settings: "Settings",
    logout: "Log out",
    semester: "Semester",
    academicYear: "Academic year",
    fullName: "Full name",
    department: "Department",
    group: "Group",
    profile: "Student profile",
    save: "Save changes",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    archive: "Archive",
    restore: "Restore",
    addModule: "Add module",
    addSession: "Add session",
    present: "Present",
    justified: "Justified absence",
    unjustified: "Unjustified absence",
    cancelled: "Cancelled",
    safe: "Safe",
    warning: "Warning",
    excluded: "Excluded",
    critical: "Critical",
    attendance: "Attendance",
    attendanceRate: "Attendance rate",
    absences: "Absences",
    totalAbsences: "Total absences",
    totalModules: "Total modules",
    sessions: "Sessions",
    upcomingSessions: "Upcoming sessions",
    moduleRisk: "Exclusion risk",
    noModules: "Your semester starts here",
    noModulesDescription:
      "Add your first module, then build your weekly timetable.",
    noSessions: "No sessions scheduled",
    noAttendance: "No attendance recorded yet",
    unknownRate: "No records yet",
    unrecorded: "Unrecorded",
    remaining: "Remaining",
    simulateJustified: "Simulate justified absence",
    simulateUnjustified: "Simulate unjustified absence",
    hypothetical: "Hypothetical simulation — your records are unchanged.",
    alreadyExcluded: "Already excluded",
    exclusionBoth:
      "Missing this session would trigger exclusion regardless of justification.",
    simulationSafe: "Your projected attendance remains within the limits.",
    simulationWarning:
      "Missing this session would put this module in the warning zone.",
    simulationExcluded: "Missing this session would trigger exclusion.",
    totalLimit: "Total absence limit",
    unjustifiedLimit: "Unjustified absence limit",
    language: "Language",
    timezone: "Timezone",
    theme: "Theme",
    dark: "Dark",
    light: "Light",
    system: "System",
    dataExport: "Export my data",
    regenerateToken: "Regenerate access token",
    recoveryCode: "Recovery code",
    markAllRead: "Mark all as read",
    markRead: "Mark as read",
    all: "All",
    search: "Search",
    exportCsv: "Export CSV",
    exportPdf: "Export PDF",
    fromDate: "From",
    toDate: "To",
    weekly: "Weekly",
    monthly: "Monthly",
    attendanceEvolution: "Attendance over time",
    attendanceByModule: "Attendance by module",
    absenceDistribution: "Absence distribution",
    riskDistribution: "Module risk distribution",
    attendanceByType: "Attendance by session type",
    absencesByModule: "Absences by module",
    filteredResults: "Filtered results",
    loading: "Loading your semester…",
    error: "Something went wrong. Please try again.",
  },
  fr: {
    dashboard: "Tableau de bord",
    timetable: "Mon emploi du temps",
    modules: "Mes modules",
    history: "Historique des présences",
    statistics: "Statistiques",
    notifications: "Notifications",
    settings: "Paramètres",
    logout: "Se déconnecter",
    semester: "Semestre",
    academicYear: "Année universitaire",
    fullName: "Nom complet",
    department: "Département",
    group: "Groupe",
    profile: "Profil étudiant",
    save: "Enregistrer",
    cancel: "Annuler",
    delete: "Supprimer",
    edit: "Modifier",
    archive: "Archiver",
    restore: "Restaurer",
    addModule: "Ajouter un module",
    addSession: "Ajouter une séance",
    present: "Présent",
    justified: "Absence justifiée",
    unjustified: "Absence non justifiée",
    cancelled: "Annulée",
    safe: "Sûr",
    warning: "Attention",
    excluded: "Exclu",
    critical: "Critique",
    attendance: "Présence",
    attendanceRate: "Taux de présence",
    absences: "Absences",
    totalAbsences: "Total des absences",
    totalModules: "Total des modules",
    sessions: "Séances",
    upcomingSessions: "Prochaines séances",
    moduleRisk: "Risque d’exclusion",
    noModules: "Votre semestre commence ici",
    noModulesDescription:
      "Ajoutez votre premier module, puis créez votre emploi du temps.",
    noSessions: "Aucune séance prévue",
    noAttendance: "Aucune présence enregistrée",
    unknownRate: "Aucun enregistrement",
    unrecorded: "Non renseigné",
    remaining: "Restant",
    simulateJustified: "Simuler une absence justifiée",
    simulateUnjustified: "Simuler une absence non justifiée",
    hypothetical: "Simulation hypothétique — vos données restent inchangées.",
    alreadyExcluded: "Déjà exclu",
    exclusionBoth:
      "Manquer cette séance entraînerait une exclusion, même avec un justificatif.",
    simulationSafe: "Votre présence projetée reste dans les limites.",
    simulationWarning:
      "Manquer cette séance placerait ce module en zone d’alerte.",
    simulationExcluded: "Manquer cette séance entraînerait une exclusion.",
    totalLimit: "Limite totale des absences",
    unjustifiedLimit: "Limite des absences non justifiées",
    language: "Langue",
    timezone: "Fuseau horaire",
    theme: "Thème",
    dark: "Sombre",
    light: "Clair",
    system: "Système",
    dataExport: "Exporter mes données",
    regenerateToken: "Régénérer le jeton d’accès",
    recoveryCode: "Code de récupération",
    markAllRead: "Tout marquer comme lu",
    markRead: "Marquer comme lu",
    all: "Tous",
    search: "Rechercher",
    exportCsv: "Exporter en CSV",
    exportPdf: "Exporter en PDF",
    fromDate: "Du",
    toDate: "Au",
    weekly: "Hebdomadaire",
    monthly: "Mensuel",
    attendanceEvolution: "Évolution de la présence",
    attendanceByModule: "Présence par module",
    absenceDistribution: "Répartition des absences",
    riskDistribution: "Répartition des risques",
    attendanceByType: "Présence par type de séance",
    absencesByModule: "Absences par module",
    filteredResults: "Résultats filtrés",
    loading: "Chargement de votre semestre…",
    error: "Une erreur est survenue. Veuillez réessayer.",
  },
} as const;

export type MessageKey = keyof typeof messages.en;
export function t(
  language: Language | undefined,
  key: MessageKey | `nav.${MessageKey}` | UiKey | AuthMessageKey,
  values?: Record<string, string | number>,
): string {
  const normalized = key.startsWith("nav.") ? key.slice(4) : key;
  const selected = language || "en";
  const text =
    (messages[selected] as Record<string, string>)[normalized] ||
    (uiMessages[selected] as Record<string, string>)[normalized] ||
    (authMessages[selected] as Record<string, string>)[normalized] ||
    (messages.en as Record<string, string>)[normalized] ||
    (uiMessages.en as Record<string, string>)[normalized] ||
    (authMessages.en as Record<string, string>)[normalized] ||
    normalized;
  return values
    ? text.replace(/\{(\w+)\}/g, (match, name: string) =>
        String(values[name] ?? match),
      )
    : text;
}

export function semesterLabel(value: string, language: Language): string {
  return language === "fr"
    ? value.replace(/^Semester (\d+)$/, "Semestre $1")
    : value;
}

export function sessionTypeLabel(value: string, language: Language): string {
  return value === "Lecture" ? t(language, "session.lecture") : value;
}
