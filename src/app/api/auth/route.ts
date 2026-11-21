import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  credentialFromCookie,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/server/auth";
import {
  deriveRecoveryReplacement,
  generateAccessToken,
  generateRecoveryCode,
  generateSession,
  secretHash,
  sessionHash,
} from "@/lib/server/credentials";
import { ApiError, rpc } from "@/lib/server/database";
import { failure, readBody, success } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { authSchema } from "@/lib/server/validation";
import { DEMO_COOKIE, localDemoEnabled } from "@/lib/server/local-demo";
import { LOCAL_DEMO_TOKEN } from "@/lib/local-demo";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const input = authSchema.parse(await readBody(request));
    if (await localDemoEnabled()) {
      const jar = await cookies();
      if (input.action === "logout") {
        jar.delete(DEMO_COOKIE);
        return success({ ok: true });
      }
      if (
        input.action === "login" &&
        input.token.trim().toUpperCase() === LOCAL_DEMO_TOKEN
      ) {
        jar.set(DEMO_COOKIE, "active", {
          httpOnly: true,
          sameSite: "strict",
          secure: false,
          path: "/",
          maxAge: 86400,
        });
        return success({ registration_complete: true });
      }
      throw new ApiError(
        input.action === "login"
          ? "For this local demo, use ABS-LOCAL-DEMO."
          : "Account creation, credential changes, and recovery require a configured Supabase account. This local demo uses ABS-LOCAL-DEMO.",
      );
    }
    const secret =
      "token" in input
        ? input.token
        : "recoveryCode" in input
          ? input.recoveryCode
          : "currentToken" in input
            ? input.currentToken
            : undefined;
    if (input.action !== "logout" && input.action !== "confirm")
      await enforceRateLimit(request, input.action, secret);
    const jar = await cookies();
    if (input.action === "register") {
      const token = generateAccessToken(),
        recoveryCode = generateRecoveryCode(),
        session = generateSession();
      const data = await rpc<Record<string, unknown>>("register", {
        ...input,
        token_hash: secretHash(token, "access"),
        recovery_hash: secretHash(recoveryCode, "recovery"),
        session_hash: sessionHash(session),
      });
      jar.set(SESSION_COOKIE, session, sessionCookieOptions);
      return success({ ...data, token, recoveryCode }, 201);
    }
    if (input.action === "login") {
      const session = generateSession();
      const data = await rpc("login", {
        token_hash: secretHash(input.token, "access"),
        session_hash: sessionHash(session),
      });
      jar.set(SESSION_COOKIE, session, sessionCookieOptions);
      return success(data);
    }
    if (input.action === "recover") {
      const { token, recoveryCode } = deriveRecoveryReplacement(
        input.recoveryCode,
      );
      const session = generateSession();
      const data = await rpc<Record<string, unknown>>("recover", {
        recovery_hash: secretHash(input.recoveryCode, "recovery"),
        token_hash: secretHash(token, "access"),
        new_recovery_hash: secretHash(recoveryCode, "recovery"),
        session_hash: sessionHash(session),
      });
      jar.set(SESSION_COOKIE, session, sessionCookieOptions);
      return success({ ...data, token, recoveryCode });
    }
    if (input.action === "logout") {
      try {
        await rpc("logout", {}, await credentialFromCookie());
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      } finally {
        jar.delete(SESSION_COOKIE);
      }
      return success({ ok: true });
    }
    const credential = await credentialFromCookie();
    if (input.action === "rotate_token") {
      const token = generateAccessToken(),
        session = generateSession();
      await rpc(
        "rotate_token",
        {
          current_token_hash: secretHash(input.currentToken, "access"),
          token_hash: secretHash(token, "access"),
          session_hash: sessionHash(session),
        },
        credential,
      );
      jar.set(SESSION_COOKIE, session, sessionCookieOptions);
      return success({ token });
    }
    if (input.action === "rotate_recovery") {
      const recoveryCode = generateRecoveryCode();
      await rpc(
        "rotate_recovery",
        {
          current_token_hash: secretHash(input.currentToken, "access"),
          recovery_hash: secretHash(recoveryCode, "recovery"),
        },
        credential,
      );
      return success({ recoveryCode });
    }
    const data = await rpc(input.action, {}, credential);
    return success(data);
  } catch (error) {
    return failure(error);
  }
}
