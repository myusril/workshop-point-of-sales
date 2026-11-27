import { AuthError } from "@workshop-pos/auth";
import { orderLineInputSchema } from "@workshop-pos/contracts";
import { z } from "zod";

import { jsonError, jsonOk, parseJson, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { addOrderLine } from "@/lib/order-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const { id } = await routeContext.params;
    if (!z.uuid().safeParse(id).success) {
      throw AuthError.notFound("Transaksi tidak ditemukan.");
    }
    const input = await parseJson(request, orderLineInputSchema);
    const result = await addOrderLine(getAuthRuntime().db, context, id, input);
    return jsonOk(result, 201);
  } catch (error) {
    return jsonError(error);
  }
}
