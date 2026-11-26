import { updateOutlet } from "@workshop-pos/auth";
import { updateOutletSchema } from "@workshop-pos/contracts";

import { jsonError, jsonOk, parseJson, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_outlets");
    const { id } = await routeContext.params;
    const input = await parseJson(request, updateOutletSchema);
    const updated = await updateOutlet(getAuthRuntime().db, context, id, input);
    return jsonOk(updated);
  } catch (error) {
    return jsonError(error);
  }
}
