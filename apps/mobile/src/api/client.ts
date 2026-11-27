import { apiErrorSchema } from "@workshop-pos/contracts";
import type { ZodType } from "zod";

/**
 * HTTP boundary for the mobile app.
 *
 * The bearer token is read per request from secure storage and never logged,
 * echoed in an error, or embedded in a URL. A 401 clears the cached session
 * through `onUnauthenticated` so the app cannot keep acting on a revoked token.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string[]> | null;
  readonly retryAfterSeconds: number | null;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]> | null;
    retryAfterSeconds?: number | null;
  }) {
    super(input.message);
    this.name = "ApiError";
    this.status = input.status;
    this.code = input.code;
    this.fieldErrors = input.fieldErrors ?? null;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
  }
}

export class NetworkError extends Error {
  constructor(message = "Tidak ada koneksi. Periksa jaringan lalu coba lagi.") {
    super(message);
    this.name = "NetworkError";
  }
}

export interface ApiClient {
  get<T>(path: string, schema: ZodType<T>): Promise<T>;
  post<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T>;
  postEmpty(path: string, body: unknown): Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  onUnauthenticated?: (rejectedToken: string) => void | Promise<void>;
}

export function validateApiBaseUrl(value: string, isDevelopment: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Alamat server tidak valid.");
  }
  // NFR-007: production traffic (password + bearer token) must be TLS. Plain
  // HTTP is tolerated only in a development build for the emulator/loopback.
  if (parsed.protocol !== "https:" && !isDevelopment) {
    throw new Error("Aplikasi produksi hanya boleh terhubung melalui HTTPS.");
  }
  return value.replace(/\/+$/, "");
}

export function resolveApiBaseUrl(explicit?: string | null): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  // The emulator loopback default exists only in development builds.
  const value = explicit?.trim() || fromEnv || (__DEV__ ? "http://10.0.2.2:3000" : "");
  if (!value) {
    throw new Error(
      "Alamat server belum diatur. Setel EXPO_PUBLIC_API_URL ke alamat HTTPS sebelum membangun aplikasi.",
    );
  }
  return validateApiBaseUrl(value, __DEV__);
}

/**
 * Parses an API error body without ever including the bearer token. A malformed
 * body degrades to a generic message in Bahasa Indonesia.
 */
function parseErrorBody(status: number, body: unknown): ApiError {
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    return new ApiError({
      status,
      code: parsed.data.error.code,
      message: parsed.data.error.message,
      fieldErrors: parsed.data.error.fieldErrors ?? null,
      retryAfterSeconds: parsed.data.error.retryAfterSeconds ?? null,
    });
  }
  return new ApiError({
    status,
    code: status === 401 ? "UNAUTHENTICATED" : "INTERNAL_ERROR",
    message:
      status === 401
        ? "Sesi berakhir. Masuk kembali untuk melanjutkan."
        : "Server tidak dapat memproses permintaan. Coba lagi.",
  });
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = resolveApiBaseUrl(options.baseUrl);
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function request(path: string, init: RequestInit): Promise<unknown> {
    const token = await options.getToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = {
      accept: "application/json",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };

    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch {
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      const error = parseErrorBody(response.status, body);
      // Only a rejected bearer token means the device session ended. A 401
      // from the login form carries no token and must not wipe local state.
      if (response.status === 401 && token) {
        await options.onUnauthenticated?.(token);
      }
      throw error;
    }
    return body;
  }

  return {
    async get<T>(path: string, schema: ZodType<T>): Promise<T> {
      const body = await request(path, { method: "GET" });
      return schema.parse(body);
    },
    async post<T>(path: string, payload: unknown, schema: ZodType<T>): Promise<T> {
      const body = await request(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return schema.parse(body);
    },
    async postEmpty(path, payload) {
      await request(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  };
}
