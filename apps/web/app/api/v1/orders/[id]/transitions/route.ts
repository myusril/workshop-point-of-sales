import { AuthError } from "@workshop-pos/auth";
import { transitionOrderSchema } from "@workshop-pos/contracts";
import { z } from "zod";

import { jsonError, jsonOk, parseJson, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { transitionOrder } from "@/lib/order-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Lifecycle transition (estimate issue, approval, revert, start, complete).
 * `PAID` and `VOID` are not reachable here: payments and the void endpoint own
 * those transitions and their side effects.
 */
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
    const input = await parseJson(request, transitionOrderSchema);
    return jsonOk(await transitionOrder(getAuthRuntime().db, context, id, input));
  } catch (error) {
    return jsonError(error);
  }
}
