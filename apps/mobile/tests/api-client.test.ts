import { ApiError, createApiClient, validateApiBaseUrl } from "@/src/api/client";
import { z } from "zod";

const okSchema = z.object({ ok: z.boolean() });

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const errorBody = {
  error: { code: "SESSION_EXPIRED", message: "Sesi berakhir." },
};

describe("transport security (NFR-007)", () => {
  it("fails closed for plain HTTP outside development", () => {
    expect(() => validateApiBaseUrl("http://shop.example.com", false)).toThrow("HTTPS");
    expect(() => validateApiBaseUrl("http://10.0.2.2:3000", false)).toThrow("HTTPS");
    expect(validateApiBaseUrl("https://pos.example.com/", false)).toBe(
      "https://pos.example.com",
    );
    expect(validateApiBaseUrl("http://10.0.2.2:3000", true)).toBe(
      "http://10.0.2.2:3000",
    );
  });
});

describe("auth boundary (FR-070, WP7 security)", () => {
  it("does not treat a failed sign-in as an expired device session", async () => {
    const onUnauthenticated = jest.fn();
    const client = createApiClient({
      baseUrl: "http://api.test",
      getToken: async () => null,
      onUnauthenticated,
      fetchImpl: async () => response(401, errorBody),
    });

    await expect(client.post("/api/v1/auth/login", {}, okSchema)).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it("clears the session when a sent bearer token is rejected", async () => {
    const onUnauthenticated = jest.fn();
    let sentAuthorization: string | null = null;
    const client = createApiClient({
      baseUrl: "http://api.test",
      getToken: async () => "device-secret",
      onUnauthenticated,
      fetchImpl: async (_url, init) => {
        sentAuthorization = new Headers(init?.headers).get("authorization");
        return response(401, errorBody);
      },
    });

    await expect(client.get("/api/v1/orders", okSchema)).rejects.toBeInstanceOf(ApiError);
    expect(sentAuthorization).toBe("Bearer device-secret");
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it("never puts the token in an error message", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test",
      getToken: async () => "device-secret",
      fetchImpl: async () =>
        new Response("not json", { status: 500, headers: { "content-type": "text/plain" } }),
    });

    try {
      await client.get("/api/v1/orders", okSchema);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as Error).message).not.toContain("device-secret");
    }
  });
});
