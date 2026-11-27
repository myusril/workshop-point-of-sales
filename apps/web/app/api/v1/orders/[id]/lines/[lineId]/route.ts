import { AuthError } from "@workshop-pos/auth";
import { updateOrderLineSchema } from "@workshop-pos/contracts";
import { z } from "zod";

import { jsonError, jsonOk, parseJson, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { removeOrderLine, updateOrderLine } from "@/lib/order-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; lineId: string }>;
}

export async function PATCH(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const { id, lineId } = await routeContext.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(lineId).success) {
      throw AuthError.notFound("Baris transaksi tidak ditemukan.");
    }
    const input = await parseJson(request, updateOrderLineSchema);
    return jsonOk(await updateOrderLine(getAuthRuntime().db, context, id, lineId, input));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const { id, lineId } = await routeContext.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(lineId).success) {
      throw AuthError.notFound("Baris transaksi tidak ditemukan.");
    }
    return jsonOk(await removeOrderLine(getAuthRuntime().db, context, id, lineId));
  } catch (error) {
    return jsonError(error);
  }
}
