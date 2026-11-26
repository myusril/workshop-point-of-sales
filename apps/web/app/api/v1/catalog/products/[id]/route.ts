import { AuthError } from "@workshop-pos/auth";
import { updateProductSchema } from "@workshop-pos/contracts";
import { z } from "zod";

import {
  jsonError,
  jsonOk,
  parseJson,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { updateProduct } from "../../_lib/catalog-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_catalog");
    const { id } = await routeContext.params;
    if (!z.uuid().safeParse(id).success) {
      throw AuthError.notFound("Produk tidak ditemukan.");
    }
    const input = await parseJson(request, updateProductSchema);
    const item = await updateProduct(getAuthRuntime().db, context, id, input);
    return jsonOk({ item });
  } catch (error) {
    return jsonError(error);
  }
}
