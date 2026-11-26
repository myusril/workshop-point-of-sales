import { describe, expect, it } from "vitest";

import {
  PUBLIC_PATHS,
  decideAccess,
  isApiPath,
  isPublicPath,
  isStaticAsset,
  normalizePathname,
} from "../../../apps/web/lib/auth/request-guard.ts";

const anonymous = { hasSessionCookie: false, hasBearer: false } as const;

describe("normalizePathname", () => {
  it("strips trailing slashes and adds a leading one", () => {
    expect(normalizePathname("/users/")).toBe("/users");
    expect(normalizePathname("users")).toBe("/users");
    expect(normalizePathname("/")).toBe("/");
  });
});

describe("public paths", () => {
  it.each(PUBLIC_PATHS)("allows %s without a credential", (pathname) => {
    expect(decideAccess({ ...anonymous, pathname })).toBe("allow");
    expect(isPublicPath(pathname)).toBe(true);
  });

  it("allows public paths with a trailing slash", () => {
    expect(decideAccess({ ...anonymous, pathname: "/login/" })).toBe("allow");
    expect(decideAccess({ ...anonymous, pathname: "/api/v1/health/" })).toBe("allow");
  });

  it("does not treat the outlet-switch or logout-as-write paths as public", () => {
    expect(decideAccess({ ...anonymous, pathname: "/api/v1/auth/session/outlet" })).toBe(
      "api401",
    );
    expect(decideAccess({ ...anonymous, pathname: "/api/v1/users" })).toBe("api401");
    expect(decideAccess({ ...anonymous, pathname: "/api/v1/outlets" })).toBe("api401");
  });
});

describe("static assets", () => {
  it.each([
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/favicon.ico",
    "/logo.svg",
  ])("allows %s without a credential", (pathname) => {
    expect(isStaticAsset(pathname)).toBe(true);
    expect(decideAccess({ ...anonymous, pathname })).toBe("allow");
  });

  it("never treats an API segment containing a dot as a static asset", () => {
    expect(isStaticAsset("/api/v1/users/1.2")).toBe(false);
    expect(decideAccess({ ...anonymous, pathname: "/api/v1/users/1.2" })).toBe(
      "api401",
    );
  });
});

describe("unauthenticated decisions", () => {
  it("redirects protected pages to the login screen", () => {
    expect(decideAccess({ ...anonymous, pathname: "/" })).toBe("redirect");
    expect(decideAccess({ ...anonymous, pathname: "/users" })).toBe("redirect");
    expect(decideAccess({ ...anonymous, pathname: "/outlets" })).toBe("redirect");
  });

  it("answers protected API calls with 401 instead of a redirect", () => {
    expect(decideAccess({ ...anonymous, pathname: "/api/v1/users" })).toBe("api401");
    expect(decideAccess({ ...anonymous, pathname: "/api" })).toBe("api401");
    expect(isApiPath("/api")).toBe(true);
  });

  it("allows every non-public path when a session cookie or bearer is present", () => {
    for (const pathname of ["/", "/users", "/api/v1/users", "/api/v1/outlets"]) {
      expect(
        decideAccess({ pathname, hasSessionCookie: true, hasBearer: false }),
      ).toBe("allow");
      expect(
        decideAccess({ pathname, hasSessionCookie: false, hasBearer: true }),
      ).toBe("allow");
    }
  });
});

describe("explicit allowlist", () => {
  it("is exactly the documented set", () => {
    expect([...PUBLIC_PATHS]).toEqual([
      "/login",
      "/api/v1/health",
      "/api/v1/auth/login",
      "/api/v1/auth/session",
      "/api/v1/auth/logout",
    ]);
  });
});
