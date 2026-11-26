import { catalogListQuerySchema, createProductSchema } from "@workshop-pos/contracts";

import {
  jsonError,
  jsonOk,
  parseJson,
  parseQuery,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { createProduct, listCatalog } from "../_lib/catalog-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Catalog reads are available to every authenticated role; cost is role-gated. */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const query = parseQuery(request, catalogListQuerySchema);
    const result = await listCatalog(getAuthRuntime().db, context, {
      ...query,
      type: "product",
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_catalog");
    const input = await parseJson(request, createProductSchema);
    const item = await createProduct(getAuthRuntime().db, context, input);
    return jsonOk({ item }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
