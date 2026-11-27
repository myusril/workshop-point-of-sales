import { AuthError } from "@workshop-pos/auth";
import { printReceiptSchema } from "@workshop-pos/contracts";
import { z } from "zod";

import {
  jsonError,
  jsonOk,
  parseOptionalJson,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { printReceiptDocument } from "@/lib/receipt-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

/**
 * Records one print/reprint (`receipt.printed` audit row) and returns the same
 * document content. The first print has no `SALINAN` stamp; later prints do.
 */
export async function POST(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const { orderId } = await routeContext.params;
    if (!z.uuid().safeParse(orderId).success) {
      throw AuthError.notFound("Transaksi tidak ditemukan.");
    }
    const input = await parseOptionalJson(request, printReceiptSchema);
    const item = await printReceiptDocument(
      getAuthRuntime().db,
      context,
      orderId,
      input.doc === "estimate" ? "ESTIMATE" : "RECEIPT",
    );
    return jsonOk({ item });
  } catch (error) {
    return jsonError(error);
  }
}
