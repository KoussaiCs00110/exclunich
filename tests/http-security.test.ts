import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { NextRequest } from "next/server";
import { failure, readBody } from "../src/lib/server/http";
import { ApiError } from "../src/lib/server/database";
import {
  networkIdentity,
  networkLimit,
} from "../src/lib/server/network-identity";

afterEach(() => {
  vi.unstubAllEnvs();
});
const request = (body = "{}", headers: Record<string, string> = {}) =>
  new NextRequest("https://absentia.test/api/auth", {
    method: "POST",
    headers: {
      origin: "https://absentia.test",
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
describe("HTTP security boundaries", () => {
  it("accepts same-origin JSON and rejects foreign or absent origins", async () => {
    vi.stubEnv("APP_URL", "https://absentia.test");
    expect(await readBody(request('{"action":"login"}'))).toEqual({
      action: "login",
    });
    await expect(
      readBody(request("{}", { origin: "https://foreign.test" })),
    ).rejects.toMatchObject({ status: 403, code: "CSRF" });
    const absent = request();
    absent.headers.delete("origin");
    await expect(readBody(absent)).rejects.toMatchObject({ status: 403 });
  });
  it("requires an explicit production origin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    await expect(readBody(request())).rejects.toMatchObject({
      status: 503,
      code: "SETUP_REQUIRED",
    });
  });
  it("bounds both declared and undeclared streamed bodies at 32KiB", async () => {
    vi.stubEnv("APP_URL", "https://absentia.test");
    await expect(
      readBody(request("{}", { "content-length": "32769" })),
    ).rejects.toMatchObject({ status: 413 });
    await expect(readBody(request("x".repeat(32769)))).rejects.toMatchObject({
      status: 413,
    });
  });
  it("rejects invalid JSON and unsupported content types", async () => {
    vi.stubEnv("APP_URL", "https://absentia.test");
    await expect(readBody(request("malformed"))).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      readBody(request("{}", { "content-type": "text/plain" })),
    ).rejects.toMatchObject({ status: 415 });
  });
  it("sanitizes internal failures while retaining actionable API errors", async () => {
    expect(
      await failure(new Error("sensitive token in internal failure")).json(),
    ).toEqual({
      error: "Something went wrong. Please try again.",
      code: "SERVER_ERROR",
    });
    const response = failure(
      new ApiError("Too many attempts.", 429, "RATE_LIMITED"),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
describe("trusted network identity", () => {
  it("ignores caller-supplied forwarding headers by default and outside the intended platform", () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "203.0.113.8",
      "x-forwarded-for": "203.0.113.9",
      "cf-connecting-ip": "203.0.113.10",
    });
    expect(networkIdentity(headers, {})).toBe("shared");
    expect(networkIdentity(headers, { TRUST_PROXY: "vercel" })).toBe("shared");
    expect(
      networkIdentity(headers, { TRUST_PROXY: "vercel", VERCEL: "1" }),
    ).toBe("203.0.113.8");
    expect(networkIdentity(headers, { TRUST_PROXY: "cloudflare" })).toBe(
      "203.0.113.10",
    );
  });
  it("rejects malformed IPs and ambiguous proxy chains", () => {
    expect(
      networkIdentity(new Headers({ "x-vercel-forwarded-for": "attacker" }), {
        TRUST_PROXY: "vercel",
        VERCEL: "1",
      }),
    ).toBe("shared");
    expect(
      networkIdentity(
        new Headers({ "x-vercel-forwarded-for": "203.0.113.8, 203.0.113.9" }),
        { TRUST_PROXY: "vercel", VERCEL: "1" },
      ),
    ).toBe("shared");
    expect(
      networkIdentity(
        new Headers({ "x-vercel-forwarded-for": "2001:db8::1" }),
        { TRUST_PROXY: "vercel", VERCEL: "1" },
      ),
    ).toBe("2001:db8::1");
  });
  it("uses bounded configurable network limits without changing credential limits", () => {
    expect(networkLimit("login", {})).toBe(240);
    expect(networkLimit("register", {})).toBe(60);
    expect(networkLimit("login", { AUTH_NETWORK_LIMIT: "1200" })).toBe(1200);
    expect(networkLimit("login", { AUTH_NETWORK_LIMIT: "-1" })).toBe(240);
    expect(
      networkLimit("register", { REGISTRATION_NETWORK_LIMIT: "invalid" }),
    ).toBe(60);
  });
});
