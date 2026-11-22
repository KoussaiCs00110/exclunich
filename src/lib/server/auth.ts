import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { AppData } from "../types";
import { sessionHash } from "./credentials";
import { ApiError, rpc } from "./database";
import { localDemoEnabled, localDemoSnapshot } from "./local-demo";

export const SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-absentia"
    : "absentia_session";
// Keep in sync with the expiry of a new row in web_sessions.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 180;
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};
async function browserSessionHash(): Promise<string | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  return raw && /^[\w-]{43}$/.test(raw) ? sessionHash(raw) : null;
}
export async function credentialFromCookie(): Promise<string> {
  const credential = await browserSessionHash();
  if (!credential)
    throw new ApiError("Please sign in to continue.", 401, "UNAUTHORIZED");
  return credential;
}
export async function getBrowserSession() {
  const credential = await browserSessionHash();
  if (!credential) return null;
  try {
    return await rpc<{ registration_complete: boolean }>("status", {}, credential);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
export const getStudentData = cache(async (): Promise<AppData> => {
  if (await localDemoEnabled()) return localDemoSnapshot();
  return rpc<AppData>("snapshot", {}, await credentialFromCookie());
});
export const requireStudent = cache(async (): Promise<AppData> => {
  try {
    return await getStudentData();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    if (error instanceof ApiError && error.code === "ONBOARDING_REQUIRED")
      redirect("/register?step=save");
    throw error;
  }
});
