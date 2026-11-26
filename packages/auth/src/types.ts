import type { Auth } from "better-auth";

import type { OutletSummary, StaffRole } from "@workshop-pos/contracts";
import type { Database } from "@workshop-pos/db";

/** The three collaborators every auth service needs. */
export interface AuthRuntime {
  db: Database;
  auth: Auth;
  production: boolean;
}

/** Minimal identity carried by an authenticated request. */
export interface AuthContextUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  phone: string;
  role: StaffRole;
  businessId: string;
}

export type AuthMethod = "web" | "bearer";

/**
 * Everything a route or page needs to authorize a request. Never serialized
 * verbatim: `sessionToken` and `tokenId` are server-only credentials.
 */
export interface AuthContext {
  user: AuthContextUser;
  method: AuthMethod;
  activeOutletId: string | null;
  outletIds: string[];
  outlets: OutletSummary[];
  idleTimeoutMinutes: number;
  /** ISO-8601. Web session expiry or device-token expiry. */
  sessionExpiresAt: string;
  /** Raw Better Auth session token for web sessions; server-only. */
  sessionToken?: string;
  /** Web session row id. */
  sessionId?: string;
  /** Device-token row id for bearer sessions. */
  tokenId?: string;
}

export interface ScopedOutlets {
  outlets: OutletSummary[];
  outletIds: string[];
}
