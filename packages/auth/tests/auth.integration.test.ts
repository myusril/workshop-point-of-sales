import { randomUUID, randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type AuthContext,
  type AuthRuntime,
  type LoginOutcome,
  POLICY,
  assertOutletAccess,
  assertPermission,
  auditDenial,
  createAuth,
  createOutlet,
  createStaffUser,
  deactivateStaffUser,
  hashDeviceToken,
  listOutlets,
  listStaffUsers,
  loginWithPassword,
  logoutCurrentSession,
  provisionAccounts,
  pruneExpiredLoginAttempts,
  pruneLoginAttempts,
  resetIpThrottle,
  resolveAuth,
  resolveAuthContext,
  resolveDeviceToken,
  revokeDeviceToken,
  switchActiveOutlet,
  unlockStaffUser,
  updateOutlet,
  updateStaffUser,
} from "../src/index.ts";
import { AuthError } from "../src/errors.ts";
import {
  SEED_BUSINESS_ID,
  SEED_OUTLET_ID,
  SEED_USERS,
  auditLog,
  businesses,
  deviceTokens,
  loginAttempts,
  outlets as outletsTable,
  session as sessionTable,
  settings as settingsTable,
  user as userTable,
  type Database,
  seedDatabase,
} from "@workshop-pos/db";

import {
  closeAuthTestDatabase,
  prepareAuthTestDatabase,
  type AuthTestDatabase,
} from "./helpers.ts";

const BASE_URL = "http://127.0.0.1:3000";
const SECRET = "wp3-integration-secret-value-at-least-32-chars";
const OUTLET_A = SEED_OUTLET_ID;

let handle: AuthTestDatabase;
let db: Database;
let runtime: AuthRuntime;
let password: string;
let outletBId: string;
let ownerContext: AuthContext;

function headers(origin: string = BASE_URL): Headers {
  return new Headers({ origin, "content-type": "application/json" });
}

function login(
  identifier: string,
  surface: "web" | "mobile" = "web",
  now?: Date,
  candidatePassword: string = password,
): Promise<LoginOutcome> {
  return loginWithPassword(
    { ...runtime, headers: headers() },
    { identifier, password: candidatePassword, surface },
    now,
  );
}

function cookieHeaders(setCookies: readonly string[]): Headers {
  const pairs = setCookies
    .map((cookie) => cookie.split(";")[0])
    .filter((pair): pair is string => Boolean(pair));
  return new Headers({ cookie: pairs.join("; ") });
}

function bearerHeaders(token: string): Headers {
  return new Headers({ authorization: `Bearer ${token}` });
}

async function contextFrom(outcome: LoginOutcome): Promise<AuthContext> {
  const context = await resolveAuthContext(runtime, cookieHeaders(outcome.setCookies));
  if (!context) throw new Error("expected an authenticated context");
  return context;
}

async function expectAuthError(
  run: Promise<unknown>,
  code: AuthError["code"],
): Promise<AuthError> {
  try {
    await run;
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    const authError = error as AuthError;
    expect(authError.code).toBe(code);
    return authError;
  }
  throw new Error(`expected AuthError ${code}`);
}

function expectSyncAuthError(run: () => void, code: AuthError["code"]): AuthError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    const authError = error as AuthError;
    expect(authError.code).toBe(code);
    return authError;
  }
  throw new Error(`expected AuthError ${code}`);
}

async function auditActions(entityId: string): Promise<string[]> {
  const rows = await db
    .select({ action: auditLog.action })
    .from(auditLog)
    .where(eq(auditLog.entityId, entityId));
  return rows.map((row) => row.action);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/** Eight reliable digits so the value also normalizes as a phone alias. */
function dialablePhone(prefix: string): string {
  const number = String(randomBytes(4).readUInt32BE(0) % 100_000_000).padStart(
    8,
    "0",
  );
  return `${prefix}${number}`;
}

interface LoginFixture {
  id: string;
  email: string;
  username: string;
  phone: string;
  password: string;
}

async function createLoginFixture(
  role: "ADMIN" | "CASHIER" | "MECHANIC" = "CASHIER",
  outletIds: readonly string[] = [OUTLET_A],
): Promise<LoginFixture> {
  const suffix = randomBytes(4).toString("hex");
  const secret = `Wp3${randomBytes(8).toString("hex")}`;
  const phone = dialablePhone("0814");
  const created = await createStaffUser(
    { db, auth: runtime.auth },
    ownerContext,
    {
      name: "Staf Uji",
      email: `uji.${suffix}@example.com`,
      username: `uji${suffix}`,
      phone,
      password: secret,
      role,
      outletIds: [...outletIds],
    },
  );

  return {
    id: created.id,
    email: created.email,
    username: created.username ?? "",
    phone,
    password: secret,
  };
}

beforeAll(async () => {
  handle = await prepareAuthTestDatabase();
  db = handle.db;
  await seedDatabase(db);

  const [outletB] = await db
    .insert(outletsTable)
    .values({ businessId: SEED_BUSINESS_ID, name: "Outlet Cabang" })
    .returning({ id: outletsTable.id });
  if (!outletB) throw new Error("failed to create second outlet");
  outletBId = outletB.id;
  await db
    .insert(settingsTable)
    .values({ businessId: SEED_BUSINESS_ID, outletId: outletBId });

  password = `Wp3${randomBytes(12).toString("hex")}`;
  runtime = {
    db,
    auth: createAuth(db, { baseURL: BASE_URL, secret: SECRET, production: false }),
    production: false,
  };
  await provisionAccounts(
    db,
    runtime.auth,
    SEED_USERS.map((fixture) => ({ userId: fixture.id, password })),
  );

  ownerContext = await contextFrom(await login("owner@example.com"));
}, 60_000);

afterAll(async () => {
  await closeAuthTestDatabase(handle);
});

describe("login and cookies", () => {
  it("logs in by email, username, and phone with an httpOnly Lax cookie", async () => {
    const byEmail = await login("owner@example.com");
    expect(byEmail.payload.user.id).toBe("seed_owner_rina");
    expect(byEmail.payload.user.role).toBe("OWNER");
    expect(byEmail.payload.allowedActions).toHaveLength(20);
    expect(byEmail.payload.outlets.map((outlet) => outlet.id)).toContain(OUTLET_A);
    expect(Number.isNaN(Date.parse(byEmail.payload.session.expiresAt))).toBe(false);
    expect(byEmail.payload.session.idleTimeoutMinutes).toBe(30);

    const sessionCookie = byEmail.setCookies.find((cookie) =>
      cookie.startsWith("workshop-pos.session_token="),
    );
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie).not.toMatch(/;\s*Secure/i);

    const byUsername = await login("cashier");
    expect(byUsername.payload.user.id).toBe("seed_cashier_dewi");
    expect(byUsername.payload.allowedActions).toHaveLength(8);

    const byPhone = await login("+62 812-0000-0004");
    expect(byPhone.payload.user.id).toBe("seed_mechanic_agus");
    expect(byPhone.payload.allowedActions).toHaveLength(3);
  });

  it("returns the same generic 401 for a wrong password and an unknown account", async () => {
    const wrongPassword = await expectAuthError(
      login("admin@example.com", "web", undefined, "salahbanget1"),
      "INVALID_CREDENTIALS",
    );
    const unknown = await expectAuthError(
      login("tidak.ada@example.com", "web", undefined, "salahbanget1"),
      "INVALID_CREDENTIALS",
    );

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPassword.message).toBe(unknown.message);
    expect(wrongPassword.message).toBe(
      "Email, nama pengguna, atau kata sandi tidak cocok.",
    );
  });

  it("marks the cookie Secure under production configuration", async () => {
    const productionAuth = createAuth(db, {
      baseURL: "https://127.0.0.1:3000",
      secret: SECRET,
      production: true,
    });
    const outcome = await loginWithPassword(
      {
        db,
        auth: productionAuth,
        production: true,
        headers: headers("https://127.0.0.1:3000"),
      },
      { identifier: "owner@example.com", password, surface: "web" },
    );

    const secureCookie = outcome.setCookies.find((cookie) =>
      cookie.startsWith("__Secure-workshop-pos.session_token="),
    );
    expect(secureCookie).toBeDefined();
    expect(secureCookie).toMatch(/;\s*Secure/i);
    expect(secureCookie).toMatch(/HttpOnly/i);
  });
});

describe("login rate limiting", () => {
  it("locks after five failures with retryAfter, then releases after 15 minutes", async () => {
    const identifier = "mechanic@example.com";
    const base = new Date(Date.now() - 60 * 60_000);
    const minute = 60_000;

    // Attempts one to four stay a generic 401: no lockout hint yet.
    for (let index = 0; index < 4; index += 1) {
      await expectAuthError(
        login(identifier, "web", new Date(base.getTime() + index * minute), "salah1234"),
        "INVALID_CREDENTIALS",
      );
    }

    // The fifth failure immediately reports the lock with a countdown.
    const fifth = await expectAuthError(
      login(identifier, "web", new Date(base.getTime() + 4 * minute), "salah1234"),
      "ACCOUNT_LOCKED",
    );
    expect(fifth.status).toBe(429);
    expect(fifth.retryAfterSeconds).toBe(POLICY.lockoutMinutes * 60);
    expect(fifth.message).toContain("Terlalu banyak percobaan");

    // Correct credentials are refused while the lock holds.
    const locked = await expectAuthError(
      login(identifier, "web", new Date(base.getTime() + 6 * minute)),
      "ACCOUNT_LOCKED",
    );
    expect(locked.status).toBe(429);
    expect(locked.retryAfterSeconds).toBeGreaterThan(0);
    expect(locked.retryAfterSeconds).toBeLessThanOrEqual(900);

    // Sixteen minutes after the fifth failure the lock has expired.
    const unlocked = await login(
      identifier,
      "web",
      new Date(base.getTime() + 21 * minute),
    );
    expect(unlocked.payload.user.id).toBe("seed_mechanic_agus");

    const attempts = await db
      .select({ identifier: loginAttempts.identifier })
      .from(loginAttempts)
      .where(eq(loginAttempts.identifier, identifier));
    expect(attempts.length).toBeGreaterThanOrEqual(6);
  });

  it("resets the failure streak after a successful login", async () => {
    const identifier = "cashier@example.com";
    const base = new Date(Date.now() - 2 * 60 * 60_000);
    const minute = 60_000;

    for (let index = 0; index < 4; index += 1) {
      await expectAuthError(
        login(identifier, "web", new Date(base.getTime() + index * minute), "salah1234"),
        "INVALID_CREDENTIALS",
      );
    }
    await login(identifier, "web", new Date(base.getTime() + 4 * minute));

    for (let index = 0; index < 4; index += 1) {
      await expectAuthError(
        login(identifier, "web", new Date(base.getTime() + (5 + index) * minute), "salah1234"),
        "INVALID_CREDENTIALS",
      );
    }

    const afterReset = await login(
      identifier,
      "web",
      new Date(base.getTime() + 10 * minute),
    );
    expect(afterReset.payload.user.id).toBe("seed_cashier_dewi");
  });
});

describe("idle timeout", () => {
  it("expires the session after the configured idle period and deletes it", async () => {
    const outcome = await login("mechanic");
    const context = await contextFrom(outcome);
    if (!context.sessionId) throw new Error("expected a web session id");

    const stale = new Date(Date.now() - 31 * 60_000);
    await db
      .update(sessionTable)
      .set({ updatedAt: stale })
      .where(eq(sessionTable.id, context.sessionId));

    const resolution = await resolveAuthContext(runtime, cookieHeaders(outcome.setCookies));
    expect(resolution).toBeNull();

    const remaining = await db
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(eq(sessionTable.id, context.sessionId));
    expect(remaining).toHaveLength(0);
  });

  it("touches updatedAt at most once every 30 seconds", async () => {
    const outcome = await login("mechanic");
    const context = await contextFrom(outcome);
    if (!context.sessionId) throw new Error("expected a web session id");

    const thirtyOneSecondsAgo = new Date(Date.now() - 31_000);
    await db
      .update(sessionTable)
      .set({ updatedAt: thirtyOneSecondsAgo })
      .where(eq(sessionTable.id, context.sessionId));

    const refreshed = await resolveAuthContext(
      runtime,
      cookieHeaders(outcome.setCookies),
    );
    expect(refreshed).not.toBeNull();

    const [afterTouch] = await db
      .select({ updatedAt: sessionTable.updatedAt })
      .from(sessionTable)
      .where(eq(sessionTable.id, context.sessionId));
    expect(afterTouch?.updatedAt.getTime()).toBeGreaterThan(
      thirtyOneSecondsAgo.getTime() + 25_000,
    );

    const fiveSecondsAgo = new Date(Date.now() - 5_000);
    await db
      .update(sessionTable)
      .set({ updatedAt: fiveSecondsAgo })
      .where(eq(sessionTable.id, context.sessionId));

    await resolveAuthContext(runtime, cookieHeaders(outcome.setCookies));

    const [afterQuiet] = await db
      .select({ updatedAt: sessionTable.updatedAt })
      .from(sessionTable)
      .where(eq(sessionTable.id, context.sessionId));
    expect(afterQuiet?.updatedAt.getTime()).toBe(fiveSecondsAgo.getTime());
  });
});

describe("outlet scoping", () => {
  it("gives Owner and Admin every active outlet and staff only their assignment", async () => {
    const owner = await contextFrom(await login("owner"));
    const admin = await contextFrom(await login("admin@example.com"));
    const cashier = await contextFrom(await login("cashier@example.com"));
    const mechanic = await contextFrom(await login("mechanic@example.com"));

    expect(owner.outletIds.sort()).toEqual([OUTLET_A, outletBId].sort());
    expect(admin.outletIds.sort()).toEqual([OUTLET_A, outletBId].sort());
    expect(cashier.outletIds).toEqual([OUTLET_A]);
    expect(mechanic.outletIds).toEqual([OUTLET_A]);
    expect(cashier.activeOutletId).toBe(OUTLET_A);
  });

  it("denies and audits a cross-outlet action for a cashier", async () => {
    const cashier = await contextFrom(await login("cashier@example.com"));

    expectSyncAuthError(
      () => assertOutletAccess(cashier, outletBId, "create_sale"),
      "FORBIDDEN",
    );

    const entityId = `order-${randomUUID()}`;
    await auditDenial(db, cashier, {
      action: "create_sale",
      entityType: "order",
      entityId,
      outletId: outletBId,
      crossOutlet: true,
    });

    const [denial] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "rbac.cross_outlet_denied"),
          eq(auditLog.entityId, entityId),
        ),
      );

    expect(denial?.actorId).toBe("seed_cashier_dewi");
    expect(denial?.outletId).toBe(OUTLET_A);
    expect(asRecord(denial?.after)).toEqual({ requestedOutletId: outletBId });

    expectSyncAuthError(
      () => assertPermission(cashier, "manage_users"),
      "FORBIDDEN",
    );
    const rbacEntityId = `users-${randomUUID()}`;
    await auditDenial(db, cashier, {
      action: "manage_users",
      entityType: "user",
      entityId: rbacEntityId,
    });
    const [rbacDenial] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.action, "rbac.denied"), eq(auditLog.entityId, rbacEntityId)),
      );
    expect(rbacDenial?.actorId).toBe("seed_cashier_dewi");
    expect(rbacDenial?.reason).toContain("mengelola pengguna");
  });
});

describe("mobile device tokens", () => {
  it("returns a raw token once, stores only its 64-hex digest, and resolves it", async () => {
    const outcome = await login("cashier@example.com", "mobile");
    const token = outcome.payload.token;
    expect(token).toBeDefined();
    expect(outcome.setCookies).toEqual([]);
    if (!token) throw new Error("expected a device token");

    const rows = await db.select().from(deviceTokens);
    const match = rows.find((row) => row.tokenHash === hashDeviceToken(token));
    expect(match).toBeDefined();
    expect(match?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.some((row) => row.tokenHash === token)).toBe(false);
    expect(match?.revokedAt).toBeNull();

    const resolution = await resolveDeviceToken(db, token);
    expect(resolution?.user.id).toBe("seed_cashier_dewi");

    const context = await resolveAuthContext(runtime, bearerHeaders(token));
    expect(context?.method).toBe("bearer");
    expect(context?.activeOutletId).toBe(OUTLET_A);
    expect(context?.outletIds).toEqual([OUTLET_A]);
  });

  it("invalidates a token on revoke", async () => {
    const outcome = await login("cashier@example.com", "mobile");
    const token = outcome.payload.token;
    if (!token) throw new Error("expected a device token");

    expect(await revokeDeviceToken(db, token)).toBe(true);
    expect(await resolveDeviceToken(db, token)).toBeNull();
    expect(await resolveAuthContext(runtime, bearerHeaders(token))).toBeNull();
    expect(await revokeDeviceToken(db, token)).toBe(false);
  });

  it("does not write lastUsedAt while resolving a token", async () => {
    const outcome = await login("cashier@example.com", "mobile");
    const token = outcome.payload.token;
    if (!token) throw new Error("expected a device token");
    const tokenHash = hashDeviceToken(token);

    expect(await resolveDeviceToken(db, token)).not.toBeNull();

    const [row] = await db
      .select({ lastUsedAt: deviceTokens.lastUsedAt })
      .from(deviceTokens)
      .where(eq(deviceTokens.tokenHash, tokenHash));
    expect(row?.lastUsedAt).toBeNull();
  });

  it("revokes a token idle past the outlet timeout and never authorizes it", async () => {
    const outcome = await login("mechanic@example.com", "mobile");
    const token = outcome.payload.token;
    if (!token) throw new Error("expected a device token");
    const tokenHash = hashDeviceToken(token);

    // Thirty-one minutes of silence against the seeded 30-minute outlet timeout.
    await db
      .update(deviceTokens)
      .set({ lastUsedAt: new Date(Date.now() - 31 * 60_000) })
      .where(eq(deviceTokens.tokenHash, tokenHash));

    const resolution = await resolveAuth(runtime, bearerHeaders(token));
    expect(resolution.status).toBe("expired");
    expect(await resolveAuthContext(runtime, bearerHeaders(token))).toBeNull();

    const [row] = await db
      .select({ revokedAt: deviceTokens.revokedAt })
      .from(deviceTokens)
      .where(eq(deviceTokens.tokenHash, tokenHash));
    expect(row?.revokedAt).not.toBeNull();
  });

  it("authorizes a fresh token, touches activity, and keeps the 30-day ceiling", async () => {
    const outcome = await login("cashier@example.com", "mobile");
    const token = outcome.payload.token;
    if (!token) throw new Error("expected a device token");

    const resolution = await resolveAuth(runtime, bearerHeaders(token));
    expect(resolution.status).toBe("authenticated");
    if (resolution.status !== "authenticated") throw new Error("expected authentication");

    expect(resolution.context.method).toBe("bearer");
    expect(resolution.context.idleTimeoutMinutes).toBe(30);

    const [row] = await db
      .select({ lastUsedAt: deviceTokens.lastUsedAt })
      .from(deviceTokens)
      .where(eq(deviceTokens.tokenHash, hashDeviceToken(token)));
    expect(row?.lastUsedAt).not.toBeNull();

    const remainingDays =
      (Date.parse(resolution.context.sessionExpiresAt) - Date.now()) / 86_400_000;
    expect(remainingDays).toBeGreaterThan(POLICY.deviceTokenTtlDays - 1);
    expect(remainingDays).toBeLessThanOrEqual(POLICY.deviceTokenTtlDays);
  });
});

describe("staff user management", () => {
  it("lets the Owner create a staff member who can then log in", async () => {
    const suffix = randomBytes(4).toString("hex");
    const created = await createStaffUser(
      { db, auth: runtime.auth },
      ownerContext,
      {
        name: "Kasir Baru",
        email: `kasir.${suffix}@example.com`,
        username: `kasir${suffix}`,
        phone: `0812${suffix.padEnd(8, "0").slice(0, 8)}`,
        password: "Stafbaru123",
        role: "CASHIER",
        outletIds: [OUTLET_A],
      },
    );

    expect(created.role).toBe("CASHIER");
    expect(created.outletIds).toEqual([OUTLET_A]);
    expect(created.isActive).toBe(true);
    expect(await auditActions(created.id)).toContain("user.created");

    const outcome = await login(created.email, "web", undefined, "Stafbaru123");
    expect(outcome.payload.user.id).toBe(created.id);

    const duplicateEmail = await expectAuthError(
      createStaffUser(
        { db, auth: runtime.auth },
        ownerContext,
        {
          name: "Duplikat Email",
          email: created.email,
          phone: "081200000099",
          password: "Stafbaru123",
          role: "ADMIN",
          outletIds: [],
        },
      ),
      "CONFLICT",
    );
    expect(duplicateEmail.fieldErrors?.email?.[0]).toContain("Email sudah digunakan");

    await expectAuthError(
      createStaffUser(
        { db, auth: runtime.auth },
        ownerContext,
        {
          name: "Duplikat HP",
          email: `lain.${suffix}@example.com`,
          phone: created.phone,
          password: "Stafbaru123",
          role: "ADMIN",
          outletIds: [],
        },
      ),
      "CONFLICT",
    );
  });

  it("refuses to create or grant the Owner role and requires outlets for staff", async () => {
    await expectAuthError(
      createStaffUser(
        { db, auth: runtime.auth },
        ownerContext,
        {
          name: "Pemilik Palsu",
          email: `owner.${randomBytes(3).toString("hex")}@example.com`,
          phone: "081200000098",
          password: "Stafbaru123",
          role: "OWNER" as never,
          outletIds: [OUTLET_A],
        },
      ),
      "FORBIDDEN",
    );

    await expectAuthError(
      createStaffUser(
        { db, auth: runtime.auth },
        ownerContext,
        {
          name: "Kasir Tanpa Outlet",
          email: `nooutlet.${randomBytes(3).toString("hex")}@example.com`,
          phone: "081200000097",
          password: "Stafbaru123",
          role: "CASHIER",
          outletIds: [],
        },
      ),
      "VALIDATION_ERROR",
    );

    await expectAuthError(
      updateStaffUser(db, ownerContext, "seed_owner_rina", {
        role: "ADMIN" as never,
      }),
      "FORBIDDEN",
    );

    const ownerDeactivate = await expectAuthError(
      deactivateStaffUser(
        db,
        ownerContext,
        "seed_owner_rina",
        "Percobaan menonaktifkan Pemilik",
      ),
      "FORBIDDEN",
    );
    expect(ownerDeactivate.message).toContain("Pemilik");
  });

  it("updates role and outlets, then deactivates while keeping history", async () => {
    const suffix = randomBytes(4).toString("hex");
    const created = await createStaffUser(
      { db, auth: runtime.auth },
      ownerContext,
      {
        name: "Mekanik Sementara",
        email: `mekanik.${suffix}@example.com`,
        phone: `0813${suffix.padEnd(8, "0").slice(0, 8)}`,
        password: "Stafbaru123",
        role: "MECHANIC",
        outletIds: [OUTLET_A],
      },
    );

    const webLogin = await login(created.email, "web", undefined, "Stafbaru123");
    expect(webLogin.payload.user.role).toBe("MECHANIC");
    const mobileLogin = await login(created.email, "mobile", undefined, "Stafbaru123");
    expect(mobileLogin.payload.token).toBeDefined();

    const updated = await updateStaffUser(db, ownerContext, created.id, {
      name: "Mekanik Diperbarui",
      role: "ADMIN",
      outletIds: [],
    });
    expect(updated.name).toBe("Mekanik Diperbarui");
    expect(updated.role).toBe("ADMIN");
    expect(updated.outletIds).toEqual([]);
    expect(await auditActions(created.id)).toContain("user.updated");

    const deactivated = await deactivateStaffUser(
      db,
      ownerContext,
      created.id,
      "Sudah tidak bekerja di bengkel ini",
    );
    expect(deactivated.isActive).toBe(false);
    expect(deactivated.deactivatedAt).not.toBeNull();

    const sessions = await db
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(eq(sessionTable.userId, created.id));
    expect(sessions).toHaveLength(0);

    const tokens = await db
      .select({ revokedAt: deviceTokens.revokedAt })
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, created.id));
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);

    const [retained] = await db
      .select({ id: userTable.id, deactivatedAt: userTable.deactivatedAt })
      .from(userTable)
      .where(eq(userTable.id, created.id));
    expect(retained?.deactivatedAt).not.toBeNull();
    expect(await auditActions(created.id)).toContain("user.deactivated");

    const denial = await expectAuthError(
      login(created.email, "web", undefined, "Stafbaru123"),
      "ACCOUNT_DEACTIVATED",
    );
    expect(denial.status).toBe(403);
    expect(denial.message).toBe("Akun dinonaktifkan. Hubungi Pemilik.");
  });

  it("lists staff with search, role, outlet, and status filters", async () => {
    const page = await listStaffUsers(db, ownerContext, {
      page: 1,
      pageSize: 50,
    });
    expect(page.total).toBeGreaterThanOrEqual(4);
    expect(page.items.map((item) => item.id)).toContain("seed_cashier_dewi");

    const cashiers = await listStaffUsers(db, ownerContext, {
      role: "CASHIER",
      page: 1,
      pageSize: 50,
    });
    expect(cashiers.items.every((item) => item.role === "CASHIER")).toBe(true);

    const inactive = await listStaffUsers(db, ownerContext, {
      status: "inactive",
      page: 1,
      pageSize: 50,
    });
    expect(inactive.items.every((item) => !item.isActive)).toBe(true);

    const byOutlet = await listStaffUsers(db, ownerContext, {
      outletId: OUTLET_A,
      page: 1,
      pageSize: 50,
    });
    expect(byOutlet.items.every((item) => item.outletIds.includes(OUTLET_A))).toBe(true);

    const searched = await listStaffUsers(db, ownerContext, {
      search: "dewi",
      page: 1,
      pageSize: 50,
    });
    expect(searched.items.map((item) => item.id)).toContain("seed_cashier_dewi");

    const cashierContext = await contextFrom(await login("cashier@example.com"));
    await expectAuthError(
      listStaffUsers(db, cashierContext, { page: 1, pageSize: 20 }),
      "FORBIDDEN",
    );
  });
});

describe("owner unlock (DEC-0007)", () => {
  const minute = 60_000;

  it("clears every lockout key and audits the unlock", async () => {
    const fixture = await createLoginFixture();
    const base = new Date(Date.now() - 2 * 60 * 60_000);

    for (let index = 0; index < POLICY.maxFailures; index += 1) {
      await expectAuthError(
        login(fixture.email, "web", new Date(base.getTime() + index * minute), "salah1234"),
        index === POLICY.maxFailures - 1 ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS",
      );
    }
    await expectAuthError(
      login(fixture.username, "web", new Date(base.getTime() + 6 * minute)),
      "ACCOUNT_LOCKED",
    );

    const result = await unlockStaffUser(db, ownerContext, fixture.id, {
      reason: "Karyawan lupa kata sandi",
    });
    expect(result).toEqual({ unlocked: true });

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "user.login_unlocked"),
          eq(auditLog.entityId, fixture.id),
        ),
      );
    expect(audit?.actorId).toBe(ownerContext.user.id);
    expect(audit?.reason).toBe("Karyawan lupa kata sandi");
    expect(asRecord(audit?.after)).toEqual({ attemptsCleared: expect.any(Number) });

    const attempts = await db
      .select({ id: loginAttempts.id })
      .from(loginAttempts)
      .where(eq(loginAttempts.identifier, `user:${fixture.id}`));
    expect(attempts).toHaveLength(0);

    // The same alias that was locked now signs in immediately.
    const fresh = await login(
      fixture.username,
      "web",
      new Date(base.getTime() + 7 * minute),
      fixture.password,
    );
    expect(fresh.payload.user.id).toBe(fixture.id);
  });

  it("denies a cashier and audits the denial", async () => {
    const fixture = await createLoginFixture();
    const cashier = await contextFrom(await login("cashier@example.com"));

    const error = await expectAuthError(
      unlockStaffUser(db, cashier, fixture.id, { reason: "Percobaan tanpa izin" }),
      "FORBIDDEN",
    );
    expect(error.status).toBe(403);

    const [denial] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "rbac.denied"),
          eq(auditLog.entityId, fixture.id),
        ),
      );
    expect(denial?.actorId).toBe("seed_cashier_dewi");
    expect(denial?.reason).toContain("manage_users");
  });

  it("reports no cleared attempts when the account has none, and 404s unknown users", async () => {
    const fixture = await createLoginFixture();

    await expect(unlockStaffUser(db, ownerContext, fixture.id)).resolves.toEqual({
      unlocked: false,
    });
    await expectAuthError(
      unlockStaffUser(db, ownerContext, randomUUID()),
      "NOT_FOUND",
    );
  });
});

describe("login attempt retention", () => {
  it("keeps attempt rows younger than the 30-day window when pruning a key", async () => {
    const identifier = `retensi.${randomBytes(3).toString("hex")}@example.com`;
    const now = new Date();
    const day = 24 * 60 * 60_000;

    await db.insert(loginAttempts).values([
      {
        identifier,
        succeeded: false,
        attemptedAt: new Date(now.getTime() - 25 * 60 * 60_000),
      },
      {
        identifier,
        succeeded: false,
        attemptedAt: new Date(now.getTime() - 31 * day),
      },
    ]);

    expect(await pruneLoginAttempts(db, [identifier], now)).toBe(1);

    const remaining = await db
      .select({ attemptedAt: loginAttempts.attemptedAt })
      .from(loginAttempts)
      .where(eq(loginAttempts.identifier, identifier));
    expect(remaining).toHaveLength(1);
    expect(now.getTime() - (remaining[0]?.attemptedAt.getTime() ?? 0)).toBeLessThan(
      26 * 60 * 60_000,
    );
  });

  it("globally prunes expired rows without touching recent ones", async () => {
    const now = new Date();
    const day = 24 * 60 * 60_000;
    const oldKey = `lama.${randomBytes(3).toString("hex")}@example.com`;
    const recentKey = `baru.${randomBytes(3).toString("hex")}@example.com`;

    await db.insert(loginAttempts).values([
      {
        identifier: oldKey,
        succeeded: false,
        attemptedAt: new Date(now.getTime() - 31 * day),
      },
      {
        identifier: recentKey,
        succeeded: false,
        attemptedAt: new Date(now.getTime() - 60_000),
      },
    ]);

    expect(await pruneExpiredLoginAttempts(db, now)).toBeGreaterThanOrEqual(1);

    const oldRows = await db
      .select({ id: loginAttempts.id })
      .from(loginAttempts)
      .where(eq(loginAttempts.identifier, oldKey));
    expect(oldRows).toHaveLength(0);

    const recentRows = await db
      .select({ id: loginAttempts.id })
      .from(loginAttempts)
      .where(eq(loginAttempts.identifier, recentKey));
    expect(recentRows).toHaveLength(1);
  });
});

describe("outlet management", () => {
  it("lets the Owner create and edit an outlet with default settings", async () => {
    const created = await createOutlet(db, ownerContext, {
      name: "Outlet Ketiga",
      address: "Jl. Baru 3",
      phone: "081200000010",
    });
    expect(created.name).toBe("Outlet Ketiga");
    expect(created.isActive).toBe(true);
    expect(await auditActions(created.id)).toContain("outlet.created");

    const [defaults] = await db
      .select({
        idleTimeoutMinutes: settingsTable.idleTimeoutMinutes,
        taxRate: settingsTable.taxRate,
      })
      .from(settingsTable)
      .where(eq(settingsTable.outletId, created.id));
    expect(defaults).toEqual({ idleTimeoutMinutes: 30, taxRate: 11 });

    const updated = await updateOutlet(db, ownerContext, created.id, {
      name: "Outlet Ketiga Baru",
      isActive: false,
    });
    expect(updated.name).toBe("Outlet Ketiga Baru");
    expect(updated.isActive).toBe(false);
    expect(await auditActions(created.id)).toContain("outlet.updated");

    const listed = await listOutlets(db, ownerContext);
    expect(listed.items.map((outlet) => outlet.id)).toContain(created.id);
  });

  it("rejects duplicate names and denies non-Owner access", async () => {
    await expectAuthError(
      createOutlet(db, ownerContext, { name: "Outlet Pusat" }),
      "CONFLICT",
    );

    const cashier = await contextFrom(await login("cashier@example.com"));
    const admin = await contextFrom(await login("admin@example.com"));

    await expectAuthError(listOutlets(db, cashier), "FORBIDDEN");
    await expectAuthError(
      createOutlet(db, cashier, { name: "Outlet Ilegal" }),
      "FORBIDDEN",
    );
    await expectAuthError(
      updateOutlet(db, cashier, OUTLET_A, { name: "Outlet Diubah Kasir" }),
      "FORBIDDEN",
    );
    await expectAuthError(
      createOutlet(db, admin, { name: "Outlet Admin" }),
      "FORBIDDEN",
    );
  });
});

describe("credential hardening", () => {
  const minute = 60_000;

  it("locks every alias of an account, not just the submitted identifier", async () => {
    const fixture = await createLoginFixture();
    const base = new Date(Date.now() - 3 * 60 * 60_000);

    for (let index = 0; index < POLICY.maxFailures; index += 1) {
      const at = new Date(base.getTime() + index * minute);
      await expectAuthError(
        login(fixture.email, "web", at, "salah1234"),
        index === POLICY.maxFailures - 1 ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS",
      );
    }

    // Rotating the identifier to another alias must not buy a fresh budget.
    for (const alias of [fixture.username, fixture.phone]) {
      const locked = await expectAuthError(
        login(alias, "web", new Date(base.getTime() + 6 * minute)),
        "ACCOUNT_LOCKED",
      );
      expect(locked.status).toBe(429);
      expect(locked.retryAfterSeconds).toBeGreaterThan(0);
    }

    const stillLocked = await expectAuthError(
      login(fixture.email, "web", new Date(base.getTime() + 7 * minute)),
      "ACCOUNT_LOCKED",
    );
    expect(stillLocked.retryAfterSeconds).toBeLessThanOrEqual(
      POLICY.lockoutMinutes * 60,
    );

    // Once the lock expires one alias signs in and clears every alias counter.
    const unlockedAt = new Date(base.getTime() + 21 * minute);
    const unlocked = await login(
      fixture.username,
      "web",
      unlockedAt,
      fixture.password,
    );
    expect(unlocked.payload.user.id).toBe(fixture.id);

    const remaining = await db
      .select({ identifier: loginAttempts.identifier })
      .from(loginAttempts)
      .where(eq(loginAttempts.identifier, `user:${fixture.id}`));
    expect(remaining.length).toBeGreaterThan(0);
  });

  it("keys an unknown identifier only by itself", async () => {
    const ghost = `hantu.${randomBytes(4).toString("hex")}@example.com`;
    const base = new Date(Date.now() - 5 * 60 * 60_000);

    for (let index = 0; index < POLICY.maxFailures - 1; index += 1) {
      await expectAuthError(
        login(ghost, "web", new Date(base.getTime() + index * minute), "salah1234"),
        "INVALID_CREDENTIALS",
      );
    }

    // Failures against an unknown identifier never lock a real account.
    await login("admin@example.com", "web", new Date(base.getTime() + 10 * minute));
  });

  it("serializes a concurrent burst so no more than five passwords are verified", async () => {
    const fixture = await createLoginFixture();
    const now = new Date();
    let verifications = 0;

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        loginWithPassword(
          {
            ...runtime,
            headers: headers(),
            onPasswordVerify: () => {
              verifications += 1;
            },
          },
          { identifier: fixture.email, password: "salah1234", surface: "web" },
          now,
        ),
      ),
    );

    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(verifications).toBeGreaterThanOrEqual(1);
    expect(verifications).toBeLessThanOrEqual(POLICY.maxFailures);

    const recorded = await db
      .select({ identifier: loginAttempts.identifier })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.identifier, `user:${fixture.id}`),
          eq(loginAttempts.succeeded, false),
        ),
      );
    expect(recorded.length).toBeLessThanOrEqual(POLICY.maxFailures);

    const locked = await expectAuthError(
      login(fixture.username, "web", now),
      "ACCOUNT_LOCKED",
    );
    expect(locked.retryAfterSeconds).toBe(POLICY.lockoutMinutes * 60);

    // A locked key is not even verified, so the burst cannot be repeated.
    const before = verifications;
    await expectAuthError(
      login(fixture.phone, "web", now),
      "ACCOUNT_LOCKED",
    );
    expect(verifications).toBe(before);
  });

  it("resolves an all-digit identifier by phone before a colliding username", async () => {
    const suffix = randomBytes(4).toString("hex");
    const phone = dialablePhone("0817");
    const secret = `Wp3${randomBytes(8).toString("hex")}`;

    const account = await createStaffUser(
      { db, auth: runtime.auth },
      ownerContext,
      {
        name: "Pemegang Nomor",
        email: `nomor.${suffix}@example.com`,
        username: `nomor${suffix}`,
        phone,
        password: secret,
        role: "CASHIER",
        outletIds: [OUTLET_A],
      },
    );

    // Legacy row the contract now rejects: an all-digit username equal to
    // another user's phone number. Phone must win the resolution.
    await db.insert(userTable).values({
      id: `legacy_${suffix}`,
      name: "Baris Lama",
      email: `lama.${suffix}@example.com`,
      businessId: SEED_BUSINESS_ID,
      role: "CASHIER",
      username: phone,
      phone: dialablePhone("0819"),
      updatedAt: new Date(),
    });

    const outcome = await login(phone, "web", undefined, secret);
    expect(outcome.payload.user.id).toBe(account.id);
  });

  it("rejects an all-digit username before writing the row", async () => {
    const suffix = randomBytes(4).toString("hex");
    const error = await expectAuthError(
      createStaffUser({ db, auth: runtime.auth }, ownerContext, {
        name: "Tidak Tersimpan",
        email: `angka.${suffix}@example.com`,
        username: "081200000003",
        phone: dialablePhone("0813"),
        password: `Wp3${randomBytes(8).toString("hex")}`,
        role: "CASHIER",
        outletIds: [OUTLET_A],
      }),
      "VALIDATION_ERROR",
    );
    expect(error.fieldErrors?.username?.[0]).toBe(
      "Nama pengguna tidak boleh hanya berisi angka.",
    );
  });

  it("refuses to deactivate the last active outlet or create a first inactive one", async () => {
    const suffix = randomBytes(4).toString("hex");
    const businessId = randomUUID();
    const ownerId = `owner_${suffix}`;
    const ownerEmail = `pemilik.${suffix}@example.com`;
    const ownerPhone = dialablePhone("0815");

    await db.insert(businesses).values({ id: businessId, name: `Bengkel ${suffix}` });
    await db.insert(userTable).values({
      id: ownerId,
      name: "Pemilik Uji",
      email: ownerEmail,
      businessId,
      role: "OWNER",
      phone: ownerPhone,
      updatedAt: new Date(),
    });

    const isolated: AuthContext = {
      user: {
        id: ownerId,
        name: "Pemilik Uji",
        email: ownerEmail,
        username: null,
        phone: ownerPhone,
        role: "OWNER",
        businessId,
      },
      method: "web",
      activeOutletId: null,
      outletIds: [],
      outlets: [],
      idleTimeoutMinutes: POLICY.defaultIdleTimeoutMinutes,
      sessionExpiresAt: new Date().toISOString(),
    };

    const firstInactive = await expectAuthError(
      createOutlet(db, isolated, { name: "Cabang Nonaktif", isActive: false }),
      "VALIDATION_ERROR",
    );
    expect(firstInactive.fieldErrors?.isActive?.[0]).toBe(
      "Tidak dapat membuat outlet nonaktif karena belum ada outlet aktif.",
    );

    const single = await createOutlet(db, isolated, { name: "Outlet Tunggal" });
    expect(single.isActive).toBe(true);

    const blocked = await expectAuthError(
      updateOutlet(db, isolated, single.id, { isActive: false }),
      "VALIDATION_ERROR",
    );
    expect(blocked.fieldErrors?.isActive?.[0]).toBe(
      "Outlet aktif terakhir tidak dapat dinonaktifkan.",
    );

    const [stillActive] = await db
      .select({ isActive: outletsTable.isActive })
      .from(outletsTable)
      .where(eq(outletsTable.id, single.id));
    expect(stillActive?.isActive).toBe(true);

    const spare = await createOutlet(db, isolated, {
      name: "Cabang Cadangan",
      isActive: false,
    });
    expect(spare.isActive).toBe(false);

    const second = await createOutlet(db, isolated, { name: "Outlet Kedua" });
    const deactivated = await updateOutlet(db, isolated, single.id, {
      isActive: false,
    });
    expect(deactivated.isActive).toBe(false);
    expect(second.isActive).toBe(true);
  });
});

describe("outlet switching and logout", () => {
  it("switches the active outlet for the Owner and audits it", async () => {
    const owner = await contextFrom(await login("owner"));
    const targetOutletId = owner.activeOutletId === OUTLET_A ? outletBId : OUTLET_A;

    const switched = await switchActiveOutlet(runtime, owner, targetOutletId);
    expect(switched.context.activeOutletId).toBe(targetOutletId);

    const [sessionRow] = await db
      .select({ activeOutletId: sessionTable.activeOutletId })
      .from(sessionTable)
      .where(eq(sessionTable.id, owner.sessionId ?? ""));
    expect(sessionRow?.activeOutletId).toBe(targetOutletId);

    const [auditRow] = await db
      .select({ outletId: auditLog.outletId })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "session.outlet_switched"),
          eq(auditLog.entityId, owner.sessionId ?? ""),
        ),
      );
    expect(auditRow?.outletId).toBe(targetOutletId);
  });

  it("denies and audits a switch for a single-outlet account, and 404s unknown outlets", async () => {
    const cashier = await contextFrom(await login("cashier@example.com"));
    expect(cashier.outletIds).toHaveLength(1);

    const denied = await expectAuthError(
      switchActiveOutlet(runtime, cashier, outletBId),
      "FORBIDDEN",
    );
    expect(denied.message).toContain("satu outlet aktif");

    const [denial] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "rbac.denied"),
          eq(auditLog.entityId, cashier.sessionId ?? ""),
        ),
      );
    expect(denial?.actorId).toBe("seed_cashier_dewi");
    expect(denial?.reason).toBe("caller has a single assigned outlet");

    const owner = await contextFrom(await login("owner"));
    await expectAuthError(
      switchActiveOutlet(runtime, owner, randomUUID()),
      "NOT_FOUND",
    );
  });

  it("lets a cashier assigned to two outlets switch and persists the choice", async () => {
    const fixture = await createLoginFixture("CASHIER", [OUTLET_A, outletBId]);
    const outcome = await login(
      fixture.username,
      "web",
      undefined,
      fixture.password,
    );
    const context = await contextFrom(outcome);
    expect(context.outletIds.sort()).toEqual([OUTLET_A, outletBId].sort());

    const target = context.activeOutletId === OUTLET_A ? outletBId : OUTLET_A;
    const switched = await switchActiveOutlet(runtime, context, target);
    expect(switched.context.activeOutletId).toBe(target);

    const [sessionRow] = await db
      .select({ activeOutletId: sessionTable.activeOutletId })
      .from(sessionTable)
      .where(eq(sessionTable.id, context.sessionId ?? ""));
    expect(sessionRow?.activeOutletId).toBe(target);

    const [auditRow] = await db
      .select({ outletId: auditLog.outletId })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "session.outlet_switched"),
          eq(auditLog.entityId, context.sessionId ?? ""),
        ),
      );
    expect(auditRow?.outletId).toBe(target);

    // A later request resolves the switched outlet from the stored session.
    const reloaded = await resolveAuthContext(
      runtime,
      cookieHeaders(outcome.setCookies),
    );
    expect(reloaded?.activeOutletId).toBe(target);
  });

  it("denies and audits a two-outlet cashier an outlet outside the assignment", async () => {
    const fixture = await createLoginFixture("CASHIER", [OUTLET_A, outletBId]);
    const context = await contextFrom(
      await login(fixture.username, "web", undefined, fixture.password),
    );
    const outside = await createOutlet(db, ownerContext, {
      name: `Outlet Luar ${randomBytes(3).toString("hex")}`,
    });

    const error = await expectAuthError(
      switchActiveOutlet(runtime, context, outside.id),
      "FORBIDDEN",
    );
    expect(error.message).toBe("Anda tidak memiliki akses ke outlet tersebut.");

    const [denial] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "rbac.cross_outlet_denied"),
          eq(auditLog.entityId, context.sessionId ?? ""),
        ),
      );
    expect(denial?.actorId).toBe(fixture.id);
    expect(asRecord(denial?.after)).toEqual({ requestedOutletId: outside.id });
  });

  it("clears the web session on logout and revokes a mobile token", async () => {
    const webLogin = await login("owner@example.com");
    const webContext = await contextFrom(webLogin);
    const logout = await logoutCurrentSession(runtime, webContext);

    expect(logout.setCookies.some((cookie) => /Max-Age=0/i.test(cookie))).toBe(true);
    expect(
      await resolveAuthContext(runtime, cookieHeaders(webLogin.setCookies)),
    ).toBeNull();

    const mobileLogin = await login("cashier@example.com", "mobile");
    const token = mobileLogin.payload.token;
    if (!token) throw new Error("expected a device token");
    const mobileContext = await resolveAuthContext(runtime, bearerHeaders(token));
    if (!mobileContext) throw new Error("expected a bearer context");

    await logoutCurrentSession(runtime, mobileContext);
    expect(await resolveAuthContext(runtime, bearerHeaders(token))).toBeNull();
  });
});

describe("provisioning guards", () => {
  it("refuses malformed passwords before writing a credential", async () => {
    await expect(
      provisionAccounts(db, runtime.auth, [
        { userId: "seed_owner_rina", password: "short1" },
      ]),
    ).rejects.toThrow(/does not meet the policy/);
  });

  it("refuses unknown staff rows", async () => {
    await expect(
      provisionAccounts(db, runtime.auth, [
        { userId: "missing_user", password },
      ]),
    ).rejects.toThrow(/does not exist/);
  });

  it("refuses production unless explicitly allowed", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(
        provisionAccounts(db, runtime.auth, [
          { userId: "seed_owner_rina", password },
        ]),
      ).rejects.toThrow(/Refusing to provision credentials in production/);

      const allowed = await provisionAccounts(
        db,
        runtime.auth,
        [{ userId: "seed_owner_rina", password }],
        { allowProduction: true },
      );
      expect(allowed.users).toBe(1);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});

describe("per-IP login throttle (DEC-0011)", () => {
  it("blocks a rotating-identifier attack from one address without harming another", async () => {
    resetIpThrottle();
    const now = new Date();
    const attackerIp = "203.0.113.7";
    const otherIp = "198.51.100.9";

    for (let index = 0; index < 29; index += 1) {
      await expect(
        loginWithPassword(
          { ...runtime, headers: headers(), clientIp: attackerIp },
          {
            identifier: `unknown-${index}@example.com`,
            password: "salah-total-1",
            surface: "web",
          },
          now,
        ),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    }

    // The 30th failure trips the per-IP threshold, before any further verify.
    await expect(
      loginWithPassword(
        { ...runtime, headers: headers(), clientIp: attackerIp },
        {
          identifier: "unknown-last@example.com",
          password: "salah-total-1",
          surface: "web",
        },
        now,
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 900 });

    await expect(
      loginWithPassword(
        { ...runtime, headers: headers(), clientIp: attackerIp },
        { identifier: "cashier", password, surface: "web" },
        now,
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 900 });

    const allowed = await loginWithPassword(
      { ...runtime, headers: headers(), clientIp: otherIp },
      { identifier: "cashier", password, surface: "web" },
      now,
    );
    expect(allowed.payload.user.role).toBe("CASHIER");

    // The block expires with the window; the same address can try again.
    resetIpThrottle();
  });

  it("does not let a successful login clear the per-IP budget", async () => {
    resetIpThrottle();
    const now = new Date();
    const ip = "203.0.113.8";

    for (let index = 0; index < 29; index += 1) {
      await expect(
        loginWithPassword(
          { ...runtime, headers: headers(), clientIp: ip },
          {
            identifier: `unknown2-${index}@example.com`,
            password: "salah-total-1",
            surface: "web",
          },
          now,
        ),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    }

    // A valid credential from the same address does not reset the counter.
    await loginWithPassword(
      { ...runtime, headers: headers(), clientIp: ip },
      { identifier: "cashier", password, surface: "web" },
      now,
    );

    await expect(
      loginWithPassword(
        { ...runtime, headers: headers(), clientIp: ip },
        {
          identifier: "unknown3@example.com",
          password: "salah-total-1",
          surface: "web",
        },
        now,
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 900 });
  });
});
