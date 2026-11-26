import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");

/**
 * Loads the repository `.env` when present. The file is gitignored and is the
 * only place local credentials live; production supplies real environment
 * variables. A missing `.env` is not an error here: `requireDatabaseUrl`
 * reports the actionable failure.
 */
export function loadRepoEnv(): void {
  try {
    process.loadEnvFile(path.join(REPOSITORY_ROOT, ".env"));
  } catch {
    // No .env in this checkout. Environment variables (or a later error) apply.
  }
}

export function requireDatabaseUrl(): string {
  loadRepoEnv();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env at the repository root, " +
        "or export DATABASE_URL for this command.",
    );
  }
  return url;
}
