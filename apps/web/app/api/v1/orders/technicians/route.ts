import { jsonError, jsonOk, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { listTechnicians } from "@/lib/order-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Active mechanics for the technician picker (FR-045). */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    return jsonOk(await listTechnicians(getAuthRuntime().db, context));
  } catch (error) {
    return jsonError(error);
  }
}
