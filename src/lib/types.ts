export type AttendanceStatus =
  "present" | "justified" | "unjustified" | "cancelled";
export type SessionType = "Lecture" | "TD" | "TP";
export type RiskLevel = "safe" | "warning" | "excluded";
export type Language = "en" | "fr";
export type Theme = "dark" | "light" | "system";

export interface Settings {
  timezone: string;
  language: Language;
  theme: Theme;
  total_threshold: number;
  unjustified_threshold: number;
  /** Retained for profile API compatibility; calendars always show all seven days. */
  show_sunday: boolean;
  notifications_enabled: boolean;
}

export interface Student extends Settings {
  id: string;
  full_name: string;
  student_identifier: string | null;
  academic_year: string;
  department: string;
  group_name: string;
  semester: string;
  registration_complete: boolean;
  created_at: string;
}

export interface Module {
  id: string;
  student_id?: string;
  name: string;
  code: string;
  professor: string;
  description: string | null;
  color: string;
  semester: string;
  academic_year?: string;
  total_threshold: number | null;
  unjustified_threshold: number | null;
  archived_at: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  student_id?: string;
  module_id: string;
  session_type: SessionType;
  weekday: number;
  start_time: string;
  end_time: string;
  classroom: string;
  professor: string | null;
  recurrence_start: string;
  recurrence_end: string;
  recurrence_configuration?: Record<string, unknown>;
  created_at: string;
}

export interface Occurrence {
  id: string;
  session_id: string;
  student_id?: string;
  module_id: string;
  occurrence_date?: string;
  starts_at: string;
  ends_at: string;
  session_type: SessionType;
  classroom: string;
  professor?: string | null;
  cancelled: boolean;
  created_at?: string;
}

export interface Attendance {
  id: string;
  student_id?: string;
  occurrence_id: string;
  module_id: string;
  attendance_status: AttendanceStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  module_id?: string | null;
  occurrence_id?: string | null;
  created_at: string;
}

export interface NotificationDraft {
  title: string;
  message: string;
  type: string;
  module_id: string | null;
  occurrence_id: string | null;
  dedupe_key: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details?: Record<string, unknown>;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  created_at: string;
}

export interface AppData {
  student: Student;
  modules: Module[];
  sessions: Session[];
  occurrences: Occurrence[];
  attendance: Attendance[];
  notifications: Notification[];
  audit: AuditLog[];
}

export interface Thresholds {
  total: number;
  unjustified: number;
}

export interface ModuleStats {
  moduleId: string;
  justified: number;
  unjustified: number;
  totalAbsences: number;
  present: number;
  recorded: number;
  scheduled: number;
  completed: number;
  unrecorded: number;
  attendanceRate: number | null;
  remainingTotal: number;
  remainingUnjustified: number;
  risk: RiskLevel;
  /** A warning module where either kind of additional absence causes exclusion. */
  critical: boolean;
  thresholds: Thresholds;
}

export interface AbsenceSimulation {
  kind: "justified" | "unjustified";
  justified: number;
  unjustified: number;
  totalAbsences: number;
  remainingTotal: number;
  remainingUnjustified: number;
  risk: RiskLevel;
  alreadyExcluded: boolean;
  explanation: string;
  hypothetical: true;
}
