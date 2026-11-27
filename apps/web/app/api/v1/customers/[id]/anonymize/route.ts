import { AuthError } from "@workshop-pos/auth";
import { anonymizeCustomerSchema } from "@workshop-pos/contracts";
import { z } from "zod";

import {
  jsonError,
  jsonOk,
  parseJson,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { anonymizeCustomer } from "../../_lib/customer-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_personal_data");
    const { id } = await routeContext.params;
    if (!z.uuid().safeParse(id).success) {
      throw AuthError.notFound("Pelanggan tidak ditemukan.");
    }
    const input = await parseJson(request, anonymizeCustomerSchema);
    const item = await anonymizeCustomer(
      getAuthRuntime().db,
      context,
      id,
      input,
    );
    return jsonOk({ item });
  } catch (error) {
    return jsonError(error);
  }
}
