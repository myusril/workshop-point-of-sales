import { describe, expect, it } from "vitest";

/**
 * Behavioral guard coverage: every API route handler is invoked with no
 * credential and must answer 401. A new route that forgets `requireApiContext`
 * fails this file without anyone remembering to add a case, because the route
 * modules are discovered from the filesystem.
 *
 * The public login endpoint answers 400 (missing body) instead of 401, and the
 * health probe answers 200 by design.
 */
process.env.DATABASE_URL =
  process.env.INTEGRATION_DATABASE_URL ??
  "postgresql://workshop:workshop@127.0.0.1:55432/workshop_pos_test";
process.env.BETTER_AUTH_SECRET ??= [
  "route",
  "guard",
  "integration",
  "test",
  "only",
  "secret",
  "value",
  "not",
  "production",
].join("-");

type RouteModule = Record<string, unknown>;

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

const ROUTE_MODULES = import.meta.glob<RouteModule>("../app/api/v1/**/route.ts", {
  eager: true,
});

function requestPath(routeFile: string): string {
  const relative = routeFile
    .replace("../app/api/v1/", "")
    .replace(/\/route\.ts$/, "")
    .replace(/\[[^\]]+\]/g, UNKNOWN_ID);
  return `/api/v1/${relative}`;
}

function expectedStatus(routeFile: string): number {
  if (routeFile.endsWith("/health/route.ts")) return 200;
  if (routeFile.endsWith("/auth/login/route.ts")) return 400;
  return 401;
}

describe("API route guards", () => {
  const routeFiles = Object.keys(ROUTE_MODULES).sort();

  it("discovers every route file", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  for (const routeFile of routeFiles) {
    const routeModule = ROUTE_MODULES[routeFile] ?? {};
    const handlers = HTTP_METHODS.filter((method) => typeof routeModule[method] === "function");

    it(`${requestPath(routeFile)} rejects a request without a credential`, async () => {
      expect(handlers.length, `${routeFile} exports no HTTP handler`).toBeGreaterThan(0);

      for (const method of handlers) {
        const handler = routeModule[method] as (
          request: Request,
          context: { params: Promise<{ id: string }> },
        ) => Promise<Response>;

        const response = await handler(
          new Request(new URL(requestPath(routeFile), "http://localhost"), { method }),
          { params: Promise.resolve({ id: UNKNOWN_ID }) },
        );

        expect(response.status, `${method} ${requestPath(routeFile)}`).toBe(
          expectedStatus(routeFile),
        );
      }
    });
  }
});
