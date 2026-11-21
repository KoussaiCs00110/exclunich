import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { rpc } from "../src/lib/server/database";
import { createLocalDemo } from "../src/lib/local-demo";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Supabase HTTP adapter", () => {
  it("excludes existing blocked classes even before database cleanup", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    const snapshot = createLocalDemo();
    snapshot.occurrences[0].starts_at = "2026-11-30T08:00:00Z";
    snapshot.occurrences[0].ends_at = "2026-11-30T09:00:00Z";
    snapshot.occurrences[0].cancelled = false;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(snapshot)));
    const data = await rpc<typeof snapshot>("snapshot", {}, "session-hash");
    expect(data.occurrences[0].cancelled).toBe(true);
    expect(data.attendance).toEqual(snapshot.attendance);
    expect(snapshot.occurrences[0].cancelled).toBe(false);
  });
  it.each([
    "https://project.supabase.co",
    "https://project.supabase.co/",
    "https://project.supabase.co/rest/v1",
    "https://project.supabase.co/rest/v1/",
    " https://project.supabase.co/rest/v1/ \n",
  ])("accepts the dashboard URL format %j", async (url) => {
    vi.stubEnv("SUPABASE_URL", url);
    const fetch = vi.fn().mockResolvedValue(Response.json({ allowed: true }));
    vi.stubGlobal("fetch", fetch);

    await expect(rpc("rate_limit", { bucket: "test" })).resolves.toEqual({
      allowed: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/absentia_api",
      expect.objectContaining({
        method: "POST",
        headers: {
          apikey: "sb_secret_test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_action: "rate_limit",
          p_body: { bucket: "test" },
          p_credential: null,
        }),
      }),
    );
  });

  it("trims pasted keys and uses the sharing function endpoint", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co/rest/v1/");
    vi.stubEnv("SUPABASE_SECRET_KEY", " sb_secret_test-key\n");
    const fetch = vi.fn().mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", fetch);

    await rpc("list", {}, "session-hash", "exclunich_sharing");
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/exclunich_sharing",
      expect.objectContaining({
        headers: {
          apikey: "sb_secret_test-key",
          "Content-Type": "application/json",
        },
      }),
    );
  });

  it("preserves legacy service-role authorization", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", " legacy-test-key\n");
    const fetch = vi.fn().mockResolvedValue(Response.json(createLocalDemo()));
    vi.stubGlobal("fetch", fetch);

    await rpc("snapshot", {}, "session-hash");
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/absentia_api",
      expect.objectContaining({
        headers: {
          apikey: "legacy-test-key",
          Authorization: "Bearer legacy-test-key",
          "Content-Type": "application/json",
        },
      }),
    );
  });
});
