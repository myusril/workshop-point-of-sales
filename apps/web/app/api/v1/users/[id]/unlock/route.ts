import { unlockStaffUser } from "@workshop-pos/auth";
import { unlockUserRequestSchema } from "@workshop-pos/contracts";

import {
  jsonError,
  jsonOk,
  parseOptionalJson,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Owner-only lockout recovery (DEC-0007). The body is optional; when a reason
 * is supplied it is recorded on the `user.login_unlocked` audit row.
 */
export async function POST(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_users");
    const { id } = await routeContext.params;
    const input = await parseOptionalJson(request, unlockUserRequestSchema);
    const result = await unlockStaffUser(
      getAuthRuntime().db,
      context,
      id,
      { reason: input.reason ?? null },
    );
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
