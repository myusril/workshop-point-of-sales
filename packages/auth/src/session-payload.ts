import type { SessionPayload } from "@workshop-pos/contracts";

import { allowedActions } from "./rbac.ts";
import type { AuthContext } from "./types.ts";

/** The single mapping from an internal context to the public session shape. */
export function buildSessionPayload(context: AuthContext): SessionPayload {
  return {
    user: {
      id: context.user.id,
      name: context.user.name,
      email: context.user.email,
      username: context.user.username,
      phone: context.user.phone,
      role: context.user.role,
    },
    session: {
      activeOutletId: context.activeOutletId,
      outletIds: context.outletIds,
      idleTimeoutMinutes: context.idleTimeoutMinutes,
      expiresAt: context.sessionExpiresAt,
    },
    outlets: context.outlets,
    allowedActions: allowedActions(context.user.role),
  };
}
