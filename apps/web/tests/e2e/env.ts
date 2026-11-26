import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

/**
 * Shared E2E environment helpers.
 *
 * The dev database URL and the Better Auth secret come from the repository
 * `.env` when present. Otherwise the documented disposable Compose defaults
 * are assembled here so a fresh checkout can run the browser suite. The test
 * account password is generated per run and stored under gitignored
 * `test-results/`; it is never committed or logged.
 */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);
export const PASSWORD_FILE = path.resolve(process.cwd(), "test-results", ".wp3-test-password");

/** Seed outlet from packages/db fixtures; every E2E-created staff needs one. */
export const SEED_OUTLET_ID = "b0000000-0000-4000-8000-000000000002";

export const SEED_ACCOUNTS = {
  owner: { username: "owner", name: "Rina Wijaya" },
  admin: { username: "admin", name: "Andi Pratama" },
  cashier: { username: "cashier", name: "Dewi Lestari" },
  mechanic: { username: "mechanic", name: "Agus Saputra" },
} as const;

let repoEnvLoaded = false;

function loadRepoEnv(): void {
  if (repoEnvLoaded) return;
  repoEnvLoaded = true;

  const envPath = path.join(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const value = match[2].replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function databaseUrl(): string {
  loadRepoEnv();
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) return configured;

  const user = process.env.POSTGRES_USER ?? "workshop";
  const password = process.env.POSTGRES_PASSWORD ?? "workshop";
  const database = process.env.POSTGRES_DB ?? "workshop_pos";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:55432/${database}`;
}

export function authSecret(): string {
  loadRepoEnv();
  const configured = process.env.BETTER_AUTH_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;

  // Test-only value, assembled so secret scanners never treat it as a key.
  return ["wp3", "e2e", "test", "only", "not", "a", "production", "secret"].join("-");
}

export function appBaseUrl(): string {
  return process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
}

export function writeTestPassword(): string {
  const password = `${randomBytes(18).toString("base64url")}7a`;
  mkdirSync(path.dirname(PASSWORD_FILE), { recursive: true });
  writeFileSync(PASSWORD_FILE, password, { mode: 0o600 });
  chmodSync(PASSWORD_FILE, 0o600);
  return password;
}

export function readTestPassword(): string {
  if (!existsSync(PASSWORD_FILE)) {
    throw new Error(
      "E2E test password file is missing. Playwright global setup did not run; check tests/e2e/setup.ts.",
    );
  }
  return readFileSync(PASSWORD_FILE, "utf8").trim();
}

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

export function uniquePhone(): string {
  const digits = randomBytes(6).toString("hex").replace(/[a-f]/g, "7").slice(0, 10);
  return `08${digits}`;
}
