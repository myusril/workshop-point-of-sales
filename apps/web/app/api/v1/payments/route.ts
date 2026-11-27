import { recordPaymentSchema } from "@workshop-pos/contracts";

import { jsonError, jsonOk, parseJson, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { recordPayment } from "@/lib/order-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Records one tender; a replay of the same key returns the original payment. */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const input = await parseJson(request, recordPaymentSchema);
    const result = await recordPayment(getAuthRuntime().db, context, input);
    return jsonOk(result, 201);
  } catch (error) {
    return jsonError(error);
  }
}
