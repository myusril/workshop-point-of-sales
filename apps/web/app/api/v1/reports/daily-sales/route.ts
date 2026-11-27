import { reportRangeQuerySchema } from "@workshop-pos/contracts";

import { jsonError, jsonOk, parseQuery, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { getDailySalesReport } from "@/lib/report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily sales per Asia/Jakarta business date (FR-060). */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "view_reports");
    const query = parseQuery(request, reportRangeQuerySchema);
    return jsonOk(await getDailySalesReport(getAuthRuntime().db, context, query));
  } catch (error) {
    return jsonError(error);
  }
}
