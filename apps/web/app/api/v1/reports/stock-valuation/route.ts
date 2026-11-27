import { stockValuationQuerySchema } from "@workshop-pos/contracts";

import { jsonError, jsonOk, parseQuery, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { getStockValuationReport } from "@/lib/report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stock-on-hand × recorded cost at a stated valuation date (FR-064). */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "view_reports");
    const query = parseQuery(request, stockValuationQuerySchema);
    return jsonOk(await getStockValuationReport(getAuthRuntime().db, context, query));
  } catch (error) {
    return jsonError(error);
  }
}
