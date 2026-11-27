import { updateBrandingSchema } from "@workshop-pos/contracts";

import {
  jsonError,
  jsonOk,
  parseJson,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";
import { getBranding, updateBranding } from "@/lib/settings-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Business product name and logo path (FR-071), Owner only. */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_settings");
    return jsonOk(await getBranding(getAuthRuntime().db, context));
  } catch (error) {
    return jsonError(error);
  }
}

/** Audited branding change; the logo is a path/URL, never an upload. */
export async function PATCH(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_settings");
    const input = await parseJson(request, updateBrandingSchema);
    return jsonOk(await updateBranding(getAuthRuntime().db, context, input));
  } catch (error) {
    return jsonError(error);
  }
}
