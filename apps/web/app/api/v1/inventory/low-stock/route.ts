import { jsonError, jsonOk, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { listLowStock } from "../_lib/inventory-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_stock");
    const result = await listLowStock(getAuthRuntime().db, context);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
