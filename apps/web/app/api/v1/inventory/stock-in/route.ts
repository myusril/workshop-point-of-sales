import { stockInRequestSchema } from "@workshop-pos/contracts";

import {
  jsonError,
  jsonOk,
  parseJson,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { recordStockIn } from "../_lib/inventory-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_stock");
    const input = await parseJson(request, stockInRequestSchema);
    const result = await recordStockIn(getAuthRuntime().db, context, input);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
