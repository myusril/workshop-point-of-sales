import type { ApiError, AuthErrorCode } from "@workshop-pos/contracts";

const STATUS_BY_CODE: Record<AuthErrorCode, number> = {
  INVALID_CREDENTIALS: 401,
  ACCOUNT_DEACTIVATED: 403,
  ACCOUNT_LOCKED: 429,
  RATE_LIMITED: 429,
  SESSION_EXPIRED: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export interface AuthErrorOptions {
  fieldErrors?: Record<string, string[]>;
  retryAfterSeconds?: number;
  cause?: unknown;
}

/** The single error type services and route handlers throw. */
export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string[]>;
  readonly retryAfterSeconds?: number;

  constructor(code: AuthErrorCode, message: string, options: AuthErrorOptions = {}) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    if (options.fieldErrors) this.fieldErrors = options.fieldErrors;
    if (options.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
    if (options.cause !== undefined) this.cause = options.cause;
  }

  static invalidCredentials(): AuthError {
    return new AuthError(
      "INVALID_CREDENTIALS",
      "Email, nama pengguna, atau kata sandi tidak cocok.",
    );
  }

  static unauthenticated(message = "Sesi tidak ditemukan. Silakan masuk kembali."): AuthError {
    return new AuthError("UNAUTHENTICATED", message);
  }

  static sessionExpired(): AuthError {
    return new AuthError(
      "SESSION_EXPIRED",
      "Sesi berakhir karena tidak ada aktivitas. Silakan masuk kembali.",
    );
  }

  static forbidden(message: string): AuthError {
    return new AuthError("FORBIDDEN", message);
  }

  static notFound(message: string): AuthError {
    return new AuthError("NOT_FOUND", message);
  }

  static conflict(message: string, fieldErrors?: Record<string, string[]>): AuthError {
    return new AuthError("CONFLICT", message, { fieldErrors });
  }

  static validation(fieldErrors: Record<string, string[]>, message = "Data yang dikirim tidak valid."): AuthError {
    return new AuthError("VALIDATION_ERROR", message, { fieldErrors });
  }

  static internal(message = "Terjadi kesalahan pada server.", cause?: unknown): AuthError {
    return new AuthError("INTERNAL_ERROR", message, { cause });
  }
}

/** Maps any thrown value to the public `{ error: { code, message } }` body. */
export function toApiErrorBody(error: AuthError): ApiError {
  const body: ApiError = {
    error: {
      code: error.code,
      message: error.message,
    },
  };
  if (error.fieldErrors) body.error.fieldErrors = error.fieldErrors;
  if (error.retryAfterSeconds !== undefined) {
    body.error.retryAfterSeconds = error.retryAfterSeconds;
  }
  return body;
}

export function isAuthError(value: unknown): value is AuthError {
  return value instanceof AuthError;
}

interface PostgresErrorLike {
  code: string;
  constraint?: unknown;
}

function asPostgresError(value: unknown): PostgresErrorLike | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("code" in value) || typeof value.code !== "string") return null;
  return "constraint" in value
    ? { code: value.code, constraint: value.constraint }
    : { code: value.code };
}

/**
 * PostgreSQL unique-violation (23505) detection without importing `pg`.
 * Drizzle may wrap driver errors (`DrizzleQueryError`), so the cause chain is
 * checked, bounded to avoid a pathological cycle.
 */
export function uniqueViolationConstraint(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
    const postgresError = asPostgresError(current);
    if (postgresError) {
      if (postgresError.code !== "23505") return null;
      return typeof postgresError.constraint === "string" ? postgresError.constraint : "";
    }
    current =
      typeof current === "object" && "cause" in current ? current.cause : null;
  }
  return null;
}
