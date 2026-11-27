import { AuthError } from "@workshop-pos/auth";
import { updateOrderSchema } from "@workshop-pos/contracts";
import { z } from "zod";

import { jsonError, jsonOk, parseJson, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { getOrderDetail, updateOrderHeader } from "@/lib/order-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const { id } = await routeContext.params;
    if (!z.uuid().safeParse(id).success) {
      throw AuthError.notFound("Transaksi tidak ditemukan.");
    }
    return jsonOk(await getOrderDetail(getAuthRuntime().db, context, id));
  } catch (error) {
    return jsonError(error);
  }
}

/** Header edit (customer, vehicle, technician, odometer, notes, discount). */
export async function PATCH(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const { id } = await routeContext.params;
    if (!z.uuid().safeParse(id).success) {
      throw AuthError.notFound("Transaksi tidak ditemukan.");
    }
    const input = await parseJson(request, updateOrderSchema);
    return jsonOk(await updateOrderHeader(getAuthRuntime().db, context, id, input));
  } catch (error) {
    return jsonError(error);
  }
}
