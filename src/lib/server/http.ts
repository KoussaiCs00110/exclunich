import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./database";

export async function readBody(request: NextRequest): Promise<unknown> {
  if (process.env.NODE_ENV === "production" && !process.env.APP_URL)
    throw new ApiError(
      "The application origin has not been configured.",
      503,
      "SETUP_REQUIRED",
    );
  const origin = request.headers.get("origin");
  const allowed = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : new URL(request.url).origin;
  if (!origin || origin !== allowed)
    throw new ApiError(
      "The request origin could not be verified. Reload this page and try again.",
      403,
      "CSRF",
    );
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError("Use an application/json request body.", 415);
  if (Number(request.headers.get("content-length")) > 32_768)
    throw new ApiError("The request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("A JSON request body is required.");
  let total = 0,
    body = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > 32_768) {
        await reader.cancel();
        throw new ApiError("The request is too large.", 413);
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new ApiError("Invalid JSON request.");
  }
}
export function success(data: unknown, status = 200) {
  return NextResponse.json(
    { data },
    { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}
export function failure(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: error.issues[0]?.message || "Please check the supplied fields.",
        code: "VALIDATION_ERROR",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  if (error instanceof ApiError)
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  // Never serialize database failures, credentials, request bodies or stack traces.
  return NextResponse.json(
    { error: "Something went wrong. Please try again.", code: "SERVER_ERROR" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}
