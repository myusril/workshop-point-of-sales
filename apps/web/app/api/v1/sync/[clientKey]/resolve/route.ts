import { AuthError } from "@workshop-pos/auth";
import { syncClientKeySchema, syncResolveRequestSchema } from "@workshop-pos/contracts";

import { jsonError, jsonOk, parseJson, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { resolveSyncConflict } from "../../_lib/sync-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ clientKey: string }>;
}

/**
 * Resolves a blocking conflict with an explicit action. `OVERRIDE` needs the
 * stock-override permission (Admin/Owner); `VOID` needs the void permission and
 * records full cash refunds without touching stock.
 */
export async function POST(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const { clientKey } = await routeContext.params;
    const parsedKey = syncClientKeySchema.safeParse(clientKey);
    if (!parsedKey.success) {
      throw AuthError.notFound("Sinkronisasi tidak ditemukan.");
    }
    const input = await parseJson(request, syncResolveRequestSchema);
    return jsonOk(
      await resolveSyncConflict(
        getAuthRuntime().db,
        context,
        parsedKey.data,
        input,
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
