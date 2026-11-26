import { getSessionCookieNames } from "@workshop-pos/auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { decideAccess } from "@/lib/auth/request-guard";

const SESSION_COOKIE_NAMES = getSessionCookieNames();

/**
 * Credential-presence gate only. Every route and page still resolves the real
 * session server-side; this proxy just avoids rendering protected shells (and
 * answers API calls) when no credential is present at all.
 */
export function proxy(request: NextRequest): NextResponse {
  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) =>
    request.cookies.has(name),
  );
  const hasBearer = request.headers.has("authorization");

  const decision = decideAccess({
    pathname: request.nextUrl.pathname,
    hasSessionCookie,
    hasBearer,
  });

  if (decision === "allow") {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-workshop-path", request.nextUrl.pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (decision === "api401") {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHENTICATED",
          message: "Sesi tidak ditemukan. Silakan masuk kembali.",
        },
      },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)"],
};
