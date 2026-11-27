import { AuthError } from "@workshop-pos/auth";
import { correctPaymentSchema, deletePaymentSchema } from "@workshop-pos/contracts";
import { z } from "zod";

import { jsonError, jsonOk, parseJson, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { correctPayment, deletePayment } from "@/lib/order-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Pre-`PAID` correction, Admin/Owner only, audited with before/after values. */
export async function PATCH(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const { id } = await routeContext.params;
    if (!z.uuid().safeParse(id).success) {
      throw AuthError.notFound("Pembayaran tidak ditemukan.");
    }
    const input = await parseJson(request, correctPaymentSchema);
    return jsonOk(await correctPayment(getAuthRuntime().db, context, id, input));
  } catch (error) {
    return jsonError(error);
  }
}

/** Removes a mis-keyed tender before `PAID`; audited with the removed values. */
export async function DELETE(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const { id } = await routeContext.params;
    if (!z.uuid().safeParse(id).success) {
      throw AuthError.notFound("Pembayaran tidak ditemukan.");
    }
    const input = await parseJson(request, deletePaymentSchema);
    return jsonOk(
      await deletePayment(getAuthRuntime().db, context, id, input.reason),
    );
  } catch (error) {
    return jsonError(error);
  }
}
