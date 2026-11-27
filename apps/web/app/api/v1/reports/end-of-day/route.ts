import { reportDateQuerySchema } from "@workshop-pos/contracts";

import { jsonError, jsonOk, parseQuery, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { getEndOfDayReport } from "@/lib/report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** End-of-day reconciliation for one business date (FR-065). */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "view_reports");
    const query = parseQuery(request, reportDateQuerySchema);
    return jsonOk(await getEndOfDayReport(getAuthRuntime().db, context, query));
  } catch (error) {
    return jsonError(error);
  }
}
