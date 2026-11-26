import { createOutlet, listOutlets } from "@workshop-pos/auth";
import { createOutletSchema } from "@workshop-pos/contracts";

import { jsonError, jsonOk, parseJson, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_outlets");
    const result = await listOutlets(getAuthRuntime().db, context);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_outlets");
    const input = await parseJson(request, createOutletSchema);
    const created = await createOutlet(getAuthRuntime().db, context, input);
    return jsonOk(created, 201);
  } catch (error) {
    return jsonError(error);
  }
}
