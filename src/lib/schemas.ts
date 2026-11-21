import { z } from "zod";
import { isValidTimezone } from "./timezone";

const requiredText = (label: string, max = 150) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or less.`);
const optionalText = (max = 500) =>
  z.string().trim().max(max).optional().nullable();
export const attendanceStatusSchema = z.enum([
  "present",
  "justified",
  "unjustified",
  "cancelled",
]);
export const sessionTypeSchema = z.enum(["Lecture", "TD", "TP"]);
export const thresholdSchema = z
  .number()
  .int()
  .min(1, "A threshold must be at least 1.")
  .max(50, "A threshold must be 50 or less.");

export const registrationSchema = z
  .object({
    full_name: requiredText("Full name", 100).min(2, "Enter your full name."),
    student_identifier: optionalText(60),
    academic_year: requiredText("Academic year", 30),
    department: requiredText("Department", 100),
    group_name: requiredText("Group", 40),
    semester: requiredText("Semester", 30),
  })
  .strict();

export const moduleSchema = z
  .object({
    name: requiredText("Module name", 120),
    code: requiredText("Module code", 30),
    professor: z.string().trim().max(120).default(""),
    description: optionalText(4000),
    color: z.string().regex(/^#[0-9a-f]{6}$/i, "Choose a valid module color."),
    semester: requiredText("Semester", 30),
    total_threshold: thresholdSchema.nullable().optional(),
    unjustified_threshold: thresholdSchema.nullable().optional(),
  })
  .strict();

export const settingsSchema = registrationSchema
  .extend({
    timezone: requiredText("Timezone", 100).refine(
      isValidTimezone,
      "Choose a valid IANA timezone.",
    ),
    language: z.enum(["en", "fr"]),
    theme: z.enum(["dark", "light", "system"]),
    total_threshold: thresholdSchema,
    unjustified_threshold: thresholdSchema,
    show_sunday: z.boolean(),
    notifications_enabled: z.boolean(),
  })
  .strict();

export const attendanceSchema = z
  .object({
    occurrence_id: z.string().uuid("Choose a valid session."),
    attendance_status: attendanceStatusSchema,
    note: optionalText(2000),
  })
  .strict();

export const occurrenceSchema = z
  .object({
    module_id: z.string().uuid("Choose a valid module."),
    session_type: sessionTypeSchema,
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
    classroom: z.string().trim().max(100),
    professor: optionalText(120),
  })
  .strict()
  .refine((value) => Date.parse(value.ends_at) > Date.parse(value.starts_at), {
    message: "The end time must be after the start time.",
    path: ["ends_at"],
  });

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type ModuleInput = z.infer<typeof moduleSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type AttendanceInput = z.infer<typeof attendanceSchema>;
