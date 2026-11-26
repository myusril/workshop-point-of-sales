import { catalogListQuerySchema, createServiceSchema } from "@workshop-pos/contracts";

import {
  jsonError,
  jsonOk,
  parseJson,
  parseQuery,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { createService, listCatalog } from "../_lib/catalog-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const query = parseQuery(request, catalogListQuerySchema);
    const result = await listCatalog(getAuthRuntime().db, context, {
      ...query,
      type: "service",
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_catalog");
    const input = await parseJson(request, createServiceSchema);
    const item = await createService(getAuthRuntime().db, context, input);
    return jsonOk({ item }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
