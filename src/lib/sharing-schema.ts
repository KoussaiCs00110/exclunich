import { z } from "zod";
export const sharingSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    title: z.string().trim().min(1).max(100),
    expires_days: z
      .union([z.literal(1), z.literal(7), z.literal(30)])
      .default(7),
  }),
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("revoke"), id: z.string().uuid() }),
  z.object({
    action: z.literal("preview"),
    token: z
      .string()
      .trim()
      .max(100)
      .regex(
        /^EXSH(?:[\s-]*[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]){32}$/i,
        "Enter a timetable sharing token beginning with EXSH.",
      ),
  }),
  z.object({
    action: z.literal("import"),
    token: z
      .string()
      .trim()
      .max(100)
      .regex(
        /^EXSH(?:[\s-]*[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]){32}$/i,
        "Enter a timetable sharing token beginning with EXSH.",
      ),
  }),
]);
