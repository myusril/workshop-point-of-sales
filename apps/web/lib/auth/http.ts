import {
  AuthError,
  isAuthError,
  toApiErrorBody,
  type AuthContext,
  type RbacAction,
} from "@workshop-pos/auth";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import { getApiAuthContext } from "./server";

const NO_STORE = { "cache-control": "no-store" } as const;

/** Hard cap for request bodies on every JSON endpoint (16 KiB). */
export const MAX_JSON_BODY_BYTES = 16 * 1024;

/**
 * Converts any thrown value into the shared `{ error: { code, message } }`
 * shape. Unknown errors are logged by name only: request bodies and driver
 * messages must never reach logs (PD-01/PD-02).
 */
export function jsonError(error: unknown): NextResponse {
  if (!isAuthError(error)) {
    console.error(
      `api: unhandled route error (${error instanceof Error ? error.name : typeof error})`,
    );
  }

  const authError = isAuthError(error)
    ? error
    : AuthError.internal("Terjadi kesalahan pada server.", error);
  const headers: Record<string, string> = { ...NO_STORE };
  if (authError.status === 429 && authError.retryAfterSeconds !== undefined) {
    headers["retry-after"] = String(authError.retryAfterSeconds);
  }

  return NextResponse.json(toApiErrorBody(authError), {
    status: authError.status,
    headers,
  });
}

export function jsonOk<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

function fieldErrorsFrom(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key =
      issue.path
        .filter((segment) => typeof segment === "string" || typeof segment === "number")
        .join(".") || "_root";
    const existing = fieldErrors[key];
    if (existing) existing.push(issue.message);
    else fieldErrors[key] = [issue.message];
  }
  return fieldErrors;
}

function allowedOrigins(request: Request): Set<string> {
  const allowed = new Set<string>();
  for (const candidate of [request.url, process.env.APP_URL]) {
    if (!candidate) continue;
    try {
      allowed.add(new URL(candidate).origin);
    } catch {
      // A malformed APP_URL is a configuration problem, not a reason to reject
      // a request whose own URL still matches.
    }
  }
  return allowed;
}

/**
 * Best-effort client address for the bounded login throttle. Behind the Caddy
 * proxy the last `X-Forwarded-For` entry is the address Caddy observed; the
 * last entry is used because a client-supplied prefix is attacker-controlled.
 * Direct development requests without a proxy header are not throttled by IP.
 */
export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    // The last entry is appended by the directly connected proxy (Caddy); a
    // client-supplied prefix is ignored so the throttle cannot be evaded by
    // sending a forged `X-Forwarded-For`.
    const last = entries.at(-1);
    if (last) return last;
  }

  // Fallback for a trusted proxy that sets only X-Real-IP.
  return request.headers.get("x-real-ip")?.trim() || null;
}

/**
 * CSRF defence-in-depth for cookie-authenticated mutations (ADR-0001:
 * SameSite=Lax plus an origin check). A request without an `Origin` header —
 * server-to-server, bearer clients, tests — is allowed; a present mismatch or
 * an explicitly cross-site fetch is refused.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin !== null && !allowedOrigins(request).has(origin)) {
    throw AuthError.forbidden(
      "Permintaan ditolak karena asal permintaan tidak dikenal.",
    );
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "cross-site") {
    throw AuthError.forbidden(
      "Permintaan ditolak karena berasal dari situs lain.",
    );
  }
}

function bodyTooLarge(): AuthError {
  return AuthError.validation({}, "Body permintaan terlalu besar.");
}

/**
 * Reads the body with a hard byte ceiling. The declared `content-length` is
 * checked first so an oversized upload is refused without reading it, and the
 * stream is read incrementally so a missing or dishonest header cannot force
 * an unbounded buffer.
 */
async function readBoundedBody(request: Request): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null && declared.trim().length > 0) {
    const length = Number(declared);
    if (!Number.isFinite(length) || length < 0) {
      throw AuthError.validation({}, "Header Content-Length tidak valid.");
    }
    if (length > MAX_JSON_BODY_BYTES) throw bodyTooLarge();
  }

  const body = request.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        throw bodyTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (chunks.length === 0) return "";
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/** Reads and validates a JSON body, translating Zod issues to Bahasa field errors. */
export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const raw = await readBoundedBody(request);
  if (raw.trim().length === 0) {
    throw AuthError.validation({}, "Body permintaan tidak boleh kosong.");
  }
  return parseJsonPayload(raw, schema);
}

/**
 * Like {@link parseJson}, but an empty body is treated as `{}` for schemas
 * whose fields are all optional (e.g. an acknowledge endpoint with an optional
 * audit reason).
 */
export async function parseOptionalJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  const raw = await readBoundedBody(request);
  if (raw.trim().length === 0) return parseJsonPayload("{}", schema);
  return parseJsonPayload(raw, schema);
}

function parseJsonPayload<T>(raw: string, schema: ZodType<T>): T {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw AuthError.validation({}, "Body permintaan bukan JSON yang valid.");
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw AuthError.validation(fieldErrorsFrom(result.error.issues));
  }
  return result.data;
}

/** Validates URL query parameters against a contract schema. */
export function parseQuery<T>(
  request: Request,
  schema: ZodType<T>,
): T {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    throw AuthError.validation(fieldErrorsFrom(result.error.issues));
  }
  return result.data;
}

/** Rejects cross-origin or cross-site mutations, then throws 401/403 before the handler runs. */
export function requireApiContext(
  request: Request,
  action?: RbacAction,
): Promise<AuthContext> {
  assertSameOrigin(request);
  return getApiAuthContext(request, action);
}
