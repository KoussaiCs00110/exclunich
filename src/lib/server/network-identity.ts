import { isIP } from "node:net";

type Environment = Record<string, string | undefined>;
/** Header trust is explicit and platform-gated. Ambiguous chains fall back safely. */
export function networkIdentity(
  headers: Headers,
  env: Environment = process.env,
): string {
  let candidate: string | null = null;
  if (env.TRUST_PROXY === "vercel" && env.VERCEL === "1") {
    candidate = headers.get("x-vercel-forwarded-for");
  } else if (env.TRUST_PROXY === "cloudflare") {
    // Deployment must prevent direct access to the origin when this mode is selected.
    candidate = headers.get("cf-connecting-ip");
  }
  const ip = candidate?.trim().toLowerCase();
  return ip && isIP(ip) ? ip : "shared";
}
export function networkLimit(
  operation: string,
  env: Environment = process.env,
): number {
  const configured = Number(
    operation === "register"
      ? env.REGISTRATION_NETWORK_LIMIT
      : env.AUTH_NETWORK_LIMIT,
  );
  return Number.isInteger(configured) && configured >= 1 && configured <= 10000
    ? configured
    : operation === "register"
      ? 60
      : 240;
}
