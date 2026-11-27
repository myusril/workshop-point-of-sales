import { AuthError } from "@workshop-pos/auth";
import {
  exportReportQuerySchema,
  reportKindSchema,
} from "@workshop-pos/contracts";

import { jsonError, parseQuery, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { buildReportCsv } from "@/lib/export-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ report: string }>;
}

/**
 * CSV download for every report (FR-066). The report service is the same one
 * the screen reads, so the file and the screen cannot drift.
 */
export async function GET(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request, "export_csv");
    const { report } = await params;
    const parsedKind = reportKindSchema.safeParse(report);
    if (!parsedKind.success) {
      throw AuthError.validation({ report: ["Jenis laporan tidak dikenal."] });
    }
    const query = parseQuery(request, exportReportQuerySchema);
    const result = await buildReportCsv(
      getAuthRuntime().db,
      context,
      parsedKind.data,
      { ...query, from: query.from, to: query.to },
    );

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
