import { loginRequestSchema } from "@workshop-pos/contracts";
import { loginWithPassword } from "@workshop-pos/auth";
import { NextResponse } from "next/server";

import { assertSameOrigin, getClientIp, jsonError, parseJson } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, loginRequestSchema);
    const runtime = getAuthRuntime();
    const outcome = await loginWithPassword(
      { ...runtime, headers: request.headers, clientIp: getClientIp(request) },
      input,
    );

    const response = NextResponse.json(outcome.payload, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
    for (const cookie of outcome.setCookies) {
      response.headers.append("set-cookie", cookie);
    }
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
