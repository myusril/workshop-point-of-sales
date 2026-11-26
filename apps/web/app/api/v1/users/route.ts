import { createStaffUser, listStaffUsers } from "@workshop-pos/auth";
import { createUserSchema, listUsersQuerySchema } from "@workshop-pos/contracts";

import {
  jsonError,
  jsonOk,
  parseJson,
  parseQuery,
  requireApiContext,
} from "@/lib/auth/http";
import { getAuthRuntime } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_users");
    const query = parseQuery(request, listUsersQuerySchema);
    const result = await listStaffUsers(getAuthRuntime().db, context, query);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiContext(request, "manage_users");
    const input = await parseJson(request, createUserSchema);
    const runtime = getAuthRuntime();
    const created = await createStaffUser(
      { db: runtime.db, auth: runtime.auth },
      context,
      input,
    );
    return jsonOk(created, 201);
  } catch (error) {
    return jsonError(error);
  }
}
