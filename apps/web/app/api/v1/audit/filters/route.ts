import { jsonError, jsonOk, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { listAuditFilters } from "@/lib/audit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Distinct action/entity/actor values for the audit filter controls. */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "view_audit_log");
    return jsonOk(await listAuditFilters(getAuthRuntime().db, context));
  } catch (error) {
    return jsonError(error);
  }
}
