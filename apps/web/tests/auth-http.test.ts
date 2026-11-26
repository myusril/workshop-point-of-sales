import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AuthError } from "@workshop-pos/auth";

import {
  MAX_JSON_BODY_BYTES,
  assertSameOrigin,
  parseJson,
  parseOptionalJson,
} from "../lib/auth/http";
import { loginRedirectPath, safeNextPath } from "../lib/auth/request-guard";

const ENDPOINT = "https://pos.example.com/api/v1/auth/login";

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

function expectAuthError(run: () => void): AuthError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    return error as AuthError;
  }
  throw new Error("expected AuthError");
}

describe("assertSameOrigin", () => {
  it("allows a same-origin mutation", () => {
    expect(() =>
      assertSameOrigin(request("{}", { origin: "https://pos.example.com" })),
    ).not.toThrow();
  });

  it("allows a request without an Origin header", () => {
    expect(() => assertSameOrigin(request("{}"))).not.toThrow();
  });

  it("allows the configured APP_URL origin behind a proxy", () => {
    const previous = process.env.APP_URL;
    process.env.APP_URL = "https://pos.example.com/";
    try {
      expect(() =>
        assertSameOrigin(request("{}", { origin: "https://pos.example.com" })),
      ).not.toThrow();
    } finally {
      if (previous === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previous;
    }
  });

  it("rejects a present but mismatched Origin", () => {
    const error = expectAuthError(() =>
      assertSameOrigin(request("{}", { origin: "https://evil.example" })),
    );
    expect(error.status).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toContain("asal permintaan tidak dikenal");
  });

  it("rejects an explicitly cross-site fetch", () => {
    const error = expectAuthError(() =>
      assertSameOrigin(request("{}", { "sec-fetch-site": "cross-site" })),
    );
    expect(error.status).toBe(403);
    expect(error.message).toContain("situs lain");
  });

  it("allows a same-site fetch", () => {
    expect(() =>
      assertSameOrigin(request("{}", { "sec-fetch-site": "same-origin" })),
    ).not.toThrow();
  });
});

describe("parseJson body limit", () => {
  const schema = z.object({ value: z.string() });

  it("accepts a body at the limit", async () => {
    const payload = JSON.stringify({ value: "a".repeat(1024) });
    await expect(parseJson(request(payload), schema)).resolves.toEqual({
      value: "a".repeat(1024),
    });
  });

  it("rejects a streamed body over the limit", async () => {
    const body = JSON.stringify({ value: "x".repeat(MAX_JSON_BODY_BYTES) });
    await expect(parseJson(request(body), schema)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      message: "Body permintaan terlalu besar.",
    });
  });

  it("rejects an oversized declared length before reading", async () => {
    const stub = {
      url: ENDPOINT,
      headers: new Headers({
        "content-length": String(MAX_JSON_BODY_BYTES + 1),
      }),
      body: null,
    } as unknown as Request;

    await expect(parseJson(stub, schema)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Body permintaan terlalu besar.",
    });
  });

  it("still rejects an empty body", async () => {
    await expect(parseJson(request(""), schema)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Body permintaan tidak boleh kosong.",
    });
  });

  it("treats an empty optional body as an empty object and keeps the cap", async () => {
    const optional = z.object({
      reason: z.string().min(10, "Alasan minimal 10 karakter.").optional(),
    });

    await expect(parseOptionalJson(request(""), optional)).resolves.toEqual({});
    await expect(
      parseOptionalJson(
        request(JSON.stringify({ reason: "Karyawan lupa kata sandi" })),
        optional,
      ),
    ).resolves.toEqual({ reason: "Karyawan lupa kata sandi" });

    await expect(
      parseOptionalJson(request(JSON.stringify({ reason: "pendek" })), optional),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: { reason: ["Alasan minimal 10 karakter."] },
    });

    const oversized = JSON.stringify({ value: "x".repeat(MAX_JSON_BODY_BYTES) });
    await expect(parseOptionalJson(request(oversized), optional)).rejects.toMatchObject(
      { message: "Body permintaan terlalu besar." },
    );
  });
});

describe("loginRedirectPath", () => {
  it("marks an expired session", () => {
    expect(loginRedirectPath("/users", true)).toBe(
      "/login?next=%2Fusers&reason=expired",
    );
  });

  it("stays silent for a plain unauthenticated visit", () => {
    expect(loginRedirectPath("/outlets", false)).toBe("/login?next=%2Foutlets");
    expect(loginRedirectPath(undefined, false)).toBe("/login?next=%2F");
  });

  it("drops absolute, protocol-relative, and backslash targets", () => {
    expect(safeNextPath("https://evil.example/steal")).toBe("/");
    expect(safeNextPath("//evil.example/steal")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(loginRedirectPath("https://evil.example", true)).toBe(
      "/login?next=%2F&reason=expired",
    );
  });

  it("drops a loop back to the login page", () => {
    expect(loginRedirectPath("/login?next=/users", false)).toBe(
      "/login?next=%2F",
    );
  });
});
