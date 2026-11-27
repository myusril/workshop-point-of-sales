import {
  createCustomerSchema,
  customerListQuerySchema,
} from "@workshop-pos/contracts";

import {
  jsonError,
  jsonOk,
  parseJson,
  parseQuery,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { createCustomer, listCustomers } from "./_lib/customer-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Customer reads are available to every authenticated role. */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const query = parseQuery(request, customerListQuerySchema);
    const result = await listCustomers(getAuthRuntime().db, context, query);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_customers");
    const input = await parseJson(request, createCustomerSchema);
    const item = await createCustomer(getAuthRuntime().db, context, input);
    return jsonOk({ item }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
