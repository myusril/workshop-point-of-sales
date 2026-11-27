import { auditListQuerySchema } from "@workshop-pos/contracts";

import { jsonError, jsonOk, parseQuery, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { listAuditEntries } from "@/lib/audit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only audit log; the service has no write path (FR-069). */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "view_audit_log");
    const query = parseQuery(request, auditListQuerySchema);
    return jsonOk(await listAuditEntries(getAuthRuntime().db, context, query));
  } catch (error) {
    return jsonError(error);
  }
}
