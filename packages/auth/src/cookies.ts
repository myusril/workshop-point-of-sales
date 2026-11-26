/**
 * Cookie naming lives in its own dependency-free module so the Next.js proxy
 * (edge runtime) can import it without pulling Better Auth, Drizzle, or `pg`
 * into the edge bundle.
 */
export const SESSION_COOKIE_PREFIX = "workshop-pos";
export const SESSION_COOKIE_BASE = `${SESSION_COOKIE_PREFIX}.session_token`;
export const SESSION_COOKIE_SECURE = `__Secure-${SESSION_COOKIE_BASE}`;

/** Both names Better Auth may issue, depending on `useSecureCookies`. */
export function getSessionCookieNames(): string[] {
  return [SESSION_COOKIE_BASE, SESSION_COOKIE_SECURE];
}
