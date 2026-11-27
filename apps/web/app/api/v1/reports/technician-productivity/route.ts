import { reportRangeQuerySchema } from "@workshop-pos/contracts";

import { jsonError, jsonOk, parseQuery, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { getTechnicianProductivityReport } from "@/lib/report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Technician productivity (FR-063). */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "view_reports");
    const query = parseQuery(request, reportRangeQuerySchema);
    return jsonOk(
      await getTechnicianProductivityReport(getAuthRuntime().db, context, query),
    );
  } catch (error) {
    return jsonError(error);
  }
}
