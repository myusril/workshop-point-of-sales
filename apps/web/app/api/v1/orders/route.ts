import { createOrderSchema, orderListQuerySchema } from "@workshop-pos/contracts";

import {
  jsonError,
  jsonOk,
  parseJson,
  parseQuery,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { createOrder, listOrders } from "@/lib/order-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Outlet-scoped order list; a Mechanic only sees their assigned work. */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const query = parseQuery(request, orderListQuerySchema);
    return jsonOk(await listOrders(getAuthRuntime().db, context, query));
  } catch (error) {
    return jsonError(error);
  }
}

/** Creates a DRAFT order; the idempotency key makes a double submit one sale. */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const input = await parseJson(request, createOrderSchema);
    const result = await createOrder(getAuthRuntime().db, context, input);
    return jsonOk(result, 201);
  } catch (error) {
    return jsonError(error);
  }
}
