import { syncApplyRequestSchema } from "@workshop-pos/contracts";

import { jsonError, jsonOk, parseJson, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { applySyncSale } from "./_lib/sync-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Applies one queued offline sale. The client key is unique per business, so a
 * retry after a lost response returns the original result and writes nothing.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const input = await parseJson(request, syncApplyRequestSchema);
    return jsonOk(await applySyncSale(getAuthRuntime().db, context, input));
  } catch (error) {
    return jsonError(error);
  }
}
