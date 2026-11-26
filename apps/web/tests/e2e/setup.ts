import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";

import { authSecret, databaseUrl, REPO_ROOT, writeTestPassword } from "./env";

function redact(value: string): string {
  return value.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://<redacted>");
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  try {
    execFileSync(command, args, { cwd: REPO_ROOT, env, stdio: "pipe", timeout: 180_000 });
  } catch (error) {
    const output =
      typeof error === "object" && error !== null && "stderr" in error
        ? String(error.stderr)
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(`${command} ${args.join(" ")} failed: ${redact(output).trim()}`);
  }
}

async function assertDatabaseReachable(url: string): Promise<void> {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 3_000 });
  try {
    await client.connect();
    await client.query("select 1");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Dev database is not reachable (${redact(message)}). ` +
        "Start it with: docker compose -f compose.dev.yaml up -d --wait db",
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

const LOOPBACK_HOSTS: Record<string, true> = {
  "127.0.0.1": true,
  localhost: true,
  "::1": true,
  "[::1]": true,
};
const DISPOSABLE_PORT = "55432";
const DISPOSABLE_DATABASE = "workshop_pos";

/**
 * Destructive reset is only ever allowed on the documented disposable dev
 * database. Any other host, port, or database name aborts before a connection
 * is opened so a misconfigured DATABASE_URL can never wipe real data.
 */
function assertDisposableDatabase(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL; refusing to reset the E2E schema.");
  }

  const protocol = parsed.protocol.replace(/:$/, "");
  const hostname = parsed.hostname.toLowerCase();
  const port = parsed.port || "5432";
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

  if (
    (protocol !== "postgres" && protocol !== "postgresql") ||
    !LOOPBACK_HOSTS[hostname] ||
    port !== DISPOSABLE_PORT ||
    database !== DISPOSABLE_DATABASE
  ) {
    throw new Error(
      `Refusing to reset a non-disposable database (${redact(url)}). ` +
        `E2E requires a loopback host, port ${DISPOSABLE_PORT}, and database ${DISPOSABLE_DATABASE}.`,
    );
  }
}

/**
 * Drops and recreates the public schema of the disposable dev database so
 * every run starts from migrations + seed only. The guard above makes this
 * safe; the dev database is never used for data anyone must keep.
 */
async function resetDevSchema(url: string): Promise<void> {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 3_000 });
  try {
    await client.connect();
    await client.query("drop schema if exists public cascade");
    // drizzle-kit records applied migrations in its own schema; leaving it
    // would make migrate believe the dropped tables still exist.
    await client.query("drop schema if exists drizzle cascade");
    await client.query("create schema public");
    await client.query("grant usage on schema public to public");
  } finally {
    await client.end().catch(() => undefined);
  }
}

function provisionSeedAccounts(env: NodeJS.ProcessEnv): void {
  const cliPath = path.join(REPO_ROOT, "packages", "auth", "src", "provision-cli.ts");
  if (!existsSync(cliPath)) {
    throw new Error("Provisioning CLI not found at packages/auth/src/provision-cli.ts");
  }

  const packagePath = path.join(REPO_ROOT, "packages", "auth", "package.json");
  const packageJson: unknown = existsSync(packagePath)
    ? JSON.parse(readFileSync(packagePath, "utf8"))
    : null;
  const scripts =
    typeof packageJson === "object" && packageJson !== null && "scripts" in packageJson
      ? (packageJson.scripts as Record<string, string>)
      : {};

  if (typeof scripts.provision === "string") {
    run("npm", ["run", "provision", "--workspace", "@workshop-pos/auth"], env);
    return;
  }

  // Node 23.6+ strips TypeScript types for first-party .ts files natively.
  run(process.execPath, [cliPath], env);
}

/**
 * Recreates the disposable dev schema, migrates and seeds it, provisions the
 * four seed accounts with a per-run password. Prints no credentials.
 */
export default async function globalSetup(): Promise<void> {
  const url = databaseUrl();
  assertDisposableDatabase(url);

  const password = writeTestPassword();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: url,
    NODE_ENV: "development",
    WP3_TEST_PASSWORD: password,
    WP3_ALLOW_PROVISION: "1",
    BETTER_AUTH_SECRET: authSecret(),
  };

  await assertDatabaseReachable(url);
  await resetDevSchema(url);
  run("npm", ["run", "db:migrate", "--workspace", "packages/db"], env);
  run("npm", ["run", "db:seed", "--workspace", "packages/db"], env);
  provisionSeedAccounts(env);

  console.log("E2E dev database ready: migrated, seeded, and seed accounts provisioned.");
}
