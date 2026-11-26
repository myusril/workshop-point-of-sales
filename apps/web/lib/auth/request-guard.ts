/**
 * Pure access decision for the Next.js proxy.
 *
 * No database, no auth package, no Next.js imports: the proxy only checks for
 * the *presence* of a credential. Real validation (signature, idle timeout,
 * role, outlet scope) happens in the route handlers and server components.
 */

/** Exact paths that may be reached without a credential. */
export const PUBLIC_PATHS: readonly string[] = [
  "/login",
  "/api/v1/health",
  "/api/v1/auth/login",
  "/api/v1/auth/session",
  "/api/v1/auth/logout",
];

export type AccessDecision = "allow" | "api401" | "redirect";

export interface AccessDecisionInput {
  pathname: string;
  hasSessionCookie: boolean;
  hasBearer: boolean;
}

export function normalizePathname(pathname: string): string {
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (withLeadingSlash.length <= 1) return withLeadingSlash;
  return withLeadingSlash.replace(/\/+$/, "");
}

export function isApiPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return normalized === "/api" || normalized.startsWith("/api/");
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(normalizePathname(pathname));
}

/**
 * Assets are allowed through without a session. The Next matcher already
 * excludes them; this keeps the rule correct if the matcher changes. API
 * paths are never treated as static even when a segment contains a dot.
 */
export function isStaticAsset(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (isApiPath(normalized)) return false;
  if (normalized === "/favicon.ico" || normalized === "/robots.txt") return true;
  if (normalized.startsWith("/_next/")) return true;
  const lastSegment = normalized.slice(normalized.lastIndexOf("/") + 1);
  return lastSegment.includes(".");
}

export function decideAccess(input: AccessDecisionInput): AccessDecision {
  const pathname = normalizePathname(input.pathname);

  if (isStaticAsset(pathname) || isPublicPath(pathname)) return "allow";
  if (input.hasSessionCookie || input.hasBearer) return "allow";

  return isApiPath(pathname) ? "api401" : "redirect";
}

/**
 * Reduces a requested path to an in-app target for the `next` parameter.
 * Absolute, protocol-relative, and backslash-escaped targets fall back to `/`,
 * and a loop back to the login page is dropped.
 */
export function safeNextPath(candidate: string | null | undefined): string {
  if (!candidate) return "/";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/";
  if (candidate.includes("\\")) return "/";
  const pathname = candidate.split("?")[0] ?? candidate;
  if (pathname === "/login" || pathname.startsWith("/login/")) return "/";
  return candidate;
}

/**
 * Builds the login redirect target. `reason=expired` is what makes the login
 * page explain an idle-timeout sign-out; a plain unauthenticated visit stays
 * silent.
 */
export function loginRedirectPath(
  candidate: string | null | undefined,
  expired: boolean,
): string {
  const next = encodeURIComponent(safeNextPath(candidate));
  return expired ? `/login?next=${next}&reason=expired` : `/login?next=${next}`;
}
