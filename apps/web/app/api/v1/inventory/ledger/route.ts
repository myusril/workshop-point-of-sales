import { ledgerListQuerySchema } from "@workshop-pos/contracts";

import {
  jsonError,
  jsonOk,
  parseQuery,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { listLedger } from "../_lib/inventory-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_stock");
    const query = parseQuery(request, ledgerListQuerySchema);
    const result = await listLedger(getAuthRuntime().db, context, query);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
