import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { AppState, View } from "react-native";

import { useAuth } from "./AuthProvider";

/**
 * Inactivity lock and absolute session expiry (DESIGN §7.7, FR-070).
 *
 * The outlet's idle timeout locks the device PIN; any touch resets the count.
 * If the server-side session expiry passes while the app is open (or the app
 * returns from a long background), the cached session is cleared and the user
 * must sign in. The outbox is never touched by either path.
 */

type Timer = ReturnType<typeof setTimeout>;

export function AutoLock({ children }: { children: ReactNode }) {
  const { status, session, hasPin, lock, expireSession } = useAuth();
  const idleTimer = useRef<Timer | null>(null);
  const backgroundAt = useRef<number | null>(null);

  const arm = useCallback(() => {
    clearTimeout(idleTimer.current ?? undefined);
    if (status !== "signedIn" || !hasPin || !session) return;
    const timeoutMs = Math.max(60_000, session.idleTimeoutMinutes * 60_000);
    idleTimer.current = setTimeout(() => lock(), timeoutMs);
  }, [hasPin, lock, session, status]);

  useEffect(() => {
    arm();
    return () => clearTimeout(idleTimer.current ?? undefined);
  }, [arm]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (
          backgroundAt.current !== null &&
          session &&
          Date.now() - backgroundAt.current >= session.idleTimeoutMinutes * 60_000
        ) {
          lock();
        }
        backgroundAt.current = null;
        arm();
        return;
      }
      if (backgroundAt.current === null) backgroundAt.current = Date.now();
    });
    return () => subscription.remove();
  }, [arm, lock, session]);

  useEffect(() => {
    if ((status !== "signedIn" && status !== "locked") || !session) return;
    const expiresAt = Date.parse(session.sessionExpiresAt);
    if (!Number.isFinite(expiresAt)) return;
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      void expireSession();
      return;
    }
    const timer = setTimeout(
      () => {
        void expireSession();
      },
      Math.min(delay, 2 ** 31 - 1),
    );
    return () => clearTimeout(timer);
  }, [expireSession, session, status]);

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        arm();
        return false;
      }}
    >
      {children}
    </View>
  );
}
