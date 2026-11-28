#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CI_MODE="${WP_CI:-0}"
COMPOSE=(docker compose -f compose.dev.yaml)

# Local disposable development credentials. Exporting them here makes the gate
# reproducible on a fresh clone and overrides any pre-set shell/.env values.
# In CI (explicit `WP_CI=1`) the pipeline supplies the database URLs and no
# Docker daemon is required on the runner.
DEV_DB_USER="workshop"
DEV_DB_PASSWORD="workshop"
DEV_DB_NAME="workshop_pos"
TEST_DB_NAME="workshop_pos_test"

step() {
  printf "\n==> %s\n" "$1"
}

fail() {
  printf "ERROR: %s\n" "$1" >&2
  exit 1
}

step "Preflight"
command -v node >/dev/null 2>&1 || fail "Node.js is not installed or not on PATH."
command -v npm >/dev/null 2>&1 || fail "npm is not installed or not on PATH."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" = "26" ] ||
  fail "Node 26 is required (found $(node --version)). Run: fnm exec --using=26.13.1 -- bash scripts/check.sh"

[ -d node_modules ] ||
  fail "node_modules is missing. Run: fnm exec --using=26.13.1 -- npm ci"

if [ "$CI_MODE" = "1" ]; then
  [ -n "${DATABASE_URL:-}" ] ||
    fail "CI mode requires DATABASE_URL (an ephemeral PostgreSQL database)."
  [ -n "${INTEGRATION_DATABASE_URL:-}" ] ||
    fail "CI mode requires INTEGRATION_DATABASE_URL (a database ending in _test)."
  export DATABASE_URL INTEGRATION_DATABASE_URL

  step "Waiting for the CI PostgreSQL service"
  node -e '
    const { Client } = require("pg");
    const url = process.env.INTEGRATION_DATABASE_URL;
    const target = new URL(url);
    const name = decodeURIComponent(target.pathname.replace(/^\//, ""));
    if (!name.endsWith("_test")) {
      throw new Error("Integration database name must end with _test");
    }
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      throw new Error("Integration database name must be a simple identifier");
    }
    const admin = new URL(url);
    admin.pathname = "/postgres";
    (async () => {
      const deadline = Date.now() + 60000;
      for (;;) {
        const client = new Client({ connectionString: admin.toString(), connectionTimeoutMillis: 3000 });
        try {
          await client.connect();
          const exists = await client.query("select 1 from pg_database where datname = $1", [name]);
          if (exists.rowCount === 0) {
            await client.query(`create database "${name}"`);
          }
          await client.end();
          return;
        } catch (error) {
          await client.end().catch(() => undefined);
          if (Date.now() > deadline) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    })().catch((error) => {
      console.error("CI database is not ready (credentials are not echoed).");
      process.exit(1);
    });
  '
else
  command -v docker >/dev/null 2>&1 ||
    fail "Docker is not installed or not on PATH. The integration and E2E gates require Docker."
  docker info >/dev/null 2>&1 ||
    fail "The Docker daemon is not reachable. Start Docker Desktop/Engine and retry."

  export POSTGRES_USER="$DEV_DB_USER"
  export POSTGRES_PASSWORD="$DEV_DB_PASSWORD"
  export POSTGRES_DB="$DEV_DB_NAME"
  export DATABASE_URL="postgresql://${DEV_DB_USER}:${DEV_DB_PASSWORD}@127.0.0.1:55432/${DEV_DB_NAME}"
  export INTEGRATION_DATABASE_URL="postgresql://${DEV_DB_USER}:${DEV_DB_PASSWORD}@127.0.0.1:55432/${TEST_DB_NAME}"

  step "Starting the development database"
  "${COMPOSE[@]}" up -d --wait db

  step "Waiting for the ${TEST_DB_NAME} database"
  TEST_DB_READY=0
  for _ in $(seq 1 30); do
    if "${COMPOSE[@]}" exec -T db psql -U "$DEV_DB_USER" -d "$TEST_DB_NAME" -c 'select 1' >/dev/null 2>&1; then
      TEST_DB_READY=1
      break
    fi
    sleep 1
  done
  if [ "$TEST_DB_READY" -ne 1 ]; then
    "${COMPOSE[@]}" logs db || true
    fail "The ${TEST_DB_NAME} database was not reachable within 30 seconds. If this volume predates docker/initdb/01-test-database.sql, reset it with: docker compose -f compose.dev.yaml down -v"
  fi

  step "Backup image"
  # The production-shape Compose file and the optional sidecar are not used by
  # the app tests, so build and render them here where Docker is available.
  # CI mode (WP_CI=1) has no Docker daemon and skips this step; the Woodpecker
  # pipeline does not build the sidecar image.
  BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-gate-only-not-a-production-secret}" \
    docker compose --profile backup config --quiet
  docker build -f docker/backup.Dockerfile -t workshop-pos-backup:gate .
fi

step "License report"
bash scripts/license-report.sh

step "Typecheck"
npm run typecheck

step "Lint"
npm run lint

step "Unit tests"
npm run test:unit

step "Integration tests"
npm run test:integration

step "Web E2E tests"
npm run test:e2e:web

step "Production build"
npm run build

printf "\nAll gates passed.\n"
