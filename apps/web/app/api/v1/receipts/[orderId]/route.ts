import { AuthError } from "@workshop-pos/auth";
import { receiptQuerySchema } from "@workshop-pos/contracts";
import { z } from "zod";

import { jsonError, jsonOk, parseQuery, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { getReceiptDocument } from "@/lib/receipt-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

/** Receipt data for preview (no write, no print-count increment). */
export async function GET(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const { orderId } = await routeContext.params;
    if (!z.uuid().safeParse(orderId).success) {
      throw AuthError.notFound("Transaksi tidak ditemukan.");
    }
    const query = parseQuery(request, receiptQuerySchema);
    const item = await getReceiptDocument(
      getAuthRuntime().db,
      context,
      orderId,
      query.doc === "estimate" ? "ESTIMATE" : "RECEIPT",
    );
    return jsonOk({ item });
  } catch (error) {
    return jsonError(error);
  }
}
