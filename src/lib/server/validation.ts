import { z } from "zod";
const text = (max = 120) => z.string().trim().max(max);
const required = (max = 120) => text(max).min(1);
const uuid = z.string().uuid();
const id = z.object({ id: uuid });
const threshold = z.number().int().min(1).max(50);
const profile = {
  full_name: required(100).min(2),
  student_identifier: text(60).optional().default(""),
  academic_year: required(30),
  department: required(100),
  group_name: required(40),
  semester: required(30),
};
export const authSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register"),
    ...profile,
    language: z.enum(["en", "fr"]).optional().default("en"),
  }),
  z.object({ action: z.literal("login"), token: required(100) }),
  z.object({ action: z.literal("recover"), recoveryCode: required(100) }),
  z.object({ action: z.literal("confirm"), saved: z.literal(true) }),
  z.object({ action: z.literal("logout") }),
  z.object({ action: z.literal("rotate_token"), currentToken: required(100) }),
  z.object({
    action: z.literal("rotate_recovery"),
    currentToken: required(100),
  }),
]);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
export const dataSchema = z
  .discriminatedUnion("action", [
    z.object({
      action: z.literal("module_save"),
      id: uuid.optional(),
      name: required(),
      code: required(30),
      professor: text().default(""),
      description: text(4000).default(""),
      color: z.string().regex(/^#[\da-fA-F]{6}$/),
      semester: required(30),
      total_threshold: threshold.nullable().optional().default(null),
      unjustified_threshold: threshold.nullable().optional().default(null),
      initial_justified_absences: z.number().int().min(0).max(1000).optional(),
      initial_unjustified_absences: z.number().int().min(0).max(1000).optional(),
    }),
    id.extend({ action: z.literal("module_delete") }),
    id.extend({ action: z.literal("module_archive"), archived: z.boolean() }),
    z.object({
      action: z.literal("session_save"),
      id: uuid.optional(),
      module_id: uuid,
      session_type: z.enum(["Lecture", "TD", "TP"]),
      weekday: z.number().int().min(1).max(7),
      start_time: time,
      end_time: time,
      classroom: text(100).default(""),
      professor: text().default(""),
      recurrence_start: day,
      recurrence_end: day,
    }),
    id.extend({ action: z.literal("session_delete") }),
    id.extend({
      action: z.literal("occurrence_save"),
      starts_at: z.string().datetime({ offset: true }).optional(),
      ends_at: z.string().datetime({ offset: true }).optional(),
      classroom: text(100).optional(),
      cancelled: z.boolean().optional(),
    }),
    z.object({
      action: z.literal("attendance_save"),
      occurrence_id: uuid,
      attendance_status: z.enum([
        "present",
        "justified",
        "unjustified",
        "cancelled",
      ]),
      note: text(2000).default(""),
    }),
    id.extend({ action: z.literal("attendance_delete") }),
    z.object({
      action: z.literal("profile_save"),
      ...profile,
      timezone: required(100),
      language: z.enum(["en", "fr"]),
      theme: z.enum(["dark", "light", "system"]),
      total_threshold: threshold,
      unjustified_threshold: threshold,
      show_sunday: z.boolean(),
      notifications_enabled: z.boolean(),
    }),
    z.object({ action: z.literal("notifications_read"), id: uuid.optional() }),
    id.extend({ action: z.literal("notification_delete") }),
    z.object({
      action: z.literal("account_delete"),
      currentToken: required(100),
      confirmation: z.literal("DELETE"),
    }),
  ])
  .superRefine((input, ctx) => {
    if (input.action === "session_save") {
      if (input.end_time <= input.start_time)
        ctx.addIssue({
          code: "custom",
          path: ["end_time"],
          message: "End time must be after start time.",
        });
      const days =
        (Date.parse(input.recurrence_end) -
          Date.parse(input.recurrence_start)) /
        86_400_000;
      if (days < 0 || days > 366)
        ctx.addIssue({
          code: "custom",
          path: ["recurrence_end"],
          message:
            "Recurring sessions must end within 366 days of the first date.",
        });
      const firstWeekday =
        new Date(input.recurrence_start + "T12:00:00Z").getUTCDay() || 7;
      if (days < (input.weekday - firstWeekday + 7) % 7)
        ctx.addIssue({
          code: "custom",
          path: ["weekday"],
          message: "The chosen date range does not contain this weekday.",
        });
    }
    if (
      input.action === "occurrence_save" &&
      input.starts_at &&
      input.ends_at &&
      Date.parse(input.ends_at) <= Date.parse(input.starts_at)
    )
      ctx.addIssue({
        code: "custom",
        path: ["ends_at"],
        message: "End time must be after start time.",
      });
  });
