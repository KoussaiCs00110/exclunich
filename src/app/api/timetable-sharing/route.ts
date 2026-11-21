import type { NextRequest } from "next/server";
import { sharingSchema } from "@/lib/sharing-schema";
import { SharingError } from "@/lib/timetable-sharing";
import { credentialFromCookie, getStudentData } from "@/lib/server/auth";
import {
  generateTimetableToken,
  timetableTokenHash,
} from "@/lib/server/credentials";
import { ApiError, rpc } from "@/lib/server/database";
import { failure, readBody, success } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { localDemoEnabled, localDemoSharing } from "@/lib/server/local-demo";
export const runtime = "nodejs";
export async function GET() {
  try {
    if (await localDemoEnabled())
      return success(await localDemoSharing({ action: "list" }));
    const credential = await credentialFromCookie();
    return success(await rpc("list", {}, credential, "exclunich_sharing"));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const input = sharingSchema.parse(await readBody(request));
    if (await localDemoEnabled()) return success(await localDemoSharing(input));
    await getStudentData();
    const credential = await credentialFromCookie();
    await enforceRateLimit(request, `timetable_${input.action}`);
    if (input.action === "create") {
      const token = generateTimetableToken();
      const info = await rpc<Record<string, unknown>>(
        "create",
        {
          title: input.title,
          expires_days: input.expires_days,
          token_hash: timetableTokenHash(token),
        },
        credential,
        "exclunich_sharing",
      );
      return success({ ...info, token }, 201);
    }
    const body =
      "token" in input
        ? { token_hash: timetableTokenHash(input.token) }
        : "id" in input
          ? { id: input.id }
          : {};
    return success(
      await rpc(input.action, body, credential, "exclunich_sharing"),
    );
  } catch (error) {
    return failure(
      error instanceof SharingError ? new ApiError(error.message) : error,
    );
  }
}
