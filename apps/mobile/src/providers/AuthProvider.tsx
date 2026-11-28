import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { canOverrideStock, sessionFromLogin, type StoredSession } from "@/src/auth/session-store";
import { checkPin, createPinRecord } from "@/src/auth/pin";
import {
  clearPersonalCaches,
  countPendingForOutlet,
  countQueue,
  purgeLocalData,
} from "@/src/db/repository";
import { getRuntime } from "@/src/providers/runtime";
import { clearReceiptFiles } from "@/src/printing/receipt-files";

/**
 * Session lifecycle for the shared counter device.
 *
 * The bearer token and the staff snapshot live only in secure storage. Sign-out,
 * a revoked token, or an expired session wipes the local personal-data cache and
 * the queue, so the next person at the counter cannot read the previous user's
 * customers or unsynced sales.
 */

export type AuthStatus = "loading" | "signedOut" | "locked" | "signedIn";

export class QueueNotEmptyError extends Error {
  readonly pending: number;

  constructor(pending: number) {
    super(`${pending} transaksi belum tersinkron.`);
    this.name = "QueueNotEmptyError";
    this.pending = pending;
  }
}

export interface SignOutOptions {
  /** True only after the cashier confirmed the destructive local wipe. */
  discardUnsynced: boolean;
}

export interface UnlockResult {
  ok: boolean;
  message?: string;
  requiresFullLogin?: boolean;
}

export interface AuthContextValue {
  status: AuthStatus;
  session: StoredSession | null;
  hasPin: boolean;
  message: string | null;
  canOverrideStock: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: (options: SignOutOptions) => Promise<void>;
  forgetDevice: () => Promise<void>;
  lock: () => void;
  unlock: (pin: string) => Promise<UnlockResult>;
  setPin: (pin: string) => Promise<void>;
  switchOutlet: (outletId: string) => Promise<void>;
  expireSession: () => Promise<void>;
  pendingCount: () => Promise<number>;
  clearMessage: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function expired(session: StoredSession, now = Date.now()): boolean {
  const at = Date.parse(session.sessionExpiresAt);
  return Number.isFinite(at) && at <= now;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<StoredSession | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);

  const clearLocalSession = useCallback(
    async (withMessage: string | null) => {
      getRuntime().token.current = null;
      getRuntime().cacheGeneration.current += 1;
      clearReceiptFiles();
      await getRuntime().sessionStore.clear();
      setSession(null);
      setHasPin(false);
      setStatus("signedOut");
      setMessage(withMessage);
    },
    [],
  );

  /**
   * A 401 means the bearer token is gone, not that the paid sales are invalid.
   * Read-only personal data is cleared immediately; `local_orders` and the
   * outbox stay so re-signing-in can finish the sync with the same client keys.
   * Only the explicit destructive sign-out confirmation purges the queue.
   */
  const handleUnauthorised = useCallback(async () => {
    let pending = 0;
    getRuntime().cacheGeneration.current += 1;
    try {
      const counts = await countQueue(getRuntime().db);
      pending =
        counts.QUEUED + counts.SENDING + counts.RETRY + counts.CONFLICT + counts.FAILED;
      await clearPersonalCaches(getRuntime().db);
    } catch {
      // A storage failure must not hide the terminal sign-in state.
    } finally {
      await clearLocalSession(
        pending > 0
          ? `Sesi berakhir atau perangkat dicabut. ${pending} transaksi tersimpan di perangkat; masuk kembali untuk menyinkronkan.`
          : "Sesi berakhir atau perangkat dicabut. Masuk kembali untuk melanjutkan.",
      );
    }
  }, [clearLocalSession]);

  useEffect(() => {
    mounted.current = true;
    getRuntime().events.onUnauthorised = handleUnauthorised;
    return () => {
      mounted.current = false;
      getRuntime().events.onUnauthorised = undefined;
    };
  }, [handleUnauthorised]);

  useEffect(() => {
    (async () => {
      const token = await getRuntime().sessionStore.getToken();
      const stored = await getRuntime().sessionStore.load();
      const pin = await getRuntime().sessionStore.getPin();
      const pinRecordExists = await getRuntime().sessionStore.hasPinRecord();
      if (!mounted.current) return;
      // A stored session with an unreadable PIN verifier fails closed: the user
      // must sign in again instead of silently enrolling a replacement PIN.
      if (stored && pinRecordExists && !pin) {
        await getRuntime().sessionStore.clear();
        getRuntime().token.current = null;
        await clearPersonalCaches(getRuntime().db);
        if (mounted.current) setStatus("signedOut");
        return;
      }
      setHasPin(Boolean(pin));
      if (!token || !stored || expired(stored)) {
        await getRuntime().sessionStore.clear();
        getRuntime().token.current = null;
        // An expired/absent session must not leave the previous user's
        // customer/vehicle cache readable to the next sign-in.
        await clearPersonalCaches(getRuntime().db);
        if (mounted.current) setStatus("signedOut");
        return;
      }
      getRuntime().token.current = token;
      setSession(stored);
      setStatus(pin ? "locked" : "signedIn");
      // Reconcile role/actions/outlet policy with the server when reachable.
      try {
        const payload = await getRuntime().endpoints.session();
        const current = await getRuntime().sessionStore.load();
        if (current && mounted.current) {
          const reconciled: StoredSession = {
            ...current,
            user: payload.user,
            activeOutletId: payload.session.activeOutletId ?? current.activeOutletId,
            outlets: payload.outlets,
            allowedActions: payload.allowedActions,
            idleTimeoutMinutes: payload.session.idleTimeoutMinutes,
            sessionExpiresAt: payload.session.expiresAt,
          };
          await getRuntime().sessionStore.save(reconciled);
          setSession(reconciled);
        }
      } catch {
        // Offline launch keeps the stored snapshot; the next API call reconciles.
      }
    })();
  }, []);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      setMessage(null);
      const response = await getRuntime().endpoints.login({
        identifier,
        password,
        surface: "mobile",
      });
      if (!response.token) {
        throw new Error("Server tidak mengirim kredensial perangkat. Hubungi administrator.");
      }
      await getRuntime().sessionStore.clearPin();
      const previous = await getRuntime().sessionStore.load();
      const nextSession = sessionFromLogin(response);
      getRuntime().cacheGeneration.current += 1;
      if (
        previous &&
        (previous.user.id !== nextSession.user.id ||
          previous.activeOutletId !== nextSession.activeOutletId)
      ) {
        await clearPersonalCaches(getRuntime().db);
      }
      getRuntime().token.current = response.token;
      await getRuntime().sessionStore.setToken(response.token);
      await getRuntime().sessionStore.save(nextSession);
      setSession(nextSession);
      setHasPin(false);
      setStatus("signedIn");
      setMessage(null);
    },
    [],
  );

  const signOut = useCallback(
    async (options: SignOutOptions) => {
      const counts = await countQueue(getRuntime().db);
      const pending =
        counts.QUEUED + counts.SENDING + counts.RETRY + counts.CONFLICT + counts.FAILED;
      if (pending > 0 && !options.discardUnsynced) {
        throw new QueueNotEmptyError(pending);
      }
      try {
        await getRuntime().endpoints.logout();
      } catch {
        // Best effort: an offline sign-out still clears the local credential.
      }
      await purgeLocalData(getRuntime().db);
      await clearLocalSession(null);
    },
    [clearLocalSession],
  );

  /** Forgets the cached session but keeps the unsynced queue for the next sign-in. */
  const forgetDevice = useCallback(async () => {
    getRuntime().cacheGeneration.current += 1;
    try {
      await getRuntime().endpoints.logout();
    } catch {
      // Best effort; the local credential is removed either way.
    }
    // The next user must not see the previous user's cached customers/vehicles.
    await clearPersonalCaches(getRuntime().db);
    await clearLocalSession(
      "Masuk dengan kata sandi. Transaksi yang belum tersinkron tetap tersimpan di perangkat.",
    );
  }, [clearLocalSession]);

  const lock = useCallback(() => {
    if (hasPin) setStatus("locked");
  }, [hasPin]);

  const unlock = useCallback(
    async (pin: string): Promise<UnlockResult> => {
      const current = await getRuntime().sessionStore.load();
      if (current && expired(current)) {
        await clearPersonalCaches(getRuntime().db);
        await clearLocalSession(
          "Sesi berakhir karena tidak ada aktivitas. Masuk kembali; transaksi tersimpan tetap ada.",
        );
        return { ok: false, requiresFullLogin: true, message: "Sesi berakhir." };
      }
      const record = await getRuntime().sessionStore.getPin();
      if (!record) {
        return {
          ok: false,
          requiresFullLogin: true,
          message: "PIN perangkat tidak tersedia. Masuk dengan kata sandi.",
        };
      }
      const result = await checkPin(pin, record);
      await getRuntime().sessionStore.setPin(result.next);
      if (result.status === "ok") {
        setStatus("signedIn");
        return { ok: true };
      }
      if (result.status === "locked") {
        return {
          ok: false,
          message: result.requiresFullLogin
            ? "Percobaan PIN terlalu sering. Masuk dengan kata sandi untuk melanjutkan."
            : `Tunggu ${result.waitSeconds} detik sebelum mencoba lagi.`,
          requiresFullLogin: result.requiresFullLogin,
        };
      }
      return {
        ok: false,
        message: `PIN salah. Sisa ${result.remaining} percobaan sebelum jeda.`,
      };
    },
    [clearLocalSession],
  );

  const setPin = useCallback(
    async (pin: string) => {
      const record = await createPinRecord(pin);
      await getRuntime().sessionStore.setPin(record);
      setHasPin(true);
    },
    [],
  );

  const switchOutlet = useCallback(
    async (outletId: string) => {
      const current = await getRuntime().sessionStore.load();
      if (current) {
        const pending = await countPendingForOutlet(
          getRuntime().db,
          current.activeOutletId,
        );
        if (pending > 0) throw new QueueNotEmptyError(pending);
      }
      const payload = await getRuntime().endpoints.switchOutlet(outletId);
      const stored = await getRuntime().sessionStore.load();
      if (!stored) throw new Error("Sesi berakhir. Masuk kembali untuk melanjutkan.");
      const next: StoredSession = {
        ...stored,
        user: payload.user,
        activeOutletId: payload.session.activeOutletId ?? outletId,
        idleTimeoutMinutes: payload.session.idleTimeoutMinutes,
        sessionExpiresAt: payload.session.expiresAt,
        outlets: payload.outlets,
        allowedActions: payload.allowedActions,
      };
      getRuntime().cacheGeneration.current += 1;
      clearReceiptFiles();
      await getRuntime().sessionStore.save(next);
      setSession(next);
      await getRuntime().db.transaction(async (tx) => {
        await tx.run("DELETE FROM cached_customers");
        await tx.run("DELETE FROM cached_vehicles");
        await tx.run("DELETE FROM cached_vehicle_history");
        await tx.run("DELETE FROM cached_orders");
        await tx.run("DELETE FROM cache_state");
      });
    },
    [],
  );

  /** Called by the auto-lock timer when the absolute session expiry passes. */
  const expireSession = useCallback(async () => {
    getRuntime().cacheGeneration.current += 1;
    try {
      await getRuntime().endpoints.logout();
    } catch {
      // The session is already unusable locally; revocation is best effort.
    }
    await clearPersonalCaches(getRuntime().db);
    await clearLocalSession(
      "Sesi berakhir karena tidak ada aktivitas. Masuk kembali; transaksi tersimpan tetap ada.",
    );
  }, [clearLocalSession]);

  const pendingCount = useCallback(async () => {
    const counts = await countQueue(getRuntime().db);
    return counts.QUEUED + counts.SENDING + counts.RETRY + counts.CONFLICT + counts.FAILED;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      hasPin,
      message,
      canOverrideStock: canOverrideStock(session),
      signIn,
      signOut,
      forgetDevice,
      lock,
      unlock,
      setPin,
      switchOutlet,
      expireSession,
      pendingCount,
      clearMessage: () => setMessage(null),
    }),
    [
      status,
      session,
      hasPin,
      message,
      signIn,
      signOut,
      forgetDevice,
      lock,
      unlock,
      setPin,
      switchOutlet,
      expireSession,
      pendingCount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing.");
  return value;
}
