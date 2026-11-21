import "server-only";
import type { NextRequest } from "next/server";
import { secretHash } from "./credentials";
import { ApiError, rpc } from "./database";
import { networkIdentity, networkLimit } from "./network-identity";

/** Never trust arbitrary forwarded IP headers; opt in only behind a configured proxy. */
export async function enforceRateLimit(
  request: NextRequest,
  operation: string,
  secret?: string,
) {
  const ip = networkIdentity(request.headers);
  const bucket = secretHash(`${operation}:ip:${ip}`, "rate");
  const { allowed } = await rpc<{ allowed: boolean }>("rate_limit", {
    bucket,
    limit: networkLimit(operation),
  });
  if (!allowed)
    throw new ApiError(
      "Too many attempts. Please wait 15 minutes before trying again.",
      429,
      "RATE_LIMITED",
    );
  if (secret) {
    const credentialBucket = secretHash(
      `${operation}:credential:${secret.replace(/[\s-]/g, "").toUpperCase()}`,
      "rate",
    );
    const result = await rpc<{ allowed: boolean }>("rate_limit", {
      bucket: credentialBucket,
      limit: 8,
    });
    if (!result.allowed)
      throw new ApiError(
        "Too many attempts for this credential. Please wait 15 minutes.",
        429,
        "RATE_LIMITED",
      );
  }
}
