import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalDemo, localDemoAllowed } from "../src/lib/local-demo";
import { getModuleStats, getOverview } from "../src/lib/attendance";
const browser = vi.hoisted(() => ({ host: "localhost:3000", signedIn: true }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: browser.host }),
  cookies: async () => ({
    get: () => (browser.signedIn ? { value: "active" } : undefined),
  }),
}));
import {
  localDemoSnapshot,
  mutateLocalDemo,
  localDemoSharing,
} from "../src/lib/server/local-demo";

describe("local demo isolation", () => {
  const env = { NODE_ENV: "development", LOCAL_DEMO_MODE: "true" };
  it("requires explicit development mode and a loopback hostname", () => {
    expect(localDemoAllowed(env, "localhost:3000")).toBe(true);
    expect(localDemoAllowed(env, "127.0.0.1:3000")).toBe(true);
    expect(localDemoAllowed(env, "[::1]:3000")).toBe(true);
    for (const host of [
      "absentia.example",
      "localhost.attacker.test",
      "localhost:3000@evil.test",
      "0.0.0.0:3000",
    ])
      expect(localDemoAllowed(env, host)).toBe(false);
    expect(
      localDemoAllowed({ ...env, LOCAL_DEMO_MODE: "false" }, "localhost"),
    ).toBe(false);
  });
  it("cannot activate in production, tests, Vercel or Render", () => {
    for (const extra of [
      { NODE_ENV: "production" },
      { NODE_ENV: "test" },
      { VERCEL: "1" },
      { RENDER: "true" },
    ])
      expect(localDemoAllowed({ ...env, ...extra }, "localhost:3000")).toBe(
        false,
      );
  });
  it("seeds real calculated safe, warning and excluded states and upcoming sessions", () => {
    const data = createLocalDemo(new Date("2026-11-20T12:00:00Z"));
    const overview = getOverview(data, new Date("2026-11-20T12:00:00Z"));
    expect(overview).toMatchObject({
      totalModules: 4,
      safe: 1,
      atRisk: 2,
      excluded: 1,
    });
    expect(data.modules.every((m) => /^[a-f0-9-]{36}$/.test(m.id))).toBe(true);
    expect(
      data.occurrences.some(
        (o) => Date.parse(o.starts_at) > Date.parse("2026-11-20T12:00:00Z"),
      ),
    ).toBe(true);
  });
});

describe("persistent local demo workflows", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "absentia-demo-test-"));
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_DEMO_MODE", "true");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("RENDER", "");
    browser.host = "localhost:3000";
    browser.signedIn = true;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });
  it("creates, previews and revokes a sharing token without exposing stored hashes", async () => {
    await localDemoSnapshot();
    const created = (await localDemoSharing({
      action: "create",
      title: "My group",
      expires_days: 7,
    })) as { id: string; token: string };
    expect(created.token).toMatch(/^EXSH-/);
    const listed = await localDemoSharing({ action: "list" });
    expect(JSON.stringify(listed)).not.toContain(created.token);
    expect(JSON.stringify(listed)).not.toContain("token_hash");
    const preview = (await localDemoSharing({
      action: "preview",
      token: created.token,
    })) as { is_owner: boolean; snapshot: unknown };
    expect(preview.is_owner).toBe(true);
    expect(JSON.stringify(preview.snapshot)).not.toContain("attendance");
    await expect(
      localDemoSharing({ action: "import", token: created.token }),
    ).rejects.toThrow("already yours");
    await localDemoSharing({ action: "revoke", id: created.id });
    await expect(
      localDemoSharing({ action: "preview", token: created.token }),
    ).rejects.toThrow("revoked");
  });
  it("requires login and rejects production reads even with a demo cookie", async () => {
    browser.signedIn = false;
    await expect(localDemoSnapshot()).rejects.toThrow("log in");
    browser.signedIn = true;
    vi.stubEnv("NODE_ENV", "production");
    await expect(localDemoSnapshot()).rejects.toThrow("log in");
  });
  it("persists corrections, prevents duplicates and recalculates risk", async () => {
    const initial = await localDemoSnapshot();
    const module = initial.modules[0];
    const record = initial.attendance.find(
      (a) => a.module_id === module.id && a.attendance_status === "unjustified",
    )!;
    const change = {
      action: "attendance_save",
      occurrence_id: record.occurrence_id,
      attendance_status: "present",
      note: "Corrected locally",
    };
    await mutateLocalDemo(change);
    await mutateLocalDemo(change);
    const after = await localDemoSnapshot();
    expect(
      after.attendance.filter((a) => a.occurrence_id === record.occurrence_id),
    ).toHaveLength(1);
    expect(after.audit).toHaveLength(1);
    expect(getModuleStats(after.modules[0], after).totalAbsences).toBe(3);
  });
  it("rejects future attendance without changing saved data", async () => {
    const data = await localDemoSnapshot();
    const upcoming = data.occurrences.find(
      (o) => Date.parse(o.ends_at) > Date.now(),
    )!;
    await expect(
      mutateLocalDemo({
        action: "attendance_save",
        occurrence_id: upcoming.id,
        attendance_status: "unjustified",
      }),
    ).rejects.toThrow("session ends");
    expect((await localDemoSnapshot()).attendance).toHaveLength(
      data.attendance.length,
    );
  });
  it("creates recurring sessions with unique dated occurrences", async () => {
    const data = await localDemoSnapshot();
    const result = (await mutateLocalDemo({
      action: "session_save",
      module_id: data.modules[0].id,
      session_type: "TP",
      weekday: 1,
      start_time: "08:00",
      end_time: "09:30",
      classroom: "LAB",
      professor: "",
      recurrence_start: "2026-11-23",
      recurrence_end: "2026-12-07",
    })) as { id: string };
    const after = await localDemoSnapshot();
    const created = after.occurrences.filter((o) => o.session_id === result.id);
    expect(created).toHaveLength(3);
    expect(created[0].starts_at).toBe("2026-11-23T07:00:00.000Z");
  });
  it.each(["semester", "academic_year"] as const)(
    "archives the timetable on a %s change without deleting attendance",
    async (field) => {
      const before = await localDemoSnapshot();
      await mutateLocalDemo({
        action: "profile_save",
        ...before.student,
        [field]: field === "semester" ? "Semester 2" : "2027–2028",
      });
      const after = await localDemoSnapshot();
      expect(after.modules.every((module) => module.archived_at)).toBe(true);
      expect(after.modules.every((module) => module.academic_year === before.student.academic_year)).toBe(true);
      expect(after.sessions).toEqual(before.sessions);
      expect(after.occurrences).toEqual(before.occurrences);
      expect(after.attendance).toEqual(before.attendance);
      expect(getOverview(after).totalModules).toBe(0);
    },
  );
  it("keeps new modules active on repeated saves and permits codes in a new year", async () => {
    const before = await localDemoSnapshot();
    const profile = { ...before.student, academic_year: "2027–2028" };
    await mutateLocalDemo({ action: "profile_save", ...profile });
    const result = (await mutateLocalDemo({
      action: "module_save",
      ...before.modules[0],
      id: undefined,
    })) as { id: string };
    await mutateLocalDemo({ action: "profile_save", ...profile, full_name: "Updated name" });
    const after = await localDemoSnapshot();
    expect(after.modules.find((module) => module.id === result.id)).toMatchObject({
      archived_at: null,
      academic_year: "2027–2028",
    });
    expect(after.attendance).toEqual(before.attendance);
  });
  it("does not archive modules on ordinary settings changes or failed profile saves", async () => {
    const before = await localDemoSnapshot();
    await mutateLocalDemo({ action: "profile_save", ...before.student, theme: "light" });
    expect((await localDemoSnapshot()).modules).toEqual(before.modules);
    await expect(mutateLocalDemo({
      action: "profile_save",
      ...before.student,
      semester: "Semester 2",
      timezone: "Invalid/Timezone",
    })).rejects.toThrow("valid timezone");
    expect((await localDemoSnapshot()).modules).toEqual(before.modules);
  });
});
