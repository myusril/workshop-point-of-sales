#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f compose.dev.yaml)

# Disposable local development credentials. Exporting them here makes the gate
# reproducible on a fresh clone and overrides any pre-set shell/.env values.
DEV_DB_USER="workshop"
DEV_DB_PASSWORD="workshop"
DEV_DB_NAME="workshop_pos"
TEST_DB_NAME="workshop_pos_test"
export POSTGRES_USER="$DEV_DB_USER"
export POSTGRES_PASSWORD="$DEV_DB_PASSWORD"
export POSTGRES_DB="$DEV_DB_NAME"
export INTEGRATION_DATABASE_URL="postgresql://${DEV_DB_USER}:${DEV_DB_PASSWORD}@127.0.0.1:55432/${TEST_DB_NAME}"

step() {
  printf "\n==> %s\n" "$1"
}

fail() {
  printf "ERROR: %s\n" "$1" >&2
  exit 1
}

step "Preflight"
command -v docker >/dev/null 2>&1 ||
  fail "Docker is not installed or not on PATH. The integration and E2E gates require Docker."
docker info >/dev/null 2>&1 ||
  fail "The Docker daemon is not reachable. Start Docker Desktop/Engine and retry."
command -v node >/dev/null 2>&1 || fail "Node.js is not installed or not on PATH."
command -v npm >/dev/null 2>&1 || fail "npm is not installed or not on PATH."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" = "26" ] ||
  fail "Node 26 is required (found $(node --version)). Run: fnm exec --using=26.13.1 -- bash scripts/check.sh"

[ -d node_modules ] ||
  fail "node_modules is missing. Run: fnm exec --using=26.13.1 -- npm ci"

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
