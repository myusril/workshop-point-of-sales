import { deactivateStaffUser } from "@workshop-pos/auth";
import { deactivateUserRequestSchema } from "@workshop-pos/contracts";

import { jsonError, jsonOk, parseJson, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_users");
    const { id } = await routeContext.params;
    const input = await parseJson(request, deactivateUserRequestSchema);
    const deactivated = await deactivateStaffUser(
      getAuthRuntime().db,
      context,
      id,
      input.reason,
    );
    return jsonOk(deactivated);
  } catch (error) {
    return jsonError(error);
  }
}
