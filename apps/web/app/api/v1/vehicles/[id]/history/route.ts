import { AuthError } from "@workshop-pos/auth";
import { vehicleHistoryQuerySchema } from "@workshop-pos/contracts";
import { z } from "zod";

import {
  jsonError,
  jsonOk,
  parseQuery,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { getVehicleHistory } from "../../_lib/vehicle-service";

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
    const context = await requireApiContext(request, "view_vehicle_history");
    const { id } = await routeContext.params;
    if (!z.uuid().safeParse(id).success) {
      throw AuthError.notFound("Kendaraan tidak ditemukan.");
    }
    const query = parseQuery(request, vehicleHistoryQuerySchema);
    const result = await getVehicleHistory(
      getAuthRuntime().db,
      context,
      id,
      query,
    );
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
