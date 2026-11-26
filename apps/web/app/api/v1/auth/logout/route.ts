import { logoutCurrentSession } from "@workshop-pos/auth";

import { jsonError, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const outcome = await logoutCurrentSession(getAuthRuntime(), context);

    const response = new Response(null, {
      status: 204,
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
