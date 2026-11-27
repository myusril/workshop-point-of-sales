import {
  createVehicleSchema,
  vehicleListQuerySchema,
} from "@workshop-pos/contracts";

import {
  jsonError,
  jsonOk,
  parseJson,
  parseQuery,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

import { createVehicle, listVehicles } from "./_lib/vehicle-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vehicle reads are available to every authenticated role. */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const query = parseQuery(request, vehicleListQuerySchema);
    const result = await listVehicles(getAuthRuntime().db, context, query);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Reuse answers `200 { item, reused: true }` for an existing plate and a fresh
 * insert answers `201 { item, reused: false }` (AC4.2).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_customers");
    const input = await parseJson(request, createVehicleSchema);
    const result = await createVehicle(getAuthRuntime().db, context, input);
    return jsonOk(result, result.reused ? 200 : 201);
  } catch (error) {
    return jsonError(error);
  }
}
