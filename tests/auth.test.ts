import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deriveRecoveryReplacement,
  generateAccessToken,
  generateRecoveryCode,
  generateSession,
  secretHash,
  sessionHash,
} from "../src/lib/server/credentials";
import { authSchema, dataSchema } from "../src/lib/server/validation";

const originalPepper = process.env.TOKEN_PEPPER;
beforeAll(() => {
  process.env.TOKEN_PEPPER = "test-only-pepper-32-characters-long-do-not-use";
});
afterAll(() => {
  if (originalPepper === undefined) delete process.env.TOKEN_PEPPER;
  else process.env.TOKEN_PEPPER = originalPepper;
});

describe("passwordless credentials", () => {
  it("generates unique readable cryptographic access and recovery credentials", () => {
    const tokens = Array.from({ length: 500 }, generateAccessToken);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const token of tokens)
      expect(token).toMatch(/^ABS(?:-[2-9A-HJ-NP-Z]{4}){8}$/);
    expect(generateRecoveryCode()).toMatch(/^REC(?:-[2-9A-HJ-NP-Z]{4}){8}$/);
  });
  it("normalizes case, separators and pasted whitespace without storing plaintext", () => {
    const token = generateAccessToken();
    const hash = secretHash(token, "access");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("ABS");
    expect(
      secretHash(`  ${token.toLowerCase().replaceAll("-", " ")}\n`, "access"),
    ).toBe(hash);
  });
  it("separates recovery/access and rate-limiting hash domains", () => {
    expect(secretHash("same-value", "access")).not.toBe(
      secretHash("same-value", "recovery"),
    );
    expect(secretHash("same-value", "rate")).not.toBe(
      secretHash("same-value", "access"),
    );
  });
  it("depends on the server pepper and refuses an absent or weak pepper", () => {
    const first = secretHash("token", "access");
    process.env.TOKEN_PEPPER =
      "another-test-only-pepper-at-least-32-characters";
    expect(secretHash("token", "access")).not.toBe(first);
    process.env.TOKEN_PEPPER = "short";
    expect(() => secretHash("token", "access")).toThrow("TOKEN_PEPPER");
    delete process.env.TOKEN_PEPPER;
    expect(() => secretHash("token", "access")).toThrow("TOKEN_PEPPER");
    process.env.TOKEN_PEPPER = "test-only-pepper-32-characters-long-do-not-use";
  });
  it("re-derives the exact pending recovery replacement after a dropped response", () => {
    const code = generateRecoveryCode();
    const first = deriveRecoveryReplacement(code);
    expect(
      deriveRecoveryReplacement(code.toLowerCase().replaceAll("-", " ")),
    ).toEqual(first);
    expect(first.token).toMatch(/^ABS(?:-[2-9A-HJ-NP-Z]{4}){8}$/);
    expect(first.recoveryCode).toMatch(/^REC(?:-[2-9A-HJ-NP-Z]{4}){8}$/);
    expect(first.recoveryCode).not.toBe(code);
    expect(deriveRecoveryReplacement(generateRecoveryCode())).not.toEqual(
      first,
    );
  });
  it("creates independent 256-bit opaque sessions and stores their hashes", () => {
    const a = generateSession(),
      b = generateSession();
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(a).not.toBe(b);
    expect(sessionHash(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(sessionHash(a)).not.toBe(sessionHash(b));
    expect(sessionHash(a)).toBe(sessionHash(a));
  });
});

const profile = {
  full_name: "Amine Student",
  academic_year: "2026/2027",
  department: "Formation de base",
  group_name: "A1",
  semester: "S3",
};
const uuid = "a15ab004-3d36-4628-b2f5-08e76bbcae8a";
const session = {
  action: "session_save",
  module_id: uuid,
  session_type: "TD",
  weekday: 1,
  start_time: "08:00",
  end_time: "09:00",
  recurrence_start: "2026-11-23",
  recurrence_end: "2027-01-04",
};
describe("server input validation", () => {
  it("restricts academic choices and normalizes recognized legacy spellings", () => {
    const parsed = authSchema.parse({ action: "register", ...profile, department: "formation superieure", group_name: "b-3" });
    expect(parsed).toMatchObject({ department: "Formation supérieure", group_name: "B3" });
    for (const department of ["Formation de base", "Formation supérieure"])
      for (const group_name of ["A1", "A2", "A3", "A4", "A5", "A6", "B1", "B2", "B3", "B4", "B5", "B6"])
        expect(authSchema.safeParse({ action: "register", ...profile, department, group_name }).success).toBe(true);
    for (const field of ["department", "group_name"])
      for (const value of ["", "Computer Science", "A7", "B0", "C1"])
        expect(authSchema.safeParse({ action: "register", ...profile, [field]: value }).success).toBe(false);
  });
  it("accepts optional starting balances and rejects invalid counts", () => {
    const module = { action: "module_save", name: "Networks", code: "NET", color: "#628b75", semester: "S3" };
    expect(dataSchema.parse(module)).not.toHaveProperty("initial_justified_absences");
    expect(dataSchema.parse({ ...module, initial_justified_absences: 0, initial_unjustified_absences: 1000 })).toHaveProperty("initial_unjustified_absences", 1000);
    for (const field of ["initial_justified_absences", "initial_unjustified_absences"])
      for (const value of [-1, 1.5, 1001, null, "2", Number.NaN])
        expect(dataSchema.safeParse({ ...module, [field]: value }).success).toBe(false);
  });
  it("validates earlier balances by session type without coercing invalid values", () => {
    const module = { action: "module_save", name: "Networks", code: "NET", color: "#628b75", semester: "S3" };
    expect(dataSchema.parse(module)).not.toHaveProperty("initial_absences_by_type");
    for (const initial_absences_by_type of [{}, { TD: { justified: 1, unjustified: 2 } }, { Lecture: { justified: 0, unjustified: 1000 }, TP: { justified: 2, unjustified: 0 } }])
      expect(dataSchema.parse({ ...module, initial_absences_by_type })).toHaveProperty("initial_absences_by_type", initial_absences_by_type);
    for (const initial_absences_by_type of [null, [], { Other: { justified: 0, unjustified: 0 } }, { TD: null }, { TD: { justified: 0 } }, { TP: { justified: 0, unjustified: 1, extra: 1 } }])
      expect(dataSchema.safeParse({ ...module, initial_absences_by_type }).success).toBe(false);
    for (const value of [-1, 1.5, 1001, null, "2", Number.NaN])
      expect(dataSchema.safeParse({ ...module, initial_absences_by_type: { TD: { justified: 0, unjustified: value } } }).success).toBe(false);
  });
  it("requires a complete student profile and an explicit saved-secret acknowledgement", () => {
    expect(
      authSchema.safeParse({ action: "register", ...profile }).success,
    ).toBe(true);
    expect(
      authSchema.parse({ action: "register", ...profile, language: "fr" }),
    ).toHaveProperty("language", "fr");
    expect(
      authSchema.safeParse({
        action: "register",
        ...profile,
        language: "unknown",
      }).success,
    ).toBe(false);
    expect(
      authSchema.safeParse({ action: "register", ...profile, full_name: "A" })
        .success,
    ).toBe(false);
    expect(
      authSchema.safeParse({ action: "confirm", saved: false }).success,
    ).toBe(false);
    expect(
      authSchema.safeParse({ action: "confirm", saved: true }).success,
    ).toBe(true);
  });
  it("never accepts a client-supplied student identity", () => {
    const parsed = dataSchema.parse({
      action: "attendance_save",
      occurrence_id: uuid,
      attendance_status: "present",
      student_id: uuid,
    });
    expect(parsed).not.toHaveProperty("student_id");
  });
  it("rejects malformed IDs, unrecognized statuses, out-of-range thresholds and unsafe colors", () => {
    expect(
      dataSchema.safeParse({
        action: "attendance_save",
        occurrence_id: "invalid",
        attendance_status: "present",
      }).success,
    ).toBe(false);
    expect(
      dataSchema.safeParse({
        action: "attendance_save",
        occurrence_id: uuid,
        attendance_status: "missing",
      }).success,
    ).toBe(false);
    const module = {
      action: "module_save",
      name: "Networks",
      code: "NET",
      color: "#3b82f6",
      semester: "S3",
    };
    expect(dataSchema.safeParse(module).success).toBe(true);
    expect(
      dataSchema.safeParse({ ...module, total_threshold: 0 }).success,
    ).toBe(false);
    expect(
      dataSchema.safeParse({ ...module, color: "url(javascript:alert(1))" })
        .success,
    ).toBe(false);
  });
  it("validates recurrence range, real calendar dates, weekday and ordered session times", () => {
    expect(dataSchema.safeParse(session).success).toBe(true);
    expect(
      dataSchema.safeParse({ ...session, end_time: "07:00" }).success,
    ).toBe(false);
    expect(
      dataSchema.safeParse({ ...session, recurrence_start: "2026-02-31" })
        .success,
    ).toBe(false);
    expect(
      dataSchema.safeParse({ ...session, recurrence_end: "2030-01-01" })
        .success,
    ).toBe(false);
    expect(
      dataSchema.safeParse({
        ...session,
        recurrence_end: "2026-11-23",
        weekday: 2,
      }).success,
    ).toBe(false);
  });
  it("requires a current credential and exact confirmation before deleting an account", () => {
    expect(
      dataSchema.safeParse({
        action: "account_delete",
        currentToken: "ABS-TEST",
        confirmation: "DELETE",
      }).success,
    ).toBe(true);
    expect(
      dataSchema.safeParse({ action: "account_delete", confirmation: "DELETE" })
        .success,
    ).toBe(false);
    expect(
      dataSchema.safeParse({
        action: "account_delete",
        currentToken: "ABS-TEST",
        confirmation: "delete",
      }).success,
    ).toBe(false);
  });
});
