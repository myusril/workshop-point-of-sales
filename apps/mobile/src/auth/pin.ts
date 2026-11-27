import * as Crypto from "expo-crypto";

import type { StoredPin } from "./session-store";

/**
 * Device PIN policy (DESIGN §7.7). The six-digit PIN unlocks the cached session
 * locally; it is never sent to the server and never replaces the account
 * password. Only a salted SHA-256 verifier is stored in secure storage.
 */

export const PIN_LENGTH = 6;
export const MAX_FREE_ATTEMPTS = 5;
export const LOCK_BASE_MS = 60_000;
export const LOCK_FULL_LOGIN_AFTER = 2;

export type PinCheck =
  | { status: "ok"; next: StoredPin }
  | { status: "wrong"; next: StoredPin; remaining: number; waitSeconds: number }
  | { status: "locked"; next: StoredPin; waitSeconds: number; requiresFullLogin: boolean };

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${pin}`,
  );
}

export async function createPinRecord(pin: string): Promise<StoredPin> {
  if (!new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin)) {
    throw new Error(`PIN harus ${PIN_LENGTH} angka.`);
  }
  const salt = toHex(Crypto.getRandomBytes(16));
  return {
    salt,
    hash: await hashPin(pin, salt),
    failedAttempts: 0,
    lockedUntil: null,
  };
}

function lockDurationMs(locks: number): number {
  return LOCK_BASE_MS * 2 ** Math.max(0, locks - 1);
}

/**
 * Checks a PIN attempt and returns the next verifier state. A wrong PIN adds a
 * delay; after two lockouts the local session requires the full credential
 * (there is no server-side PIN recovery).
 */
export async function checkPin(
  pin: string,
  record: StoredPin,
  now: Date = new Date(),
): Promise<PinCheck> {
  if (record.lockedUntil && new Date(record.lockedUntil).getTime() > now.getTime()) {
    return {
      status: "locked",
      next: record,
      waitSeconds: Math.ceil((new Date(record.lockedUntil).getTime() - now.getTime()) / 1000),
      requiresFullLogin: record.failedAttempts >= MAX_FREE_ATTEMPTS * LOCK_FULL_LOGIN_AFTER,
    };
  }

  const candidate = await hashPin(pin, record.salt);
  if (candidate === record.hash) {
    return {
      status: "ok",
      next: { ...record, failedAttempts: 0, lockedUntil: null },
    };
  }

  const failedAttempts = record.failedAttempts + 1;
  const locks = Math.floor(failedAttempts / MAX_FREE_ATTEMPTS);
  if (locks > 0) {
    const waitMs = lockDurationMs(locks);
    return {
      status: "locked",
      next: {
        ...record,
        failedAttempts,
        lockedUntil: new Date(now.getTime() + waitMs).toISOString(),
      },
      waitSeconds: Math.ceil(waitMs / 1000),
      requiresFullLogin: locks >= LOCK_FULL_LOGIN_AFTER,
    };
  }

  return {
    status: "wrong",
    next: { ...record, failedAttempts, lockedUntil: null },
    remaining: MAX_FREE_ATTEMPTS - failedAttempts,
    waitSeconds: 0,
  };
}
