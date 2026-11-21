import { createHash, createHmac, randomBytes } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
// Rejection sampling avoids modulo bias for this human-readable alphabet.
function readableSecret(prefix: string): string {
  let value = "";
  const ceiling = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  while (value.length < 32) {
    for (const byte of randomBytes(48)) {
      if (byte < ceiling) value += ALPHABET[byte % ALPHABET.length];
      if (value.length === 32) break;
    }
  }
  return `${prefix}-${value.match(/.{4}/g)!.join("-")}`;
}
export const generateAccessToken = () => readableSecret("ABS");
export const generateRecoveryCode = () => readableSecret("REC");
export const generateTimetableToken = () => readableSecret("EXSH");
export const timetableTokenHash = (value: string) =>
  createHash("sha256")
    .update("timetable:" + value.trim().toUpperCase().replace(/[\s-]/g, ""))
    .digest("hex");
export const generateSession = () => randomBytes(32).toString("base64url");
export const sessionHash = (raw: string) =>
  createHash("sha256").update(raw).digest("hex");
export function secretHash(
  value: string,
  purpose: "access" | "recovery" | "rate",
): string {
  const pepper = process.env.TOKEN_PEPPER;
  if (!pepper || pepper.length < 32)
    throw new Error("TOKEN_PEPPER must contain at least 32 characters.");
  const canonical =
    purpose === "rate"
      ? value
      : value.trim().toUpperCase().replace(/[\s-]/g, "");
  return createHmac("sha256", pepper)
    .update(`${purpose}:${canonical}`)
    .digest("hex");
}

/** Deterministic pseudorandom replacement makes a lost recovery response safely retryable.
 * The database allows re-delivery only while this exact recovery remains unconfirmed. */
export function deriveRecoveryReplacement(recoveryCode: string): {
  token: string;
  recoveryCode: string;
} {
  const pepper = process.env.TOKEN_PEPPER;
  if (!pepper || pepper.length < 32)
    throw new Error("TOKEN_PEPPER must contain at least 32 characters.");
  const canonical = recoveryCode.trim().toUpperCase().replace(/[\s-]/g, "");
  const derive = (prefix: string, purpose: string) => {
    const bytes = createHmac("sha256", pepper)
      .update(`recovery-replacement:${purpose}:${canonical}`)
      .digest();
    const value = [...bytes]
      .map((byte) => ALPHABET[byte % ALPHABET.length])
      .join("");
    return `${prefix}-${value.match(/.{4}/g)!.join("-")}`;
  };
  return {
    token: derive("ABS", "access"),
    recoveryCode: derive("REC", "recovery"),
  };
}
