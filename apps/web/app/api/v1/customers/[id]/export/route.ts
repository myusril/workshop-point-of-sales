import { AuthError } from "@workshop-pos/auth";
import { z } from "zod";

import { jsonError, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { exportCustomerPersonalData } from "../../_lib/customer-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Personal-data export download (FR-029). The body is the export document
 * itself — no `{ item }` envelope — because the Owner saves it as a file.
 */
export async function GET(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_personal_data");
    const { id } = await routeContext.params;
    if (!z.uuid().safeParse(id).success) {
      throw AuthError.notFound("Pelanggan tidak ditemukan.");
    }

    const document = await exportCustomerPersonalData(
      getAuthRuntime().db,
      context,
      id,
    );

    return new Response(JSON.stringify(document), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="pelanggan-${id}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
