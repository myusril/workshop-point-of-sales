import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { apiErrorSchema, outletSchema, userListResponseSchema } from "@workshop-pos/contracts";
import { Client } from "pg";

import {
  databaseUrl,
  readTestPassword,
  SEED_ACCOUNTS,
  SEED_OUTLET_ID,
  uniquePhone,
  uniqueSuffix,
} from "./env";

export interface StaffInput {
  name: string;
  email: string;
  username: string;
  phone: string;
  password: string;
  role: "ADMIN" | "CASHIER" | "MECHANIC";
  outletIds: string[];
}

export function newStaffInput(role: StaffInput["role"] = "CASHIER"): StaffInput {
  const suffix = uniqueSuffix();
  return {
    name: `Staf E2E ${suffix}`,
    email: `e2e.${suffix}@example.com`,
    username: `e2e_${suffix}`,
    phone: uniquePhone(),
    password: readTestPassword(),
    role,
    outletIds: [SEED_OUTLET_ID],
  };
}

/** Signs the browser context in through the real login endpoint. */
export async function signInWithPassword(
  context: BrowserContext,
  identifier: string,
  password: string,
): Promise<void> {
  const response = await context.request.post("/api/v1/auth/login", {
    data: { identifier, password, surface: "web" },
  });

  if (!response.ok()) {
    throw new Error(`API sign-in failed for ${identifier}: HTTP ${response.status()}`);
  }
}

/** Signs the browser context in through the real login endpoint. */
export async function signInWithApi(
  context: BrowserContext,
  account: keyof typeof SEED_ACCOUNTS = "owner",
): Promise<void> {
  await signInWithPassword(context, SEED_ACCOUNTS[account].username, readTestPassword());
}

/**
 * Moves the newest web session of a seed account past the idle timeout without
 * touching the browser cookie, so the next page request exercises the real
 * expired-session path instead of a hand-written `/login?reason=expired` URL.
 */
export async function ageSessionForUser(username: string, minutes = 45): Promise<void> {
  const client = new Client({ connectionString: databaseUrl(), connectionTimeoutMillis: 3_000 });
  try {
    await client.connect();
    const result = await client.query(
      `update "session" as s
          set "updatedAt" = now() - make_interval(mins => $2::int)
        where s.id = (
          select inner_s.id
            from "session" as inner_s
            join "user" as u on u.id = inner_s."userId"
           where u.username = $1
           order by inner_s."createdAt" desc
           limit 1
        )`,
      [username, minutes],
    );
    if (result.rowCount !== 1) {
      throw new Error(`No web session found for seed account ${username}`);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function errorCodeOf(body: unknown): string | null {
  const parsed = apiErrorSchema.safeParse(body);
  return parsed.success ? parsed.data.error.code : null;
}

export async function listUsersViaApi(
  request: APIRequestContext,
  search: string,
): Promise<{ id: string; email: string; name: string }[]> {
  const response = await request.get(`/api/v1/users?search=${encodeURIComponent(search)}&pageSize=100`);
  expect(response.status()).toBe(200);
  const parsed = userListResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`Unexpected user list payload: ${parsed.error.message}`);
  }

  return parsed.data.items.map((item) => ({ id: item.id, email: item.email, name: item.name }));
}

export async function createStaffViaApi(
  context: BrowserContext,
  input: StaffInput,
): Promise<{ id: string; name: string; username: string; email: string }> {
  const response = await context.request.post("/api/v1/users", { data: input });
  if (!response.ok()) {
    throw new Error(`Creating staff failed: HTTP ${response.status()} ${await response.text()}`);
  }

  const matches = await listUsersViaApi(context.request, input.email);
  const created = matches.find((candidate) => candidate.email === input.email);
  if (!created) {
    throw new Error("Created staff is not visible in the user list");
  }

  return { id: created.id, name: input.name, username: input.username, email: input.email };
}

export async function createOutletViaApi(
  context: BrowserContext,
  input: { name: string; address?: string },
): Promise<{ id: string; name: string }> {
  const response = await context.request.post("/api/v1/outlets", { data: input });
  if (!response.ok()) {
    throw new Error(`Creating outlet failed: HTTP ${response.status()} ${await response.text()}`);
  }

  const parsed = outletSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`Unexpected outlet payload: ${parsed.error.message}`);
  }

  return { id: parsed.data.id, name: parsed.data.name };
}

export async function deactivateStaffViaApi(
  context: BrowserContext,
  userId: string,
  reason = "E2E selesai menguji akun staf",
): Promise<void> {
  const response = await context.request.post(`/api/v1/users/${userId}/deactivate`, { data: { reason } });
  if (!response.ok()) {
    throw new Error(`Deactivating staff failed: HTTP ${response.status()}`);
  }
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits, "page must not overflow horizontally").toBe(true);
}
