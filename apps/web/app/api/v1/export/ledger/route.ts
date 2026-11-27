import { exportLedgerQuerySchema } from "@workshop-pos/contracts";

import { jsonError, parseQuery, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { buildLedgerCsv } from "@/lib/export-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stock-ledger CSV (FR-050, FR-066), capped with an explicit error. */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "export_csv");
    const query = parseQuery(request, exportLedgerQuerySchema);
    const result = await buildLedgerCsv(getAuthRuntime().db, context, query);

    return new Response(result.content, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${result.filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
