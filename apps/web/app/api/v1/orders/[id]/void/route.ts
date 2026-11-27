import { AuthError } from "@workshop-pos/auth";
import { voidOrderSchema } from "@workshop-pos/contracts";
import { z } from "zod";

import { jsonError, jsonOk, parseJson, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { verifyUserPassword } from "@/lib/order-reauth";
import { voidOrder } from "@/lib/order-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Whole-order void with a mandatory reason; no partial refund operation exists. */
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
    const input = await parseJson(request, voidOrderSchema);
    // A paid void re-asks for the Owner's password (verify-only).
    const runtime = getAuthRuntime();
    return jsonOk(
      await voidOrder(runtime.db, context, id, input, (password) =>
        verifyUserPassword(runtime.auth, context.user.id, password),
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
