import {
  parseJson,
  jsonError,
  jsonOk,
  parseQuery,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { getOutletSettings, updateOutletSettings } from "@/lib/settings-service";
import { settingsQuerySchema, updateOutletSettingsSchema } from "@workshop-pos/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current per-outlet settings (FR-070), Owner only. */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_settings");
    const query = parseQuery(request, settingsQuerySchema);
    return jsonOk(await getOutletSettings(getAuthRuntime().db, context, query.outletId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Audited settings update; existing orders keep their snapshots. */
export async function PATCH(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_settings");
    const input = await parseJson(request, updateOutletSettingsSchema);
    return jsonOk(await updateOutletSettings(getAuthRuntime().db, context, input));
  } catch (error) {
    return jsonError(error);
  }
}
