import { jsonError, jsonOk, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { listSyncConflicts } from "../_lib/sync-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Outlet-scoped unresolved sync conflicts; visible until explicitly resolved. */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    return jsonOk(await listSyncConflicts(getAuthRuntime().db, context));
  } catch (error) {
    return jsonError(error);
  }
}
