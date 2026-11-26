import { describe, expect, it } from "vitest";

import {
  ASSIGNABLE_STAFF_ROLES,
  AUTH_ERROR_CODES,
  apiErrorSchema,
  assignableStaffRoleSchema,
  createOutletSchema,
  createUserSchema,
  listUsersQuerySchema,
  loginRequestSchema,
  loginResponseSchema,
  normalizePhoneNumber,
  outletSchema,
  passwordSchema,
  sessionPayloadSchema,
  staffRoleSchema,
  switchOutletRequestSchema,
  unlockUserRequestSchema,
  unlockUserResponseSchema,
  updateOutletSchema,
  updateUserSchema,
  userListResponseSchema,
  usernameSchema,
} from "../src/index.ts";

const VALID_PASSWORD = "rahasia123";

describe("auth request contracts", () => {
  it("round-trips a web login request through JSON without changing shape", () => {
    const parsed = loginRequestSchema.parse({
      identifier: " owner@example.com ",
      password: VALID_PASSWORD,
    });

    expect(parsed).toEqual({
      identifier: "owner@example.com",
      password: VALID_PASSWORD,
      surface: "web",
    });

    const roundTripped = loginRequestSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(roundTripped).toEqual(parsed);
  });

  it("keeps the mobile surface and rejects payloads missing a password", () => {
    expect(
      loginRequestSchema.parse({
        identifier: "cashier",
        password: VALID_PASSWORD,
        surface: "mobile",
      }).surface,
    ).toBe("mobile");

    const missingPassword = loginRequestSchema.safeParse({ identifier: "cashier" });
    expect(missingPassword.success).toBe(false);
  });

  it("uses Bahasa Indonesia messages for a too-short identifier", () => {
    const result = loginRequestSchema.safeParse({ identifier: "ab", password: VALID_PASSWORD });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "Isi email, nama pengguna, atau nomor HP.",
      );
    }
  });

  it("enforces the password policy: at least 8 characters, one letter, one digit", () => {
    expect(passwordSchema.safeParse(VALID_PASSWORD).success).toBe(true);

    const cases: ReadonlyArray<readonly [string, string]> = [
      ["pendek1", "Kata sandi minimal 8 karakter."],
      ["12345678", "Kata sandi harus memuat huruf."],
      ["abcdefgh", "Kata sandi harus memuat angka."],
    ];

    for (const [value, message] of cases) {
      const result = passwordSchema.safeParse(value);
      expect(result.success, value).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.message)).toContain(message);
      }
    }
  });
});

describe("staff role contracts", () => {
  it("exposes exactly four roles and never lets the users API assign OWNER", () => {
    expect([...staffRoleSchema.options]).toEqual(["OWNER", "ADMIN", "CASHIER", "MECHANIC"]);
    expect([...ASSIGNABLE_STAFF_ROLES]).toEqual(["ADMIN", "CASHIER", "MECHANIC"]);

    const owner = assignableStaffRoleSchema.safeParse("OWNER");
    expect(owner.success).toBe(false);
    expect(assignableStaffRoleSchema.safeParse("CASHIER").success).toBe(true);
  });
});

describe("phone and username normalization", () => {
  it.each([
    ["081200000001", "081200000001"],
    ["+6281200000001", "081200000001"],
    ["6281200000001", "081200000001"],
    ["0812-0000-0001", "081200000001"],
    [" 0812 0000 0001 ", "081200000001"],
    ["(0812) 0000.0001", "081200000001"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });

  it("rejects phone input that is not an Indonesian mobile-shaped number", () => {
    const result = createUserSchema.shape.phone.safeParse("123");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "Nomor HP tidak valid.",
      );
    }
  });

  it("lowercases and trims usernames, and rejects separators outside the allowlist", () => {
    expect(usernameSchema.parse("  Dewi.Lestari ")).toBe("dewi.lestari");

    const invalid = usernameSchema.safeParse("dewi lestari");
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues[0]?.message).toBe(
        "Nama pengguna hanya boleh huruf kecil, angka, titik, garis bawah, atau tanda hubung.",
      );
    }
  });

  it("rejects an all-digit username so it cannot shadow a phone number", () => {
    const numeric = usernameSchema.safeParse("081200000003");
    expect(numeric.success).toBe(false);
    if (!numeric.success) {
      expect(numeric.error.issues.map((issue) => issue.message)).toContain(
        "Nama pengguna tidak boleh hanya berisi angka.",
      );
    }

    expect(usernameSchema.parse("kasir0812")).toBe("kasir0812");
    const created = createUserSchema.safeParse({
      ...baseUserFields(),
      username: "081200000003",
    });
    expect(created.success).toBe(false);
    if (!created.success) {
      expect(created.error.issues.map((issue) => issue.message)).toContain(
        "Nama pengguna tidak boleh hanya berisi angka.",
      );
    }
  });
});

function baseUserFields() {
  return {
    name: "Dewi Lestari",
    email: "dewi@example.com",
    phone: "081200000003",
    password: VALID_PASSWORD,
    role: "CASHIER" as const,
    outletIds: ["b0000000-0000-4000-8000-000000000002"],
  };
}

describe("user management contracts", () => {
  const baseUser = {
    name: "Dewi Lestari",
    email: "DEWI@Example.com",
    phone: "+62 812-0000-0003",
    password: VALID_PASSWORD,
    role: "CASHIER" as const,
  };

  it("normalizes email/phone and demands an outlet for cashier and mechanic", () => {
    const parsed = createUserSchema.parse({ ...baseUser, role: "ADMIN", outletIds: [] });
    expect(parsed.email).toBe("dewi@example.com");
    expect(parsed.phone).toBe("081200000003");
    expect(parsed.outletIds).toEqual([]);

    const assigned = createUserSchema.parse({
      ...baseUser,
      outletIds: ["b0000000-0000-4000-8000-000000000002"],
    });
    expect(assigned.outletIds).toHaveLength(1);

    const missing = createUserSchema.safeParse({ ...baseUser, outletIds: [] });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues.map((issue) => issue.message)).toContain(
        "Kasir dan mekanik harus ditugaskan ke minimal satu outlet.",
      );
    }
  });

  it("allows an ADMIN without outlet assignment and rejects an empty name", () => {
    expect(createUserSchema.parse({ ...baseUser, role: "ADMIN" }).outletIds).toEqual([]);

    const emptyName = createUserSchema.safeParse({ ...baseUser, name: "" });
    expect(emptyName.success).toBe(false);
    if (!emptyName.success) {
      expect(emptyName.error.issues[0]?.message).toBe("Nama minimal 2 karakter.");
    }
  });

  it("keeps update fields optional and allows clearing a username", () => {
    expect(updateUserSchema.parse({})).toEqual({});
    expect(updateUserSchema.parse({ username: null })).toEqual({ username: null });
  });

  it("coerces pagination and applies safe defaults", () => {
    const query = listUsersQuerySchema.parse({ page: "2", pageSize: "50" });
    expect(query).toMatchObject({ page: 2, pageSize: 50 });
    expect(listUsersQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });

    expect(listUsersQuerySchema.safeParse({ pageSize: "1000" }).success).toBe(false);
  });

  it("round-trips a user list response", () => {
    const payload = {
      items: [
        {
          id: "seed_cashier_dewi",
          name: "Dewi Lestari",
          email: "cashier@example.com",
          username: "cashier",
          phone: "081200000003",
          role: "CASHIER",
          outletIds: ["b0000000-0000-4000-8000-000000000002"],
          isActive: true,
          deactivatedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    };

    expect(userListResponseSchema.parse(JSON.parse(JSON.stringify(payload)))).toEqual(payload);
  });

  it("accepts an optional unlock reason and a boolean unlock result", () => {
    expect(unlockUserRequestSchema.parse({})).toEqual({});
    expect(
      unlockUserRequestSchema.parse({ reason: "  Karyawan lupa kata sandi  " }),
    ).toEqual({ reason: "Karyawan lupa kata sandi" });

    const short = unlockUserRequestSchema.safeParse({ reason: "pendek" });
    expect(short.success).toBe(false);
    if (!short.success) {
      expect(short.error.issues[0]?.message).toBe("Alasan minimal 10 karakter.");
    }

    expect(unlockUserResponseSchema.parse({ unlocked: true })).toEqual({
      unlocked: true,
    });
    expect(unlockUserResponseSchema.safeParse({ unlocked: "ya" }).success).toBe(false);
  });

  it("applies the shared password policy to user creation", () => {
    for (const invalid of ["pendek1", "12345678", "abcdefgh"]) {
      const expected = passwordSchema.safeParse(invalid);
      if (expected.success) throw new Error("expected an invalid password fixture");

      const result = createUserSchema.safeParse({
        ...baseUser,
        role: "ADMIN",
        password: invalid,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.message)).toEqual(
          expected.error.issues.map((issue) => issue.message),
        );
      }
    }
  });
});

describe("outlet contracts", () => {
  it("round-trips outlet creation and update payloads", () => {
    const created = createOutletSchema.parse({
      name: "Outlet Cabang",
      address: "Jl. Merdeka 10",
      phone: "+62 812 0000 0009",
    });
    expect(created.phone).toBe("081200000009");

    const updated = updateOutletSchema.parse({ isActive: false, address: null });
    expect(updated).toEqual({ isActive: false, address: null });

    const emptyName = createOutletSchema.safeParse({ name: " " });
    expect(emptyName.success).toBe(false);
    if (!emptyName.success) {
      expect(emptyName.error.issues[0]?.message).toBe("Nama outlet minimal 2 karakter.");
    }
  });

  it("requires a UUID when switching outlets", () => {
    expect(
      switchOutletRequestSchema.parse({ outletId: "b0000000-0000-4000-8000-000000000002" }),
    ).toEqual({ outletId: "b0000000-0000-4000-8000-000000000002" });

    const invalid = switchOutletRequestSchema.safeParse({ outletId: "outlet-1" });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues[0]?.message).toBe("Outlet tidak valid.");
    }
  });

  it("round-trips an outlet row", () => {
    const outlet = {
      id: "b0000000-0000-4000-8000-000000000002",
      name: "Outlet Pusat",
      address: null,
      phone: null,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(outletSchema.parse(JSON.parse(JSON.stringify(outlet)))).toEqual(outlet);
  });
});

describe("session and error contracts", () => {
  const payload = {
    user: {
      id: "seed_owner_rina",
      name: "Rina Wijaya",
      email: "owner@example.com",
      username: "owner",
      phone: "081200000001",
      role: "OWNER",
    },
    session: {
      activeOutletId: "b0000000-0000-4000-8000-000000000002",
      outletIds: ["b0000000-0000-4000-8000-000000000002"],
      idleTimeoutMinutes: 30,
      expiresAt: "2026-01-01T00:30:00.000Z",
    },
    outlets: [
      {
        id: "b0000000-0000-4000-8000-000000000002",
        name: "Outlet Pusat",
        isActive: true,
      },
    ],
    allowedActions: [
      "manage_users",
      "manage_outlets",
      "create_sale",
      "view_vehicle_history",
    ],
  };

  it("round-trips the session payload and optional mobile token", () => {
    expect(sessionPayloadSchema.parse(JSON.parse(JSON.stringify(payload)))).toEqual(payload);

    const login = loginResponseSchema.parse({
      ...payload,
      token: "raw-token-once",
      tokenExpiresAt: "2026-01-31T00:00:00.000Z",
    });
    expect(login.token).toBe("raw-token-once");
  });

  it("rejects an error body with an unknown code but accepts every declared code", () => {
    for (const code of AUTH_ERROR_CODES) {
      expect(apiErrorSchema.safeParse({ error: { code, message: "x" } }).success).toBe(true);
    }
    expect(apiErrorSchema.safeParse({ error: { code: "NOPE", message: "x" } }).success).toBe(false);
  });
});
