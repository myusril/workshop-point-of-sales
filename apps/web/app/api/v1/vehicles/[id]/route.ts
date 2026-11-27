import { AuthError } from "@workshop-pos/auth";
import { updateVehicleSchema } from "@workshop-pos/contracts";
import { z } from "zod";

import {
  jsonError,
  jsonOk,
  parseJson,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { getVehicle, updateVehicle } from "../_lib/vehicle-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_customers");
    const { id } = await routeContext.params;
    if (!z.uuid().safeParse(id).success) {
      throw AuthError.notFound("Kendaraan tidak ditemukan.");
    }
    const item = await getVehicle(getAuthRuntime().db, context, id);
    return jsonOk({ item });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: Request,
  routeContext: RouteContext,
): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_customers");
    const { id } = await routeContext.params;
    if (!z.uuid().safeParse(id).success) {
      throw AuthError.notFound("Kendaraan tidak ditemukan.");
    }
    const input = await parseJson(request, updateVehicleSchema);
    const item = await updateVehicle(getAuthRuntime().db, context, id, input);
    return jsonOk({ item });
  } catch (error) {
    return jsonError(error);
  }
}
