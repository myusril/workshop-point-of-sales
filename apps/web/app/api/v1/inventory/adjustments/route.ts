import { adjustmentRequestSchema } from "@workshop-pos/contracts";

import {
  jsonError,
  jsonOk,
  parseJson,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { recordAdjustment } from "../_lib/inventory-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_stock");
    const input = await parseJson(request, adjustmentRequestSchema);
    const result = await recordAdjustment(getAuthRuntime().db, context, input);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
