import { z } from "zod";

import type { LoginResponse, SessionPayload } from "@workshop-pos/contracts";

import type { SecretStore } from "./secret-store";

/**
 * Stored session snapshot. It lives in secure storage beside the bearer token
 * because it contains staff personal data (name, email, phone). Signing out,
 * device revocation, or an expired token deletes it together with the SQLite
 * personal-data cache.
 */

const OUTLET_KEY = "wpos.session";
const TOKEN_KEY = "wpos.token";
const PIN_KEY = "wpos.pin";

export const storedSessionSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    username: z.string().nullable(),
    phone: z.string(),
    role: z.enum(["OWNER", "ADMIN", "CASHIER", "MECHANIC"]),
  }),
  activeOutletId: z.uuid(),
  outlets: z.array(
    z.object({ id: z.uuid(), name: z.string(), isActive: z.boolean() }),
  ),
  allowedActions: z.array(z.string()),
  idleTimeoutMinutes: z.number().int().positive(),
  sessionExpiresAt: z.string(),
  signedInAt: z.string(),
  tokenExpiresAt: z.string().nullable(),
});
export type StoredSession = z.infer<typeof storedSessionSchema>;

export interface SessionStore {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  getPin(): Promise<StoredPin | null>;
  hasPinRecord(): Promise<boolean>;
  setPin(pin: StoredPin): Promise<void>;
  clearPin(): Promise<void>;
}

export const storedPinSchema = z.object({
  salt: z.string().min(16),
  hash: z.string().min(32),
  failedAttempts: z.number().int().nonnegative(),
  lockedUntil: z.string().nullable(),
});
export type StoredPin = z.infer<typeof storedPinSchema>;

function readJson<T>(raw: string | null, schema: z.ZodType<T>): T | null {
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createSessionStore(secrets: SecretStore): SessionStore {
  return {
    async load() {
      return readJson(await secrets.get(OUTLET_KEY), storedSessionSchema);
    },
    async save(session) {
      await secrets.set(OUTLET_KEY, JSON.stringify(session));
    },
    async clear() {
      await Promise.all([
        secrets.delete(OUTLET_KEY),
        secrets.delete(TOKEN_KEY),
        secrets.delete(PIN_KEY),
      ]);
    },
    async getToken() {
      return secrets.get(TOKEN_KEY);
    },
    async setToken(token) {
      await secrets.set(TOKEN_KEY, token);
    },
    async getPin() {
      return readJson(await secrets.get(PIN_KEY), storedPinSchema);
    },
    async hasPinRecord() {
      return (await secrets.get(PIN_KEY)) !== null;
    },
    async setPin(pin) {
      await secrets.set(PIN_KEY, JSON.stringify(pin));
    },
    async clearPin() {
      await secrets.delete(PIN_KEY);
    },
  };
}

/** Builds the durable snapshot from a login/session payload. */
export function sessionFromPayload(
  payload: SessionPayload,
  options: { tokenExpiresAt?: string | null; now?: Date } = {},
): StoredSession {
  const activeOutletId =
    payload.session.activeOutletId ?? payload.outlets[0]?.id ?? null;
  if (!activeOutletId) {
    throw new Error("Akun ini belum memiliki outlet aktif. Hubungi Pemilik.");
  }
  return {
    user: payload.user,
    activeOutletId,
    outlets: payload.outlets,
    allowedActions: payload.allowedActions,
    idleTimeoutMinutes: payload.session.idleTimeoutMinutes,
    sessionExpiresAt: payload.session.expiresAt,
    signedInAt: (options.now ?? new Date()).toISOString(),
    tokenExpiresAt: options.tokenExpiresAt ?? null,
  };
}

export function sessionFromLogin(
  login: LoginResponse,
  now: Date = new Date(),
): StoredSession {
  return sessionFromPayload(login, {
    tokenExpiresAt: login.tokenExpiresAt ?? null,
    now,
  });
}

export function hasAction(session: StoredSession | null, action: string): boolean {
  return session?.allowedActions.includes(action) ?? false;
}

export function canOverrideStock(session: StoredSession | null): boolean {
  return session?.user.role === "OWNER" || session?.user.role === "ADMIN";
}
