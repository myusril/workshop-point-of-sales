import { buildSessionPayload } from "@workshop-pos/auth";

import { jsonError, jsonOk, requireApiContext } from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    return jsonOk(buildSessionPayload(context));
  } catch (error) {
    return jsonError(error);
  }
}
