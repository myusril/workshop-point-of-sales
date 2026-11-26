import { switchActiveOutlet, buildSessionPayload } from "@workshop-pos/auth";
import { switchOutletRequestSchema } from "@workshop-pos/contracts";

import { jsonError, jsonOk, parseJson, requireApiContext } from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request);
    const input = await parseJson(request, switchOutletRequestSchema);
    const result = await switchActiveOutlet(
      getAuthRuntime(),
      context,
      input.outletId,
    );
    return jsonOk(buildSessionPayload(result.context));
  } catch (error) {
    return jsonError(error);
  }
}
